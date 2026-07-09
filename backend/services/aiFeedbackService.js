const VALID_FEEDBACK_TYPES = new Set(['like', 'dislike', 'watched', 'hide']);
const DEFAULT_STATUS = Object.freeze({
  like: false,
  dislike: false,
  watched: false,
  hide: false,
});

const OPPOSITE_TYPES = {
  like: ['dislike', 'hide'],
  dislike: ['like'],
  watched: [],
  hide: ['like'],
};

function isMissingFeedbackTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function normalizeAiFeedbackType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'liked') return 'like';
  if (type === 'hidden' || type === 'blocked') return 'hide';
  if (type === 'seen') return 'watched';
  return VALID_FEEDBACK_TYPES.has(type) ? type : '';
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeMovieIds(movieIds) {
  const source = Array.isArray(movieIds) ? movieIds : String(movieIds || '').split(',');
  return [...new Set(source.map(toPositiveInt).filter(Boolean))].slice(0, 80);
}

function emptyFeedbackMap(movieIds = []) {
  return Object.fromEntries(
    normalizeMovieIds(movieIds).map((movieId) => [movieId, { ...DEFAULT_STATUS, movie_id: movieId }])
  );
}

function buildFeedbackMap(rows, movieIds = []) {
  const map = emptyFeedbackMap(movieIds);
  rows.forEach((row) => {
    const movieId = Number(row.movie_id);
    const type = normalizeAiFeedbackType(row.feedback_type);
    if (!movieId || !type) return;
    if (!map[movieId]) map[movieId] = { ...DEFAULT_STATUS, movie_id: movieId };
    map[movieId][type] = true;
  });
  return map;
}

async function ensureVisibleMovie(db, movieId) {
  const [rows] = await db.execute(
    'SELECT id, title FROM movies WHERE id = ? AND is_visible = 1 LIMIT 1',
    [movieId]
  );
  if (!rows.length) {
    const error = new Error('Khong tim thay phim');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

async function getAiMovieFeedbackMap(db, { userId, profileId, movieIds } = {}) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  const ids = normalizeMovieIds(movieIds);
  if (!numericUserId || !numericProfileId || !ids.length) return emptyFeedbackMap(ids);

  try {
    const [rows] = await db.execute(
      `SELECT movie_id, feedback_type
       FROM ai_movie_feedback
       WHERE user_id = ?
         AND profile_id = ?
         AND movie_id IN (${ids.map(() => '?').join(',')})`,
      [numericUserId, numericProfileId, ...ids]
    );
    return buildFeedbackMap(rows, ids);
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return emptyFeedbackMap(ids);
    throw error;
  }
}

async function setAiMovieFeedback(db, {
  userId,
  profileId,
  movieId,
  feedbackType,
  active = true,
  sessionId = null,
  source = 'chatbot',
  metadata = {},
} = {}) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  const numericMovieId = toPositiveInt(movieId);
  const type = normalizeAiFeedbackType(feedbackType);

  if (!numericUserId || !numericProfileId) {
    const error = new Error('Can dang nhap de luu gu phim');
    error.statusCode = 401;
    throw error;
  }
  if (!numericMovieId) {
    const error = new Error('movie_id khong hop le');
    error.statusCode = 400;
    throw error;
  }
  if (!type) {
    const error = new Error('feedback_type khong hop le');
    error.statusCode = 400;
    throw error;
  }

  await ensureVisibleMovie(db, numericMovieId);

  try {
    if (!active) {
      await db.execute(
        `DELETE FROM ai_movie_feedback
         WHERE user_id = ? AND profile_id = ? AND movie_id = ? AND feedback_type = ?`,
        [numericUserId, numericProfileId, numericMovieId, type]
      );
      const feedback = await getAiMovieFeedbackMap(db, {
        userId: numericUserId,
        profileId: numericProfileId,
        movieIds: [numericMovieId],
      });
      return feedback[numericMovieId];
    }

    const oppositeTypes = OPPOSITE_TYPES[type] || [];
    if (oppositeTypes.length) {
      await db.execute(
        `DELETE FROM ai_movie_feedback
         WHERE user_id = ?
           AND profile_id = ?
           AND movie_id = ?
           AND feedback_type IN (${oppositeTypes.map(() => '?').join(',')})`,
        [numericUserId, numericProfileId, numericMovieId, ...oppositeTypes]
      );
    }

    const insertParams = [
      numericUserId,
      numericProfileId,
      numericMovieId,
      type,
      String(source || 'chatbot').slice(0, 40),
      sessionId ? String(sessionId).slice(0, 64) : null,
      JSON.stringify(metadata || {}),
    ];
    const insertSql = `INSERT INTO ai_movie_feedback
      (user_id, profile_id, movie_id, feedback_type, source, session_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source = VALUES(source),
       session_id = VALUES(session_id),
       metadata = VALUES(metadata),
       updated_at = CURRENT_TIMESTAMP`;

    try {
      await db.execute(insertSql, insertParams);
    } catch (error) {
      if (error?.code !== 'ER_NO_REFERENCED_ROW_2' || !insertParams[5]) throw error;
      insertParams[5] = null;
      await db.execute(insertSql, insertParams);
    }

    const feedback = await getAiMovieFeedbackMap(db, {
      userId: numericUserId,
      profileId: numericProfileId,
      movieIds: [numericMovieId],
    });
    return feedback[numericMovieId];
  } catch (error) {
    if (isMissingFeedbackTableError(error)) {
      error.statusCode = 500;
      error.message = 'Chua chay migration ai_movie_feedback';
    }
    throw error;
  }
}

async function getAiFeedbackSeeds(db, userId, profileId, types, weights, limit = 16) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  const safeTypes = types.map(normalizeAiFeedbackType).filter(Boolean);
  if (!numericUserId || !safeTypes.length) return [];

  try {
    const [rows] = await db.execute(
      `SELECT movie_id, feedback_type, updated_at AS last_seen
       FROM ai_movie_feedback
       WHERE user_id = ?
         AND (? IS NULL OR profile_id = ?)
         AND feedback_type IN (${safeTypes.map(() => '?').join(',')})
       ORDER BY updated_at DESC
       LIMIT ${Math.max(1, Math.min(Number(limit) || 16, 50))}`,
      [numericUserId, numericProfileId, numericProfileId, ...safeTypes]
    );

    return rows
      .map((row) => ({
        movie_id: Number(row.movie_id),
        weight: weights[row.feedback_type] || 1,
        last_seen: row.last_seen,
        feedback_type: row.feedback_type,
      }))
      .filter((row) => row.movie_id > 0);
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return [];
    throw error;
  }
}

function getAiPositiveFeedbackSeeds(db, userId, profileId, limit = 16) {
  return getAiFeedbackSeeds(db, userId, profileId, ['like', 'watched'], {
    like: 6,
    watched: 3,
  }, limit);
}

function getAiNegativeFeedbackSeeds(db, userId, profileId, limit = 16) {
  return getAiFeedbackSeeds(db, userId, profileId, ['dislike', 'hide'], {
    dislike: 3,
    hide: 4,
  }, limit);
}

async function getAiExcludedFeedbackMovieIds(db, userId, profileId) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  if (!numericUserId) return [];

  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT movie_id
       FROM ai_movie_feedback
       WHERE user_id = ?
         AND (? IS NULL OR profile_id = ?)
         AND feedback_type IN ('dislike', 'hide', 'watched')`,
      [numericUserId, numericProfileId, numericProfileId]
    );
    return rows.map((row) => Number(row.movie_id)).filter(Boolean);
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return [];
    throw error;
  }
}

async function getAiFeedbackStats(db) {
  try {
    const [rows] = await db.execute(
      `SELECT feedback_type, COUNT(*) AS total
       FROM ai_movie_feedback
       GROUP BY feedback_type`
    );
    return rows.reduce((stats, row) => {
      stats[row.feedback_type] = Number(row.total) || 0;
      return stats;
    }, { like: 0, dislike: 0, watched: 0, hide: 0 });
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return { like: 0, dislike: 0, watched: 0, hide: 0 };
    throw error;
  }
}

async function listAiMovieFeedback(db, { userId, profileId, limit = 120 } = {}) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 120, 240));
  const empty = { like: [], dislike: [], watched: [], hide: [] };
  if (!numericUserId || !numericProfileId) return empty;

  try {
    const [rows] = await db.execute(
      `SELECT
         f.movie_id,
         f.feedback_type,
         f.updated_at AS feedback_updated_at,
         m.id,
         m.title,
         m.original_title,
         m.poster_url,
         m.release_year,
         m.duration,
         m.imdb_rating,
         m.quality,
         m.status,
         COALESCE(GROUP_CONCAT(DISTINCT g.name SEPARATOR '|||'), '') AS genres,
         COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '|||'), '') AS countries
       FROM ai_movie_feedback f
       JOIN movies m ON m.id = f.movie_id
       LEFT JOIN movie_genres mg ON mg.movie_id = m.id
       LEFT JOIN genres g ON g.id = mg.genre_id
       LEFT JOIN movie_countries mc ON mc.movie_id = m.id
       LEFT JOIN countries c ON c.id = mc.country_id
       WHERE f.user_id = ?
         AND f.profile_id = ?
         AND m.is_visible = 1
       GROUP BY
         f.movie_id, f.feedback_type, f.updated_at,
         m.id, m.title, m.original_title, m.poster_url, m.release_year,
         m.duration, m.imdb_rating, m.quality, m.status
       ORDER BY f.updated_at DESC
       LIMIT ${safeLimit}`,
      [numericUserId, numericProfileId]
    );

    return rows.reduce((groups, row) => {
      const type = normalizeAiFeedbackType(row.feedback_type);
      if (!type) return groups;
      groups[type].push({
        id: Number(row.id),
        movie_id: Number(row.movie_id),
        feedback_type: type,
        title: row.title,
        original_title: row.original_title,
        poster_url: row.poster_url,
        release_year: row.release_year,
        duration: row.duration,
        imdb_rating: row.imdb_rating,
        quality: row.quality,
        status: row.status,
        genres: row.genres ? String(row.genres).split('|||') : [],
        countries: row.countries ? String(row.countries).split('|||') : [],
        feedback_updated_at: row.feedback_updated_at,
      });
      return groups;
    }, { ...empty });
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return empty;
    throw error;
  }
}

async function clearAiMovieFeedback(db, { userId, profileId, movieId = null, feedbackType = null } = {}) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  if (!numericUserId || !numericProfileId) {
    const error = new Error('Can dang nhap de cap nhat gu phim');
    error.statusCode = 401;
    throw error;
  }

  const where = ['user_id = ?', 'profile_id = ?'];
  const params = [numericUserId, numericProfileId];
  const numericMovieId = toPositiveInt(movieId);
  const type = normalizeAiFeedbackType(feedbackType);

  if (numericMovieId) {
    where.push('movie_id = ?');
    params.push(numericMovieId);
  }
  if (feedbackType && !type) {
    const error = new Error('feedback_type khong hop le');
    error.statusCode = 400;
    throw error;
  }
  if (type) {
    where.push('feedback_type = ?');
    params.push(type);
  }

  try {
    const [result] = await db.execute(
      `DELETE FROM ai_movie_feedback WHERE ${where.join(' AND ')}`,
      params
    );
    return Number(result.affectedRows) || 0;
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return 0;
    throw error;
  }
}

module.exports = {
  clearAiMovieFeedback,
  getAiExcludedFeedbackMovieIds,
  getAiFeedbackStats,
  getAiMovieFeedbackMap,
  getAiNegativeFeedbackSeeds,
  getAiPositiveFeedbackSeeds,
  listAiMovieFeedback,
  normalizeAiFeedbackType,
  setAiMovieFeedback,
};
