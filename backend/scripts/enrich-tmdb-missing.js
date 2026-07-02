require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { enrichMissingMoviesWithTmdb } = require('../services/tmdbService');

const limit = Number(process.env.TMDB_ENRICH_LIMIT || process.argv[2] || 20);
const delayMs = Number(process.env.TMDB_ENRICH_DELAY_MS || 300);

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
    const report = await enrichMissingMoviesWithTmdb(db, {
      limit,
      delayMs,
      replaceImportedImages: true,
      castLimit: 8,
      directorLimit: 4,
    });

    for (const item of report.results) {
      if (item.ok) {
        console.log(`[OK] #${item.movie_id} ${item.title}: ${item.changes.join(', ') || 'no change'}`);
      } else {
        console.warn(`[SKIP] #${item.movie_id} ${item.title}: ${item.error}`);
      }
    }

    console.log(
      `Done. Success: ${report.summary.success}, failed/skipped: ${report.summary.failed}, changed: ${report.summary.changed}, scanned: ${report.summary.scanned}.`
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
