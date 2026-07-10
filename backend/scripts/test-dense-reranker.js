const {
  buildMovieEmbeddingText,
  cosineSimilarity,
  normalizeVector,
} = require('../services/denseEmbeddingService');
const { rerankCandidates } = require('../services/hybridRerankerService');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function candidate(id, score, denseSimilarity, tasteScore = 0, rating = 7, views = 100) {
  return {
    profile: { id, imdb_rating: rating, views },
    score,
    denseSimilarity,
    tasteScore,
  };
}

function main() {
  const normalized = normalizeVector([3, 4]);
  assert(Math.abs(normalized[0] - 0.6) < 0.000001, 'normalizeVector failed');
  assert(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 0.000001, 'identical cosine should be 1');
  assert(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 0.000001, 'orthogonal cosine should be 0');

  const content = buildMovieEmbeddingText({
    title: 'Phim thử nghiệm',
    description: 'Một hành trình chữa lành và tìm lại hy vọng.',
    genres: ['Tâm lý', 'Tình cảm'],
    countries: ['Việt Nam'],
    release_year: 2026,
    duration: '90 phút',
  });
  assert(content.title === 'Phim thử nghiệm', 'embedding title is missing');
  assert(content.text.includes('chữa lành'), 'embedding document is missing description');
  assert(content.text.includes('Tâm lý'), 'embedding document is missing genres');

  const ranked = rerankCandidates([
    candidate(1, 100, 0.42, 0, 9, 10000),
    candidate(2, 80, 0.92, 8, 8, 200),
    candidate(3, 70, 0.55, 2, 7, 500),
  ], {
    denseAvailable: true,
    engagementScores: new Map([[2, { score: 0.8 }]]),
    limit: 3,
  });
  assert(ranked[0].profile.id === 2, 'dense + taste + engagement candidate should be reranked first');
  assert(ranked.every((item) => Number.isFinite(item.rerankScore)), 'reranker should expose a finite score');

  const fallback = rerankCandidates([
    candidate(1, 20, 0),
    candidate(2, 40, 0),
  ], { denseAvailable: false, engagementScores: new Map(), limit: 2 });
  assert(fallback[0].profile.id === 2, 'fallback should preserve base ranking');
  assert(fallback[0].rerankScore === null, 'fallback should not invent a rerank score');

  console.log('Dense embedding & hybrid reranker unit test passed');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
