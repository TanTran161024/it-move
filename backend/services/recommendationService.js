const DEFAULT_LIMIT = 12;
const MAX_POOL_SIZE = 240;
const COUNTRY_SIGNALS = new Set(['trung quoc', 'han quoc', 'nhat ban', 'viet nam', 'my']);
const STOP_WORDS = new Set([
  'toi', 'minh', 'ban', 'muon', 'can', 'xem', 'phim', 'bo', 'tap', 'co',
  'khong', 'goi', 'y', 'tu', 'van', 'cho', 'hay', 'nao', 'gi', 'mot',
  'cac', 'nhung', 'the', 'loai', 'hom', 'nay', 'that', 'su',
]);

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 30);
}

function parseIdList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseNameList(value) {
  if (!value) return [];
  return String(value)
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`);
  return pattern.test(text);
}

function profileMatchesWanted(profile, wanted, haystack) {
  const aliasesByWanted = {
    'hanh dong': ['hanh dong'],
    hai: ['hai', 'hai huoc'],
    'tinh cam': ['tinh cam', 'lang man'],
    'kinh di': ['kinh di'],
    'gay can': ['gay can', 'hinh su', 'bi an', 'kinh di'],
    'bi an': ['bi an', 'trinh tham', 'hinh su'],
    'vien tuong': ['vien tuong', 'khoa hoc'],
    'phieu luu': ['phieu luu'],
    'hoat hinh': ['hoat hinh', 'anime'],
    'tam ly': ['tam ly', 'chinh kich'],
    'vo thuat': ['vo thuat'],
    'co trang': ['co trang', 'kiem hiep', 'than thoai'],
    'nhe nhang': ['hai huoc', 'tinh cam', 'gia dinh'],
    'tai lieu': ['tai lieu'],
    'hoc duong': ['hoc duong'],
    'trung quoc': ['trung quoc'],
    'han quoc': ['han quoc'],
    'nhat ban': ['nhat ban'],
    'viet nam': ['viet nam'],
    my: ['my', 'au my'],
  };

  const aliases = aliasesByWanted[wanted] || [wanted];
  const genreText = normalizeText(profile.genres.join(' '));
  const countryText = normalizeText(profile.countries.join(' '));
  const structuredText = `${genreText} ${countryText}`;

  if (aliases.some((alias) => containsPhrase(structuredText, alias))) return true;
  if (wanted === 'hoat hinh' && containsPhrase(countryText, 'nhat ban')) return true;
  if (wanted === 'vo thuat' && containsPhrase(countryText, 'trung quoc')) {
    return ['hanh dong', 'co trang', 'than thoai', 'phieu luu'].some((alias) => containsPhrase(genreText, alias));
  }
  if (wanted === 'hai' || wanted === 'my') return false;
  return aliases.some((alias) => containsPhrase(haystack, alias));
}

function readableSignal(label) {
  const labels = {
    'hanh dong': 'hành động',
    hai: 'hài',
    'tinh cam': 'tình cảm',
    'kinh di': 'kinh dị',
    'gay can': 'gay cấn/căng thẳng',
    'bi an': 'bí ẩn',
    'vien tuong': 'viễn tưởng',
    'phieu luu': 'phiêu lưu',
    'hoat hinh': 'anime/hoạt hình',
    'tam ly': 'tâm lý',
    'vo thuat': 'võ thuật',
    'co trang': 'cổ trang',
    'nhe nhang': 'nhẹ nhàng',
    'tai lieu': 'tài liệu',
    'hoc duong': 'học đường',
    'trung quoc': 'Trung Quốc',
    'han quoc': 'Hàn Quốc',
    'nhat ban': 'Nhật Bản',
    'viet nam': 'Việt Nam',
    my: 'Mỹ/Âu Mỹ',
  };
  return labels[label] || label;
}

function signalWeight(label) {
  if (COUNTRY_SIGNALS.has(label)) return 46;
  if (label === 'nhe nhang' || label === 'gay can' || label === 'bi an') return 30;
  return 52;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function hydrateProfile(row) {
  return {
    id: row.id,
    title: row.title,
    original_title: row.original_title,
    slug: row.slug,
    description: row.description,
    poster_url: row.poster_url,
    release_year: row.release_year,
    duration: row.duration,
    imdb_rating: row.imdb_rating,
    quality: row.quality,
    status: row.status,
    views: Number(row.views) || 0,
    genre_ids: parseIdList(row.genre_ids),
    country_ids: parseIdList(row.country_ids),
    actor_ids: parseIdList(row.actor_ids),
    director_ids: parseIdList(row.director_ids),
    genres: parseNameList(row.genres),
    countries: parseNameList(row.countries),
    actors: parseNameList(row.actors),
    directors: parseNameList(row.directors),
  };
}

function toMovieCard(profile, extra = {}) {
  return {
    id: profile.id,
    title: profile.title,
    original_title: profile.original_title,
    slug: profile.slug,
    poster_url: profile.poster_url,
    release_year: profile.release_year,
    duration: profile.duration,
    imdb_rating: profile.imdb_rating,
    quality: profile.quality,
    status: profile.status,
    description: profile.description,
    genres: profile.genres,
    countries: profile.countries,
    match_score: extra.score,
    match_reasons: extra.reasons || [],
  };
}

async function getMovieProfiles(db, options = {}) {
  const params = [];
  const where = ['m.is_visible = 1'];

  if (options.ids?.length) {
    where.push(`m.id IN (${options.ids.map(() => '?').join(',')})`);
    params.push(...options.ids);
  }

  if (options.excludeIds?.length) {
    where.push(`m.id NOT IN (${options.excludeIds.map(() => '?').join(',')})`);
    params.push(...options.excludeIds);
  }

  const limit = clampLimit(options.limit, MAX_POOL_SIZE);
  const [rows] = await db.execute(
    `
      SELECT
        m.id, m.title, m.original_title, m.slug, m.description, m.poster_url,
        m.release_year, m.duration, m.imdb_rating, m.quality, m.status,
        COALESCE(m.views, 0) AS views,
        GROUP_CONCAT(DISTINCT mg.genre_id) AS genre_ids,
        GROUP_CONCAT(DISTINCT mc.country_id) AS country_ids,
        GROUP_CONCAT(DISTINCT ma.actor_id) AS actor_ids,
        GROUP_CONCAT(DISTINCT md.director_id) AS director_ids,
        GROUP_CONCAT(DISTINCT g.name SEPARATOR '||') AS genres,
        GROUP_CONCAT(DISTINCT c.name SEPARATOR '||') AS countries,
        GROUP_CONCAT(DISTINCT a.name SEPARATOR '||') AS actors,
        GROUP_CONCAT(DISTINCT d.name SEPARATOR '||') AS directors
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      LEFT JOIN movie_actors ma ON m.id = ma.movie_id
      LEFT JOIN actors a ON ma.actor_id = a.id
      LEFT JOIN movie_directors md ON m.id = md.movie_id
      LEFT JOIN directors d ON md.director_id = d.id
      WHERE ${where.join(' AND ')}
      GROUP BY
        m.id, m.title, m.original_title, m.slug, m.description, m.poster_url,
        m.release_year, m.duration, m.imdb_rating, m.quality, m.status, m.views
      ORDER BY COALESCE(m.views, 0) DESC, COALESCE(m.imdb_rating, 0) DESC, m.created_at DESC
      LIMIT ${limit}
    `,
    params
  );

  return rows.map(hydrateProfile);
}

function scoreAgainstSeed(seed, candidate) {
  const reasons = [];
  let score = 0;

  const genreMatches = overlap(seed.genre_ids, candidate.genre_ids);
  if (genreMatches.length) {
    score += genreMatches.length * 55;
    reasons.push(`Trùng ${genreMatches.length} thể loại`);
  }

  const countryMatches = overlap(seed.country_ids, candidate.country_ids);
  if (countryMatches.length) {
    score += countryMatches.length * 18;
    reasons.push('Cùng quốc gia');
  }

  const actorMatches = overlap(seed.actor_ids, candidate.actor_ids);
  if (actorMatches.length) {
    score += Math.min(actorMatches.length * 16, 48);
    reasons.push(`Chung ${actorMatches.length} diễn viên`);
  }

  const directorMatches = overlap(seed.director_ids, candidate.director_ids);
  if (directorMatches.length) {
    score += directorMatches.length * 22;
    reasons.push('Cùng đạo diễn');
  }

  if (seed.release_year && candidate.release_year) {
    const yearGap = Math.abs(Number(seed.release_year) - Number(candidate.release_year));
    if (yearGap <= 2) {
      score += 12;
      reasons.push('Cùng giai đoạn phát hành');
    } else if (yearGap <= 5) {
      score += 6;
    }
  }

  if (seed.imdb_rating && candidate.imdb_rating) {
    const ratingGap = Math.abs(Number(seed.imdb_rating) - Number(candidate.imdb_rating));
    if (ratingGap <= 0.7) score += 8;
    else if (ratingGap <= 1.5) score += 4;
  }

  score += Math.min(Math.log10((candidate.views || 0) + 1) * 2, 10);
  return { score, reasons };
}

async function getPopularMovies(db, options = {}) {
  const profiles = await getMovieProfiles(db, {
    excludeIds: options.excludeIds || [],
    limit: clampLimit(options.limit, DEFAULT_LIMIT),
  });
  return profiles.map((profile) => toMovieCard(profile, {
    score: 0,
    reasons: ['Đang được xem nhiều'],
  }));
}

async function getSimilarMovies(db, movieId, limit = DEFAULT_LIMIT) {
  const numericId = Number(movieId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    const error = new Error('movie_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const [seed] = await getMovieProfiles(db, { ids: [numericId], limit: 1 });
  if (!seed) {
    const error = new Error('Không tìm thấy phim');
    error.statusCode = 404;
    throw error;
  }

  const candidates = await getMovieProfiles(db, { excludeIds: [numericId], limit: MAX_POOL_SIZE });
  const ranked = candidates
    .map((candidate) => {
      const result = scoreAgainstSeed(seed, candidate);
      return { candidate, ...result };
    })
    .sort((left, right) => right.score - left.score || (right.candidate.views || 0) - (left.candidate.views || 0))
    .slice(0, clampLimit(limit))
    .map((item) => toMovieCard(item.candidate, item));

  return ranked.length ? ranked : getPopularMovies(db, { excludeIds: [numericId], limit });
}

async function getUserSeedMovieIds(db, userId) {
  const [rows] = await db.execute(
    `
      SELECT movie_id, MAX(weight) AS weight, MAX(last_seen) AS last_seen
      FROM (
        SELECT movie_id, 5 AS weight, created_at AS last_seen FROM user_favorites WHERE user_id = ?
        UNION ALL
        SELECT movie_id, 4 AS weight, created_at AS last_seen FROM user_watchlist WHERE user_id = ?
        UNION ALL
        SELECT movie_id, 3 AS weight, last_watched_at AS last_seen FROM user_watch_history WHERE user_id = ?
      ) seeds
      GROUP BY movie_id
      ORDER BY weight DESC, last_seen DESC
      LIMIT 10
    `,
    [userId, userId, userId]
  );
  return rows.map((row) => Number(row.movie_id)).filter(Boolean);
}

async function getUserRecommendations(db, userId, limit = DEFAULT_LIMIT) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    const error = new Error('userId không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const seedIds = await getUserSeedMovieIds(db, numericUserId);
  if (!seedIds.length) {
    return getPopularMovies(db, { limit });
  }

  const seeds = await getMovieProfiles(db, { ids: seedIds, limit: seedIds.length });
  const candidates = await getMovieProfiles(db, { excludeIds: seedIds, limit: MAX_POOL_SIZE });
  const scores = new Map();

  for (const candidate of candidates) {
    let total = 0;
    const reasonSet = new Set();
    for (const seed of seeds) {
      const result = scoreAgainstSeed(seed, candidate);
      total += result.score;
      result.reasons.forEach((reason) => reasonSet.add(reason));
    }
    scores.set(candidate.id, {
      candidate,
      score: total,
      reasons: [...reasonSet].slice(0, 3),
    });
  }

  return [...scores.values()]
    .sort((left, right) => right.score - left.score || (right.candidate.views || 0) - (left.candidate.views || 0))
    .slice(0, clampLimit(limit))
    .map((item) => toMovieCard(item.candidate, item));
}

function messageSignals(message) {
  const normalized = normalizeText(message);
  const rawTerms = unique(normalized
    .split(' ')
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word)));
  const wanted = [];

  const groups = [
    ['hanh dong', ['hanh dong', 'chien dau', 'sat thu', 'action']],
    ['hai', ['hai', 'hai huoc', 'vui', 'cuoi', 'comedy']],
    ['tinh cam', ['tinh cam', 'lang man', 'love', 'romance']],
    ['kinh di', ['kinh di', 'ma', 'am anh', 'horror']],
    ['gay can', ['gay can', 'cang thang', 'hoi hop', 'nghet tho', 'thriller']],
    ['bi an', ['bi an', 'trinh tham', 'mystery']],
    ['vien tuong', ['vien tuong', 'khoa hoc', 'sci fi', 'robot']],
    ['phieu luu', ['phieu luu', 'adventure']],
    ['hoat hinh', ['hoat hinh', 'anime', 'cartoon']],
    ['tam ly', ['tam ly', 'drama', 'chinh kich']],
    ['vo thuat', ['vo thuat', 'kiem hiep', 'kungfu']],
    ['co trang', ['co trang', 'lich su']],
    ['nhe nhang', ['nhe nhang', 'thu gian', 'chill', 'de thuong']],
    ['tai lieu', ['tai lieu', 'documentary']],
    ['hoc duong', ['hoc duong', 'truong hoc']],
    ['trung quoc', ['trung quoc', 'hoa ngu']],
    ['han quoc', ['han quoc', 'hanh quoc', 'korean']],
    ['nhat ban', ['nhat ban', 'japan']],
    ['viet nam', ['viet nam', 'vietnam']],
    ['my', ['my', 'au my', 'hollywood']],
  ];

  for (const [label, aliases] of groups) {
    if (aliases.some((alias) => containsPhrase(normalized, alias))) wanted.push(label);
  }

  const wantedWords = new Set();
  for (const [label, aliases] of groups) {
    if (!wanted.includes(label)) continue;
    [label, ...aliases].forEach((phrase) => {
      normalizeText(phrase).split(' ').forEach((word) => {
        if (word.length >= 2) wantedWords.add(word);
      });
    });
  }

  const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
  return {
    normalized,
    terms: rawTerms.filter((term) => !wantedWords.has(term)),
    wanted: unique(wanted),
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

function scoreMessageMatch(profile, signals) {
  const haystack = normalizeText([
    profile.title,
    profile.original_title,
    profile.description,
    profile.genres.join(' '),
    profile.countries.join(' '),
    profile.actors.slice(0, 8).join(' '),
    profile.directors.join(' '),
  ].join(' '));

  let score = 0;
  const reasons = [];
  let strongMatches = 0;
  let keywordMatches = 0;

  for (const wanted of signals.wanted) {
    if (profileMatchesWanted(profile, wanted, haystack)) {
      score += signalWeight(wanted);
      strongMatches += 1;
      reasons.push(`Phù hợp ${readableSignal(wanted)}`);
    }
  }

  for (const term of signals.terms) {
    if (term.length >= 3 && haystack.includes(term)) {
      score += 7;
      keywordMatches += 1;
      if (reasons.length < 3) reasons.push(`Có từ khóa "${term}"`);
    }
  }

  if (signals.year && profile.release_year) {
    const yearGap = Math.abs(Number(profile.release_year) - signals.year);
    if (yearGap === 0) {
      score += 20;
      strongMatches += 1;
      reasons.push(`Đúng năm ${signals.year}`);
    } else if (yearGap <= 2) {
      score += 8;
    }
  }

  if (strongMatches || keywordMatches || signals.wanted.length === 0) {
    score += Math.min(Math.log10((profile.views || 0) + 1) * 2, 8);
    if (profile.imdb_rating) score += Math.min(Number(profile.imdb_rating), 10) / 2;
  }

  return { score, reasons, strongMatches, keywordMatches };
}

async function searchMoviesForMessage(db, message, options = {}) {
  const signals = messageSignals(message);
  const hasSpecificIntent = signals.wanted.length > 0 || Boolean(signals.year) || signals.terms.length > 0;
  const profiles = await getMovieProfiles(db, { limit: MAX_POOL_SIZE });
  const ranked = profiles
    .map((profile) => {
      const result = scoreMessageMatch(profile, signals);
      return { profile, ...result };
    })
    .filter((item) => {
      if (!hasSpecificIntent) return true;
      if (signals.wanted.length > 0 || signals.year) {
        return item.strongMatches > 0 || item.keywordMatches >= 2;
      }
      return item.keywordMatches > 0;
    })
    .sort((left, right) => right.score - left.score || (right.profile.views || 0) - (left.profile.views || 0))
    .slice(0, clampLimit(options.limit, DEFAULT_LIMIT));

  if (!ranked.length) {
    return hasSpecificIntent ? [] : getPopularMovies(db, { limit: options.limit || DEFAULT_LIMIT });
  }

  return ranked.map((item) => toMovieCard(item.profile, item));
}

module.exports = {
  clampLimit,
  getMovieProfiles,
  getSimilarMovies,
  getUserRecommendations,
  getPopularMovies,
  searchMoviesForMessage,
  messageSignals,
  normalizeText,
};
