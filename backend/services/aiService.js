const {
  searchMoviesForMessage,
  getUserRecommendations,
  messageSignals,
  normalizeText,
} = require('./recommendationService');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_CONTEXT_MOVIES = 12;
const MAX_RETURNED_MOVIES = 6;

let geminiHealth = {
  ok: null,
  checked_at: null,
  error_code: null,
  error_status: null,
  error_message: null,
  http_status: null,
};

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getAiStatus() {
  return {
    configured: hasGeminiKey(),
    provider: hasGeminiKey() ? 'gemini' : 'database-rules',
    model: getGeminiModel(),
    fallback: 'database-rules',
    grounded: true,
    no_fake_data: true,
    access_denied: geminiHealth.error_code === 'PROJECT_DENIED',
    health: geminiHealth,
  };
}

function setGeminiHealth(nextHealth) {
  geminiHealth = {
    ...geminiHealth,
    ...nextHealth,
    checked_at: new Date().toISOString(),
  };
}

function isMovieRelated(message) {
  const normalized = normalizeText(message);
  const movieTerms = [
    'phim', 'movie', 'xem', 'dien anh', 'tap', 'series', 'bo phim',
    'hanh dong', 'hai', 'kinh di', 'tinh cam', 'lang man', 'anime',
    'hoat hinh', 'vien tuong', 'vo thuat', 'trung quoc', 'han quoc',
    'nhat ban', 'my', 'dao dien', 'dien vien', 'imdb',
  ];
  return movieTerms.some((term) => normalized.includes(term));
}

function isClearlyOffTopic(message) {
  const normalized = normalizeText(message);
  const offTopicTerms = [
    'laptop', 'may tinh', 'dien thoai', 'thoi tiet', 'bong da',
    'nau an', 'code', 'lap trinh', 'chung khoan', 'crypto',
    'suc khoe', 'thuoc', 'du lich', 'khach san',
  ];
  return !isMovieRelated(message) && offTopicTerms.some((term) => normalized.includes(term));
}

function shouldAskClarifyingQuestion(message) {
  const normalized = normalizeText(message);
  const signals = messageSignals(message);
  const genericRequests = [
    'goi y', 'tu van', 'phim hay', 'muon xem phim', 'xem gi',
    'recommend', 'de xuat',
  ];

  const isGeneric = genericRequests.some((term) => normalized.includes(term));
  return isGeneric && signals.wanted.length === 0 && !signals.year && normalized.split(' ').length <= 8;
}

function compactMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    year: movie.release_year,
    imdb_rating: movie.imdb_rating,
    quality: movie.quality,
    genres: movie.genres,
    countries: movie.countries,
    description: movie.description ? String(movie.description).slice(0, 260) : '',
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content)
    .slice(-8);
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function isFollowUpMessage(message) {
  const normalized = normalizeText(message);
  const signals = messageSignals(message);
  const followUpTerms = ['khac', 'nua', 'them', 'tiep', 'hon', 'giong', 'nhu vay', 'doi gu'];
  return signals.wanted.length === 0 && !signals.year && (
    normalized.split(' ').length <= 5 || followUpTerms.some((term) => normalized.includes(term))
  );
}

function buildRetrievalMessage(message, history) {
  const cleanHistory = normalizeHistory(history);
  if (!isFollowUpMessage(message) || !cleanHistory.length) return message;

  const recentUserContext = cleanHistory
    .filter((item) => item.role === 'user')
    .slice(-2)
    .map((item) => item.content)
    .join(' ');

  return recentUserContext ? `${recentUserContext} ${message}` : message;
}

function safeParseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      return null;
    }
  }
}

function classifyGeminiError(httpStatus, bodyText) {
  const parsed = safeParseJson(bodyText);
  const googleStatus = parsed?.error?.status || null;
  const googleMessage = parsed?.error?.message || '';
  const combined = `${googleStatus || ''} ${googleMessage || bodyText || ''}`;
  let errorCode = 'GEMINI_ERROR';
  let publicMessage = 'Mình bị gián đoạn một chút, nhưng vẫn có thể chọn phim cho bạn.';

  if (httpStatus === 403 && /denied access|access restricted|terms of service|supported region/i.test(combined)) {
    errorCode = 'PROJECT_DENIED';
    publicMessage = 'Mình bị gián đoạn một chút, nhưng vẫn có thể chọn phim cho bạn.';
  } else if (httpStatus === 403) {
    errorCode = 'PERMISSION_DENIED';
    publicMessage = 'Mình bị gián đoạn một chút, nhưng vẫn có thể chọn phim cho bạn.';
  } else if (httpStatus === 404 || /model.*not found|not found/i.test(combined)) {
    errorCode = 'MODEL_NOT_FOUND';
    publicMessage = 'Mình bị gián đoạn một chút, nhưng vẫn có thể chọn phim cho bạn.';
  } else if (httpStatus === 429) {
    errorCode = 'RATE_LIMITED';
    publicMessage = 'Mình đang hơi bận một chút, nhưng vẫn có thể chọn phim cho bạn.';
  }

  return {
    ok: false,
    http_status: httpStatus,
    error_code: errorCode,
    error_status: googleStatus,
    error_message: publicMessage,
  };
}

function buildGeminiPrompt(message, recommendations) {
  const context = recommendations.map(compactMovie);
  return `
Bạn là bộ chọn phim cho website Smart Movie Streaming Web.
CONTEXT là danh sách phim thật đã lấy từ MySQL. Bạn chỉ được chọn id có trong CONTEXT.
Không tạo phim mới, không tự bịa rating, poster, tập phim, link xem, diễn viên hoặc năm phát hành.
Nếu dữ liệu không đủ khớp, vẫn chỉ chọn các phim phù hợp nhất trong CONTEXT và không thêm dữ liệu ngoài.

CONTEXT:
${JSON.stringify(context, null, 2)}

USER_MESSAGE:
${message}

Trả về JSON hợp lệ, không markdown:
{
  "recommendation_ids": [id phim trong CONTEXT, tối đa ${MAX_RETURNED_MOVIES}],
  "intent_summary": "tóm tắt rất ngắn nhu cầu của người dùng"
}
`.trim();
}

function buildGeminiGenerationConfig(model) {
  const config = {
    temperature: 0,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        recommendation_ids: {
          type: 'ARRAY',
          items: { type: 'INTEGER' },
        },
        intent_summary: { type: 'STRING' },
      },
      required: ['recommendation_ids'],
    },
  };

  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function callGemini(message, recommendations) {
  if (!hasGeminiKey()) return null;

  const model = getGeminiModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildGeminiPrompt(message, recommendations) }],
          },
        ],
        generationConfig: buildGeminiGenerationConfig(model),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const health = classifyGeminiError(response.status, body);
    setGeminiHealth(health);
    const error = new Error(`${health.error_code}: ${health.error_message}`);
    error.publicCode = health.error_code;
    error.publicMessage = health.error_message;
    error.httpStatus = response.status;
    throw error;
  }

  const data = await response.json();
  setGeminiHealth({
    ok: true,
    http_status: response.status,
    error_code: null,
    error_status: null,
    error_message: null,
  });
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
  return safeParseJson(text);
}

function extractRecommendationIds(geminiResult) {
  if (!geminiResult) return [];
  if (Array.isArray(geminiResult)) return geminiResult;

  const direct = geminiResult.recommendation_ids
    || geminiResult.recommendationIds
    || geminiResult.movie_ids
    || geminiResult.movieIds
    || geminiResult.ids;

  if (Array.isArray(direct)) return direct;
  if (Array.isArray(geminiResult.recommendations)) {
    return geminiResult.recommendations.map((item) => (
      typeof item === 'object' && item !== null ? item.id || item.movie_id || item.movieId : item
    ));
  }

  return [];
}

function verifyRecommendations(rawIds, candidates, limit = MAX_RETURNED_MOVIES) {
  const allowed = new Map(candidates.map((movie) => [Number(movie.id), movie]));
  const ids = Array.isArray(rawIds) ? rawIds.map(Number) : [];
  const verified = [];

  for (const id of ids) {
    if (allowed.has(id) && !verified.some((movie) => Number(movie.id) === id)) {
      verified.push(allowed.get(id));
    }
    if (verified.length >= limit) break;
  }

  for (const movie of candidates) {
    if (verified.length >= limit) break;
    if (!verified.some((item) => Number(item.id) === Number(movie.id))) {
      verified.push(movie);
    }
  }

  return verified.slice(0, limit);
}

function formatRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? `IMDb ${rating.toFixed(1)}` : null;
}

function formatMovie(movie) {
  const meta = [
    movie.release_year ? String(movie.release_year) : null,
    formatRating(movie.imdb_rating),
  ].filter(Boolean);

  return `${movie.title}${meta.length ? ` (${meta.join(' · ')})` : ''}`;
}

function readableWanted(labels) {
  const dictionary = {
    'hanh dong': 'hành động',
    hai: 'hài',
    'tinh cam': 'tình cảm',
    'kinh di': 'kinh dị',
    'vien tuong': 'viễn tưởng',
    'phieu luu': 'phiêu lưu',
    'hoat hinh': 'hoạt hình/anime',
    'tam ly': 'tâm lý',
    'vo thuat': 'võ thuật',
    'hoc duong': 'học đường',
    'trung quoc': 'Trung Quốc',
    'han quoc': 'Hàn Quốc',
    'nhat ban': 'Nhật Bản',
    'viet nam': 'Việt Nam',
    my: 'Mỹ',
  };
  return labels.map((label) => dictionary[label] || label);
}

function buildGroundedReply(message, recommendations) {
  if (!recommendations.length) {
    return 'Gu này hơi hẹp, mình cần thêm một chút manh mối.\nBạn thử đổi thể loại, quốc gia hoặc mood muốn xem nhé.';
  }

  const signals = messageSignals(message);
  const wanted = readableWanted(signals.wanted);
  const intro = wanted.length
    ? `Mình chọn vài phim hợp gu ${wanted.join(', ')} cho bạn:`
    : 'Mình chọn vài phim đáng xem cho bạn:';
  const topMovies = recommendations
    .slice(0, 3)
    .map((movie, index) => `${index + 1}. ${formatMovie(movie)}`)
    .join('\n');

  return `${intro}\n\n${topMovies}\n\nMuốn mình đổi mood hoặc chọn thêm phim khác không?`;
}

function buildGrounding(source, candidates, recommendations) {
  return {
    mode: 'mysql-catalog',
    source,
    context_count: candidates.length,
    verified_ids: recommendations.map((movie) => Number(movie.id)).filter(Boolean),
    no_fake_data: true,
  };
}

function buildResponse({ message, candidates, recommendations, source, provider, aiError = null }) {
  const verified = recommendations.slice(0, MAX_RETURNED_MOVIES);
  return {
    reply: buildGroundedReply(message, verified, source),
    recommendations: verified,
    source,
    provider,
    model: provider === 'gemini' ? getGeminiModel() : null,
    ai_error: aiError,
    grounding: buildGrounding(source, candidates, verified),
  };
}

async function getFallbackForClarification(db, userId) {
  if (!userId) return [];
  return getUserRecommendations(db, userId, 4).catch(() => []);
}

async function getCandidateMovies(db, message, userId, limit = MAX_CONTEXT_MOVIES) {
  const signals = messageSignals(message);
  const hasSearchIntent = signals.wanted.length > 0 || Boolean(signals.year) || signals.terms.some((term) => (
    term.length >= 3 && !['phim', 'xem', 'muon', 'goi', 'hay', 'cho', 'toi', 'can'].includes(term)
  ));

  if (hasSearchIntent) {
    return searchMoviesForMessage(db, message, { limit });
  }

  if (userId) {
    const userRecommendations = await getUserRecommendations(db, userId, limit).catch(() => []);
    if (userRecommendations.length) return userRecommendations;
  }

  return searchMoviesForMessage(db, message, { limit });
}

async function chatWithMovieAdvisor(db, { message, user_id, history, shown_movie_ids }) {
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    const error = new Error('Bạn nhập gu phim trước nhé.');
    error.statusCode = 400;
    throw error;
  }

  if (isClearlyOffTopic(cleanMessage)) {
    return {
      reply: 'Mình chỉ tư vấn phim ở đây thôi.\nTối nay bạn muốn vui nhẹ, hồi hộp hay lãng mạn?',
      recommendations: [],
      source: 'off-topic',
      provider: 'database-rules',
      model: null,
      grounding: buildGrounding('off-topic', [], []),
    };
  }

  if (shouldAskClarifyingQuestion(cleanMessage)) {
    const fallback = await getFallbackForClarification(db, user_id);
    return {
      reply: 'Bạn muốn xem theo mood nào?\nThử nói: hành động hài, kinh dị căng thẳng, tình cảm Hàn Quốc.',
      recommendations: fallback,
      source: 'clarification',
      provider: 'database-rules',
      model: null,
      grounding: buildGrounding('clarification', fallback, fallback),
    };
  }

  const retrievalMessage = buildRetrievalMessage(cleanMessage, history);
  const excludedIds = isFollowUpMessage(cleanMessage) ? normalizeIdList(shown_movie_ids) : [];
  const baseLimit = excludedIds.length ? MAX_CONTEXT_MOVIES + Math.min(excludedIds.length, 12) : MAX_CONTEXT_MOVIES;
  const baseCandidates = await getCandidateMovies(db, retrievalMessage, user_id, baseLimit);
  let candidates = excludedIds.length
    ? baseCandidates.filter((movie) => !excludedIds.includes(Number(movie.id))).slice(0, MAX_CONTEXT_MOVIES)
    : baseCandidates;
  if (!candidates.length) candidates = baseCandidates.slice(0, MAX_CONTEXT_MOVIES);
  let source = 'rule-based';
  let provider = 'database-rules';
  let verified = verifyRecommendations([], candidates);
  let aiError = null;

  try {
    const geminiResult = await callGemini(retrievalMessage, candidates);
    const geminiIds = extractRecommendationIds(geminiResult);
    if (geminiIds.length) {
      verified = verifyRecommendations(geminiIds, candidates);
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
    aiError,
  });
}

module.exports = {
  chatWithMovieAdvisor,
  getAiStatus,
};
