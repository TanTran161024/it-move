const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const mysql = require('mysql2/promise');
const { getMovieEmbeddingStatus, syncMovieEmbeddings } = require('../services/denseEmbeddingService');

function argumentValue(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });

  try {
    if (process.argv.includes('--status')) {
      console.log(JSON.stringify(await getMovieEmbeddingStatus(db), null, 2));
      return;
    }
    const result = await syncMovieEmbeddings(db, {
      force: process.argv.includes('--force'),
      limit: argumentValue('limit'),
      batchSize: argumentValue('batch-size'),
      onProgress: ({ embedded, pending, total }) => {
        console.log(`embedded ${embedded}/${pending} pending (${total} movies total)`);
      },
    });
    console.log('Movie embedding sync completed');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
