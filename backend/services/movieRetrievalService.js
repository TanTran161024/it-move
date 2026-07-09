const {
  searchMoviesForMessage,
  getUserRecommendations,
  getPopularMovies,
  normalizeText,
} = require('./recommendationService');
const { hasAnyPhrase, hasRefinement, parseDurationMinutes } = require('./chatIntentService');

const DEFAULT_CONTEXT_LIMIT = 12;
const CURRENT_YEAR = new Date().getFullYear();
const USER_TASTE_TERMS = [
  'vua xem',
  'dang xem',
  'lich su',
  'history',
  'da xem',
  'gu cua toi',
  'gu toi',
  'theo gu',
  'yeu thich',
  'watchlist',
  'danh sach',
  'giong phim vua xem',
];

function movieSearchText(movie) {
  return normalizeText([
    movie.title,
    movie.original_title,
    movie.description,
    Array.isArray(movie.genres) ? movie.genres.join(' ') : '',
    Array.isArray(movie.countries) ? movie.countries.join(' ') : '',
  ].join(' '));
}

function movieYear(movie) {
  const year = Number(movie.release_year || movie.year || String(movie.release_date || '').slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function movieRating(movie) {
  const rating = Number(movie.imdb_rating || movie.rating || movie.vote_average || movie.voteAverage);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

function isSeriesMovie(movie) {
  return movie.is_series === true || Number(movie.is_series) === 1 || hasAnyPhrase(movieSearchText(movie), ['phim bo', 'series']);
}

function isAnimeMovie(movie) {
  const haystack = movieSearchText(movie);
  return hasAnyPhrase(haystack, ['anime', 'hoat hinh', 'animation', 'cartoon']);
}

function isHorrorMovie(movie) {
  return hasAnyPhrase(movieSearchText(movie), ['kinh di', 'horror', 'ma', 'am anh', 'quy', 'sat nhan']);
}

function hasCountry(movie, aliases) {
  const haystack = movieSearchText(movie);
  return hasAnyPhrase(haystack, aliases);
}

function hasHardRefinement(refinement) {
  return Boolean(
    refinement.noSeries
    || refinement.seriesOnly
    || refinement.animeOnly
    || refinement.noAnime
    || refinement.noHorror
    || refinement.koreanOnly
    || refinement.chineseOnly
    || refinement.japaneseOnly
  );
}

function passesHardRefinement(movie, refinement) {
  if (refinement.noSeries && isSeriesMovie(movie)) return false;
  if (refinement.seriesOnly && !isSeriesMovie(movie)) return false;
  if (refinement.animeOnly && !isAnimeMovie(movie)) return false;
  if (refinement.noAnime && isAnimeMovie(movie)) return false;
  if (refinement.noHorror && isHorrorMovie(movie)) return false;
  if (refinement.koreanOnly && !hasCountry(movie, ['han quoc', 'korea', 'korean'])) return false;
  if (refinement.chineseOnly && !hasCountry(movie, ['trung quoc', 'china', 'chinese', 'hoa ngu'])) return false;
  if (refinement.japaneseOnly && !hasCountry(movie, ['nhat ban', 'japan', 'japanese'])) return false;
  return true;
}

function refinementScore(movie, refinement, index, contextLimit = DEFAULT_CONTEXT_LIMIT) {
  let score = Number(movie.match_score || movie.score || 0) + Math.max(0, contextLimit - index);
  const haystack = movieSearchText(movie);

  if (refinement.lighter) {
    if (hasAnyPhrase(haystack, ['hai', 'hai huoc', 'tinh cam', 'lang man', 'gia dinh', 'hoc duong', 'hoat hinh'])) {
      score += 36;
    }
    if (hasAnyPhrase(haystack, ['kinh di', 'hinh su', 'chien tranh', 'gay can', 'cang thang', 'ma', 'sat thu'])) {
      score -= 26;
    }
  }

  if (refinement.shorter) {
    const minutes = parseDurationMinutes(movie.duration);
    if (minutes) {
      if (minutes <= 35) score += 42;
      else if (minutes <= 60) score += 34;
      else if (minutes <= 95) score += 22;
      else if (minutes > 140) score -= 18;
    } else if (movie.is_series) {
      score += 8;
    }
  }

  if (refinement.moreIntense && hasAnyPhrase(haystack, ['gay can', 'hanh dong', 'kinh di', 'hinh su', 'bi an', 'chien dau'])) {
    score += 30;
  }

  if (refinement.funnier && hasAnyPhrase(haystack, ['hai', 'hai huoc', 'vui', 'gia dinh'])) {
    score += 28;
  }

  if (refinement.newer) {
    const year = movieYear(movie);
    if (year) {
      score += Math.max(0, Math.min(36, (year - (CURRENT_YEAR - 10)) * 3));
      if (year >= CURRENT_YEAR - 2) score += 45;
      else if (year >= CURRENT_YEAR - 5) score += 30;
      else if (year >= CURRENT_YEAR - 10) score += 12;
      else score -= 12;
    }
  }

  if (refinement.higherRated) {
    const rating = movieRating(movie);
    if (rating) {
      if (rating >= 8) score += 45;
      else if (rating >= 7) score += 30;
      else if (rating >= 6) score += 12;
      else score -= 18;
    }
  }

  if (refinement.noSeries) score += isSeriesMovie(movie) ? -80 : 24;
  if (refinement.seriesOnly) score += isSeriesMovie(movie) ? 30 : -45;
  if (refinement.animeOnly) score += isAnimeMovie(movie) ? 60 : -50;
  if (refinement.noAnime) score += isAnimeMovie(movie) ? -70 : 16;
  if (refinement.noHorror) score += isHorrorMovie(movie) ? -85 : 18;
  if (refinement.koreanOnly) score += hasCountry(movie, ['han quoc', 'korea', 'korean']) ? 55 : -35;
  if (refinement.chineseOnly) score += hasCountry(movie, ['trung quoc', 'china', 'chinese', 'hoa ngu']) ? 55 : -35;
  if (refinement.japaneseOnly) score += hasCountry(movie, ['nhat ban', 'japan', 'japanese']) ? 55 : -35;

  return score;
}

function applyConversationRefinements(candidates, refinement, contextLimit = DEFAULT_CONTEXT_LIMIT) {
  if (!hasRefinement(refinement)) return candidates;
  const ranked = [...candidates].sort((left, right) => {
    const leftIndex = candidates.findIndex((movie) => Number(movie.id) === Number(left.id));
    const rightIndex = candidates.findIndex((movie) => Number(movie.id) === Number(right.id));
    return refinementScore(right, refinement, rightIndex, contextLimit) - refinementScore(left, refinement, leftIndex, contextLimit);
  });

  if (!hasHardRefinement(refinement)) return ranked;

  const filtered = ranked.filter((movie) => passesHardRefinement(movie, refinement));
  return filtered.length ? filtered : ranked;
}

async function fillCandidatePool(db, candidates, excludeIds, targetLimit) {
  if (candidates.length >= targetLimit) return candidates.slice(0, targetLimit);

  const currentIds = candidates.map((movie) => Number(movie.id)).filter(Boolean);
  const fallback = await getPopularMovies(db, {
    excludeIds: [...new Set([...excludeIds, ...currentIds])],
    limit: targetLimit - candidates.length,
  }).catch(() => []);

  return [...candidates, ...fallback].slice(0, targetLimit);
}

async function getCandidateMovies(db, { message, userId, profileId, limit, signals, tasteProfile = null }) {
  const normalizedMessage = normalizeText(message);
  const wantsUserTaste = USER_TASTE_TERMS.some((term) => normalizedMessage.includes(term));
  if (wantsUserTaste && userId) {
    const userRecommendations = await getUserRecommendations(db, userId, limit, profileId, { tasteProfile }).catch(() => []);
    if (userRecommendations.length) return userRecommendations;
  }

  const hasSearchIntent = signals.wanted.length > 0 || Boolean(signals.year) || signals.terms.some((term) => (
    term.length >= 3 && !['phim', 'xem', 'muon', 'goi', 'hay', 'cho', 'toi', 'can'].includes(term)
  ));

  if (hasSearchIntent) {
    const searched = await searchMoviesForMessage(db, message, { limit, tasteProfile });
    if (searched.length) return searched;
  }

  if (userId) {
    const userRecommendations = await getUserRecommendations(db, userId, limit, profileId, { tasteProfile }).catch(() => []);
    if (userRecommendations.length) return userRecommendations;
  }

  const broadSearch = await searchMoviesForMessage(db, message, { limit, tasteProfile });
  if (broadSearch.length) return broadSearch;

  return getPopularMovies(db, { limit });
}

module.exports = {
  applyConversationRefinements,
  fillCandidatePool,
  getCandidateMovies,
};
