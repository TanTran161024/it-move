const {
  searchMoviesForMessage,
  getUserRecommendations,
  getPopularMovies,
  normalizeText,
} = require('./recommendationService');
const { hasAnyPhrase, hasRefinement, parseDurationMinutes } = require('./chatIntentService');

const DEFAULT_CONTEXT_LIMIT = 12;
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

  return score;
}

function applyConversationRefinements(candidates, refinement, contextLimit = DEFAULT_CONTEXT_LIMIT) {
  if (!hasRefinement(refinement)) return candidates;
  return [...candidates].sort((left, right) => {
    const leftIndex = candidates.findIndex((movie) => Number(movie.id) === Number(left.id));
    const rightIndex = candidates.findIndex((movie) => Number(movie.id) === Number(right.id));
    return refinementScore(right, refinement, rightIndex, contextLimit) - refinementScore(left, refinement, leftIndex, contextLimit);
  });
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

async function getCandidateMovies(db, { message, userId, profileId, limit, signals }) {
  const normalizedMessage = normalizeText(message);
  const wantsUserTaste = USER_TASTE_TERMS.some((term) => normalizedMessage.includes(term));
  if (wantsUserTaste && userId) {
    const userRecommendations = await getUserRecommendations(db, userId, limit, profileId).catch(() => []);
    if (userRecommendations.length) return userRecommendations;
  }

  const hasSearchIntent = signals.wanted.length > 0 || Boolean(signals.year) || signals.terms.some((term) => (
    term.length >= 3 && !['phim', 'xem', 'muon', 'goi', 'hay', 'cho', 'toi', 'can'].includes(term)
  ));

  if (hasSearchIntent) {
    const searched = await searchMoviesForMessage(db, message, { limit });
    if (searched.length) return searched;
  }

  if (userId) {
    const userRecommendations = await getUserRecommendations(db, userId, limit, profileId).catch(() => []);
    if (userRecommendations.length) return userRecommendations;
  }

  const broadSearch = await searchMoviesForMessage(db, message, { limit });
  if (broadSearch.length) return broadSearch;

  return getPopularMovies(db, { limit });
}

module.exports = {
  applyConversationRefinements,
  fillCandidatePool,
  getCandidateMovies,
};
