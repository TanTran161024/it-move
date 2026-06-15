require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const API_BASE = 'https://phimapi.com';
const pages = Number(process.env.KKPHIM_PAGES || process.argv[2] || 2);
const limit = Number(process.env.KKPHIM_LIMIT || process.argv[3] || 24);

function cleanText(value) {
  if (!value) return null;
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function normalizeEpisodeNumber(name, index) {
  const match = String(name || '').match(/\d+/);
  return match ? Number(match[0]) : index + 1;
}

function isSeries(type, episodeTotal) {
  return ['series', 'tvshows', 'hoathinh'].includes(type) || Number(episodeTotal) > 1;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function ensureNamedRow(db, table, name, extra = {}) {
  const [rows] = await db.execute(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
  if (rows.length) return rows[0].id;

  if (table === 'producers') {
    const [result] = await db.execute('INSERT INTO producers (name, country_id) VALUES (?, ?)', [name, extra.country_id || null]);
    return result.insertId;
  }

  if (table === 'actors') {
    const [result] = await db.execute('INSERT INTO actors (name, profile_pic_url, bio) VALUES (?, NULL, NULL)', [name]);
    return result.insertId;
  }

  if (table === 'directors') {
    const [result] = await db.execute('INSERT INTO directors (name, profile_pic_url, bio) VALUES (?, NULL, NULL)', [name]);
    return result.insertId;
  }

  const [result] = await db.execute(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
  return result.insertId;
}

async function upsertMovie(db, movie) {
  const [existing] = await db.execute('SELECT id FROM movies WHERE slug = ? LIMIT 1', [movie.slug]);
  const values = [
    movie.name,
    null,
    movie.origin_name || null,
    movie.slug,
    cleanText(movie.content),
    movie.year || null,
    movie.time || null,
    isSeries(movie.type, movie.episode_total) ? 1 : 0,
    movie.poster_url || movie.thumb_url || null,
    movie.trailer_url || null,
    movie.tmdb?.vote_average || null,
    movie.status === 'completed' ? 'completed' : 'ongoing',
    movie.quality || null,
  ];

  if (existing.length) {
    await db.execute(
      `UPDATE movies
       SET title=?, age_limit=?, original_title=?, slug=?, description=?, release_year=?, duration=?,
           is_series=?, poster_url=?, trailer_url=?, imdb_rating=?, status=?, quality=?
       WHERE id=?`,
      [...values, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await db.execute(
    `INSERT INTO movies
     (title, age_limit, original_title, slug, description, release_year, duration,
      is_series, poster_url, trailer_url, imdb_rating, status, quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values
  );
  return result.insertId;
}

async function replaceLinks(db, movieId, table, column, ids) {
  await db.execute(`DELETE FROM ${table} WHERE movie_id = ?`, [movieId]);
  for (const id of ids) {
    await db.execute(`INSERT IGNORE INTO ${table} (movie_id, ${column}) VALUES (?, ?)`, [movieId, id]);
  }
}

async function replaceEpisodes(db, movieId, episodes) {
  await db.execute('DELETE FROM episodes WHERE movie_id = ?', [movieId]);
  const firstServer = episodes?.[0]?.server_data || [];
  for (let i = 0; i < firstServer.length; i += 1) {
    const episode = firstServer[i];
    await db.execute(
      `INSERT INTO episodes (movie_id, episode_number, title, video_url, subtitle_url)
       VALUES (?, ?, ?, ?, NULL)`,
      [
        movieId,
        normalizeEpisodeNumber(episode.name, i),
        episode.name || `Tập ${i + 1}`,
        episode.link_embed || episode.link_m3u8 || null,
      ]
    );
  }
}

async function upsertBanner(db, movieId, movie) {
  if (!movie.thumb_url) return;
  const [rows] = await db.execute('SELECT id FROM banners WHERE movie_id = ? LIMIT 1', [movieId]);
  const thumbnails = JSON.stringify([movie.poster_url, movie.thumb_url].filter(Boolean));
  if (rows.length) {
    await db.execute('UPDATE banners SET bg_url=?, title_url=?, thumbnails=? WHERE id=?', [
      movie.thumb_url,
      null,
      thumbnails,
      rows[0].id,
    ]);
    return;
  }
  await db.execute('INSERT INTO banners (movie_id, bg_url, title_url, thumbnails) VALUES (?, ?, ?, ?)', [
    movieId,
    movie.thumb_url,
    null,
    thumbnails,
  ]);
}

async function importMovie(db, slug) {
  const detail = await fetchJson(`${API_BASE}/phim/${encodeURIComponent(slug)}`);
  if (!detail.status || !detail.movie) return null;

  const movie = detail.movie;
  const movieId = await upsertMovie(db, movie);

  const genreIds = [];
  for (const genre of movie.category || []) {
    genreIds.push(await ensureNamedRow(db, 'genres', genre.name));
  }
  await replaceLinks(db, movieId, 'movie_genres', 'genre_id', genreIds);

  const countryIds = [];
  for (const country of movie.country || []) {
    countryIds.push(await ensureNamedRow(db, 'countries', country.name));
  }
  await replaceLinks(db, movieId, 'movie_countries', 'country_id', countryIds);

  const actorIds = [];
  for (const actor of movie.actor || []) {
    const name = cleanText(actor);
    if (name && name !== 'Đang cập nhật') actorIds.push(await ensureNamedRow(db, 'actors', name));
  }
  await replaceLinks(db, movieId, 'movie_actors', 'actor_id', actorIds);

  const directorIds = [];
  for (const director of movie.director || []) {
    const name = cleanText(director);
    if (name && name !== 'Đang cập nhật') directorIds.push(await ensureNamedRow(db, 'directors', name));
  }
  await replaceLinks(db, movieId, 'movie_directors', 'director_id', directorIds);

  await replaceEpisodes(db, movieId, detail.episodes || []);
  await upsertBanner(db, movieId, movie);

  return movie.name;
}

async function main() {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
    waitForConnections: true,
    connectionLimit: 5,
  });

  let imported = 0;
  try {
    for (let page = 1; page <= pages; page += 1) {
      const list = await fetchJson(`${API_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`);
      const items = (list.items || []).slice(0, limit);
      for (const item of items) {
        const name = await importMovie(db, item.slug);
        if (name) {
          imported += 1;
          console.log(`[${imported}] ${name}`);
        }
      }
    }

    const [[movieCount]] = await db.query('SELECT COUNT(*) AS count FROM movies');
    const [[episodeCount]] = await db.query('SELECT COUNT(*) AS count FROM episodes');
    console.log(`Done. Imported/updated ${imported} movies. Database now has ${movieCount.count} movies and ${episodeCount.count} episodes.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
