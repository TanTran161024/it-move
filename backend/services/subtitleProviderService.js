const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { ensureWebVtt, saveEpisodeSubtitle } = require('./subtitleService');
const { extractSpeechAudio, parseWebVtt, synchronizeCues } = require('./dubbingService');
const { transcribeAudio } = require('./kokoroTtsService');
const { translateSubtitle } = require('./subtitleTranslatorService');

const FETCH_TIMEOUT_MS = 15000;
const MAX_REMOTE_SUBTITLE_BYTES = 1024 * 1024;

const PROVIDER_DEFINITIONS = [
  {
    id: 'opensubtitles',
    name: 'OpenSubtitles.com',
    website_url: 'https://www.opensubtitles.com',
    priority: 10,
    envKey: 'OPENSUBTITLES_API_KEY',
  },
  {
    id: 'subdl',
    name: 'SubDL',
    website_url: 'https://subdl.com',
    priority: 20,
    envKey: 'SUBDL_API_KEY',
  },
];

const PROVIDER_MAP = new Map(PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider]));

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return fallback;
}

function normalizeLanguage(value) {
  return String(value || 'vi').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'vi';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectFormatFromName(value = '') {
  const lower = String(value || '').toLowerCase();
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass';
  return 'srt';
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function assertProvider(id) {
  const provider = PROVIDER_MAP.get(String(id || '').trim().toLowerCase());
  if (!provider) {
    const error = new Error('Provider phụ đề không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  return provider;
}

function hasApiKey(provider) {
  return Boolean(process.env[provider.envKey]);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Provider responded ${response.status}`);
    error.statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
    error.providerStatus = response.status;
    throw error;
  }

  return body;
}

async function fetchSubtitleText(url, headers = {}) {
  const parsed = safeUrl(url);
  if (!parsed) {
    const error = new Error('Link phụ đề không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const response = await fetchWithTimeout(parsed.toString(), {
    headers: {
      'User-Agent': 'ITMoveSubtitleProviderHub/1.0',
      Accept: 'text/vtt,text/plain,text/srt,text/x-ssa,text/x-ass,application/octet-stream,*/*;q=0.7',
      ...headers,
    },
  });

  if (!response.ok) {
    const error = new Error(`Nguồn phụ đề phản hồi ${response.status}`);
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_REMOTE_SUBTITLE_BYTES) {
    const error = new Error('File phụ đề quá lớn');
    error.statusCode = 413;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_REMOTE_SUBTITLE_BYTES) {
    const error = new Error('File phụ đề quá lớn');
    error.statusCode = 413;
    throw error;
  }

  // Node fetch usually auto-decompresses gzip responses while the upstream
  // content-encoding header may still be present. Trust the gzip magic bytes
  // instead of the header to avoid double-decompression.
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = zlib.gunzipSync(buffer);
  }

  const text = buffer[0] === 0x50 && buffer[1] === 0x4b
    ? extractSubtitleTextFromZip(buffer)
    : buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!looksLikeSubtitle(text)) {
    const error = new Error('Nội dung tải về không giống file phụ đề hợp lệ');
    error.statusCode = 422;
    throw error;
  }

  return text;
}

function looksLikeSubtitle(content) {
  const text = String(content || '').slice(0, 5000);
  return /^\s*WEBVTT\b/i.test(text)
    || /^\s*\[Script Info\]/im.test(text)
    || /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text);
}

function readUInt16(buffer, offset) {
  return offset + 2 <= buffer.length ? buffer.readUInt16LE(offset) : 0;
}

function readUInt32(buffer, offset) {
  return offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) : 0;
}

function isSubtitleFileName(fileName) {
  return /\.(srt|vtt|ass|ssa|txt)$/i.test(String(fileName || ''));
}

function extractSubtitleTextFromZip(buffer) {
  let offset = 0;
  const candidates = [];

  while (offset + 30 <= buffer.length) {
    const signature = readUInt32(buffer, offset);
    if (signature !== 0x04034b50) break;

    const flags = readUInt16(buffer, offset + 6);
    const compressionMethod = readUInt16(buffer, offset + 8);
    const compressedSize = readUInt32(buffer, offset + 18);
    const uncompressedSize = readUInt32(buffer, offset + 22);
    const fileNameLength = readUInt16(buffer, offset + 26);
    const extraLength = readUInt16(buffer, offset + 28);
    const fileNameStart = offset + 30;
    const dataStart = fileNameStart + fileNameLength + extraLength;
    const fileName = buffer.slice(fileNameStart, fileNameStart + fileNameLength).toString('utf8');

    if ((flags & 0x01) === 0x01) {
      const error = new Error('File ZIP phụ đề đang được mã hóa, chưa thể đọc tự động.');
      error.statusCode = 415;
      throw error;
    }

    if ((flags & 0x08) === 0x08 || !compressedSize) {
      const error = new Error('File ZIP phụ đề dùng data descriptor, chưa thể đọc tự động.');
      error.statusCode = 415;
      throw error;
    }

    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) break;

    if (isSubtitleFileName(fileName)) {
      candidates.push({
        fileName,
        compressionMethod,
        compressed: buffer.slice(dataStart, dataEnd),
        uncompressedSize,
      });
    }

    offset = dataEnd;
  }

  if (!candidates.length) {
    const error = new Error('File ZIP không chứa phụ đề SRT/VTT/ASS hợp lệ.');
    error.statusCode = 422;
    throw error;
  }

  const selected = candidates.find((item) => /\.(srt|vtt|ass|ssa)$/i.test(item.fileName)) || candidates[0];
  let extracted;

  if (selected.compressionMethod === 0) {
    extracted = selected.compressed;
  } else if (selected.compressionMethod === 8) {
    extracted = zlib.inflateRawSync(selected.compressed);
  } else {
    const error = new Error('File ZIP dùng kiểu nén phụ đề chưa hỗ trợ.');
    error.statusCode = 415;
    throw error;
  }

  if (selected.uncompressedSize && extracted.length !== selected.uncompressedSize) {
    // Some providers do not set this field reliably; keep parsing but enforce
    // the actual size limit below.
  }

  if (extracted.length > MAX_REMOTE_SUBTITLE_BYTES) {
    const error = new Error('File phụ đề trong ZIP quá lớn');
    error.statusCode = 413;
    throw error;
  }

  return extracted.toString('utf8').replace(/^\uFEFF/, '').trim();
}

async function readProviderRows(db) {
  try {
    const [rows] = await db.execute(
      'SELECT id, enabled, priority FROM subtitle_providers ORDER BY priority ASC, name ASC'
    );
    return rows;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

async function ensureProviderTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subtitle_providers (
      id VARCHAR(40) NOT NULL,
      name VARCHAR(120) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      priority INT NOT NULL DEFAULT 100,
      website_url VARCHAR(255) DEFAULT NULL,
      notes VARCHAR(255) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

async function listSubtitleProviders(db) {
  const storedRows = await readProviderRows(db);
  const storedById = new Map(storedRows.map((row) => [row.id, row]));

  return PROVIDER_DEFINITIONS.map((provider) => {
    const stored = storedById.get(provider.id) || {};
    return {
      id: provider.id,
      name: provider.name,
      website_url: provider.website_url,
      enabled: normalizeBoolean(stored.enabled, true),
      priority: Number.isFinite(Number(stored.priority)) ? Number(stored.priority) : provider.priority,
      configured: hasApiKey(provider),
      env_key: provider.envKey,
    };
  }).sort((left, right) => left.priority - right.priority);
}

async function updateSubtitleProvider(db, providerId, payload = {}) {
  const provider = assertProvider(providerId);
  const enabled = normalizeBoolean(payload.enabled, true) ? 1 : 0;
  const priority = Number.isFinite(Number(payload.priority))
    ? Math.max(1, Math.min(999, Number(payload.priority)))
    : provider.priority;

  await ensureProviderTable(db);
  await db.execute(
    `INSERT INTO subtitle_providers (id, name, enabled, priority, website_url, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       priority = VALUES(priority),
       updated_at = CURRENT_TIMESTAMP`,
    [provider.id, provider.name, enabled, priority, provider.website_url, 'Managed from admin subtitle provider hub']
  );

  const providers = await listSubtitleProviders(db);
  return providers.find((item) => item.id === provider.id);
}

async function getMovieEpisode(db, movieId, episodeId) {
  const [rows] = await db.execute(
    `SELECT
       m.id AS movie_id,
       m.title AS movie_title,
       m.original_title,
       m.release_year,
       m.is_series,
       m.tmdb_id,
       m.tmdb_type,
       e.id AS episode_id,
       e.episode_number,
       e.title AS episode_title,
       e.hls_url,
       e.video_url
     FROM movies m
     JOIN episodes e ON e.movie_id = m.id
     WHERE m.id = ? AND e.id = ?
     LIMIT 1`,
    [movieId, episodeId]
  );

  if (!rows.length) {
    const error = new Error('Chỉ có thể tìm phụ đề cho phim và tập có thật trong hệ thống');
    error.statusCode = 404;
    throw error;
  }

  return rows[0];
}

function buildProviderQuery(target) {
  const movieTitle = cleanTitle(target.original_title || target.movie_title);
  const seasonMatch = String(target.original_title || target.movie_title || '')
    .match(/(?:season|phần)\s*(\d+)/i);
  return {
    title: movieTitle || target.movie_title,
    fallbackTitle: cleanTitle(target.movie_title),
    year: target.release_year ? Number(target.release_year) : null,
    episodeNumber: target.episode_number ? Number(target.episode_number) : null,
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : 1,
    isSeries: Boolean(target.is_series),
    tmdbId: target.tmdb_id ? Number(target.tmdb_id) : null,
  };
}

function scoreResult(target, language, releaseName = '') {
  const query = buildProviderQuery(target);
  const release = normalizeText(releaseName);
  const primaryTitle = normalizeText(query.title);
  const fallbackTitle = normalizeText(query.fallbackTitle);
  let score = 45;

  if (primaryTitle && release.includes(primaryTitle)) score += 25;
  else if (fallbackTitle && release.includes(fallbackTitle)) score += 18;

  if (query.year && release.includes(String(query.year))) score += 8;
  if (query.isSeries && query.episodeNumber && release.match(new RegExp(`(^|\\D)${query.episodeNumber}(\\D|$)`))) score += 8;
  if (language) score += 8;

  return Math.max(1, Math.min(100, score));
}

function normalizeSubdlDownloadUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const fullUrl = raw.startsWith('http') ? raw : `https://dl.subdl.com${raw.startsWith('/') ? '' : '/'}${raw}`;
  const parsed = safeUrl(fullUrl);
  if (!parsed || !/(^|\.)subdl\.com$/i.test(parsed.hostname)) return null;
  return parsed.toString();
}

function mapOpenSubtitlesResult(item, target, language) {
  const attrs = item?.attributes || {};
  const files = Array.isArray(attrs.files) ? attrs.files : [];
  return files
    .filter((file) => file?.file_id)
    .map((file) => {
      const releaseName = file.file_name || attrs.release || attrs.url || `${target.movie_title} subtitle`;
      return {
        id: `opensubtitles:${file.file_id}`,
        provider: 'opensubtitles',
        provider_name: 'OpenSubtitles.com',
        language: attrs.language || language,
        release_name: releaseName,
        score: scoreResult(target, attrs.language || language, releaseName),
        format: detectFormatFromName(releaseName),
        file_id: Number(file.file_id),
        download_url: null,
        hearing_impaired: Boolean(attrs.hearing_impaired),
        source_url: attrs.url || null,
      };
    });
}

async function searchOpenSubtitles(target, language) {
  const provider = assertProvider('opensubtitles');
  if (!hasApiKey(provider)) return [];

  const query = buildProviderQuery(target);
  const request = async (loose = false) => {
    const params = new URLSearchParams({
      query: query.title,
      languages: language,
    });

    if (!loose && query.year) params.set('year', String(query.year));
    if (!loose && query.isSeries && query.episodeNumber) {
      params.set('type', 'episode');
      params.set('episode_number', String(query.episodeNumber));
      params.set('season_number', String(query.seasonNumber));
      if (query.tmdbId) params.set('parent_tmdb_id', String(query.tmdbId));
    } else if (!loose && query.tmdbId) {
      params.set('tmdb_id', String(query.tmdbId));
    }

    const data = await fetchJson(`https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`, {
      headers: {
        'Api-Key': process.env.OPENSUBTITLES_API_KEY,
        'User-Agent': 'ITMove v1',
        Accept: 'application/json',
      },
    });

    return (Array.isArray(data?.data) ? data.data : [])
      .flatMap((item) => mapOpenSubtitlesResult(item, target, language));
  };

  const strictResults = await request(false);
  return strictResults.length ? strictResults : request(true);
}

function mapSubdlResult(item, target, language) {
  const releaseName = item?.release_name || item?.name || item?.filename || item?.subtitleName || 'SubDL subtitle';
  const downloadUrl = normalizeSubdlDownloadUrl(item?.download_link || item?.downloadLink || item?.url);
  return {
    id: `subdl:${item?.id || downloadUrl || releaseName}`,
    provider: 'subdl',
    provider_name: 'SubDL',
    language: normalizeLanguage(item?.language || item?.lang || language),
    release_name: releaseName,
    score: scoreResult(target, item?.language || language, releaseName),
    format: detectFormatFromName(releaseName || downloadUrl || ''),
    file_id: item?.id ? String(item.id) : null,
    download_url: downloadUrl,
    hearing_impaired: Boolean(item?.hi || item?.hearing_impaired),
    source_url: item?.subtitlePage || item?.page || null,
  };
}

async function searchSubdl(target, language) {
  const provider = assertProvider('subdl');
  if (!hasApiKey(provider)) return [];

  const query = buildProviderQuery(target);
  const request = async (loose = false) => {
    const params = new URLSearchParams({
      api_key: process.env.SUBDL_API_KEY,
      film_name: query.title,
      languages: language,
    });

    if (!loose && query.year) params.set('year', String(query.year));
    if (!loose && query.isSeries && query.episodeNumber) params.set('episode_number', String(query.episodeNumber));

    const data = await fetchJson(`https://api.subdl.com/api/v1/subtitles?${params.toString()}`, {
      headers: {
        'User-Agent': 'ITMoveSubtitleProviderHub/1.0',
        Accept: 'application/json',
      },
    });

    const rows = Array.isArray(data?.subtitles) ? data.subtitles : Array.isArray(data?.results) ? data.results : [];
    return rows.map((item) => mapSubdlResult(item, target, language)).filter((item) => item.download_url);
  };

  const strictResults = await request(false);
  return strictResults.length ? strictResults : request(true);
}

async function getActiveProviders(db, providerIds = []) {
  const requestedIds = providerIds
    .map((id) => String(id || '').trim().toLowerCase())
    .filter((id) => PROVIDER_MAP.has(id));
  const providers = await listSubtitleProviders(db);
  return providers.filter((provider) => (
    provider.enabled
    && provider.configured
    && (!requestedIds.length || requestedIds.includes(provider.id))
  ));
}

async function searchOnlineSubtitles(db, payload = {}) {
  const movieId = Number(payload.movie_id);
  const episodeId = Number(payload.episode_id);
  if (!Number.isInteger(movieId) || !Number.isInteger(episodeId)) {
    const error = new Error('Thiếu movie_id hoặc episode_id hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const language = normalizeLanguage(payload.language);
  const target = await getMovieEpisode(db, movieId, episodeId);
  const providers = await getActiveProviders(db, Array.isArray(payload.providers) ? payload.providers : []);
  const errors = [];
  const results = [];

  for (const provider of providers) {
    try {
      const providerResults = provider.id === 'opensubtitles'
        ? await searchOpenSubtitles(target, language)
        : await searchSubdl(target, language);
      results.push(...providerResults);
    } catch (error) {
      errors.push({
        provider: provider.id,
        message: error.message || 'Không thể tìm phụ đề từ provider này',
      });
    }
  }

  const relevantResults = results.filter((item) => item.score >= 70);
  relevantResults.sort((left, right) => right.score - left.score);

  return {
    query: {
      movie_id: movieId,
      episode_id: episodeId,
      title: buildProviderQuery(target).title,
      language,
    },
    episode: target,
    providers,
    results: relevantResults.slice(0, 30),
    errors,
  };
}

async function downloadFromOpenSubtitles(payload = {}) {
  const provider = assertProvider('opensubtitles');
  if (!hasApiKey(provider)) {
    const error = new Error('OpenSubtitles.com chưa cấu hình API key');
    error.statusCode = 400;
    throw error;
  }

  const fileId = Number(payload.file_id);
  if (!Number.isInteger(fileId) || fileId <= 0) {
    const error = new Error('Thiếu file_id từ OpenSubtitles.com');
    error.statusCode = 400;
    throw error;
  }

  const data = await fetchJson('https://api.opensubtitles.com/api/v1/download', {
    method: 'POST',
    headers: {
      'Api-Key': process.env.OPENSUBTITLES_API_KEY,
      'User-Agent': 'ITMove v1',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!data?.link) {
    const error = new Error('OpenSubtitles.com không trả link tải hợp lệ');
    error.statusCode = 502;
    throw error;
  }

  return {
    content: await fetchSubtitleText(data.link),
    fileName: data.file_name || payload.release_name || `opensubtitles-${fileId}.srt`,
  };
}

async function downloadFromSubdl(payload = {}) {
  const provider = assertProvider('subdl');
  if (!hasApiKey(provider)) {
    const error = new Error('SubDL chưa cấu hình API key');
    error.statusCode = 400;
    throw error;
  }

  const downloadUrl = normalizeSubdlDownloadUrl(payload.download_url);
  if (!downloadUrl) {
    const error = new Error('SubDL không có link tải hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  return {
    content: await fetchSubtitleText(downloadUrl),
    fileName: payload.release_name || downloadUrl.split('/').pop() || 'subdl-subtitle.srt',
  };
}

async function downloadProviderSubtitle(payload = {}) {
  const provider = assertProvider(payload.provider);
  return provider.id === 'opensubtitles'
    ? downloadFromOpenSubtitles(payload)
    : downloadFromSubdl(payload);
}

function buildSubtitleLabel(provider, language, releaseName) {
  const providerName = provider?.name || provider?.id || 'Online';
  const safeRelease = String(releaseName || '').trim();
  const suffix = safeRelease ? ` · ${safeRelease}` : '';
  return `${providerName} ${language.toUpperCase()}${suffix}`.slice(0, 100);
}

async function importOnlineSubtitle(db, payload = {}) {
  const movieId = Number(payload.movie_id);
  const episodeId = Number(payload.episode_id);
  if (!Number.isInteger(movieId) || !Number.isInteger(episodeId)) {
    const error = new Error('Thiếu movie_id hoặc episode_id hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const target = await getMovieEpisode(db, movieId, episodeId);
  const provider = assertProvider(payload.provider);
  const language = normalizeLanguage(payload.language || payload.srclang);
  const downloaded = await downloadProviderSubtitle(payload);
  const format = detectFormatFromName(downloaded.fileName || payload.release_name || payload.format);
  const vttContent = ensureWebVtt(downloaded.content, downloaded.fileName || `subtitle.${format}`);

  if (payload.preview_only) {
    return {
      preview: true,
      provider: provider.id,
      language,
      format,
      release_name: payload.release_name || downloaded.fileName,
      content: downloaded.content,
      vtt_content: vttContent,
    };
  }

  let contentToSave = downloaded.content;
  let formatToSave = format;
  let syncStatus = 'unchecked';
  let syncScore = null;
  let syncReport = { applied: false, disabled: payload.sync_with_audio === false };
  if (payload.sync_with_audio !== false) {
    const source = target.hls_url || target.video_url;
    if (!source) {
      const error = new Error('Tập phim chưa có nguồn MP4/HLS để đồng bộ phụ đề với hội thoại.');
      error.statusCode = 400;
      throw error;
    }

    const cues = parseWebVtt(vttContent);
    const workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), `itmove-subtitle-${episodeId}-`));
    try {
      let synchronized = null;
      try {
        if (!cues.length) throw new Error('Phụ đề tải về không có timestamp hợp lệ.');
        synchronized = await synchronizeCues(source, cues, workDir);
        syncReport = synchronized.report;
      } catch (error) {
        syncReport = {
          applied: false,
          reliable: false,
          warning: `Không thể căn phụ đề tải về: ${error.message}`.slice(0, 1000),
        };
      }

      if (syncReport.reliable !== false) {
        contentToSave = ensureWebVtt(synchronized.synced_content, 'subtitle-synced.srt');
        formatToSave = 'vtt';
        syncStatus = 'verified';
        syncScore = syncReport.score;
      } else {
        const regenerated = await regenerateSubtitleFromAudio(source, language, workDir, syncReport);
        contentToSave = regenerated.content;
        formatToSave = 'vtt';
        syncStatus = 'transcribed';
        syncScore = regenerated.score;
        syncReport = regenerated.report;
      }
    } catch (error) {
      if (!error.statusCode) error.statusCode = 422;
      error.syncReport = error.syncReport || syncReport;
      throw error;
    } finally {
      await fsPromises.rm(workDir, { recursive: true, force: true });
    }
  }

  const subtitle = await saveEpisodeSubtitle(db, episodeId, {
    content: contentToSave,
    original_content: downloaded.content,
    srclang: language,
    label: buildSubtitleLabel(provider, language, payload.release_name || downloaded.fileName),
    format: formatToSave,
    is_default: payload.is_default !== false,
    sync_status: syncStatus,
    sync_score: syncScore,
    sync_offset_seconds: syncReport.offset_seconds,
    sync_drift_seconds: syncReport.drift_seconds,
    sync_report: syncReport,
  });

  return {
    imported: true,
    provider: provider.id,
    release_name: payload.release_name || downloaded.fileName,
    subtitle,
    sync: syncReport,
  };
}

function formatVttTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function transcriptToVtt(segments) {
  const cues = segments.map((segment, index) => (
    `${index + 1}\n${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end)}\n${String(segment.text || '').trim()}`
  ));
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

async function regenerateSubtitleFromAudio(source, targetLanguage, workDir, alignmentReport) {
  const audioPath = path.join(workDir, 'dialogue-16khz.wav');
  await extractSpeechAudio(source, audioPath);
  const transcription = await transcribeAudio({ audioPath });
  const transcriptVtt = transcriptToVtt(transcription.segments);
  let content = transcriptVtt;
  let translation = {
    provider: 'none',
    source_language: transcription.language,
    target_language: targetLanguage,
  };

  if (normalizeLanguage(transcription.language) !== targetLanguage) {
    translation = await translateSubtitle({
      content: transcriptVtt,
      source_language: transcription.language,
      target_language: targetLanguage,
      format: 'vtt',
      bilingual: false,
    });
    if (translation.fallback) {
      const error = new Error(translation.message || 'Không thể dịch transcript sang ngôn ngữ phụ đề đã chọn.');
      error.statusCode = 502;
      throw error;
    }
    content = ensureWebVtt(translation.translated_content, 'subtitle.vtt');
  }

  const confidences = transcription.segments
    .map((segment) => Number(segment.confidence))
    .filter(Number.isFinite);
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null;
  return {
    content,
    score: averageConfidence === null ? null : Number((averageConfidence * 100).toFixed(3)),
    report: {
      mode: 'asr_regenerated',
      reliable: true,
      warning: 'Timestamp từ phụ đề tải về không dùng được; hệ thống đã nghe video và tạo lại phụ đề.',
      alignment: alignmentReport,
      asr: {
        model: transcription.model,
        language: transcription.language,
        language_probability: transcription.language_probability,
        segment_count: transcription.segments.length,
        average_confidence: averageConfidence === null ? null : Number(averageConfidence.toFixed(4)),
      },
      translation: {
        provider: translation.provider,
        model: translation.model || null,
        source_language: transcription.language,
        target_language: targetLanguage,
      },
    },
  };
}

async function generateSubtitleFromEpisodeAudio(db, payload = {}) {
  const movieId = Number(payload.movie_id);
  const episodeId = Number(payload.episode_id);
  if (!Number.isInteger(movieId) || !Number.isInteger(episodeId)) {
    const error = new Error('Thiếu movie_id hoặc episode_id hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const target = await getMovieEpisode(db, movieId, episodeId);
  const source = target.hls_url || target.video_url;
  if (!source) {
    const error = new Error('Tập phim chưa có nguồn MP4/HLS để nhận diện hội thoại.');
    error.statusCode = 400;
    throw error;
  }

  const language = normalizeLanguage(payload.language);
  const workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), `itmove-transcribe-${episodeId}-`));
  try {
    const regenerated = await regenerateSubtitleFromAudio(source, language, workDir, {
      applied: false,
      reliable: false,
      skipped: true,
      warning: 'Tạo phụ đề trực tiếp từ hội thoại video.',
    });
    const subtitle = await saveEpisodeSubtitle(db, episodeId, {
      content: regenerated.content,
      srclang: language,
      label: `Whisper ${language.toUpperCase()} · ${target.episode_title || `Tập ${target.episode_number}`}`,
      format: 'vtt',
      is_default: payload.is_default !== false,
      sync_status: 'transcribed',
      sync_score: regenerated.score,
      sync_report: regenerated.report,
    });
    return { generated: true, subtitle, sync: regenerated.report };
  } finally {
    await fsPromises.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  generateSubtitleFromEpisodeAudio,
  importOnlineSubtitle,
  listSubtitleProviders,
  searchOnlineSubtitles,
  updateSubtitleProvider,
};
