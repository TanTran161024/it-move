const DEFAULT_MODEL = 'gemini-2.5-flash';
const { compactTasteProfile } = require('./profileTasteService');

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
  } else if (httpStatus === 403) {
    errorCode = 'PERMISSION_DENIED';
  } else if (httpStatus === 404 || /model.*not found|not found/i.test(combined)) {
    errorCode = 'MODEL_NOT_FOUND';
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

function buildGeminiPrompt(message, recommendations, intent = {}, maxReturnedMovies = 6, tasteProfile = null) {
  const context = recommendations.map(compactMovie);
  const compactTaste = compactTasteProfile(tasteProfile);
  return `
Bạn là bộ chọn phim cho website Smart Movie Streaming Web.
CONTEXT là danh sách phim thật đã lấy từ MySQL. Bạn chỉ được chọn id có trong CONTEXT.
Không tạo phim mới, không tự bịa rating, poster, tập phim, link xem, diễn viên hoặc năm phát hành.
Nếu dữ liệu không đủ khớp, vẫn chỉ chọn các phim phù hợp nhất trong CONTEXT và không thêm dữ liệu ngoài.
Nếu USER_MESSAGE là câu nối tiếp như "phim khác", "nhẹ nhàng hơn", "ngắn thôi", hãy dùng CONVERSATION_INTENT để hiểu yêu cầu mới.
PROFILE_TASTE là gu đã học của profile hiện tại; dùng nó để ưu tiên phim hợp gu, nhưng USER_MESSAGE vẫn là yêu cầu chính.

CONTEXT:
${JSON.stringify(context, null, 2)}

PROFILE_TASTE:
${JSON.stringify(compactTaste, null, 2)}

CONVERSATION_INTENT:
${JSON.stringify({
  is_follow_up: Boolean(intent.isFollowUp),
  refinement: intent.refinement || {},
  previous_user_need: intent.previousUserText || '',
}, null, 2)}

USER_MESSAGE:
${message}

Trả về JSON hợp lệ, không markdown:
{
  "recommendation_ids": [id phim trong CONTEXT, tối đa ${maxReturnedMovies}],
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

function buildGenericGenerationConfig(model, options = {}) {
  const config = {
    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.3,
    maxOutputTokens: Number(options.maxOutputTokens) || 1024,
  };

  if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
  if (options.responseSchema) config.responseSchema = options.responseSchema;

  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function requestGemini(prompt, generationConfig) {
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
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
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

  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
}

async function callGeminiJson(prompt, responseSchema, options = {}) {
  const model = getGeminiModel();
  const text = await requestGemini(prompt, buildGenericGenerationConfig(model, {
    ...options,
    responseMimeType: 'application/json',
    responseSchema,
  }));
  return safeParseJson(text);
}

async function callGemini(message, recommendations, intent, options = {}) {
  if (!hasGeminiKey()) return null;

  const model = getGeminiModel();
  const text = await requestGemini(
    buildGeminiPrompt(message, recommendations, intent, options.maxReturnedMovies || 6, options.tasteProfile || null),
    buildGeminiGenerationConfig(model)
  );
  return safeParseJson(text);
}

module.exports = {
  callGemini,
  callGeminiJson,
  getAiStatus,
  getGeminiModel,
};
