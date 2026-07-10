const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const mysql = require('mysql2/promise');
const { getDenseSearchScores, getMovieEmbeddingStatus } = require('../services/denseEmbeddingService');
const { normalizeText, searchMoviesForMessage } = require('../services/recommendationService');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });
  try {
    const status = await getMovieEmbeddingStatus(db);
    assert(status.configured, 'Embedding provider chưa được cấu hình');
    assert(status.coverage >= 95, `Embedding coverage quá thấp: ${status.coverage}%`);

    const meaningfulQuery = 'một bí ẩn tội phạm cần suy luận từng manh mối';
    const nonsenseQuery = 'qzxwvplm nfrtkgb';
    const [meaningfulDense, nonsenseDense] = await Promise.all([
      getDenseSearchScores(db, meaningfulQuery),
      getDenseSearchScores(db, nonsenseQuery),
    ]);
    assert(meaningfulDense.available && meaningfulDense.confident, 'Dense search không nhận ra truy vấn có nghĩa');
    assert(nonsenseDense.available && nonsenseDense.confident === false, 'Dense search chưa chặn truy vấn vô nghĩa');
    assert(
      meaningfulDense.distribution.contrast > nonsenseDense.distribution.contrast,
      'Truy vấn có nghĩa phải có độ tương phản lớn hơn truy vấn rác'
    );

    const meaningfulMovies = await searchMoviesForMessage(db, meaningfulQuery, { limit: 6, denseResult: meaningfulDense });
    const nonsenseMovies = await searchMoviesForMessage(db, nonsenseQuery, { limit: 6, denseResult: nonsenseDense });
    assert(meaningfulMovies.length > 0, 'Dense search không trả phim cho truy vấn có nghĩa');
    assert(meaningfulMovies.some((movie) => Number(movie.dense_similarity) > 0), 'Kết quả thiếu dense similarity');
    assert(nonsenseMovies.length === 0, 'Truy vấn rác không được trả phim');

    const vietnameseMovies = await searchMoviesForMessage(db, 'phim Việt Nam tình cảm đời thường', { limit: 6 });
    assert(vietnameseMovies.length > 0, 'Không tìm thấy phim Việt Nam');
    assert(vietnameseMovies.every((movie) => (
      (movie.countries || []).some((country) => normalizeText(country) === 'viet nam')
    )), 'Dense reranker đã vượt qua hard filter Việt Nam');

    console.log('Live dense search test passed');
    console.log(JSON.stringify({
      model: status.model,
      dimensions: status.dimensions,
      coverage: status.coverage,
      meaningful_contrast: Number(meaningfulDense.distribution.contrast.toFixed(4)),
      nonsense_contrast: Number(nonsenseDense.distribution.contrast.toFixed(4)),
      recommendations: meaningfulMovies.map((movie) => movie.title),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
