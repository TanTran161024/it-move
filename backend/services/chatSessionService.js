const crypto = require('crypto');

function makeSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(18).toString('hex');
}

function isMissingChatTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function safeJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clampHistoryLimit(value) {
  const number = Number(value) || 24;
  return Math.max(1, Math.min(number, 60));
}

async function ensureChatSession(db, { sessionId, userId = null, profileId = null } = {}) {
  const id = sessionId && String(sessionId).trim() ? String(sessionId).trim().slice(0, 64) : makeSessionId();
  const numericUserId = Number(userId) || null;
  const numericProfileId = Number(profileId) || null;

  try {
    await db.execute(
      `INSERT INTO ai_chat_sessions (id, user_id, profile_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = COALESCE(VALUES(user_id), user_id),
         profile_id = COALESCE(VALUES(profile_id), profile_id),
         updated_at = CURRENT_TIMESTAMP`,
      [id, numericUserId, numericProfileId]
    );
    return { id, persisted: true };
  } catch (error) {
    if (isMissingChatTableError(error)) return { id, persisted: false };
    if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_ROW_IS_REFERENCED_2') {
      await db.execute(
        `INSERT INTO ai_chat_sessions (id, user_id, profile_id)
         VALUES (?, NULL, NULL)
         ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
        [id]
      );
      return { id, persisted: true };
    }
    throw error;
  }
}

async function getMovieCardsByIds(db, ids) {
  const uniqueIds = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return new Map();

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT
       m.id,
       m.title,
       m.original_title,
       m.poster_url,
       m.release_year,
       m.imdb_rating,
       m.quality,
       m.duration,
       m.description,
       COALESCE(GROUP_CONCAT(DISTINCT g.name SEPARATOR '|||'), '') AS genres,
       COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '|||'), '') AS countries
     FROM movies m
     LEFT JOIN movie_genres mg ON mg.movie_id = m.id
     LEFT JOIN genres g ON g.id = mg.genre_id
     LEFT JOIN movie_countries mc ON mc.movie_id = m.id
     LEFT JOIN countries c ON c.id = mc.country_id
     WHERE m.id IN (${placeholders}) AND m.is_visible = 1
     GROUP BY m.id`,
    uniqueIds
  );

  return new Map(rows.map((movie) => [
    Number(movie.id),
    {
      ...movie,
      genres: movie.genres ? String(movie.genres).split('|||') : [],
      countries: movie.countries ? String(movie.countries).split('|||') : [],
    },
  ]));
}

async function getLatestChatHistory(db, { userId = null, profileId = null, limit = 24 } = {}) {
  const numericUserId = Number(userId) || null;
  const numericProfileId = Number(profileId) || null;
  if (!numericUserId) {
    return { persisted: false, session_id: null, messages: [] };
  }

  try {
    const profileClause = numericProfileId ? 'profile_id = ?' : 'profile_id IS NULL';
    const sessionParams = numericProfileId ? [numericUserId, numericProfileId] : [numericUserId];
    const [sessions] = await db.execute(
      `SELECT id
       FROM ai_chat_sessions
       WHERE user_id = ? AND ${profileClause}
       ORDER BY updated_at DESC
       LIMIT 1`,
      sessionParams
    );

    const session = sessions[0];
    if (!session?.id) return { persisted: true, session_id: null, messages: [] };

    const safeLimit = clampHistoryLimit(limit);
    const [rows] = await db.execute(
      `SELECT role, content, source, provider, recommendation_ids, metadata, created_at
       FROM (
         SELECT *
         FROM ai_chat_messages
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ${safeLimit}
       ) recent
       ORDER BY id ASC`,
      [session.id]
    );

    const allRecommendationIds = rows.flatMap((row) => safeJson(row.recommendation_ids, []) || []);
    const movieMap = await getMovieCardsByIds(db, allRecommendationIds);
    const messages = rows
      .map((row) => {
        const recommendationIds = safeJson(row.recommendation_ids, []) || [];
        const metadata = safeJson(row.metadata, {}) || {};
        return {
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: row.content,
          recommendations: recommendationIds
            .map((id) => movieMap.get(Number(id)))
            .filter(Boolean)
            .slice(0, 6),
          source: row.source || 'history',
          provider: row.provider || null,
          grounding: metadata.grounding || null,
          aiError: metadata.ai_error || null,
          requestId: metadata.request_id || null,
          suggestedReplies: [],
          created_at: row.created_at,
        };
      })
      .filter((item) => item.content);

    return { persisted: true, session_id: session.id, messages };
  } catch (error) {
    if (isMissingChatTableError(error)) return { persisted: false, session_id: null, messages: [] };
    throw error;
  }
}

async function saveChatMessage(db, { sessionId, role, content, source = null, provider = null, recommendationIds = [], metadata = {} }) {
  if (!sessionId || !content) return false;
  try {
    await db.execute(
      `INSERT INTO ai_chat_messages
        (session_id, role, content, source, provider, recommendation_ids, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        role === 'assistant' ? 'assistant' : 'user',
        String(content).slice(0, 10000),
        source,
        provider,
        JSON.stringify(recommendationIds || []),
        JSON.stringify(metadata || {}),
      ]
    );
    await db.execute('UPDATE ai_chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);
    return true;
  } catch (error) {
    if (isMissingChatTableError(error)) return false;
    throw error;
  }
}

async function saveChatExchange(db, { sessionId, userMessage, assistantResult }) {
  if (!sessionId) return false;

  const recommendationIds = Array.isArray(assistantResult?.recommendations)
    ? assistantResult.recommendations.map((movie) => Number(movie.id)).filter(Boolean)
    : [];

  await saveChatMessage(db, {
    sessionId,
    role: 'user',
    content: userMessage,
    metadata: { received_at: new Date().toISOString() },
  });

  await saveChatMessage(db, {
    sessionId,
    role: 'assistant',
    content: assistantResult?.reply || '',
    source: assistantResult?.source || null,
    provider: assistantResult?.provider || null,
    recommendationIds,
    metadata: {
      conversation: assistantResult?.conversation || null,
      grounding: assistantResult?.grounding || null,
      ai_error: assistantResult?.ai_error || null,
      request_id: assistantResult?.request_id || null,
    },
  });

  return true;
}

async function getAiChatStats(db) {
  try {
    const [[sessionStats]] = await db.execute(
      `SELECT
         COUNT(*) AS total_sessions,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS sessions_7d
       FROM ai_chat_sessions`
    );
    const [[messageStats]] = await db.execute(
      `SELECT
         COUNT(*) AS total_messages,
         SUM(role = 'user') AS user_messages,
         SUM(role = 'assistant') AS assistant_messages,
         SUM(provider = 'gemini') AS gemini_messages,
         SUM(provider = 'database-rules') AS rule_messages,
         SUM(source = 'rule-based-fallback') AS fallback_messages
       FROM ai_chat_messages`
    );
    const [recentRows] = await db.execute(
      `SELECT session_id, role, source, provider, created_at
       FROM ai_chat_messages
       ORDER BY id DESC
       LIMIT 10`
    );
    const [recentQuestionRows] = await db.execute(
      `SELECT session_id, content, created_at
       FROM ai_chat_messages
       WHERE role = 'user'
       ORDER BY id DESC
       LIMIT 10`
    );
    const [topQuestionRows] = await db.execute(
      `SELECT
         MIN(SUBSTRING(TRIM(content), 1, 180)) AS question,
         COUNT(*) AS total
       FROM ai_chat_messages
       WHERE role = 'user' AND TRIM(content) <> ''
       GROUP BY LOWER(TRIM(content))
       ORDER BY total DESC, MAX(created_at) DESC
       LIMIT 8`
    );

    return {
      persisted: true,
      sessions: {
        total: Number(sessionStats.total_sessions) || 0,
        last_7_days: Number(sessionStats.sessions_7d) || 0,
      },
      messages: {
        total: Number(messageStats.total_messages) || 0,
        user: Number(messageStats.user_messages) || 0,
        assistant: Number(messageStats.assistant_messages) || 0,
        gemini: Number(messageStats.gemini_messages) || 0,
        rule_based: Number(messageStats.rule_messages) || 0,
        fallback: Number(messageStats.fallback_messages) || 0,
      },
      recent: recentRows,
      questions: {
        recent: recentQuestionRows.map((row) => ({
          session_id: row.session_id,
          content: row.content,
          created_at: row.created_at,
        })),
        top: topQuestionRows.map((row) => ({
          question: row.question,
          total: Number(row.total) || 0,
        })),
      },
    };
  } catch (error) {
    if (isMissingChatTableError(error)) {
      return {
        persisted: false,
        sessions: { total: 0, last_7_days: 0 },
        messages: { total: 0, user: 0, assistant: 0, gemini: 0, rule_based: 0, fallback: 0 },
        recent: [],
        questions: { recent: [], top: [] },
      };
    }
    throw error;
  }
}

module.exports = {
  ensureChatSession,
  getAiChatStats,
  getLatestChatHistory,
  saveChatExchange,
};
