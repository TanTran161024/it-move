function extractRecommendationIds(aiResult) {
  if (!aiResult) return [];
  if (Array.isArray(aiResult)) return aiResult;

  const direct = aiResult.recommendation_ids
    || aiResult.recommendationIds
    || aiResult.movie_ids
    || aiResult.movieIds
    || aiResult.ids;

  if (Array.isArray(direct)) return direct;
  if (Array.isArray(aiResult.recommendations)) {
    return aiResult.recommendations.map((item) => (
      typeof item === 'object' && item !== null ? item.id || item.movie_id || item.movieId : item
    ));
  }

  return [];
}

function verifyRecommendations(rawIds, candidates, limit) {
  const allowed = new Map(candidates.map((movie) => [Number(movie.id), movie]));
  const ids = Array.isArray(rawIds) ? rawIds.map(Number) : [];
  const verified = [];

  for (const id of ids) {
    if (allowed.has(id) && !verified.some((movie) => Number(movie.id) === id)) {
      verified.push(allowed.get(id));
    }
    if (verified.length >= limit) break;
  }

  for (const movie of candidates) {
    if (verified.length >= limit) break;
    if (!verified.some((item) => Number(item.id) === Number(movie.id))) {
      verified.push(movie);
    }
  }

  return verified.slice(0, limit);
}

module.exports = {
  extractRecommendationIds,
  verifyRecommendations,
};
