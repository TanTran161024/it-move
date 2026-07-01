const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'vi-VN';
const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p';

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

function imageUrl(path, size = 'w500') {
  if (!path) return null;
  return `${getImageBase()}/${size}${path}`;
}

function normalizeLimit(value, fallback = 8, max = 20) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
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
    if (value !== undefined && value !== null && value !== '') {
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

async function findBestTmdbMatch(movie) {
  const queries = [...new Set([movie.original_title, movie.title].map(cleanText).filter(Boolean))];
  const year = Number(movie.release_year) || null;
  const preferredType = Number(movie.is_series) === 1 ? 'tv' : 'movie';
  const secondaryType = preferredType === 'tv' ? 'movie' : 'tv';
  const candidates = [];

  for (const query of queries) {
    candidates.push(...await searchTyped(query, year, preferredType));
    candidates.push(...await searchTyped(query, year, secondaryType));
  }

  if (!candidates.length) return null;

  return candidates
    .map((result) => ({ ...result, match_score: scoreResult(movie, result, preferredType) }))
    .sort((left, right) => right.match_score - left.match_score)[0];
}

async function getDetails(match) {
  const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
  return tmdbRequest(`/${mediaType}/${match.id}`, {
    append_to_response: 'credits',
  });
}

async function getExistingActorCount(db, movieId) {
  const [[row]] = await db.execute(
    'SELECT COUNT(*) AS count FROM movie_actors WHERE movie_id = ?',
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
    if (!existing[0].profile_pic_url && profilePic) {
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

async function upsertBackdrop(db, movieId, backdropUrl, overwrite = false) {
  if (!backdropUrl) return { updated: false, reason: 'missing_tmdb_backdrop' };

  const [rows] = await db.execute('SELECT id, bg_url, thumbnails, title_url FROM banners WHERE movie_id = ? ORDER BY id ASC LIMIT 1', [movieId]);
  if (!rows.length) {
    await db.execute(
      'INSERT INTO banners (movie_id, bg_url, title_url, thumbnails) VALUES (?, ?, ?, ?)',
      [movieId, backdropUrl, null, JSON.stringify([backdropUrl])]
    );
    return { updated: true, created: true };
  }

  const banner = rows[0];
  if (!overwrite && !isMissingUrl(banner.bg_url)) {
    return { updated: false, reason: 'backdrop_exists' };
  }

  await db.execute(
    'UPDATE banners SET bg_url = ?, thumbnails = ? WHERE id = ?',
    [backdropUrl, JSON.stringify([backdropUrl]), banner.id]
  );
  return { updated: true, created: false };
}

async function enrichMovieWithTmdb(db, movieId, options = {}) {
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

  const movie = movieRows[0];
  const overwrite = options.overwrite === true || options.overwrite === 'true';
  const match = await findBestTmdbMatch(movie);
  if (!match) {
    const error = new Error('TMDb không có kết quả phù hợp cho phim này');
    error.statusCode = 404;
    throw error;
  }

  const details = await getDetails(match);
  const posterUrl = imageUrl(details.poster_path || match.poster_path, 'w500');
  const backdropUrl = imageUrl(details.backdrop_path || match.backdrop_path, 'original');
  const updates = {
    poster: { updated: false },
    backdrop: { updated: false },
    cast: { added: 0 },
  };

  if (posterUrl && (overwrite || isMissingUrl(movie.poster_url))) {
    await db.execute('UPDATE movies SET poster_url = ? WHERE id = ?', [posterUrl, numericMovieId]);
    updates.poster = { updated: true, url: posterUrl };
  } else {
    updates.poster = { updated: false, reason: posterUrl ? 'poster_exists' : 'missing_tmdb_poster' };
  }

  updates.backdrop = await upsertBackdrop(db, numericMovieId, backdropUrl, overwrite);
  updates.cast = await attachCast(db, numericMovieId, details.credits?.cast || [], normalizeLimit(options.castLimit));

  return {
    movie_id: numericMovieId,
    tmdb: {
      id: match.id,
      media_type: match.media_type,
      title: resultTitle(match),
      year: resultYear(match),
      score: Math.round(match.match_score),
      url: `https://www.themoviedb.org/${match.media_type === 'tv' ? 'tv' : 'movie'}/${match.id}`,
    },
    updates,
  };
}

module.exports = {
  enrichMovieWithTmdb,
  hasTmdbKey,
};
