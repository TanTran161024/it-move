const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'vi-VN';
const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_TYPES = new Set(['movie', 'tv']);

function hasTmdbKey() {
  return Boolean(process.env.TMDB_API_KEY);
}

function getLanguage() {
  return process.env.TMDB_LANGUAGE || DEFAULT_LANGUAGE;
}

function getImageBase() {
  return (process.env.TMDB_IMAGE_BASE || DEFAULT_IMAGE_BASE).replace(/\/+$/, '');
}

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMissingUrl(value) {
  const url = cleanText(value);
  if (!url) return true;
  return /example\.com|localhost\/videos|placeholder|no[-_ ]?poster/i.test(url);
}

function isTmdbImageUrl(value) {
  return /image\.tmdb\.org\/t\/p/i.test(cleanText(value));
}

function isImportedImageUrl(value) {
  return /phimimg\.com|img\.phimapi\.com|static\.nutscdn\.com|ophim/i.test(cleanText(value));
}

function shouldReplaceImageUrl(value, options = {}) {
  if (isMissingUrl(value)) return true;
  if (options.overwrite) return true;
  if (options.replaceImportedImages && isImportedImageUrl(value) && !isTmdbImageUrl(value)) return true;
  return false;
}

function imageUrl(path, size = 'w500') {
  if (!path) return null;
  return `${getImageBase()}/${size}${path}`;
}

function normalizeLimit(value, fallback = 8, max = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeTmdbType(value, fallback = 'movie') {
  const type = cleanText(value).toLowerCase();
  return TMDB_TYPES.has(type) ? type : fallback;
}

async function tmdbRequest(path, params = {}) {
  if (!hasTmdbKey()) {
    const error = new Error('Chưa cấu hình TMDB_API_KEY trong backend/.env');
    error.statusCode = 400;
    throw error;
  }

  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', params.language || getLanguage());
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'language' && value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.status_message || `TMDb error ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

function resultYear(result) {
  const date = result.release_date || result.first_air_date || '';
  return Number(String(date).slice(0, 4)) || null;
}

function resultTitle(result) {
  return result.title || result.name || result.original_title || result.original_name || '';
}

function scoreResult(movie, result, preferredType) {
  const wantedTitles = [movie.original_title, movie.title].map(normalizeText).filter(Boolean);
  const foundTitles = [result.title, result.name, result.original_title, result.original_name].map(normalizeText).filter(Boolean);
  let score = 0;

  if (result.media_type === preferredType) score += 18;
  if (foundTitles.some((title) => wantedTitles.includes(title))) score += 60;
  if (foundTitles.some((title) => wantedTitles.some((wanted) => title.includes(wanted) || wanted.includes(title)))) score += 24;

  const year = Number(movie.release_year) || null;
  const foundYear = resultYear(result);
  if (year && foundYear) {
    const gap = Math.abs(year - foundYear);
    if (gap === 0) score += 25;
    else if (gap <= 1) score += 14;
    else if (gap <= 3) score += 6;
  }

  score += Math.min(Number(result.popularity) || 0, 80) / 10;
  if (result.poster_path) score += 4;
  if (result.backdrop_path) score += 4;
  return score;
}

async function searchTyped(query, year, mediaType) {
  const path = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const params = {
    query,
    include_adult: 'false',
    page: 1,
  };

  if (year) {
    if (mediaType === 'tv') params.first_air_date_year = year;
    else {
      params.year = year;
      params.primary_release_year = year;
    }
  }

  const data = await tmdbRequest(path, params);
  return (data.results || []).map((result) => ({ ...result, media_type: mediaType }));
}

function titleQueryVariants(value) {
  const raw = cleanText(value);
  if (!raw) return [];

  const variants = [
    raw,
    raw.replace(/\([^)]*(season|phần|phan|part|cour)\s*\d+[^)]*\)/gi, ' '),
    raw.replace(/\([^)]*\)/g, ' '),
    raw.replace(/\b(season|phần|phan|part|cour)\s*\d+\b/gi, ' '),
  ];

  for (const item of [...variants]) {
    if (item.includes('/')) {
      variants.push(...item.split('/'));
    }
    if (item.includes(':')) {
      variants.push(item.split(':')[0]);
    }
  }

  const seen = new Set();
  return variants
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 2)
    .filter((item) => {
      const key = normalizeText(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function findBestTmdbMatch(movie) {
  if (movie.tmdb_id && movie.tmdb_type) {
    return {
      id: Number(movie.tmdb_id),
      media_type: normalizeTmdbType(movie.tmdb_type, Number(movie.is_series) === 1 ? 'tv' : 'movie'),
      match_score: 999,
      cached: true,
    };
  }

  const queries = [...new Set([
    ...titleQueryVariants(movie.original_title),
    ...titleQueryVariants(movie.title),
  ])];
  const year = Number(movie.release_year) || null;
  const preferredType = Number(movie.is_series) === 1 ? 'tv' : 'movie';
  const secondaryType = preferredType === 'tv' ? 'movie' : 'tv';
  const candidates = [];

  for (const query of queries) {
    candidates.push(...await searchTyped(query, year, preferredType));
    candidates.push(...await searchTyped(query, year, secondaryType));
  }

  if (!candidates.length && year) {
    for (const query of queries) {
      candidates.push(...await searchTyped(query, null, preferredType));
      candidates.push(...await searchTyped(query, null, secondaryType));
    }
  }

  if (!candidates.length) return null;

  return candidates
    .map((result) => ({ ...result, match_score: scoreResult(movie, result, preferredType) }))
    .sort((left, right) => right.match_score - left.match_score)[0];
}

async function getDetails(match, language = getLanguage()) {
  const mediaType = normalizeTmdbType(match.media_type);
  return tmdbRequest(`/${mediaType}/${match.id}`, {
    language,
    append_to_response: 'credits,videos',
  });
}

async function getVideos(match, language = 'en-US') {
  const mediaType = normalizeTmdbType(match.media_type);
  return tmdbRequest(`/${mediaType}/${match.id}/videos`, { language });
}

function pickTrailer(videos = []) {
  const filtered = videos
    .filter((video) => video?.site === 'YouTube' && video?.key)
    .sort((left, right) => {
      const typeScore = (video) => (video.type === 'Trailer' ? 3 : video.type === 'Teaser' ? 2 : 1);
      const officialScore = (video) => (video.official ? 1 : 0);
      return typeScore(right) - typeScore(left) || officialScore(right) - officialScore(left);
    });

  const selected = filtered.find((video) => video.type === 'Trailer') || filtered[0];
  return selected ? `https://www.youtube.com/watch?v=${selected.key}` : null;
}

async function resolveTrailerUrl(match, details) {
  const localized = pickTrailer(details.videos?.results || []);
  if (localized) return localized;

  try {
    const englishVideos = await getVideos(match, 'en-US');
    return pickTrailer(englishVideos.results || []);
  } catch (_) {
    return null;
  }
}

async function getExistingActorCount(db, movieId) {
  const [[row]] = await db.execute(
    'SELECT COUNT(*) AS count FROM movie_actors WHERE movie_id = ?',
    [movieId]
  );
  return Number(row?.count) || 0;
}

async function getExistingDirectorCount(db, movieId) {
  const [[row]] = await db.execute(
    'SELECT COUNT(*) AS count FROM movie_directors WHERE movie_id = ?',
    [movieId]
  );
  return Number(row?.count) || 0;
}

async function ensureActor(db, actor) {
  const name = cleanText(actor.name);
  if (!name) return null;

  const profilePic = imageUrl(actor.profile_path, 'w500');
  const [existing] = await db.execute('SELECT id, profile_pic_url FROM actors WHERE name = ? LIMIT 1', [name]);
  if (existing.length) {
    if (isMissingUrl(existing[0].profile_pic_url) && profilePic) {
      await db.execute('UPDATE actors SET profile_pic_url = ? WHERE id = ?', [profilePic, existing[0].id]);
    }
    return existing[0].id;
  }

  const [result] = await db.execute(
    'INSERT INTO actors (name, profile_pic_url, bio) VALUES (?, ?, ?)',
    [name, profilePic, actor.character ? `Vai: ${cleanText(actor.character).slice(0, 160)}` : '']
  );
  return result.insertId;
}

async function ensureDirector(db, crewMember) {
  const name = cleanText(crewMember.name);
  if (!name) return null;

  const profilePic = imageUrl(crewMember.profile_path, 'w500');
  const [existing] = await db.execute('SELECT id, profile_pic_url FROM directors WHERE name = ? LIMIT 1', [name]);
  if (existing.length) {
    if (isMissingUrl(existing[0].profile_pic_url) && profilePic) {
      await db.execute('UPDATE directors SET profile_pic_url = ? WHERE id = ?', [profilePic, existing[0].id]);
    }
    return existing[0].id;
  }

  const [result] = await db.execute(
    'INSERT INTO directors (name, profile_pic_url, bio) VALUES (?, ?, ?)',
    [name, profilePic, crewMember.job ? cleanText(crewMember.job).slice(0, 160) : '']
  );
  return result.insertId;
}

async function attachCast(db, movieId, cast, targetLimit = 8) {
  const currentCount = await getExistingActorCount(db, movieId);
  const availableSlots = Math.max(0, targetLimit - currentCount);
  if (!availableSlots) return { added: 0, skipped: currentCount };

  let added = 0;
  for (const actor of cast.slice(0, targetLimit * 2)) {
    if (added >= availableSlots) break;
    const actorId = await ensureActor(db, actor);
    if (!actorId) continue;

    const [exists] = await db.execute(
      'SELECT movie_id FROM movie_actors WHERE movie_id = ? AND actor_id = ? LIMIT 1',
      [movieId, actorId]
    );
    if (exists.length) continue;

    await db.execute('INSERT INTO movie_actors (movie_id, actor_id) VALUES (?, ?)', [movieId, actorId]);
    added += 1;
  }

  return { added, skipped: currentCount };
}

function directorCrew(details) {
  const crew = details.credits?.crew || [];
  if (normalizeTmdbType(details.media_type || '') === 'tv' || details.created_by?.length) {
    return [...(details.created_by || []), ...crew.filter((member) => ['Director', 'Creator'].includes(member.job))];
  }
  return crew.filter((member) => member.job === 'Director');
}

async function attachDirectors(db, movieId, crew, targetLimit = 4) {
  const currentCount = await getExistingDirectorCount(db, movieId);
  const availableSlots = Math.max(0, targetLimit - currentCount);
  if (!availableSlots) return { added: 0, skipped: currentCount };

  let added = 0;
  const uniqueCrew = [];
  const seen = new Set();
  for (const member of crew) {
    const key = normalizeText(member.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueCrew.push(member);
  }

  for (const member of uniqueCrew.slice(0, targetLimit * 2)) {
    if (added >= availableSlots) break;
    const directorId = await ensureDirector(db, member);
    if (!directorId) continue;

    const [exists] = await db.execute(
      'SELECT movie_id FROM movie_directors WHERE movie_id = ? AND director_id = ? LIMIT 1',
      [movieId, directorId]
    );
    if (exists.length) continue;

    await db.execute('INSERT INTO movie_directors (movie_id, director_id) VALUES (?, ?)', [movieId, directorId]);
    added += 1;
  }

  return { added, skipped: currentCount };
}

async function upsertBackdrop(db, movieId, backdropUrl, options = {}) {
  if (!backdropUrl) return { updated: false, reason: 'missing_tmdb_backdrop' };

  const [rows] = await db.execute('SELECT id, bg_url, thumbnails FROM banners WHERE movie_id = ? ORDER BY id ASC LIMIT 1', [movieId]);
  if (!rows.length) {
    await db.execute(
      'INSERT INTO banners (movie_id, bg_url, title_url, thumbnails) VALUES (?, ?, ?, ?)',
      [movieId, backdropUrl, null, JSON.stringify([backdropUrl])]
    );
    return { updated: true, created: true };
  }

  const banner = rows[0];
  if (!shouldReplaceImageUrl(banner.bg_url, options)) {
    return { updated: false, reason: 'backdrop_exists' };
  }

  await db.execute(
    'UPDATE banners SET bg_url = ?, thumbnails = ? WHERE id = ?',
    [backdropUrl, JSON.stringify([backdropUrl]), banner.id]
  );
  return { updated: true, created: false };
}

async function saveTmdbMatch(db, movieId, match) {
  await db.execute(
    'UPDATE movies SET tmdb_id = ?, tmdb_type = ?, tmdb_last_synced_at = NOW() WHERE id = ?',
    [Number(match.id), normalizeTmdbType(match.media_type), movieId]
  );
}

async function updateTrailer(db, movieId, movie, trailerUrl, overwrite) {
  if (!trailerUrl) return { updated: false, reason: 'missing_tmdb_trailer' };
  if (!overwrite && !isMissingUrl(movie.trailer_url)) return { updated: false, reason: 'trailer_exists' };

  await db.execute('UPDATE movies SET trailer_url = ? WHERE id = ?', [trailerUrl, movieId]);
  return { updated: true, url: trailerUrl };
}

async function updatePoster(db, movieId, movie, posterUrl, options = {}) {
  if (!posterUrl) return { updated: false, reason: 'missing_tmdb_poster' };
  if (!shouldReplaceImageUrl(movie.poster_url, options)) return { updated: false, reason: 'poster_exists' };

  await db.execute('UPDATE movies SET poster_url = ? WHERE id = ?', [posterUrl, movieId]);
  return { updated: true, url: posterUrl };
}

async function loadMovie(db, movieId) {
  const numericMovieId = Number(movieId);
  if (!Number.isInteger(numericMovieId) || numericMovieId <= 0) {
    const error = new Error('movie_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const [movieRows] = await db.execute('SELECT * FROM movies WHERE id = ? LIMIT 1', [numericMovieId]);
  if (!movieRows.length) {
    const error = new Error('Không tìm thấy phim');
    error.statusCode = 404;
    throw error;
  }

  return movieRows[0];
}

async function enrichMovieWithTmdb(db, movieId, options = {}) {
  const movie = await loadMovie(db, movieId);
  const numericMovieId = Number(movie.id);
  const overwrite = options.overwrite === true || options.overwrite === 'true';
  let match = await findBestTmdbMatch(movie);
  if (!match) {
    const error = new Error('TMDb không có kết quả phù hợp cho phim này');
    error.statusCode = 404;
    throw error;
  }

  let details;
  try {
    details = await getDetails(match);
  } catch (error) {
    if (!match.cached || error.statusCode !== 404) throw error;
    match = await findBestTmdbMatch({ ...movie, tmdb_id: null, tmdb_type: null });
    if (!match) {
      const notFound = new Error('TMDb không có kết quả phù hợp cho phim này');
      notFound.statusCode = 404;
      throw notFound;
    }
    details = await getDetails(match);
  }

  const mediaType = normalizeTmdbType(match.media_type);
  details.media_type = mediaType;

  const posterUrl = imageUrl(details.poster_path || match.poster_path, 'w500');
  const backdropUrl = imageUrl(details.backdrop_path || match.backdrop_path, 'original');
  const trailerUrl = await resolveTrailerUrl(match, details);
  const imageOptions = {
    overwrite,
    replaceImportedImages: options.replaceImportedImages === true || options.replace_imported_images === true,
  };
  const updates = {
    tmdb: { updated: false },
    poster: { updated: false },
    backdrop: { updated: false },
    trailer: { updated: false },
    cast: { added: 0 },
    directors: { added: 0 },
  };

  if (Number(movie.tmdb_id) !== Number(match.id) || normalizeTmdbType(movie.tmdb_type) !== mediaType || overwrite) {
    await saveTmdbMatch(db, numericMovieId, match);
    updates.tmdb = { updated: true, id: Number(match.id), type: mediaType };
  }

  updates.poster = await updatePoster(db, numericMovieId, movie, posterUrl, imageOptions);
  updates.backdrop = await upsertBackdrop(db, numericMovieId, backdropUrl, imageOptions);
  updates.trailer = await updateTrailer(db, numericMovieId, movie, trailerUrl, overwrite);
  updates.cast = await attachCast(db, numericMovieId, details.credits?.cast || [], normalizeLimit(options.castLimit, 8, 20));
  updates.directors = await attachDirectors(db, numericMovieId, directorCrew(details), normalizeLimit(options.directorLimit, 4, 10));

  return {
    movie_id: numericMovieId,
    tmdb: {
      id: Number(match.id),
      media_type: mediaType,
      title: resultTitle(details) || resultTitle(match),
      year: resultYear(details) || resultYear(match),
      score: match.cached ? null : Math.round(match.match_score || 0),
      cached: Boolean(match.cached),
      url: `https://www.themoviedb.org/${mediaType}/${match.id}`,
    },
    updates,
  };
}

function summarizeEnrichResult(result) {
  const updates = result.updates || {};
  return [
    updates.tmdb?.updated ? 'tmdb' : null,
    updates.poster?.updated ? 'poster' : null,
    updates.backdrop?.updated ? 'backdrop' : null,
    updates.trailer?.updated ? 'trailer' : null,
    updates.cast?.added ? `${updates.cast.added} cast` : null,
    updates.directors?.added ? `${updates.directors.added} directors` : null,
  ].filter(Boolean);
}

async function findMoviesNeedingTmdbEnrich(db, limit = 10) {
  const safeLimit = normalizeLimit(limit, 10, 50);
  const [movies] = await db.query(
    `
      SELECT
        m.id, m.title, m.original_title, m.release_year, m.poster_url, m.trailer_url, m.tmdb_id, m.tmdb_type,
        COUNT(DISTINCT ma.actor_id) AS actor_count,
        COUNT(DISTINCT md.director_id) AS director_count,
        MAX(CASE WHEN b.bg_url IS NOT NULL AND b.bg_url <> '' THEN b.bg_url ELSE NULL END) AS existing_bg_url
      FROM movies m
      LEFT JOIN movie_actors ma ON m.id = ma.movie_id
      LEFT JOIN movie_directors md ON m.id = md.movie_id
      LEFT JOIN banners b ON m.id = b.movie_id
      GROUP BY m.id, m.title, m.original_title, m.release_year, m.poster_url, m.trailer_url, m.tmdb_id, m.tmdb_type, m.created_at
      HAVING
        m.tmdb_id IS NULL
        OR m.tmdb_id = 0
        OR m.poster_url IS NULL
        OR m.poster_url = ''
        OR m.poster_url LIKE '%example.com%'
        OR m.poster_url LIKE '%placeholder%'
        OR m.poster_url LIKE '%no-poster%'
        OR m.trailer_url IS NULL
        OR m.trailer_url = ''
        OR existing_bg_url IS NULL
        OR actor_count = 0
        OR director_count = 0
      ORDER BY m.created_at DESC
      LIMIT ${safeLimit}
    `
  );
  return movies;
}

async function enrichMissingMoviesWithTmdb(db, options = {}) {
  const limit = normalizeLimit(options.limit, 10, 50);
  const delayMs = Math.max(0, Math.min(Number(options.delayMs) || 0, 5000));
  const movies = await findMoviesNeedingTmdbEnrich(db, limit);
  const results = [];
  let success = 0;
  let failed = 0;
  let changed = 0;

  for (const movie of movies) {
    try {
      const result = await enrichMovieWithTmdb(db, movie.id, options);
      const changes = summarizeEnrichResult(result);
      if (changes.length) changed += 1;
      success += 1;
      results.push({
        movie_id: movie.id,
        title: movie.title,
        ok: true,
        changes,
        result,
      });
    } catch (error) {
      failed += 1;
      results.push({
        movie_id: movie.id,
        title: movie.title,
        ok: false,
        error: error.message,
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    summary: {
      scanned: movies.length,
      success,
      failed,
      changed,
      limit,
    },
    results,
  };
}

module.exports = {
  enrichMovieWithTmdb,
  enrichMissingMoviesWithTmdb,
  findMoviesNeedingTmdbEnrich,
  hasTmdbKey,
};
