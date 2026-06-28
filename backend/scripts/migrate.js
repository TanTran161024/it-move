require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const migrationsDir = path.join(__dirname, '..', 'migrations');

function splitAlterClauses(clausesSql) {
  const clauses = [];
  let start = 0;
  let quote = null;
  let depth = 0;

  for (let i = 0; i < clausesSql.length; i += 1) {
    const char = clausesSql[i];
    const prev = clausesSql[i - 1];

    if ((char === "'" || char === '`' || char === '"') && prev !== '\\') {
      quote = quote === char ? null : quote || char;
      continue;
    }

    if (quote) continue;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      clauses.push(clausesSql.slice(start, i).trim());
      start = i + 1;
    }
  }

  clauses.push(clausesSql.slice(start).trim());
  return clauses.filter(Boolean);
}

async function columnExists(db, tableName, columnName) {
  const [rows] = await db.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function normalizeAlterAddColumnIfNotExists(db, statement) {
  const match = statement.match(/^ALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?\s+([\s\S]+)$/i);
  if (!match || !/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(statement)) {
    return statement;
  }

  const [, tableName, clausesSql] = match;
  const clauses = splitAlterClauses(clausesSql);
  const pendingClauses = [];

  for (const clause of clauses) {
    const columnMatch = clause.match(/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?\s+([\s\S]+)$/i);
    if (!columnMatch) {
      pendingClauses.push(clause);
      continue;
    }

    const [, columnName, columnDefinition] = columnMatch;
    if (!(await columnExists(db, tableName, columnName))) {
      pendingClauses.push(`ADD COLUMN \`${columnName}\` ${columnDefinition}`);
    }
  }

  if (pendingClauses.length === 0) {
    return '';
  }

  return `ALTER TABLE \`${tableName}\`\n  ${pendingClauses.join(',\n  ')}`;
}

async function normalizeMigrationSql(db, sql) {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  const normalized = [];

  for (const statement of statements) {
    const nextStatement = await normalizeAlterAddColumnIfNotExists(db, statement);
    if (nextStatement) {
      normalized.push(nextStatement);
    }
  }

  return normalized.join(';\n');
}

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
      const sql = await normalizeMigrationSql(db, fs.readFileSync(fullPath, 'utf8').trim());
      if (!sql) {
        console.log(`skip empty ${file}`);
        await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
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
