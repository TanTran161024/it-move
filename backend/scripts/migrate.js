require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
    multipleStatements: true,
  });

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT NOT NULL AUTO_INCREMENT,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const [executedRows] = await db.query('SELECT filename FROM schema_migrations');
    const executed = new Set(executedRows.map((row) => row.filename));
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let applied = 0;
    for (const file of files) {
      if (executed.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8').trim();
      if (!sql) {
        console.log(`skip empty ${file}`);
        continue;
      }

      console.log(`apply ${file}`);
      await db.beginTransaction();
      try {
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
        await db.commit();
        applied += 1;
      } catch (error) {
        await db.rollback();
        throw new Error(`Migration failed: ${file}\n${error.message}`);
      }
    }

    console.log(`Done. Applied ${applied} migration(s).`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
