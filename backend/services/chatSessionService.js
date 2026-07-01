const crypto = require('crypto');

function makeSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(18).toString('hex');
}

function isMissingChatTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || /ai_chat_sessions|ai_chat_messages/i.test(error?.message || '');
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
    };
  } catch (error) {
    if (isMissingChatTableError(error)) {
      return {
        persisted: false,
        sessions: { total: 0, last_7_days: 0 },
        messages: { total: 0, user: 0, assistant: 0, gemini: 0, rule_based: 0, fallback: 0 },
        recent: [],
      };
    }
    throw error;
  }
}

module.exports = {
  ensureChatSession,
  getAiChatStats,
  saveChatExchange,
};
