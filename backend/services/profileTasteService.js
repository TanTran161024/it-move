const DEFAULT_TASTE_PROFILE = Object.freeze({
  signals_count: 0,
  positive: { genres: [], countries: [] },
  negative: { genres: [], countries: [] },
  duration: {
    preference: null,
    average_minutes: null,
    buckets: { short: 0, medium: 0, long: 0, series: 0 },
  },
  reason_signals: {},
  summary: [],
});

function isMissingFeedbackTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNameList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value).split('||').map((item) => item.trim()).filter(Boolean);
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

function parseDurationMinutes(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const explicitMinutes = text.match(/(\d+)\s*(phut|minute|min|m)\b/);
  if (explicitMinutes) return Number(explicitMinutes[1]) || null;
  const hourMinute = text.match(/(\d+)\s*(gio|hour|h)\s*(\d+)?/);
  if (hourMinute) {
    return (Number(hourMinute[1]) || 0) * 60 + (Number(hourMinute[3]) || 0);
  }
  const firstNumber = text.match(/\b(\d{2,3})\b/);
  return firstNumber ? Number(firstNumber[1]) : null;
}

function cloneDefaultTaste() {
  return {
    signals_count: 0,
    positive: { genres: [], countries: [] },
    negative: { genres: [], countries: [] },
    duration: {
      preference: null,
      average_minutes: null,
      buckets: { short: 0, medium: 0, long: 0, series: 0 },
    },
    reason_signals: {},
    summary: [],
  };
}

function addScore(map, name, weight) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return;
  const key = normalizeText(cleanName);
  const current = map.get(key) || { name: cleanName, score: 0 };
  current.score += Math.abs(Number(weight) || 0);
  map.set(key, current);
}

function topScores(map, limit = 5) {
  return [...map.values()]
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit)
    .map((item) => ({ name: item.name, score: Math.round(item.score) }));
}

function durationBucket(minutes, isSeries) {
  if (isSeries && (!minutes || minutes <= 70)) return 'series';
  if (!minutes) return null;
  if (minutes <= 45) return 'short';
  if (minutes <= 105) return 'medium';
  return 'long';
}

function durationLabel(preference) {
  const labels = {
    short: 'hay xem phim ngắn',
    medium: 'hay xem phim vừa thời lượng',
    long: 'không ngại phim dài',
    series: 'hay xem phim bộ/tập ngắn',
  };
  return labels[preference] || null;
}

function friendlyGenre(name) {
  const normalized = normalizeText(name);
  if (normalized.includes('hoat hinh') || normalized.includes('anime')) return 'anime/hoạt hình';
  return name;
}

function friendlyCountry(name) {
  const normalized = normalizeText(name);
  const labels = {
    'han quoc': 'Hàn Quốc',
    'trung quoc': 'Trung Quốc',
    'nhat ban': 'Nhật Bản',
    'viet nam': 'Việt Nam',
    my: 'Mỹ',
  };
  return labels[normalized] || name;
}

async function getBaseTasteEvents(db, userId, profileId) {
  const [rows] = await db.execute(
    `
      SELECT movie_id, MAX(weight) AS weight, MAX(last_seen) AS last_seen
      FROM (
        SELECT movie_id, 6 AS weight, created_at AS last_seen
        FROM user_favorites
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
        UNION ALL
        SELECT movie_id, 4 AS weight, created_at AS last_seen
        FROM user_watchlist
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
        UNION ALL
        SELECT
          movie_id,
          CASE
            WHEN rating >= 8 THEN 6
            WHEN rating >= 6 THEN 3
            WHEN rating <= 4 THEN -5
            ELSE 1
          END AS weight,
          updated_at AS last_seen
        FROM movie_ratings
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
        UNION ALL
        SELECT
          movie_id,
          CASE WHEN completed = 1 THEN 3 ELSE 1 END AS weight,
          last_watched_at AS last_seen
        FROM user_watch_history
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
      ) events
      GROUP BY movie_id
      ORDER BY ABS(MAX(weight)) DESC, MAX(last_seen) DESC
      LIMIT 80
    `,
    [
      userId,
      profileId,
      profileId,
      userId,
      profileId,
      profileId,
      userId,
      profileId,
      profileId,
      userId,
      profileId,
      profileId,
    ]
  );
  return rows.map((row) => ({
    movie_id: Number(row.movie_id),
    weight: Number(row.weight) || 0,
    last_seen: row.last_seen,
  })).filter((row) => row.movie_id > 0 && row.weight !== 0);
}

async function getAiTasteEvents(db, userId, profileId) {
  try {
    const [rows] = await db.execute(
      `SELECT
         movie_id,
         feedback_type,
         metadata,
         CASE feedback_type
           WHEN 'like' THEN 8
           WHEN 'watched' THEN 3
           WHEN 'dislike' THEN -7
           WHEN 'hide' THEN -8
           ELSE 0
         END AS weight,
         updated_at AS last_seen
       FROM ai_movie_feedback
       WHERE user_id = ?
         AND (? IS NULL OR profile_id = ?)
       ORDER BY updated_at DESC
       LIMIT 80`,
      [userId, profileId, profileId]
    );
    return rows.map((row) => ({
      movie_id: Number(row.movie_id),
      weight: Number(row.weight) || 0,
      last_seen: row.last_seen,
      feedback_type: row.feedback_type,
      reason: safeJson(row.metadata, {}).reason || null,
    })).filter((row) => row.movie_id > 0 && row.weight !== 0);
  } catch (error) {
    if (isMissingFeedbackTableError(error)) return [];
    throw error;
  }
}

async function getMovieTasteProfiles(db, movieIds) {
  const ids = [...new Set(movieIds.map(toPositiveInt).filter(Boolean))];
  if (!ids.length) return new Map();

  const [rows] = await db.execute(
    `SELECT
       m.id,
       m.duration,
       m.is_series,
       COALESCE(GROUP_CONCAT(DISTINCT g.name SEPARATOR '||'), '') AS genres,
       COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '||'), '') AS countries
     FROM movies m
     LEFT JOIN movie_genres mg ON mg.movie_id = m.id
     LEFT JOIN genres g ON g.id = mg.genre_id
     LEFT JOIN movie_countries mc ON mc.movie_id = m.id
     LEFT JOIN countries c ON c.id = mc.country_id
     WHERE m.id IN (${ids.map(() => '?').join(',')}) AND m.is_visible = 1
     GROUP BY m.id, m.duration, m.is_series`,
    ids
  );

  return new Map(rows.map((row) => [Number(row.id), {
    id: Number(row.id),
    duration: row.duration,
    is_series: Boolean(row.is_series),
    genres: parseNameList(row.genres),
    countries: parseNameList(row.countries),
  }]));
}

function buildTasteSummary({ positiveGenres, positiveCountries, negativeGenres, negativeCountries, duration, reasonSignals = {} }) {
  const summary = [];
  positiveGenres.slice(0, 2).forEach((item) => summary.push(`thích ${friendlyGenre(item.name)}`));
  positiveCountries.slice(0, 2).forEach((item) => summary.push(`thích ${friendlyCountry(item.name)}`));
  negativeGenres.slice(0, 1).forEach((item) => summary.push(`tránh ${friendlyGenre(item.name)}`));
  negativeCountries.slice(0, 1).forEach((item) => summary.push(`ít chọn ${friendlyCountry(item.name)}`));
  const label = durationLabel(duration.preference);
  if (label) summary.push(label);
  if (reasonSignals.too_long > 0) summary.push('ưu tiên phim gọn hơn');
  if (reasonSignals.too_intense > 0) summary.push('tránh phim quá căng');
  return [...new Set(summary)].slice(0, 6);
}

function negativeLearningScope(reason) {
  if (reason === 'wrong_genre' || reason === 'too_intense') return { genres: true, countries: false };
  if (reason === 'wrong_country') return { genres: false, countries: true };
  if (['too_long', 'seen_before', 'bad_match', 'wrong_mood', 'too_repetitive'].includes(reason)) {
    return { genres: false, countries: false };
  }
  return { genres: true, countries: true };
}

async function getProfileTasteProfile(db, userId, profileId = null) {
  const numericUserId = toPositiveInt(userId);
  const numericProfileId = toPositiveInt(profileId);
  if (!numericUserId) return cloneDefaultTaste();

  const [baseEvents, aiEvents] = await Promise.all([
    getBaseTasteEvents(db, numericUserId, numericProfileId),
    getAiTasteEvents(db, numericUserId, numericProfileId),
  ]);
  const events = [...baseEvents, ...aiEvents];
  if (!events.length) return cloneDefaultTaste();

  const movieProfiles = await getMovieTasteProfiles(db, events.map((event) => event.movie_id));
  const positiveGenres = new Map();
  const positiveCountries = new Map();
  const negativeGenres = new Map();
  const negativeCountries = new Map();
  const durationBuckets = { short: 0, medium: 0, long: 0, series: 0 };
  const reasonSignals = {};
  let durationTotal = 0;
  let durationWeight = 0;
  let signalCount = 0;

  for (const event of events) {
    const movie = movieProfiles.get(event.movie_id);
    if (!movie) continue;
    signalCount += 1;
    const reason = String(event.reason || '').trim();
    if (reason) reasonSignals[reason] = (reasonSignals[reason] || 0) + Math.abs(event.weight);
    const targetGenres = event.weight > 0 ? positiveGenres : negativeGenres;
    const targetCountries = event.weight > 0 ? positiveCountries : negativeCountries;
    const scope = event.weight > 0 ? { genres: true, countries: true } : negativeLearningScope(reason);
    if (scope.genres) movie.genres.forEach((name) => addScore(targetGenres, name, event.weight));
    if (scope.countries) movie.countries.forEach((name) => addScore(targetCountries, name, event.weight));

    if (event.weight > 0) {
      const minutes = parseDurationMinutes(movie.duration);
      const bucket = durationBucket(minutes, movie.is_series);
      if (bucket) durationBuckets[bucket] += Math.abs(event.weight);
      if (minutes) {
        durationTotal += minutes * Math.abs(event.weight);
        durationWeight += Math.abs(event.weight);
      }
    } else if (reason === 'too_long') {
      durationBuckets.short += Math.abs(event.weight) * 2;
    }
  }

  const positiveGenreList = topScores(positiveGenres);
  const positiveCountryList = topScores(positiveCountries);
  const negativeGenreList = topScores(negativeGenres);
  const negativeCountryList = topScores(negativeCountries);
  const topDuration = Object.entries(durationBuckets)
    .sort((left, right) => right[1] - left[1])[0];
  const duration = {
    preference: topDuration && topDuration[1] >= 5 ? topDuration[0] : null,
    average_minutes: durationWeight ? Math.round(durationTotal / durationWeight) : null,
    buckets: Object.fromEntries(Object.entries(durationBuckets).map(([key, value]) => [key, Math.round(value)])),
  };

  return {
    signals_count: signalCount,
    positive: {
      genres: positiveGenreList,
      countries: positiveCountryList,
    },
    negative: {
      genres: negativeGenreList,
      countries: negativeCountryList,
    },
    duration,
    reason_signals: reasonSignals,
    summary: buildTasteSummary({
      positiveGenres: positiveGenreList,
      positiveCountries: positiveCountryList,
      negativeGenres: negativeGenreList,
      negativeCountries: negativeCountryList,
      duration,
      reasonSignals,
    }),
  };
}

function listScore(list, names) {
  const normalizedNames = new Set(names.map(normalizeText));
  return (list || [])
    .filter((item) => normalizedNames.has(normalizeText(item.name)))
    .reduce((total, item) => total + Math.min(Number(item.score) || 0, 24), 0);
}

function isExplicitlyRequestedNegative(name, signals = {}) {
  const normalizedName = normalizeText(name);
  return (signals.wanted || []).some((wanted) => normalizedName.includes(normalizeText(wanted)) || normalizeText(wanted).includes(normalizedName));
}

function scoreMovieWithTaste(movie, tasteProfile, signals = {}) {
  if (!tasteProfile?.signals_count) return { score: 0, reasons: [] };

  const reasons = [];
  let score = 0;
  const genres = parseNameList(movie.genres);
  const countries = parseNameList(movie.countries);
  const positiveGenreScore = listScore(tasteProfile.positive?.genres, genres);
  const positiveCountryScore = listScore(tasteProfile.positive?.countries, countries);
  const negativeGenreItems = (tasteProfile.negative?.genres || [])
    .filter((item) => !isExplicitlyRequestedNegative(item.name, signals));
  const negativeCountryItems = (tasteProfile.negative?.countries || [])
    .filter((item) => !isExplicitlyRequestedNegative(item.name, signals));
  const negativeGenreScore = listScore(negativeGenreItems, genres);
  const negativeCountryScore = listScore(negativeCountryItems, countries);

  if (positiveGenreScore) {
    score += Math.round(positiveGenreScore * 0.8);
    const matched = (tasteProfile.positive?.genres || []).find((item) => genres.map(normalizeText).includes(normalizeText(item.name)));
    if (matched) reasons.push(`Hợp gu ${friendlyGenre(matched.name)}`);
  }
  if (positiveCountryScore) {
    score += Math.round(positiveCountryScore * 0.55);
    const matched = (tasteProfile.positive?.countries || []).find((item) => countries.map(normalizeText).includes(normalizeText(item.name)));
    if (matched) reasons.push(`Hợp gu ${friendlyCountry(matched.name)}`);
  }
  if (negativeGenreScore) score -= Math.round(negativeGenreScore * 1.15);
  if (negativeCountryScore) score -= Math.round(negativeCountryScore * 0.9);

  const preference = tasteProfile.duration?.preference;
  const minutes = parseDurationMinutes(movie.duration);
  const bucket = durationBucket(minutes, movie.is_series);
  if (preference && bucket === preference) {
    score += 8;
    const label = durationLabel(preference);
    if (label) reasons.push(label);
  } else if (preference === 'short' && minutes && minutes > 130) {
    score -= 8;
  } else if (preference === 'series' && !movie.is_series && minutes && minutes > 140) {
    score -= 6;
  }

  const reasonSignals = tasteProfile.reason_signals || {};
  if (reasonSignals.too_long > 0 && minutes) {
    const strength = Math.min(14, Math.max(4, Math.round(reasonSignals.too_long / 2)));
    if (minutes > 105) score -= strength;
    if (minutes <= 60) {
      score += Math.min(6, strength);
      reasons.push('Hợp phản hồi muốn phim gọn hơn');
    }
  }
  if (reasonSignals.too_intense > 0) {
    const intense = genres.some((name) => ['kinh di', 'gay can', 'hinh su', 'hanh dong'].some((term) => normalizeText(name).includes(term)));
    if (intense) score -= Math.min(14, Math.max(5, Math.round(reasonSignals.too_intense / 2)));
  }

  return { score, reasons: [...new Set(reasons)].slice(0, 3) };
}

function compactTasteProfile(tasteProfile) {
  if (!tasteProfile?.signals_count) return null;
  return {
    signals_count: tasteProfile.signals_count,
    summary: tasteProfile.summary || [],
    positive: {
      genres: (tasteProfile.positive?.genres || []).slice(0, 4),
      countries: (tasteProfile.positive?.countries || []).slice(0, 4),
    },
    negative: {
      genres: (tasteProfile.negative?.genres || []).slice(0, 3),
      countries: (tasteProfile.negative?.countries || []).slice(0, 3),
    },
    duration: tasteProfile.duration || DEFAULT_TASTE_PROFILE.duration,
    reason_signals: tasteProfile.reason_signals || {},
  };
}

module.exports = {
  compactTasteProfile,
  getProfileTasteProfile,
  scoreMovieWithTaste,
};
