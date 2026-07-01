require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { enrichMovieWithTmdb } = require('../services/tmdbService');

const limit = Number(process.env.TMDB_ENRICH_LIMIT || process.argv[2] || 20);
const delayMs = Number(process.env.TMDB_ENRICH_DELAY_MS || 300);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.TMDB_API_KEY) {
    throw new Error('Thiếu TMDB_API_KEY trong backend/.env');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Limit không hợp lệ. Ví dụ: npm run enrich:tmdb -- 20');
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });

  try {
    const [movies] = await db.query(
      `
        SELECT
          m.id, m.title, m.original_title, m.release_year, m.poster_url,
          COUNT(DISTINCT ma.actor_id) AS actor_count,
          MAX(CASE WHEN b.bg_url IS NOT NULL AND b.bg_url <> '' THEN b.bg_url ELSE NULL END) AS existing_bg_url
        FROM movies m
        LEFT JOIN movie_actors ma ON m.id = ma.movie_id
        LEFT JOIN banners b ON m.id = b.movie_id
        GROUP BY m.id, m.title, m.original_title, m.release_year, m.poster_url, m.created_at
        HAVING
          m.poster_url IS NULL
          OR m.poster_url = ''
          OR m.poster_url LIKE '%example.com%'
          OR m.poster_url LIKE '%placeholder%'
          OR m.poster_url LIKE '%no-poster%'
          OR existing_bg_url IS NULL
          OR actor_count = 0
        ORDER BY m.created_at DESC
        LIMIT ${limit}
      `
    );

    let success = 0;
    let failed = 0;

    for (const movie of movies) {
      try {
        const result = await enrichMovieWithTmdb(db, movie.id, { castLimit: 8 });
        const updates = result.updates;
        const changed = [
          updates.poster?.updated ? 'poster' : null,
          updates.backdrop?.updated ? 'backdrop' : null,
          updates.cast?.added ? `${updates.cast.added} cast` : null,
        ].filter(Boolean).join(', ') || 'no change';
        console.log(`[OK] #${movie.id} ${movie.title}: ${changed}`);
        success += 1;
      } catch (error) {
        console.warn(`[SKIP] #${movie.id} ${movie.title}: ${error.message}`);
        failed += 1;
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    console.log(`Done. Success: ${success}, failed/skipped: ${failed}, scanned: ${movies.length}.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
