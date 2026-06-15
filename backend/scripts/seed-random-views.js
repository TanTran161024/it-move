require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const minViews = Number(process.env.TEST_VIEW_MIN || process.argv[2] || 1000);
const maxViews = Number(process.env.TEST_VIEW_MAX || process.argv[3] || 10000);

function randomViews() {
  return Math.floor(Math.random() * (maxViews - minViews + 1)) + minViews;
}

async function main() {
  if (!Number.isFinite(minViews) || !Number.isFinite(maxViews) || minViews < 0 || maxViews < minViews) {
    throw new Error('Khoảng view không hợp lệ. Ví dụ: npm run seed:views -- 1000 10000');
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });

  try {
    const [movies] = await db.query('SELECT id, views FROM movies');
    let updated = 0;

    for (const movie of movies) {
      if (Number(movie.views) >= minViews) continue;
      await db.execute('UPDATE movies SET views = ? WHERE id = ?', [randomViews(), movie.id]);
      updated += 1;
    }

    console.log(`Done. Updated ${updated}/${movies.length} movie view counts to ${minViews}-${maxViews}.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
