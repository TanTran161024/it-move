const {
  clearAiMovieFeedback,
  getAiFeedbackStats,
  setAiMovieFeedback,
} = require('./aiFeedbackService');
const { getUserRecommendations } = require('./recommendationService');
const { compactTasteProfile, getProfileTasteProfile } = require('./profileTasteService');

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function safeLimit(value, fallback = 80, max = 240) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, max);
}

function feedbackLabel(type) {
  return {
    like: 'Thích',
    dislike: 'Không thích',
    watched: 'Đã xem',
    hide: 'Không gợi ý nữa',
  }[type] || type || 'Không rõ';
}

function durationPreferenceLabel(preference) {
  return {
    short: 'Phim ngắn',
    medium: 'Thời lượng vừa',
    long: 'Phim dài',
    series: 'Phim bộ / tập ngắn',
  }[preference] || 'Chưa rõ';
}

function durationBucketFromMovie(movie) {
  if (Number(movie?.is_series) === 1) return 'series';
  const text = String(movie?.duration || '').toLowerCase();
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(gio|giờ|hour|h)/);
  const minuteMatch = text.match(/(\d+)\s*(phut|phút|min|m)/);
  let minutes = 0;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (!minutes) {
    const plain = text.match(/\b(\d{2,3})\b/);
    if (plain) minutes = Number(plain[1]);
  }
  if (!minutes) return 'unknown';
  if (minutes <= 45) return 'short';
  if (minutes <= 105) return 'medium';
  return 'long';
}

function formatProfileName(profile) {
  return `${profile.username || profile.email || `User #${profile.user_id}`} / ${profile.name || `Profile #${profile.id}`}`;
}

async function getProfileRows(db, limit = 60) {
  const safeProfileLimit = safeLimit(limit, 60, 100);
  const [rows] = await db.execute(
    `SELECT
       p.id,
       p.user_id,
       p.name,
       p.avatar_color,
       p.avatar_url,
       p.is_kids,
       u.username,
       u.email
     FROM user_profiles p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ${safeProfileLimit}`
  );
  return rows;
}

async function getTasteProfileCounts(db) {
  const [[totalRow]] = await db.execute('SELECT COUNT(*) AS total FROM user_profiles');
  const totalProfiles = Number(totalRow?.total) || 0;

  try {
    const [[tasteRow]] = await db.execute(
      `SELECT COUNT(DISTINCT profile_id) AS total
       FROM (
         SELECT profile_id FROM user_favorites WHERE profile_id IS NOT NULL
         UNION
         SELECT profile_id FROM user_watchlist WHERE profile_id IS NOT NULL
         UNION
         SELECT profile_id FROM user_watch_history WHERE profile_id IS NOT NULL
         UNION
         SELECT profile_id FROM ai_movie_feedback WHERE profile_id IS NOT NULL
       ) taste_profiles`
    );
    const profilesWithTaste = Number(tasteRow?.total) || 0;
    return {
      profilesWithTaste,
      profilesWithoutTaste: Math.max(0, totalProfiles - profilesWithTaste),
    };
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    return { profilesWithTaste: 0, profilesWithoutTaste: totalProfiles };
  }
}

async function getTopNames(db, table, linkTable, linkColumn, feedbackTypes, limit = 5) {
  const safeTopLimit = safeLimit(limit, 5, 12);
  const placeholders = feedbackTypes.map(() => '?').join(',');
  try {
    const [rows] = await db.execute(
      `SELECT n.name, COUNT(*) AS total
       FROM ai_movie_feedback f
       JOIN ${linkTable} link ON link.movie_id = f.movie_id
       JOIN ${table} n ON n.id = link.${linkColumn}
       WHERE f.feedback_type IN (${placeholders})
       GROUP BY n.id, n.name
       ORDER BY total DESC, n.name ASC
       LIMIT ${safeTopLimit}`,
      feedbackTypes
    );
    return rows.map((row) => ({ name: row.name, total: Number(row.total) || 0 }));
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

async function getPreferredDuration(db) {
  try {
    const [rows] = await db.execute(
      `SELECT m.duration, m.is_series, COUNT(*) AS total
       FROM ai_movie_feedback f
       JOIN movies m ON m.id = f.movie_id
       WHERE f.feedback_type IN ('like', 'watched')
       GROUP BY m.duration, m.is_series`
    );
    const buckets = rows.reduce((acc, row) => {
      const bucket = durationBucketFromMovie(row);
      acc[bucket] = (acc[bucket] || 0) + (Number(row.total) || 0);
      return acc;
    }, {});
    const top = Object.entries(buckets)
      .filter(([key]) => key !== 'unknown')
      .sort((left, right) => right[1] - left[1])[0];
    return {
      label: durationPreferenceLabel(top?.[0]),
      buckets,
    };
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return { label: 'Chưa rõ', buckets: {} };
    throw error;
  }
}

async function getGlobalTopTastes(db) {
  const [likedGenres, likedCountries, avoidedGenres, duration] = await Promise.all([
    getTopNames(db, 'genres', 'movie_genres', 'genre_id', ['like', 'watched']),
    getTopNames(db, 'countries', 'movie_countries', 'country_id', ['like', 'watched']),
    getTopNames(db, 'genres', 'movie_genres', 'genre_id', ['dislike', 'hide']),
    getPreferredDuration(db),
  ]);

  return {
    likedGenres,
    likedCountries,
    avoidedGenres,
    preferredDuration: duration.label,
    durationBuckets: duration.buckets,
  };
}

async function hydrateAdminProfiles(db, rows) {
  return Promise.all(rows.map(async (row) => {
    const taste = await getProfileTasteProfile(db, row.user_id, row.id).catch(() => null);
    const compact = compactTasteProfile(taste);
    return {
      id: Number(row.id),
      user_id: Number(row.user_id),
      name: formatProfileName(row),
      profile_name: row.name,
      username: row.username,
      email: row.email,
      avatar_color: row.avatar_color,
      avatar_url: row.avatar_url,
      is_kids: Boolean(row.is_kids),
      desc: compact?.summary?.length ? compact.summary.join(', ') : 'Chưa đủ dữ liệu gu',
      type: durationPreferenceLabel(compact?.duration?.preference),
      taste_profile: compact,
    };
  }));
}

async function getRecentFeedbackRows(db, { profileId = null, limit = 120 } = {}) {
  const safeFeedbackLimit = safeLimit(limit, 80, 200);
  const numericProfileId = toPositiveInt(profileId);
  const params = [];
  const profileWhere = numericProfileId ? 'AND f.profile_id = ?' : '';
  if (numericProfileId) params.push(numericProfileId);

  try {
    const [rows] = await db.execute(
      `SELECT
         f.id,
         f.user_id,
         f.profile_id,
         f.movie_id,
         f.feedback_type,
         f.source,
         f.updated_at,
         u.username,
         u.email,
         p.name AS profile_name,
         m.title AS movie_title,
         m.poster_url
       FROM ai_movie_feedback f
       JOIN users u ON u.id = f.user_id
       JOIN user_profiles p ON p.id = f.profile_id
       JOIN movies m ON m.id = f.movie_id
       WHERE m.is_visible = 1
       ${profileWhere}
       ORDER BY f.updated_at DESC, f.id DESC
       LIMIT ${safeFeedbackLimit}`,
      params
    );

    return rows.map((row) => ({
      id: Number(row.id),
      user_id: Number(row.user_id),
      profile_id: Number(row.profile_id),
      movie_id: Number(row.movie_id),
      profile: `${row.username || row.email || `User #${row.user_id}`} / ${row.profile_name}`,
      movie: row.movie_title,
      poster_url: row.poster_url,
      type: row.feedback_type,
      type_label: feedbackLabel(row.feedback_type),
      source: row.source || 'unknown',
      time: row.updated_at,
    }));
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

function buildRecommendationPreview(recommendations) {
  const maxScore = Math.max(
    ...recommendations.map((movie) => Number(movie.match_score || movie.score || 0)),
    1
  );

  return recommendations.map((movie) => {
    const score = Number(movie.match_score || movie.score || 0);
    const match = score > 0 ? Math.max(55, Math.min(99, Math.round((score / maxScore) * 100))) : 60;
    const reasons = Array.isArray(movie.match_reasons) ? movie.match_reasons.filter(Boolean) : [];
    return {
      id: Number(movie.id),
      title: movie.title,
      poster: movie.poster_url,
      match,
      reason: reasons.slice(0, 2).join(' · ') || 'Phù hợp nhất trong kho dữ liệu hiện có',
      reasons,
      score,
    };
  });
}

async function getRecommendationPreview(db, profile) {
  if (!profile?.id || !profile?.user_id) return [];
  const taste = await getProfileTasteProfile(db, profile.user_id, profile.id).catch(() => null);
  const recommendations = await getUserRecommendations(db, profile.user_id, 8, profile.id, taste ? { tasteProfile: taste } : {})
    .catch(() => []);
  return buildRecommendationPreview(recommendations);
}

async function getAdminAiTasteDashboard(db, options = {}) {
  const numericProfileId = toPositiveInt(options.profileId);
  const [profileRows, feedbackStats, profileCounts, topTastes] = await Promise.all([
    getProfileRows(db),
    getAiFeedbackStats(db),
    getTasteProfileCounts(db),
    getGlobalTopTastes(db),
  ]);
  const profiles = await hydrateAdminProfiles(db, profileRows);
  const selectedProfile = profiles.find((profile) => profile.id === numericProfileId) || profiles[0] || null;
  const [feedbackRows, recommendations] = await Promise.all([
    getRecentFeedbackRows(db, {
      profileId: selectedProfile?.id || numericProfileId,
      limit: options.limit,
    }),
    getRecommendationPreview(db, selectedProfile),
  ]);

  const stats = {
    totalFeedback: Object.values(feedbackStats).reduce((total, value) => total + (Number(value) || 0), 0),
    likes: Number(feedbackStats.like) || 0,
    dislikes: Number(feedbackStats.dislike) || 0,
    watched: Number(feedbackStats.watched) || 0,
    notRecommend: Number(feedbackStats.hide) || 0,
    profilesWithTaste: profileCounts.profilesWithTaste,
    profilesWithoutTaste: profileCounts.profilesWithoutTaste,
  };

  return {
    stats,
    topTastes,
    profiles,
    selected_profile_id: selectedProfile?.id || null,
    selected_profile: selectedProfile,
    feedbacks: feedbackRows,
    recommendations,
  };
}

async function deleteAdminAiFeedback(db, feedbackId) {
  const numericFeedbackId = toPositiveInt(feedbackId);
  if (!numericFeedbackId) {
    const error = new Error('feedback_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  const [result] = await db.execute('DELETE FROM ai_movie_feedback WHERE id = ?', [numericFeedbackId]);
  return Number(result.affectedRows) || 0;
}

async function resetAdminProfileAiFeedback(db, profileId) {
  const numericProfileId = toPositiveInt(profileId);
  if (!numericProfileId) {
    const error = new Error('profile_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  const [profileRows] = await db.execute('SELECT id, user_id FROM user_profiles WHERE id = ? LIMIT 1', [numericProfileId]);
  if (!profileRows.length) {
    const error = new Error('Không tìm thấy profile');
    error.statusCode = 404;
    throw error;
  }
  return clearAiMovieFeedback(db, {
    userId: profileRows[0].user_id,
    profileId: numericProfileId,
  });
}

async function hideAdminMovieForProfile(db, { profileId, movieId }) {
  const numericProfileId = toPositiveInt(profileId);
  const numericMovieId = toPositiveInt(movieId);
  if (!numericProfileId || !numericMovieId) {
    const error = new Error('profile_id hoặc movie_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  const [profileRows] = await db.execute('SELECT id, user_id FROM user_profiles WHERE id = ? LIMIT 1', [numericProfileId]);
  if (!profileRows.length) {
    const error = new Error('Không tìm thấy profile');
    error.statusCode = 404;
    throw error;
  }
  return setAiMovieFeedback(db, {
    userId: profileRows[0].user_id,
    profileId: numericProfileId,
    movieId: numericMovieId,
    feedbackType: 'hide',
    active: true,
    source: 'admin',
    metadata: { admin_action: 'hide_from_ai_taste_manager' },
  });
}

module.exports = {
  deleteAdminAiFeedback,
  getAdminAiTasteDashboard,
  hideAdminMovieForProfile,
  resetAdminProfileAiFeedback,
};
