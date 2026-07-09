const MAX_SUBTITLE_BYTES = 1024 * 1024;
const SUBTITLE_FETCH_TIMEOUT_MS = 10000;

function normalizeSubtitleContent(content) {
  return String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function detectSubtitleFormat(content, url = '') {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return String(url || '').toLowerCase();
    }
  })();

  if (pathname.endsWith('.vtt') || /^\s*WEBVTT\b/i.test(content)) return 'vtt';
  if (pathname.endsWith('.ass') || pathname.endsWith('.ssa') || /^\s*\[Script Info\]/im.test(content)) return 'ass';
  return 'srt';
}

function normalizeTimestamp(timestamp) {
  const value = String(timestamp || '').trim().replace(',', '.');
  const parts = value.split(':');

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return `00:${minutes.padStart(2, '0')}:${seconds.padStart(6, '0')}`;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(6, '0')}`;
  }

  return value;
}

function cleanCueText(text) {
  return String(text || '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\\N|\\n/g, '\n')
    .replace(/<\/?font[^>]*>/gi, '')
    .trim();
}

function srtToVtt(content) {
  const body = normalizeSubtitleContent(content)
    .replace(/^WEBVTT[^\n]*(?:\n+)?/i, '')
    .replace(
      /(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}[^\n]*/g,
      (line) => line
        .replace(/,/g, '.')
        .replace(/(^|\s)(\d{1,2}:\d{2}\.\d{1,3})/g, '$100:$2')
    );

  return `WEBVTT\n\n${body}\n`;
}

function assTimeToVtt(timestamp) {
  const match = String(timestamp || '').trim().match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,2})$/);
  if (!match) return null;

  const [, hours, minutes, seconds, centiseconds] = match;
  const milliseconds = centiseconds.padEnd(3, '0').slice(0, 3);
  return `${hours.padStart(2, '0')}:${minutes}:${seconds}.${milliseconds}`;
}

function assToVtt(content) {
  const lines = normalizeSubtitleContent(content).split('\n');
  let inEvents = false;
  let formatFields = [];
  const cues = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[(.+)\]$/);
    if (section) {
      inEvents = section[1].toLowerCase() === 'events';
      return;
    }

    if (!inEvents) return;

    if (/^Format\s*:/i.test(trimmed)) {
      formatFields = trimmed
        .replace(/^Format\s*:\s*/i, '')
        .split(',')
        .map((field) => field.trim().toLowerCase());
      return;
    }

    if (!/^Dialogue\s*:/i.test(trimmed) || !formatFields.length) return;

    const startIndex = formatFields.indexOf('start');
    const endIndex = formatFields.indexOf('end');
    const textIndex = formatFields.indexOf('text');
    if (startIndex === -1 || endIndex === -1 || textIndex === -1) return;

    const parts = line.replace(/^Dialogue\s*:\s*/i, '').split(',');
    if (parts.length <= textIndex) return;

    const start = assTimeToVtt(parts[startIndex]);
    const end = assTimeToVtt(parts[endIndex]);
    const text = cleanCueText(parts.slice(textIndex).join(','));
    if (!start || !end || !text) return;

    cues.push(`${start} --> ${end}\n${text}`);
  });

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function ensureWebVtt(content, sourceUrl = '') {
  const normalized = normalizeSubtitleContent(content);
  const format = detectSubtitleFormat(normalized, sourceUrl);

  if (format === 'vtt') {
    return /^\s*WEBVTT\b/i.test(normalized) ? `${normalized}\n` : `WEBVTT\n\n${normalized}\n`;
  }

  if (format === 'ass') return assToVtt(normalized);
  return srtToVtt(normalized);
}

function normalizeSubtitleUrl(value) {
  const url = String(value || '').trim();
  if (!url || /^https?:\/\/example\.com\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeSubtitleLabel(label, srclang) {
  const value = String(label || '').trim();
  if (value) return value.slice(0, 100);
  if (srclang === 'en') return 'English';
  if (srclang === 'ja') return '日本語';
  if (srclang === 'ko') return '한국어';
  if (srclang === 'zh') return '中文';
  return 'Tiếng Việt';
}

function normalizeSubtitleLanguage(value) {
  const language = String(value || 'vi').trim().toLowerCase().replace(/[^a-z-]/g, '');
  return (language || 'vi').slice(0, 12);
}

function normalizeSyncStatus(value) {
  return ['verified', 'transcribed'].includes(value) ? value : 'unchecked';
}

async function fetchSubtitleText(subtitleUrl) {
  const safeUrl = normalizeSubtitleUrl(subtitleUrl);
  if (!safeUrl) {
    const error = new Error('Tập phim chưa có phụ đề. Hãy thêm phụ đề có timestamp trước khi lồng tiếng.');
    error.statusCode = 404;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBTITLE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ITMoveSubtitleFetcher/1.0',
        Accept: 'text/vtt,text/plain,text/srt,text/x-ssa,text/x-ass,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      const error = new Error(`Subtitle source responded ${response.status}`);
      error.statusCode = response.status === 404 ? 404 : 502;
      throw error;
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SUBTITLE_BYTES) {
      const error = new Error('Subtitle file is too large');
      error.statusCode = 413;
      throw error;
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_SUBTITLE_BYTES) {
      const error = new Error('Subtitle file is too large');
      error.statusCode = 413;
      throw error;
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadEpisodeSubtitleAsVtt(db, episodeId) {
  const [rows] = await db.execute(
    `SELECT e.id, e.subtitle_url, m.is_visible
     FROM episodes e
     JOIN movies m ON m.id = e.movie_id
     WHERE e.id = ?
     LIMIT 1`,
    [episodeId]
  );

  if (!rows.length || !rows[0].is_visible) {
    const error = new Error('Subtitle not found');
    error.statusCode = 404;
    throw error;
  }

  const [storedRows] = await db.execute(
    `SELECT id, label, srclang, format, content
     FROM episode_subtitles
     WHERE episode_id = ?
     ORDER BY is_default DESC, id ASC
     LIMIT 1`,
    [episodeId]
  );

  if (storedRows.length) {
    return {
      content: ensureWebVtt(storedRows[0].content, `subtitle.${storedRows[0].format || 'vtt'}`),
      sourceUrl: null,
      track: storedRows[0],
    };
  }

  const subtitleUrl = normalizeSubtitleUrl(rows[0].subtitle_url);
  if (!subtitleUrl) {
    const error = new Error('Tập phim chưa có phụ đề. Hãy thêm phụ đề có timestamp trước khi lồng tiếng.');
    error.statusCode = 404;
    throw error;
  }

  const source = await fetchSubtitleText(subtitleUrl);
  const content = ensureWebVtt(source, subtitleUrl);
  return {
    content,
    sourceUrl: subtitleUrl,
  };
}

async function loadStoredSubtitleAsVtt(db, episodeId, subtitleId) {
  const [rows] = await db.execute(
    `SELECT s.id, s.episode_id, s.label, s.srclang, s.format, s.content, m.is_visible
     FROM episode_subtitles s
     JOIN episodes e ON e.id = s.episode_id
     JOIN movies m ON m.id = e.movie_id
     WHERE s.episode_id = ? AND s.id = ?
     LIMIT 1`,
    [episodeId, subtitleId]
  );

  if (!rows.length || !rows[0].is_visible) {
    const error = new Error('Subtitle not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    content: ensureWebVtt(rows[0].content, `subtitle.${rows[0].format || 'vtt'}`),
    sourceUrl: null,
    track: rows[0],
  };
}

async function getEpisodeSubtitleTracks(db, episodeIds) {
  const ids = [...new Set((episodeIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const [storedRows] = await db.execute(
    `SELECT id, episode_id, label, srclang, is_default
     FROM episode_subtitles
     WHERE episode_id IN (${placeholders})
     ORDER BY is_default DESC, id ASC`,
    ids
  );

  const tracksByEpisode = new Map(ids.map((id) => [id, []]));
  storedRows.forEach((row) => {
    tracksByEpisode.get(Number(row.episode_id))?.push({
      id: `db-${row.id}`,
      subtitle_id: row.id,
      label: normalizeSubtitleLabel(row.label, row.srclang),
      srclang: row.srclang || 'vi',
      src: `/api/subtitles/episodes/${row.episode_id}/${row.id}.vtt`,
      is_default: Boolean(row.is_default),
    });
  });

  return tracksByEpisode;
}

async function saveEpisodeSubtitle(db, episodeId, payload = {}) {
  const content = normalizeSubtitleContent(payload.content);
  if (!content) {
    const error = new Error('Thiếu nội dung phụ đề');
    error.statusCode = 400;
    throw error;
  }

  if (content.length > 500000) {
    const error = new Error('Phụ đề quá lớn');
    error.statusCode = 413;
    throw error;
  }

  const [episodeRows] = await db.execute('SELECT id FROM episodes WHERE id = ? LIMIT 1', [episodeId]);
  if (!episodeRows.length) {
    const error = new Error('Episode not found');
    error.statusCode = 404;
    throw error;
  }

  const srclang = normalizeSubtitleLanguage(payload.srclang || payload.language);
  const label = normalizeSubtitleLabel(payload.label, srclang);
  const format = detectSubtitleFormat(content, `subtitle.${payload.format || 'vtt'}`);
  const isDefault = payload.is_default === false || payload.is_default === 0 ? 0 : 1;
  const originalContent = payload.original_content ? normalizeSubtitleContent(payload.original_content) : null;
  const syncStatus = normalizeSyncStatus(payload.sync_status);
  const syncScore = Number.isFinite(Number(payload.sync_score)) ? Number(payload.sync_score) : null;
  const syncOffset = Number.isFinite(Number(payload.sync_offset_seconds)) ? Number(payload.sync_offset_seconds) : null;
  const syncDrift = Number.isFinite(Number(payload.sync_drift_seconds)) ? Number(payload.sync_drift_seconds) : null;
  const syncReport = payload.sync_report ? JSON.stringify(payload.sync_report) : null;
  const syncedAt = syncStatus === 'unchecked' ? null : new Date();
  const transaction = typeof db.beginTransaction === 'function'
    ? db
    : await db.getConnection();

  try {
    await transaction.beginTransaction();

    if (isDefault) {
      await transaction.execute('UPDATE episode_subtitles SET is_default = 0 WHERE episode_id = ?', [episodeId]);
    }

    const [result] = await transaction.execute(
      `INSERT INTO episode_subtitles
         (episode_id, label, srclang, format, content, original_content, is_default,
          sync_status, sync_score, sync_offset_seconds, sync_drift_seconds, sync_report_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         label = VALUES(label),
         format = VALUES(format),
         content = VALUES(content),
         original_content = VALUES(original_content),
         is_default = VALUES(is_default),
         sync_status = VALUES(sync_status),
         sync_score = VALUES(sync_score),
         sync_offset_seconds = VALUES(sync_offset_seconds),
         sync_drift_seconds = VALUES(sync_drift_seconds),
         sync_report_json = VALUES(sync_report_json),
         synced_at = VALUES(synced_at),
         updated_at = CURRENT_TIMESTAMP`,
      [episodeId, label, srclang, format, content, originalContent, isDefault,
        syncStatus, syncScore, syncOffset, syncDrift, syncReport, syncedAt]
    );

    await transaction.commit();
    return {
      id: result.insertId,
      episode_id: Number(episodeId),
      label,
      srclang,
      format,
      is_default: Boolean(isDefault),
      sync_status: syncStatus,
      sync_score: syncScore,
      sync_offset_seconds: syncOffset,
      sync_drift_seconds: syncDrift,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    if (transaction !== db) transaction.release();
  }
}

async function listEpisodeSubtitles(db, episodeId) {
  const [episodeRows] = await db.execute(
    `SELECT e.id, e.episode_number, e.title, e.movie_id, m.title AS movie_title
     FROM episodes e
     JOIN movies m ON m.id = e.movie_id
     WHERE e.id = ?
     LIMIT 1`,
    [episodeId]
  );

  if (!episodeRows.length) {
    const error = new Error('Episode not found');
    error.statusCode = 404;
    throw error;
  }

  const [rows] = await db.execute(
    `SELECT id, episode_id, label, srclang, format, content, is_default,
            sync_status, sync_score, sync_offset_seconds, sync_drift_seconds,
            sync_report_json, synced_at, created_at, updated_at
     FROM episode_subtitles
     WHERE episode_id = ?
     ORDER BY is_default DESC, srclang ASC, id ASC`,
    [episodeId]
  );

  return {
    episode: episodeRows[0],
    subtitles: rows.map((row) => ({
      ...row,
      is_default: Boolean(row.is_default),
      content_length: row.content ? row.content.length : 0,
      preview_url: `/api/subtitles/episodes/${row.episode_id}/${row.id}.vtt`,
    })),
  };
}

async function getEpisodeSubtitle(db, subtitleId) {
  const [rows] = await db.execute(
    `SELECT s.id, s.episode_id, s.label, s.srclang, s.format, s.content, s.is_default,
            s.sync_status, s.sync_score, s.sync_offset_seconds, s.sync_drift_seconds,
            s.sync_report_json, s.synced_at,
            s.created_at, s.updated_at, e.episode_number, e.title AS episode_title,
            m.id AS movie_id, m.title AS movie_title
     FROM episode_subtitles s
     JOIN episodes e ON e.id = s.episode_id
     JOIN movies m ON m.id = e.movie_id
     WHERE s.id = ?
     LIMIT 1`,
    [subtitleId]
  );

  if (!rows.length) {
    const error = new Error('Subtitle not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...rows[0],
    is_default: Boolean(rows[0].is_default),
    preview_url: `/api/subtitles/episodes/${rows[0].episode_id}/${rows[0].id}.vtt`,
  };
}

async function updateEpisodeSubtitle(db, subtitleId, payload = {}) {
  const existing = await getEpisodeSubtitle(db, subtitleId);
  const content = normalizeSubtitleContent(payload.content);
  if (!content) {
    const error = new Error('Thiếu nội dung phụ đề');
    error.statusCode = 400;
    throw error;
  }

  if (content.length > 500000) {
    const error = new Error('Phụ đề quá lớn');
    error.statusCode = 413;
    throw error;
  }

  const srclang = normalizeSubtitleLanguage(payload.srclang || payload.language || existing.srclang);
  const label = normalizeSubtitleLabel(payload.label, srclang);
  const format = detectSubtitleFormat(content, `subtitle.${payload.format || existing.format || 'vtt'}`);
  const isDefault = payload.is_default === true || payload.is_default === 1 || payload.is_default === '1';
  const transaction = typeof db.beginTransaction === 'function'
    ? db
    : await db.getConnection();

  try {
    await transaction.beginTransaction();

    if (isDefault) {
      await transaction.execute('UPDATE episode_subtitles SET is_default = 0 WHERE episode_id = ?', [existing.episode_id]);
    }

    await transaction.execute(
      `UPDATE episode_subtitles
       SET label = ?, srclang = ?, format = ?, content = ?, original_content = NULL,
           is_default = ?, sync_status = 'unchecked', sync_score = NULL,
           sync_offset_seconds = NULL, sync_drift_seconds = NULL,
           sync_report_json = NULL, synced_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [label, srclang, format, content, isDefault ? 1 : 0, subtitleId]
    );

    await transaction.commit();
    return getEpisodeSubtitle(db, subtitleId);
  } catch (error) {
    await transaction.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicate = new Error('Tập này đã có phụ đề cho ngôn ngữ này');
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  } finally {
    if (transaction !== db) transaction.release();
  }
}

async function deleteEpisodeSubtitle(db, subtitleId) {
  const existing = await getEpisodeSubtitle(db, subtitleId);
  await db.execute('DELETE FROM episode_subtitles WHERE id = ?', [subtitleId]);

  if (existing.is_default) {
    const [nextRows] = await db.execute(
      'SELECT id FROM episode_subtitles WHERE episode_id = ? ORDER BY id ASC LIMIT 1',
      [existing.episode_id]
    );
    if (nextRows[0]) {
      await db.execute('UPDATE episode_subtitles SET is_default = 1 WHERE id = ?', [nextRows[0].id]);
    }
  }

  return { success: true };
}

module.exports = {
  ensureWebVtt,
  deleteEpisodeSubtitle,
  getEpisodeSubtitleTracks,
  getEpisodeSubtitle,
  loadEpisodeSubtitleAsVtt,
  loadStoredSubtitleAsVtt,
  listEpisodeSubtitles,
  normalizeSubtitleUrl,
  saveEpisodeSubtitle,
  updateEpisodeSubtitle,
};
