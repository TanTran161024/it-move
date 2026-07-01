const { messageSignals } = require('./recommendationService');
const { callGemini, getAiStatus, getGeminiModel } = require('./aiProviderService');
const {
  buildConversationIntent,
  buildRetrievalMessage,
  isClearlyOffTopic,
  normalizeIdList,
  shouldAskClarifyingQuestion,
} = require('./chatIntentService');
const { buildGrounding, buildResponse } = require('./chatResponseService');
const { extractRecommendationIds, verifyRecommendations } = require('./chatGuardService');
const {
  applyConversationRefinements,
  fillCandidatePool,
  getCandidateMovies,
} = require('./movieRetrievalService');
const { getUserRecommendations } = require('./recommendationService');

const MAX_CONTEXT_MOVIES = 12;
const MAX_RETURNED_MOVIES = 6;

async function getFallbackForClarification(db, userId, profileId) {
  if (!userId) return [];
  return getUserRecommendations(db, userId, 4, profileId).catch(() => []);
}

function buildOffTopicResponse(intent) {
  return {
    reply: 'Mình chỉ tư vấn phim ở đây thôi.\nTối nay bạn muốn vui nhẹ, hồi hộp hay lãng mạn?',
    recommendations: [],
    suggested_replies: ['Hài nhẹ nhàng', 'Kinh dị căng thẳng', 'Tình cảm Hàn Quốc'],
    conversation: {
      memory_used: Boolean(intent.hasMemory),
      follow_up: false,
      refinement: {},
    },
    source: 'off-topic',
    provider: 'database-rules',
    model: null,
    grounding: buildGrounding('off-topic', [], []),
  };
}

async function buildClarificationResponse(db, userId, profileId, intent) {
  const fallback = await getFallbackForClarification(db, userId, profileId);
  return {
    reply: 'Bạn muốn xem theo mood nào?\nThử nói: hành động hài, kinh dị căng thẳng, tình cảm Hàn Quốc.',
    recommendations: fallback,
    suggested_replies: ['Hành động hài', 'Nhẹ nhàng hơn', 'Ngắn thôi'],
    conversation: {
      memory_used: Boolean(intent.hasMemory),
      follow_up: Boolean(intent.isFollowUp),
      refinement: intent.refinement,
    },
    source: 'clarification',
    provider: 'database-rules',
    model: null,
    grounding: buildGrounding('clarification', fallback, fallback),
  };
}

async function chatWithMovieAdvisor(db, { message, user_id, profile_id, history, shown_movie_ids }) {
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    const error = new Error('Bạn nhập gu phim trước nhé.');
    error.statusCode = 400;
    throw error;
  }

  const intent = buildConversationIntent(cleanMessage, history);

  if (isClearlyOffTopic(cleanMessage)) {
    return buildOffTopicResponse(intent);
  }

  if (shouldAskClarifyingQuestion(cleanMessage)) {
    return buildClarificationResponse(db, user_id, profile_id, intent);
  }

  const retrievalMessage = buildRetrievalMessage(cleanMessage, history);
  const excludedIds = intent.isFollowUp ? normalizeIdList(shown_movie_ids) : [];
  const baseLimit = excludedIds.length ? MAX_CONTEXT_MOVIES + Math.min(excludedIds.length, 12) : MAX_CONTEXT_MOVIES;
  const baseCandidates = await getCandidateMovies(db, {
    message: retrievalMessage,
    userId: user_id,
    profileId: profile_id,
    limit: baseLimit,
    signals: messageSignals(retrievalMessage),
  });

  let candidates = excludedIds.length
    ? baseCandidates.filter((movie) => !excludedIds.includes(Number(movie.id))).slice(0, MAX_CONTEXT_MOVIES)
    : baseCandidates;

  candidates = applyConversationRefinements(candidates, intent.refinement, MAX_CONTEXT_MOVIES).slice(0, MAX_CONTEXT_MOVIES);
  if (intent.isFollowUp) {
    candidates = await fillCandidatePool(db, candidates, excludedIds, MAX_CONTEXT_MOVIES);
  }
  if (!candidates.length) {
    candidates = applyConversationRefinements(baseCandidates, intent.refinement, MAX_CONTEXT_MOVIES).slice(0, MAX_CONTEXT_MOVIES);
  }

  let source = 'rule-based';
  let provider = 'database-rules';
  let verified = verifyRecommendations([], candidates, MAX_RETURNED_MOVIES);
  let aiError = null;

  try {
    const geminiResult = await callGemini(retrievalMessage, candidates, intent, {
      maxReturnedMovies: MAX_RETURNED_MOVIES,
    });
    const geminiIds = extractRecommendationIds(geminiResult);
    if (geminiIds.length) {
      verified = verifyRecommendations(geminiIds, candidates, MAX_RETURNED_MOVIES);
      source = 'gemini-grounded';
      provider = 'gemini';
    }
  } catch (error) {
    console.warn('[AI fallback]', error.message);
    source = 'rule-based-fallback';
    aiError = {
      code: error.publicCode || 'GEMINI_ERROR',
      message: error.publicMessage || 'Mình bị gián đoạn một chút, nhưng vẫn có thể chọn phim cho bạn.',
      http_status: error.httpStatus || null,
    };
  }

  return buildResponse({
    message: retrievalMessage,
    candidates,
    recommendations: verified,
    source,
    provider,
    model: provider === 'gemini' ? getGeminiModel() : null,
    aiError,
    intent,
    limit: MAX_RETURNED_MOVIES,
  });
}

module.exports = {
  chatWithMovieAdvisor,
  getAiStatus,
};
