const crypto = require('crypto');

const DEFAULT_MODEL = 'gemini-embedding-2';
const DEFAULT_DIMENSIONS = 768;
const QUERY_CACHE_LIMIT = 120;
const queryCache = new Map();
let embeddingHealth = {
  ok: null,
  checked_at: null,
  error_code: null,
  error_message: null,
  http_status: null,
};

function clampInteger(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function getEmbeddingConfig() {
  return {
    enabled: process.env.DENSE_SEARCH_ENABLED !== 'false',
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_MODEL,
    dimensions: clampInteger(process.env.GEMINI_EMBEDDING_DIMENSIONS, 128, 3072, DEFAULT_DIMENSIONS),
    timeoutMs: clampInteger(process.env.GEMINI_EMBEDDING_TIMEOUT_MS, 1000, 120000, 20000),
    batchSize: clampInteger(process.env.GEMINI_EMBEDDING_BATCH_SIZE, 1, 100, 20),
    cacheTtlMs: clampInteger(process.env.DENSE_QUERY_CACHE_TTL_MS, 1000, 86400000, 900000),
  };
}

function getDenseEmbeddingStatus() {
  const config = getEmbeddingConfig();
  return {
    enabled: config.enabled,
    configured: config.configured,
    model: config.model,
    dimensions: config.dimensions,
    query_cache_size: queryCache.size,
    health: embeddingHealth,
  };
}

function setEmbeddingHealth(next) {
  embeddingHealth = {
    ...embeddingHealth,
    ...next,
    checked_at: new Date().toISOString(),
  };
}

function normalizeVector(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const vector = values.map(Number);
  if (vector.some((value) => !Number.isFinite(value))) return [];
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return [];
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function parseNameList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value).split('||').map((item) => item.trim()).filter(Boolean);
}

function buildMovieEmbeddingText(movie) {
  const title = String(movie?.title || movie?.original_title || 'Không rõ').trim();
  const details = [
    movie?.original_title && movie.original_title !== title ? `Tên gốc: ${movie.original_title}` : null,
    movie?.release_year ? `Năm phát hành: ${movie.release_year}` : null,
    movie?.is_series ? 'Định dạng: phim bộ nhiều tập' : 'Định dạng: phim lẻ',
    movie?.duration ? `Thời lượng: ${movie.duration}` : null,
    parseNameList(movie?.genres).length ? `Thể loại: ${parseNameList(movie.genres).join(', ')}` : null,
    parseNameList(movie?.countries).length ? `Quốc gia: ${parseNameList(movie.countries).join(', ')}` : null,
    parseNameList(movie?.actors).length ? `Diễn viên: ${parseNameList(movie.actors).slice(0, 10).join(', ')}` : null,
    parseNameList(movie?.directors).length ? `Đạo diễn: ${parseNameList(movie.directors).slice(0, 5).join(', ')}` : null,
    movie?.description ? `Nội dung: ${String(movie.description).slice(0, 1800)}` : null,
  ].filter(Boolean).join('. ');
  return { title, text: details.slice(0, 7000) };
}

function contentHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function prepareEmbeddingInput({ text, title = '', kind = 'document' }, model) {
  const cleanText = String(text || '').trim();
  if (model.includes('embedding-2')) {
    if (kind === 'query') return `task: search result | query: ${cleanText}`;
    return `title: ${String(title || 'none').trim() || 'none'} | text: ${cleanText}`;
  }
  return cleanText;
}

function buildEmbeddingRequest(input, config) {
  const request = {
    model: `models/${config.model}`,
    content: {
      parts: [{ text: prepareEmbeddingInput(input, config.model) }],
    },
    outputDimensionality: config.dimensions,
  };
  if (!config.model.includes('embedding-2')) {
    request.taskType = input.kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    if (input.kind !== 'query' && input.title) request.title = String(input.title).slice(0, 300);
  }
  return request;
}

function classifyEmbeddingError(status, body) {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 401 || status === 403) return 'ACCESS_DENIED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (/dimension/i.test(body || '')) return 'INVALID_DIMENSIONS';
  return 'EMBEDDING_ERROR';
}

async function requestEmbeddingBatchOnce(inputs) {
  const config = getEmbeddingConfig();
  if (!config.enabled) throw Object.assign(new Error('Dense search đang tắt'), { code: 'DENSE_DISABLED' });
  if (!config.configured) throw Object.assign(new Error('Chưa cấu hình GEMINI_API_KEY cho embedding'), { code: 'EMBEDDING_NOT_CONFIGURED' });
  if (!Array.isArray(inputs) || !inputs.length) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:batchEmbedContents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({ requests: inputs.map((input) => buildEmbeddingRequest(input, config)) }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const code = classifyEmbeddingError(response.status, body);
      setEmbeddingHealth({ ok: false, http_status: response.status, error_code: code, error_message: body.slice(0, 500) });
      const retryAfter = Number(response.headers.get('retry-after'));
      throw Object.assign(new Error(`${code}: không thể tạo embedding`), {
        code,
        httpStatus: response.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
      });
    }
    const payload = await response.json();
    const embeddings = Array.isArray(payload.embeddings) ? payload.embeddings : [];
    if (embeddings.length !== inputs.length) {
      throw Object.assign(new Error(`Embedding count mismatch: ${embeddings.length}/${inputs.length}`), { code: 'INVALID_EMBEDDING_RESPONSE' });
    }
    const vectors = embeddings.map((embedding) => normalizeVector(embedding?.values));
    if (vectors.some((vector) => vector.length !== config.dimensions)) {
      throw Object.assign(new Error('Embedding trả về sai số chiều'), { code: 'INVALID_EMBEDDING_DIMENSIONS' });
    }
    setEmbeddingHealth({ ok: true, http_status: response.status, error_code: null, error_message: null });
    return vectors;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = Object.assign(new Error('Embedding provider timeout'), { code: 'EMBEDDING_TIMEOUT' });
      setEmbeddingHealth({ ok: false, http_status: null, error_code: timeoutError.code, error_message: timeoutError.message });
      throw timeoutError;
    }
    if (!error.code) setEmbeddingHealth({ ok: false, error_code: 'EMBEDDING_ERROR', error_message: error.message });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEmbeddingBatch(inputs) {
  const maxAttempts = clampInteger(process.env.GEMINI_EMBEDDING_MAX_ATTEMPTS, 1, 6, 5);
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestEmbeddingBatchOnce(inputs);
    } catch (error) {
      lastError = error;
      const retryable = ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'EMBEDDING_TIMEOUT'].includes(error.code);
      if (!retryable || attempt >= maxAttempts) throw error;
      const exponentialDelay = Math.min(15000, 1000 * (2 ** (attempt - 1)));
      const delayMs = error.retryAfterMs || exponentialDelay + Math.floor(Math.random() * 500);
      await wait(delayMs);
    }
  }
  throw lastError || new Error('Không thể tạo embedding');
}

function getCachedQuery(key, ttlMs) {
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > ttlMs) {
    queryCache.delete(key);
    return null;
  }
  queryCache.delete(key);
  queryCache.set(key, cached);
  return cached.vector;
}

function setCachedQuery(key, vector) {
  queryCache.set(key, { vector, createdAt: Date.now() });
  while (queryCache.size > QUERY_CACHE_LIMIT) {
    queryCache.delete(queryCache.keys().next().value);
  }
}

async function embedQuery(message) {
  const config = getEmbeddingConfig();
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) return [];
  const key = `${config.model}:${config.dimensions}:${contentHash(cleanMessage)}`;
  const cached = getCachedQuery(key, config.cacheTtlMs);
  if (cached) return cached;
  const [vector] = await requestEmbeddingBatch([{ text: cleanMessage, kind: 'query' }]);
  setCachedQuery(key, vector);
  return vector;
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

async function loadStoredEmbeddings(db) {
  const config = getEmbeddingConfig();
  try {
    const [rows] = await db.execute(
      `SELECT me.movie_id, me.embedding
       FROM movie_embeddings me
       JOIN movies m ON m.id = me.movie_id
       WHERE me.model = ? AND me.dimensions = ? AND m.is_visible = 1`,
      [config.model, config.dimensions]
    );
    return rows.map((row) => ({ movieId: Number(row.movie_id), vector: parseEmbedding(row.embedding) }))
      .filter((row) => row.movieId > 0 && row.vector.length === config.dimensions);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

async function getDenseSearchScores(db, message) {
  const config = getEmbeddingConfig();
  if (!config.enabled || !config.configured) {
    return { available: false, scores: new Map(), coverage: 0, reason: config.enabled ? 'not_configured' : 'disabled' };
  }
  try {
    const stored = await loadStoredEmbeddings(db);
    if (!stored.length) return { available: false, scores: new Map(), coverage: 0, reason: 'empty_index' };
    const queryVector = await embedQuery(message);
    if (!queryVector.length) return { available: false, scores: new Map(), coverage: stored.length, reason: 'empty_query' };
    const scores = new Map(stored.map((item) => [item.movieId, cosineSimilarity(queryVector, item.vector)]));
    const sorted = [...scores.values()].filter(Number.isFinite).sort((left, right) => left - right);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const maximum = sorted.length ? sorted[sorted.length - 1] : 0;
    const contrast = maximum - median;
    const minContrast = Number(process.env.DENSE_SEARCH_MIN_CONTRAST || 0.045);
    return {
      available: true,
      confident: sorted.length < 5 || contrast >= minContrast,
      scores,
      coverage: stored.length,
      model: config.model,
      dimensions: config.dimensions,
      distribution: {
        minimum: sorted[0] || 0,
        median,
        maximum,
        contrast,
      },
      matchThreshold: Math.max(
        Number(process.env.DENSE_SEARCH_MIN_SIMILARITY || 0.35),
        median + Math.max(0.02, contrast * 0.35)
      ),
      strongThreshold: Math.max(
        Number(process.env.DENSE_SEARCH_STRONG_SIMILARITY || 0.52),
        median + Math.max(0.035, contrast * 0.55)
      ),
    };
  } catch (error) {
    return { available: false, scores: new Map(), coverage: 0, reason: error.code || 'provider_error', error: error.message };
  }
}

async function getEmbeddingMovieRows(db, limit = 10000) {
  const safeLimit = clampInteger(limit, 1, 100000, 10000);
  const [rows] = await db.execute(
    `SELECT
       m.id, m.title, m.original_title, m.description, m.release_year, m.duration, m.is_series,
       COALESCE(GROUP_CONCAT(DISTINCT g.name SEPARATOR '||'), '') AS genres,
       COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '||'), '') AS countries,
       COALESCE(GROUP_CONCAT(DISTINCT a.name SEPARATOR '||'), '') AS actors,
       COALESCE(GROUP_CONCAT(DISTINCT d.name SEPARATOR '||'), '') AS directors
     FROM movies m
     LEFT JOIN movie_genres mg ON mg.movie_id = m.id
     LEFT JOIN genres g ON g.id = mg.genre_id
     LEFT JOIN movie_countries mc ON mc.movie_id = m.id
     LEFT JOIN countries c ON c.id = mc.country_id
     LEFT JOIN movie_actors ma ON ma.movie_id = m.id
     LEFT JOIN actors a ON a.id = ma.actor_id
     LEFT JOIN movie_directors md ON md.movie_id = m.id
     LEFT JOIN directors d ON d.id = md.director_id
     WHERE m.is_visible = 1
     GROUP BY m.id, m.title, m.original_title, m.description, m.release_year, m.duration, m.is_series
     ORDER BY m.id
     LIMIT ${safeLimit}`
  );
  return rows;
}

async function syncMovieEmbeddings(db, options = {}) {
  const config = getEmbeddingConfig();
  if (!config.enabled) throw new Error('DENSE_SEARCH_ENABLED=false');
  if (!config.configured) throw new Error('Chưa cấu hình GEMINI_API_KEY');
  const movies = await getEmbeddingMovieRows(db, options.limit);
  const [existingRows] = await db.execute(
    'SELECT movie_id, content_hash FROM movie_embeddings WHERE model = ? AND dimensions = ?',
    [config.model, config.dimensions]
  );
  const existing = new Map(existingRows.map((row) => [Number(row.movie_id), row.content_hash]));
  const prepared = movies.map((movie) => {
    const content = buildMovieEmbeddingText(movie);
    const preparedText = prepareEmbeddingInput({ ...content, kind: 'document' }, config.model);
    return { movie, content, hash: contentHash(preparedText) };
  });
  const pending = prepared.filter((item) => options.force || existing.get(Number(item.movie.id)) !== item.hash);
  const batchSize = clampInteger(options.batchSize, 1, 100, config.batchSize);
  let embedded = 0;

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await requestEmbeddingBatch(batch.map((item) => ({ ...item.content, kind: 'document' })));
    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      await db.execute(
        `INSERT INTO movie_embeddings
          (movie_id, model, dimensions, content_hash, embedding, source_chars)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           content_hash = VALUES(content_hash),
           embedding = VALUES(embedding),
           source_chars = VALUES(source_chars),
           updated_at = CURRENT_TIMESTAMP`,
        [
          item.movie.id,
          config.model,
          config.dimensions,
          item.hash,
          JSON.stringify(vectors[index]),
          item.content.text.length,
        ]
      );
      embedded += 1;
    }
    options.onProgress?.({ embedded, pending: pending.length, total: movies.length });
  }

  return {
    model: config.model,
    dimensions: config.dimensions,
    total_movies: movies.length,
    embedded,
    unchanged: movies.length - pending.length,
    coverage: movies.length ? Number((((movies.length - pending.length + embedded) / movies.length) * 100).toFixed(1)) : 0,
  };
}

async function getMovieEmbeddingStatus(db) {
  const config = getEmbeddingConfig();
  try {
    const [[movieRow], [embeddingRow]] = await Promise.all([
      db.execute('SELECT COUNT(*) AS total FROM movies WHERE is_visible = 1').then(([rows]) => rows),
      db.execute(
        `SELECT COUNT(*) AS total, MAX(me.updated_at) AS last_updated
         FROM movie_embeddings me
         JOIN movies m ON m.id = me.movie_id
         WHERE me.model = ? AND me.dimensions = ? AND m.is_visible = 1`,
        [config.model, config.dimensions]
      ).then(([rows]) => rows),
    ]);
    const totalMovies = Number(movieRow?.total) || 0;
    const embeddedMovies = Number(embeddingRow?.total) || 0;
    return {
      ...getDenseEmbeddingStatus(),
      total_movies: totalMovies,
      embedded_movies: embeddedMovies,
      coverage: totalMovies ? Number(((embeddedMovies / totalMovies) * 100).toFixed(1)) : 0,
      last_updated: embeddingRow?.last_updated || null,
    };
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return { ...getDenseEmbeddingStatus(), total_movies: 0, embedded_movies: 0, coverage: 0, last_updated: null };
    }
    throw error;
  }
}

module.exports = {
  buildMovieEmbeddingText,
  cosineSimilarity,
  getDenseEmbeddingStatus,
  getDenseSearchScores,
  getEmbeddingConfig,
  getMovieEmbeddingStatus,
  normalizeVector,
  requestEmbeddingBatch,
  syncMovieEmbeddings,
};
