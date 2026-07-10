const crypto = require('crypto');

const VALID_EVENT_TYPES = new Set([
  'response',
  'error',
  'impression',
  'why_open',
  'detail_click',
  'play',
  'save',
  'feedback',
]);
const MOVIE_EVENT_TYPES = new Set(['impression', 'why_open', 'detail_click', 'play', 'save', 'feedback']);

function isMissingAnalyticsTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function clampInteger(value, min, max, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeJson(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanString(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function createRecommendationRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(18).toString('hex');
}

function emptyAnalytics(days = 30) {
  return {
    available: false,
    window_days: days,
    totals: {
      responses: 0,
      errors: 0,
      impressions: 0,
      why_opens: 0,
      detail_clicks: 0,
      plays: 0,
      saves: 0,
      feedback: 0,
    },
    rates: {
      detail_ctr: 0,
      play_rate: 0,
      save_rate: 0,
      feedback_rate: 0,
      zero_result_rate: 0,
      fallback_rate: 0,
      error_rate: 0,
    },
    latency: { average_ms: 0, p95_ms: 0, samples: 0 },
    providers: [],
    sources: [],
    top_feedback_reasons: [],
    trend: [],
  };
}

async function getVisibleMovieIds(db, movieIds) {
  const ids = [...new Set(movieIds.map(toPositiveInt).filter(Boolean))];
  if (!ids.length) return new Set();
  const [rows] = await db.execute(
    `SELECT id FROM movies WHERE is_visible = 1 AND id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return new Set(rows.map((row) => Number(row.id)));
}

async function insertEvent(db, event) {
  const params = [
    event.eventKey,
    event.requestId,
    event.sessionId,
    event.userId,
    event.profileId,
    event.movieId,
    event.eventType,
    event.position,
    event.source,
    event.provider,
    event.latencyMs,
    JSON.stringify(event.metadata || {}),
  ];
  const sql = `INSERT INTO ai_recommendation_events
    (event_key, request_id, session_id, user_id, profile_id, movie_id, event_type,
     \`position\`, source, provider, latency_ms, metadata)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE event_key = VALUES(event_key)`;

  try {
    const [result] = await db.execute(sql, params);
    return Number(result.insertId) > 0 ? 1 : 0;
  } catch (error) {
    if (error?.code !== 'ER_NO_REFERENCED_ROW_2' || !params[2]) throw error;
    params[2] = null;
    const [result] = await db.execute(sql, params);
    return Number(result.insertId) > 0 ? 1 : 0;
  }
}

async function recordRecommendationEvents(db, {
  userId = null,
  profileId = null,
  sessionId = null,
  requestId = null,
  source = null,
  provider = null,
  events = [],
} = {}) {
  if (process.env.AI_ANALYTICS_DISABLED === 'true') return { recorded: 0, accepted: 0 };
  const input = (Array.isArray(events) ? events : [events]).slice(0, 40);
  if (!input.length) return { recorded: 0, accepted: 0 };

  const normalized = input.map((event) => {
    const item = safeObject(event);
    const eventType = cleanString(item.event_type || item.type, 32);
    if (!VALID_EVENT_TYPES.has(eventType)) return null;
    const movieId = toPositiveInt(item.movie_id);
    if (MOVIE_EVENT_TYPES.has(eventType) && !movieId) return null;
    return {
      eventType,
      eventKey: cleanString(item.event_key, 160),
      requestId: cleanString(item.request_id || requestId, 64),
      sessionId: cleanString(item.session_id || sessionId, 64),
      userId: toPositiveInt(userId),
      profileId: toPositiveInt(profileId),
      movieId,
      position: clampInteger(item.position, 1, 100, null),
      source: cleanString(item.source || source, 64),
      provider: cleanString(item.provider || provider, 64),
      latencyMs: clampInteger(item.latency_ms, 0, 600000, null),
      metadata: safeObject(item.metadata),
    };
  }).filter(Boolean);

  if (!normalized.length) return { recorded: 0, accepted: 0 };

  try {
    const visibleMovieIds = await getVisibleMovieIds(db, normalized.map((event) => event.movieId));
    const accepted = normalized.filter((event) => !event.movieId || visibleMovieIds.has(event.movieId));
    let recorded = 0;
    for (const event of accepted) recorded += await insertEvent(db, event);
    return { recorded, accepted: accepted.length };
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) return { recorded: 0, accepted: 0, unavailable: true };
    throw error;
  }
}

async function recordRecommendationResponse(db, {
  requestId,
  sessionId = null,
  userId = null,
  profileId = null,
  result = null,
  error = null,
  latencyMs = 0,
  message = '',
} = {}) {
  const failed = Boolean(error);
  const recommendations = Array.isArray(result?.recommendations) ? result.recommendations : [];
  const eventType = failed ? 'error' : 'response';
  const recommendationEligible = !failed && !['off-topic', 'clarification'].includes(result?.source);
  return recordRecommendationEvents(db, {
    userId,
    profileId,
    sessionId,
    requestId,
    source: result?.source || (failed ? 'error' : null),
    provider: result?.provider || null,
    events: [{
      event_type: eventType,
      event_key: `${eventType}:${requestId}`,
      latency_ms: latencyMs,
      metadata: {
        query: String(message || '').trim().slice(0, 300),
        recommendation_count: recommendations.length,
        recommendation_eligible: recommendationEligible,
        zero_result: recommendationEligible && recommendations.length === 0,
        fallback: Boolean(result?.source && String(result.source).includes('fallback')),
        error_status: error?.statusCode || null,
        error_code: error?.publicCode || error?.code || null,
      },
    }],
  });
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator) / Number(denominator)) * 100).toFixed(1));
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

async function getRecommendationAnalytics(db, { profileId = null, days = 30 } = {}) {
  const safeDays = clampInteger(days, 1, 365, 30);
  const numericProfileId = toPositiveInt(profileId);
  const profileClause = numericProfileId ? 'AND profile_id = ?' : '';
  const params = numericProfileId ? [numericProfileId] : [];
  const windowSql = `created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)`;

  try {
    const [countRows, responseRows, dimensionRows, trendRows] = await Promise.all([
      db.execute(
        `SELECT event_type, COUNT(*) AS total
         FROM ai_recommendation_events
         WHERE ${windowSql} ${profileClause}
         GROUP BY event_type`,
        params
      ).then(([rows]) => rows),
      db.execute(
        `SELECT event_type, source, provider, latency_ms, metadata
         FROM ai_recommendation_events
         WHERE ${windowSql} ${profileClause}
           AND event_type IN ('response', 'error')`,
        params
      ).then(([rows]) => rows),
      db.execute(
        `SELECT source, provider, COUNT(*) AS total
         FROM ai_recommendation_events
         WHERE ${windowSql} ${profileClause} AND event_type = 'response'
         GROUP BY source, provider`,
        params
      ).then(([rows]) => rows),
      db.execute(
        `SELECT DATE(created_at) AS day, event_type, COUNT(*) AS total
         FROM ai_recommendation_events
         WHERE ${windowSql} ${profileClause}
         GROUP BY DATE(created_at), event_type
         ORDER BY day ASC`,
        params
      ).then(([rows]) => rows),
    ]);

    const counts = Object.fromEntries(countRows.map((row) => [row.event_type, Number(row.total) || 0]));
    const responses = counts.response || 0;
    const errors = counts.error || 0;
    const impressions = counts.impression || 0;
    const parsedResponses = responseRows.map((row) => ({ ...row, metadata: safeJson(row.metadata, {}) }));
    const eligibleResponses = parsedResponses.filter((row) => (
      row.event_type === 'response' && row.metadata.recommendation_eligible !== false
    ));
    const zeroResults = eligibleResponses.filter((row) => row.metadata.zero_result).length;
    const fallbacks = parsedResponses.filter((row) => row.event_type === 'response' && row.metadata.fallback).length;
    const latencies = parsedResponses
      .filter((row) => row.event_type === 'response')
      .map((row) => Number(row.latency_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const providerMap = new Map();
    const sourceMap = new Map();
    dimensionRows.forEach((row) => {
      const providerName = row.provider || 'unknown';
      const sourceName = row.source || 'unknown';
      providerMap.set(providerName, (providerMap.get(providerName) || 0) + (Number(row.total) || 0));
      sourceMap.set(sourceName, (sourceMap.get(sourceName) || 0) + (Number(row.total) || 0));
    });

    let feedbackReasons = [];
    try {
      const feedbackProfileClause = numericProfileId ? 'AND profile_id = ?' : '';
      const [reasonRows] = await db.execute(
        `SELECT
           COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.reason_label')), 'null'), 'Không nêu lý do') AS label,
           COUNT(*) AS total
         FROM ai_movie_feedback
         WHERE updated_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
           ${feedbackProfileClause}
           AND feedback_type IN ('dislike', 'hide')
         GROUP BY label
         ORDER BY total DESC, label ASC
         LIMIT 8`,
        params
      );
      feedbackReasons = reasonRows.map((row) => ({ label: row.label, total: Number(row.total) || 0 }));
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    }

    const trendMap = new Map();
    trendRows.forEach((row) => {
      const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);
      if (!trendMap.has(day)) trendMap.set(day, { day });
      trendMap.get(day)[row.event_type] = Number(row.total) || 0;
    });

    return {
      available: true,
      window_days: safeDays,
      totals: {
        responses,
        errors,
        impressions,
        why_opens: counts.why_open || 0,
        detail_clicks: counts.detail_click || 0,
        plays: counts.play || 0,
        saves: counts.save || 0,
        feedback: counts.feedback || 0,
      },
      rates: {
        detail_ctr: percentage(counts.detail_click || 0, impressions),
        play_rate: percentage(counts.play || 0, impressions),
        save_rate: percentage(counts.save || 0, impressions),
        feedback_rate: percentage(counts.feedback || 0, impressions),
        zero_result_rate: percentage(zeroResults, eligibleResponses.length),
        fallback_rate: percentage(fallbacks, responses),
        error_rate: percentage(errors, responses + errors),
      },
      latency: {
        average_ms: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
        p95_ms: percentile(latencies, 0.95),
        samples: latencies.length,
      },
      providers: [...providerMap.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
      sources: [...sourceMap.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
      top_feedback_reasons: feedbackReasons,
      trend: [...trendMap.values()],
    };
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) return emptyAnalytics(safeDays);
    throw error;
  }
}

async function getMovieEngagementScores(db, movieIds, days = 90) {
  const ids = [...new Set((movieIds || []).map(toPositiveInt).filter(Boolean))].slice(0, 500);
  if (!ids.length) return new Map();
  const safeDays = clampInteger(days, 1, 365, 90);
  try {
    const [rows] = await db.execute(
      `SELECT
         movie_id,
         SUM(event_type = 'impression') AS impressions,
         SUM(event_type = 'detail_click') AS detail_clicks,
         SUM(event_type = 'play') AS plays,
         SUM(event_type = 'save') AS saves,
         SUM(event_type = 'feedback' AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.feedback_type')) IN ('like', 'watched')) AS positive_feedback,
         SUM(event_type = 'feedback' AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.feedback_type')) IN ('dislike', 'hide')) AS negative_feedback
       FROM ai_recommendation_events
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
         AND movie_id IN (${ids.map(() => '?').join(',')})
       GROUP BY movie_id`,
      ids
    );
    return new Map(rows.map((row) => {
      const impressions = Number(row.impressions) || 0;
      const detailClicks = Number(row.detail_clicks) || 0;
      const plays = Number(row.plays) || 0;
      const saves = Number(row.saves) || 0;
      const positiveFeedback = Number(row.positive_feedback) || 0;
      const negativeFeedback = Number(row.negative_feedback) || 0;
      const rawScore = (
        detailClicks * 0.18
        + plays * 0.9
        + saves * 0.75
        + positiveFeedback * 0.8
        - negativeFeedback * 0.7
      ) / (impressions + 5);
      return [Number(row.movie_id), {
        score: Math.max(0, Math.min(1, rawScore)),
        impressions,
        detail_clicks: detailClicks,
        plays,
        saves,
        positive_feedback: positiveFeedback,
        negative_feedback: negativeFeedback,
      }];
    }));
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) return new Map();
    throw error;
  }
}

module.exports = {
  createRecommendationRequestId,
  getMovieEngagementScores,
  getRecommendationAnalytics,
  recordRecommendationEvents,
  recordRecommendationResponse,
};
