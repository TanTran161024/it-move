const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getSimilarMovies, getUserRecommendations, clampLimit } = require('./services/recommendationService');
const { chatWithMovieAdvisor, getAiStatus } = require('./services/aiService');
const {
  deleteAdminAiFeedback,
  getAdminAiTasteDashboard,
  hideAdminMovieForProfile,
  resetAdminProfileAiFeedback,
} = require('./services/adminAiTasteService');
const { ensureChatSession, getAiChatStats, getLatestChatHistory, saveChatExchange } = require('./services/chatSessionService');
const {
  clearAiMovieFeedback,
  getAiFeedbackStats,
  getAiMovieFeedbackMap,
  listAiMovieFeedback,
  normalizeAiFeedbackType,
  setAiMovieFeedback,
} = require('./services/aiFeedbackService');
const { compactTasteProfile, getProfileTasteProfile } = require('./services/profileTasteService');
const {
  createRecommendationRequestId,
  getRecommendationAnalytics,
  recordRecommendationEvents,
  recordRecommendationResponse,
} = require('./services/recommendationAnalyticsService');
const { getDenseEmbeddingStatus, getMovieEmbeddingStatus } = require('./services/denseEmbeddingService');
const { generateMovieDescription } = require('./services/adminDescriptionService');
const { translateSubtitle } = require('./services/subtitleTranslatorService');
const { enrichMissingMoviesWithTmdb, enrichMovieWithTmdb } = require('./services/tmdbService');
const { smartSearchMovies } = require('./services/smartSearchService');
const {
  deleteEpisodeSubtitle,
  ensureWebVtt,
  getEpisodeSubtitleTracks,
  getEpisodeSubtitle,
  loadEpisodeSubtitleAsVtt,
  loadStoredSubtitleAsVtt,
  listEpisodeSubtitles,
  normalizeSubtitleUrl,
  saveEpisodeSubtitle,
  updateEpisodeSubtitle,
} = require('./services/subtitleService');
const {
  generateSubtitleFromEpisodeAudio,
  importOnlineSubtitle,
  listSubtitleProviders,
  searchOnlineSubtitles,
  updateSubtitleProvider,
} = require('./services/subtitleProviderService');
const {
  KOKORO_VOICES,
  getKokoroStatus,
  synthesizeEpisodePreview,
} = require('./services/kokoroTtsService');
const {
  cancelJob: cancelDubbingJob,
  createJob: createDubbingJob,
  getJob: getDubbingJob,
  listJobs: listDubbingJobs,
  removeEpisodeDubbing,
} = require('./services/dubbingService');

const OTP_EXPIRATION_MINUTES = 10;
const TEST_VIEW_MIN = Number(process.env.TEST_VIEW_MIN || 1000);
const TEST_VIEW_MAX = Number(process.env.TEST_VIEW_MAX || 10000);
const CHAT_STREAM_CHUNK_DELAY_MS = Number(process.env.CHAT_STREAM_CHUNK_DELAY_MS || 18);

function randomTestViews() {
  return Math.floor(Math.random() * (TEST_VIEW_MAX - TEST_VIEW_MIN + 1)) + TEST_VIEW_MIN;
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function cleanImageUrl(value) {
  if (!value) return null;
  return String(value).replace(/&quot;?|"/g, '').trim() || null;
}

async function attachMovieGenresAndCountries(db, rows) {
  const movieIds = rows.map((row) => row.id);
  if (!movieIds.length) return rows;

  const placeholders = movieIds.map(() => '?').join(',');
  const [genreRows] = await db.query(
    `SELECT mg.movie_id, g.name
     FROM movie_genres mg
     JOIN genres g ON mg.genre_id = g.id
     WHERE mg.movie_id IN (${placeholders})`,
    movieIds
  );
  const [countryRows] = await db.query(
    `SELECT mc.movie_id, c.name
     FROM movie_countries mc
     JOIN countries c ON mc.country_id = c.id
     WHERE mc.movie_id IN (${placeholders})`,
    movieIds
  );

  const genresMap = genreRows.reduce((acc, row) => {
    if (!acc[row.movie_id]) acc[row.movie_id] = [];
    acc[row.movie_id].push(row.name);
    return acc;
  }, {});
  const countriesMap = countryRows.reduce((acc, row) => {
    if (!acc[row.movie_id]) acc[row.movie_id] = [];
    acc[row.movie_id].push(row.name);
    return acc;
  }, {});

  return rows.map((row) => ({
    ...row,
    poster_url: cleanImageUrl(row.poster_url),
    bg_url: cleanImageUrl(row.bg_url),
    genres: genresMap[row.id] || [],
    countries: countriesMap[row.id] || [],
  }));
}

function attachSubtitleTracks(episodes, tracksByEpisode) {
  return episodes.map((episode) => {
    const storedTracks = tracksByEpisode.get(Number(episode.id)) || [];
    const subtitleTracks = storedTracks.length
      ? storedTracks
      : normalizeSubtitleUrl(episode.subtitle_url)
        ? [{
            id: `legacy-${episode.id}`,
            label: 'Phụ đề',
            srclang: 'vi',
            src: `/api/subtitles/episodes/${episode.id}.vtt`,
            is_default: true,
          }]
        : [];

    return {
      ...episode,
      subtitle_tracks: subtitleTracks,
    };
  });
}

function formatDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function formatUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    email_verified: user.email_verified,
    is_active: user.is_active,
    vip_until: user.vip_until || null,
    is_vip: Boolean(user.vip_until && new Date(user.vip_until) > new Date()),
    gender: user.gender,
    avatar: user.avatar_url,
    avatar_url: user.avatar_url,
    phone: user.phone,
    birth_date: formatDateOnly(user.birth_date),
  };
}

async function sendOtpEmail(email, otp, type = 'register') {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[DEV MAIL] ${type} OTP for ${email}: ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const subject = type === 'register'
    ? 'Xác nhận email IT Move'
    : type === 'reset-password'
      ? 'Đặt lại mật khẩu IT Move'
      : 'Mã OTP IT Move';

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"IT Move" <no-reply@itmove.local>',
    to: email,
    subject,
    text: `Mã xác nhận của bạn là: ${otp}\n\nMã có hiệu lực trong ${OTP_EXPIRATION_MINUTES} phút.`,
  });
}

async function setUserOtp(db, userId, otp) {
  await db.execute(
    'UPDATE users SET email_otp=?, email_otp_expires=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?',
    [hashOtp(otp), OTP_EXPIRATION_MINUTES, userId]
  );
}

async function setPasswordResetOtp(db, userId, otp) {
  await db.execute(
    'UPDATE users SET password_reset_otp=?, password_reset_expires=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?',
    [hashOtp(otp), OTP_EXPIRATION_MINUTES, userId]
  );
}

async function verifyGoogleCredential(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google login is not configured');
  }
  const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!response.ok) throw new Error('Invalid Google credential');

  const profile = await response.json();
  const allowedAudiences = process.env.GOOGLE_CLIENT_ID.split(',').map(id => id.trim()).filter(Boolean);
  if (!allowedAudiences.includes(profile.aud)) throw new Error('Google credential audience is invalid');
  if (profile.email_verified !== 'true' && profile.email_verified !== true) throw new Error('Google email is not verified');

  return {
    email: profile.email.toLowerCase(),
    username: profile.name || profile.email.split('@')[0],
    avatar_url: profile.picture || null,
  };
}

// Lấy pool kết nối từ app.locals
function getDb(req) {
  return req.app.locals.db;
}

function getUserId(req) {
  return req.body?.user_id || req.query?.user_id || req.headers?.['x-user-id'];
}

function getProfileId(req) {
  return req.body?.profile_id || req.query?.profile_id || req.headers?.['x-profile-id'];
}

function toPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function clampSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

async function isAdminUser(db, userId) {
  if (!userId) return false;
  const [rows] = await db.execute('SELECT is_admin FROM users WHERE id = ?', [userId]);
  return Boolean(rows[0]?.is_admin);
}

const PROFILE_SETTINGS_DEFAULTS = {
  autoplay_next: true,
  subtitle_style: 'default',
  subtitle_track: 'auto',
  cinema_default: false,
};

function payloadBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeProfileSettingsPayload(body = {}, fallback = PROFILE_SETTINGS_DEFAULTS) {
  const source = body.player_settings && typeof body.player_settings === 'object' ? body.player_settings : body;
  const subtitleStyle = String(source.subtitle_style || source.subtitleStyle || fallback.subtitle_style || 'default').trim().slice(0, 32);
  const subtitleTrack = String(source.subtitle_track || source.subtitleTrack || fallback.subtitle_track || 'auto').trim().slice(0, 64);

  return {
    autoplay_next: payloadBoolean(source.autoplay_next ?? source.autoplayNext, fallback.autoplay_next),
    subtitle_style: subtitleStyle || 'default',
    subtitle_track: subtitleTrack || 'auto',
    cinema_default: payloadBoolean(source.cinema_default ?? source.cinemaDefault, fallback.cinema_default),
  };
}

function normalizeProfilePayload(body = {}) {
  const name = String(body.name || '').trim().slice(0, 60);
  const avatarColor = String(body.avatar_color || '#E50914').trim().slice(0, 20);
  const avatarUrl = String(body.avatar_url || '').trim().slice(0, 1000) || null;
  const isKids = payloadBoolean(body.is_kids);
  const settings = normalizeProfileSettingsPayload(body);
  return { name, avatarColor, avatarUrl, isKids, settings };
}

function formatProfileRow(profile = {}) {
  const settings = normalizeProfileSettingsPayload(profile);
  return {
    ...profile,
    is_kids: Boolean(profile.is_kids),
    is_default: Boolean(profile.is_default),
    autoplay_next: settings.autoplay_next,
    subtitle_style: settings.subtitle_style,
    subtitle_track: settings.subtitle_track,
    cinema_default: settings.cinema_default,
    player_settings: {
      autoplayNext: settings.autoplay_next,
      subtitleStyle: settings.subtitle_style,
      subtitleTrack: settings.subtitle_track,
      cinemaDefault: settings.cinema_default,
    },
  };
}

async function ensureDefaultProfile(db, userId) {
  const [existing] = await db.execute(
    `SELECT id, user_id, name, avatar_color, avatar_url, is_kids, is_default,
            autoplay_next, subtitle_style, subtitle_track, cinema_default
     FROM user_profiles
     WHERE user_id = ?
     ORDER BY is_default DESC, id ASC
     LIMIT 1`,
    [userId]
  );
  if (existing.length) return existing[0];

  const [users] = await db.execute('SELECT username FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!users.length) return null;

  const [result] = await db.execute(
    "INSERT INTO user_profiles (user_id, name, avatar_color, avatar_url, is_kids, is_default, autoplay_next, subtitle_style, subtitle_track, cinema_default) VALUES (?, ?, ?, NULL, 0, 1, 1, 'default', 'auto', 0)",
    [userId, users[0].username || 'Profile', '#E50914']
  );
  return {
    id: result.insertId,
    user_id: Number(userId),
    name: users[0].username || 'Profile',
    avatar_color: '#E50914',
    avatar_url: null,
    is_kids: 0,
    is_default: 1,
    autoplay_next: 1,
    subtitle_style: 'default',
    subtitle_track: 'auto',
    cinema_default: 0,
  };
}

async function resolveProfileId(db, userId, requestedProfileId = null) {
  const numericUserId = toPositiveInt(userId);
  if (!numericUserId) return null;

  const numericProfileId = toPositiveInt(requestedProfileId);
  if (numericProfileId) {
    const [rows] = await db.execute(
      'SELECT id FROM user_profiles WHERE id = ? AND user_id = ? LIMIT 1',
      [numericProfileId, numericUserId]
    );
    if (!rows.length) {
      const error = new Error('Profile không thuộc tài khoản này');
      error.statusCode = 403;
      throw error;
    }
    return numericProfileId;
  }

  const profile = await ensureDefaultProfile(db, numericUserId);
  return profile?.id || null;
}

function profileHeader(req) {
  return getProfileId(req);
}

async function runAiChatRequest(req) {
  const db = getDb(req);
  const userId = req.body?.user_id || req.headers?.['x-user-id'];
  const profileId = req.body?.profile_id || req.headers?.['x-profile-id'];
  const requestId = createRecommendationRequestId();
  const startedAt = Date.now();
  let session = null;

  try {
    session = await ensureChatSession(db, {
      sessionId: req.body?.session_id,
      userId,
      profileId,
    });
    const result = await chatWithMovieAdvisor(db, {
      message: req.body?.message,
      user_id: userId,
      profile_id: profileId,
      history: req.body?.history,
      shown_movie_ids: req.body?.shown_movie_ids,
    });
    const response = {
      ...result,
      request_id: requestId,
      session_id: session.id,
      session_persisted: session.persisted,
    };
    await saveChatExchange(db, {
      sessionId: session.id,
      userMessage: req.body?.message,
      assistantResult: response,
    });
    await recordRecommendationResponse(db, {
      requestId,
      sessionId: session.id,
      userId,
      profileId,
      result: response,
      latencyMs: Date.now() - startedAt,
      message: req.body?.message,
    }).catch((error) => console.warn('[Recommendation analytics]', error.message));
    return response;
  } catch (error) {
    await recordRecommendationResponse(db, {
      requestId,
      sessionId: session?.id || null,
      userId,
      profileId,
      error,
      latencyMs: Date.now() - startedAt,
      message: req.body?.message,
    }).catch((analyticsError) => console.warn('[Recommendation analytics]', analyticsError.message));
    throw error;
  }
}

function setupSseResponse(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function writeSseEvent(res, event, data = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function splitStreamText(text) {
  const source = String(text || '');
  const chunks = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === '\n') {
      chunks.push('\n');
      index += 1;
      continue;
    }

    let nextIndex = Math.min(source.length, index + Math.max(4, Math.ceil(source.length / 90)));
    while (nextIndex < source.length && /\S/.test(source[nextIndex]) && nextIndex - index < 18) {
      nextIndex += 1;
    }
    chunks.push(source.slice(index, nextIndex));
    index = nextIndex;
  }
  return chunks;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function requireAdmin(req, res) {
  const db = getDb(req);
  const userId = getUserId(req);
  const ok = await isAdminUser(db, userId);
  if (!ok) {
    res.status(403).json({ message: 'Admin only' });
    return null;
  }
  return { db, userId };
}

async function requireAdminMiddleware(req, res, next) {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    req.admin = auth;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function recordMovieView(db, req, movieId) {
  const userId = getUserId(req) || null;
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;

  await db.execute(
    'INSERT INTO movie_views (movie_id, user_id, ip_address, user_agent) VALUES (?, ?, ?, ?)',
    [movieId, userId, ipAddress, userAgent]
  );
  await db.execute('UPDATE movies SET views = COALESCE(views, 0) + 1 WHERE id = ?', [movieId]);
}

async function getValidatedWatchProgressInput(db, body) {
  const movieId = toPositiveInt(body?.movie_id);
  const episodeId = body?.episode_id ? toPositiveInt(body.episode_id) : null;
  const episodeNumber = body?.episode_number ? toPositiveInt(body.episode_number) : null;
  let progress = clampSeconds(body?.progress_seconds);
  let duration = clampSeconds(body?.duration_seconds);

  if (!movieId) {
    const error = new Error('Thiếu movie_id hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const [movieRows] = await db.execute('SELECT id FROM movies WHERE id = ? LIMIT 1', [movieId]);
  if (!movieRows.length) {
    const error = new Error('Phim không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  let normalizedEpisodeNumber = episodeNumber;
  if (episodeId) {
    const [episodeRows] = await db.execute(
      'SELECT id, episode_number FROM episodes WHERE id = ? AND movie_id = ? LIMIT 1',
      [episodeId, movieId]
    );
    if (!episodeRows.length) {
      const error = new Error('Tập phim không tồn tại hoặc không thuộc phim này');
      error.statusCode = 400;
      throw error;
    }
    normalizedEpisodeNumber = episodeRows[0].episode_number;
  }

  if (duration > 0 && progress > duration) progress = duration;
  const completed = body?.completed === undefined
    ? duration > 0 && progress / duration >= 0.9
    : Boolean(body.completed);

  return {
    movieId,
    episodeId,
    episodeNumber: normalizedEpisodeNumber,
    progress,
    duration,
    completed,
  };
}

async function upsertWatchProgress(db, userId, profileId, input) {
  await db.execute(
    `INSERT INTO user_watch_history
     (user_id, profile_id, movie_id, episode_id, episode_number, progress_seconds, duration_seconds, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       episode_id = VALUES(episode_id),
       progress_seconds = VALUES(progress_seconds),
       duration_seconds = VALUES(duration_seconds),
       completed = VALUES(completed),
       last_watched_at = NOW()`,
    [
      userId,
      profileId,
      input.movieId,
      input.episodeId || null,
      input.episodeNumber || null,
      input.progress,
      input.duration,
      input.completed ? 1 : 0,
    ]
  );
}

async function getMovieCardsByJoin(db, tableName, userId, profileId, orderColumn = 'ul.created_at') {
  const [rows] = await db.execute(
    `SELECT m.id, m.title, m.original_title, m.poster_url, m.release_year, m.duration,
            m.imdb_rating, m.quality, m.status, ul.created_at AS saved_at
     FROM ${tableName} ul
     JOIN movies m ON ul.movie_id = m.id
     WHERE ul.user_id = ? AND ul.profile_id = ?
     ORDER BY ${orderColumn} DESC`,
    [userId, profileId]
  );
  return rows;
}

function toDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function dateKeyToTime(key) {
  return new Date(`${key}T00:00:00`).getTime();
}

function calculateWatchStreaks(dayRows) {
  const dayKeys = [...new Set(dayRows.map((row) => toDateKey(row.watch_date)).filter(Boolean))]
    .sort((left, right) => dateKeyToTime(left) - dateKeyToTime(right));

  if (!dayKeys.length) {
    return { current_streak_days: 0, longest_streak_days: 0 };
  }

  let longest = 1;
  let currentRun = 1;

  for (let index = 1; index < dayKeys.length; index += 1) {
    const previous = dateKeyToTime(dayKeys[index - 1]);
    const current = dateKeyToTime(dayKeys[index]);
    const dayGap = Math.round((current - previous) / 86400000);

    currentRun = dayGap === 1 ? currentRun + 1 : 1;
    longest = Math.max(longest, currentRun);
  }

  let latestStreak = 1;
  for (let index = dayKeys.length - 1; index > 0; index -= 1) {
    const current = dateKeyToTime(dayKeys[index]);
    const previous = dateKeyToTime(dayKeys[index - 1]);
    const dayGap = Math.round((current - previous) / 86400000);
    if (dayGap !== 1) break;
    latestStreak += 1;
  }

  return { current_streak_days: latestStreak, longest_streak_days: longest };
}

function buildRecentWatchActivity(rows, days = 7) {
  const byDate = new Map(rows.map((row) => [toDateKey(row.watch_date), row]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = toDateKey(date);
    const row = byDate.get(key) || {};

    return {
      date: key,
      entries: Number(row.entries) || 0,
      watch_seconds: Number(row.watch_seconds) || 0,
      completed_entries: Number(row.completed_entries) || 0,
    };
  });
}

// Đăng ký tài khoản và gửi OTP xác nhận email
router.post('/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ message: 'Thiếu thông tin đăng ký' });
  try {
    const db = getDb(req);
    const normalizedEmail = email.trim().toLowerCase();
    const [existingByEmail] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (existingByEmail.length > 0) {
      const user = existingByEmail[0];
      if (user.email_verified) return res.status(400).json({ message: 'Email đã được đăng ký' });
      const otp = generateOtp();
      await setUserOtp(db, user.id, otp);
      await sendOtpEmail(normalizedEmail, otp, 'register');
      return res.json({ message: 'Tài khoản chưa xác nhận. Mã OTP mới đã được gửi.', requiresVerification: true, email: normalizedEmail });
    }

    const [existingByUsername] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existingByUsername.length > 0) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (username, password, email, email_verified, is_active) VALUES (?, ?, ?, 0, 1)',
      [username, hash, normalizedEmail]
    );
    const otp = generateOtp();
    await setUserOtp(db, result.insertId, otp);
    await sendOtpEmail(normalizedEmail, otp, 'register');
    res.json({ message: 'Đăng ký thành công. Vui lòng nhập mã OTP đã gửi email để xác nhận tài khoản.', requiresVerification: true, email: normalizedEmail });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xác nhận email bằng OTP
router.post('/auth/verify-email', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Thiếu email hoặc mã OTP' });
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    const user = rows[0];
    if (user.email_verified) return res.json({ message: 'Email đã được xác nhận' });
    if (!user.email_otp || user.email_otp !== hashOtp(otp)) return res.status(400).json({ message: 'Mã OTP không đúng' });
    if (user.email_otp_expires && new Date(user.email_otp_expires) < new Date()) return res.status(400).json({ message: 'Mã OTP đã hết hạn' });
    await db.execute('UPDATE users SET email_verified=1, email_otp=NULL, email_otp_expires=NULL WHERE id=?', [user.id]);
    res.json({ message: 'Xác nhận email thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Gửi lại OTP xác nhận email
router.post('/auth/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Thiếu email' });
  try {
    const db = getDb(req);
    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    if (rows[0].email_verified) return res.json({ message: 'Email đã được xác nhận' });
    const otp = generateOtp();
    await setUserOtp(db, rows[0].id, otp);
    await sendOtpEmail(normalizedEmail, otp, 'register');
    res.json({ message: 'Mã OTP mới đã được gửi' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Đăng nhập bằng username hoặc email
router.post('/auth/login', async (req, res) => {
  const { username, email, password } = req.body;
  const identifier = (username || email || '').trim();
  if (!identifier || !password) return res.status(400).json({ message: 'Thiếu thông tin đăng nhập' });
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    if (!user.email_verified) return res.status(403).json({ message: 'Vui lòng xác nhận email trước khi đăng nhập', requiresVerification: true, email: user.email });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Đăng nhập bằng Google Identity credential
router.post('/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ message: 'Missing Google credential' });
  try {
    const db = getDb(req);
    const profile = await verifyGoogleCredential(credential);
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [profile.email]);
    let user = rows[0];
    if (!user) {
      const baseUsername = profile.username.replace(/\s+/g, '').slice(0, 40) || profile.email.split('@')[0];
      let username = baseUsername;
      let suffix = 1;
      while (true) {
        const [taken] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (!taken.length) break;
        username = baseUsername + suffix++;
      }
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const [result] = await db.execute(
        'INSERT INTO users (username, avatar_url, password, email, email_verified, is_active) VALUES (?, ?, ?, ?, 1, 1)',
        [username, profile.avatar_url, randomPassword, profile.email]
      );
      const [createdRows] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = createdRows[0];
    } else {
      if (!user.is_active) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
      if (!user.email_verified) {
        await db.execute('UPDATE users SET email_verified=1, email_otp=NULL, email_otp_expires=NULL WHERE id=?', [user.id]);
        user.email_verified = 1;
      }
    }
    res.json(formatUser(user));
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

// ====== USER PROFILES API ======
router.get('/profiles', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    await ensureDefaultProfile(db, userId);
    const [rows] = await db.execute(
      `SELECT id, user_id, name, avatar_color, avatar_url, is_kids, is_default,
              autoplay_next, subtitle_style, subtitle_track, cinema_default,
              created_at, updated_at
       FROM user_profiles
       WHERE user_id = ?
       ORDER BY is_default DESC, id ASC`,
      [userId]
    );
    res.json(rows.map(formatProfileRow));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const { name, avatarColor, avatarUrl, isKids, settings } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'Tên profile không được để trống' });

    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?', [userId]);
    if (Number(count) >= 5) return res.status(400).json({ message: 'Mỗi tài khoản tối đa 5 profile' });

    const isDefault = Number(count) === 0 ? 1 : 0;
    const [result] = await db.execute(
      `INSERT INTO user_profiles
        (user_id, name, avatar_color, avatar_url, is_kids, is_default, autoplay_next, subtitle_style, subtitle_track, cinema_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name,
        avatarColor,
        avatarUrl,
        isKids ? 1 : 0,
        isDefault,
        settings.autoplay_next ? 1 : 0,
        settings.subtitle_style,
        settings.subtitle_track,
        settings.cinema_default ? 1 : 0,
      ]
    );
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ profile: formatProfileRow(rows[0]) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.put('/profiles/:profileId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    const { name, avatarColor, avatarUrl, isKids, settings } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'Tên profile không được để trống' });

    await db.execute(
      `UPDATE user_profiles
       SET name = ?, avatar_color = ?, avatar_url = ?, is_kids = ?,
           autoplay_next = ?, subtitle_style = ?, subtitle_track = ?, cinema_default = ?
       WHERE id = ? AND user_id = ?`,
      [
        name,
        avatarColor,
        avatarUrl,
        isKids ? 1 : 0,
        settings.autoplay_next ? 1 : 0,
        settings.subtitle_style,
        settings.subtitle_track,
        settings.cinema_default ? 1 : 0,
        profileId,
        userId,
      ]
    );
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [profileId]);
    res.json({ profile: formatProfileRow(rows[0]) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/profiles/:profileId/default', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    await db.execute('UPDATE user_profiles SET is_default = 0 WHERE user_id = ?', [userId]);
    await db.execute('UPDATE user_profiles SET is_default = 1 WHERE id = ? AND user_id = ?', [profileId, userId]);
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [profileId]);
    res.json({ profile: formatProfileRow(rows[0]) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.put('/profiles/:profileId/settings', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    const settings = normalizeProfileSettingsPayload(req.body);

    await db.execute(
      `UPDATE user_profiles
       SET autoplay_next = ?, subtitle_style = ?, subtitle_track = ?, cinema_default = ?
       WHERE id = ? AND user_id = ?`,
      [
        settings.autoplay_next ? 1 : 0,
        settings.subtitle_style,
        settings.subtitle_track,
        settings.cinema_default ? 1 : 0,
        profileId,
        userId,
      ]
    );
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [profileId]);
    res.json({ profile: formatProfileRow(rows[0]) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/profiles/:profileId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?', [userId]);
    if (Number(count) <= 1) return res.status(400).json({ message: 'Tài khoản cần ít nhất 1 profile' });

    const [rows] = await db.execute('SELECT is_default FROM user_profiles WHERE id = ? AND user_id = ? LIMIT 1', [profileId, userId]);
    const wasDefault = Boolean(rows[0]?.is_default);
    await db.execute('DELETE FROM user_profiles WHERE id = ? AND user_id = ?', [profileId, userId]);
    if (wasDefault) {
      const [nextRows] = await db.execute('SELECT id FROM user_profiles WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
      if (nextRows[0]) await db.execute('UPDATE user_profiles SET is_default = 1 WHERE id = ?', [nextRows[0].id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/movies', async (req, res) => {
  try {
    const db = getDb(req);
    const includeHidden = req.query.include_hidden === 'true' && req.headers?.['x-user-id'] && await isAdminUser(db, req.headers['x-user-id']);
    const limit = req.query.limit ? clampLimit(req.query.limit, 24) : null;
    const sort = String(req.query.sort || 'recent').toLowerCase();
    const orderBy = {
      recent: 'created_at DESC',
      views: 'views DESC, created_at DESC',
      imdb: 'imdb_rating DESC, views DESC',
    }[sort] || 'created_at DESC';
    const [rows] = await db.execute(
      `SELECT * FROM movies ${includeHidden ? '' : 'WHERE is_visible = 1'} ORDER BY ${orderBy}${limit ? ` LIMIT ${limit}` : ''}`
    );

    // Lấy genres và countries cho tất cả movies
    const movieIds = rows.map(row => row.id);
    let genresMap = {};
    let countriesMap = {};
    if (movieIds.length > 0) {
      // Genres
      const [genreRows] = await db.query(
        `SELECT mg.movie_id, g.name
         FROM movie_genres mg
         JOIN genres g ON mg.genre_id = g.id
         WHERE mg.movie_id IN (${movieIds.map(() => '?').join(',')})`,
        movieIds
      );
      genresMap = genreRows.reduce((acc, cur) => {
        if (!acc[cur.movie_id]) acc[cur.movie_id] = [];
        acc[cur.movie_id].push(cur.name);
        return acc;
      }, {});

      // Countries
      const [countryRows] = await db.query(
        `SELECT mc.movie_id, c.name
         FROM movie_countries mc
         JOIN countries c ON mc.country_id = c.id
         WHERE mc.movie_id IN (${movieIds.map(() => '?').join(',')})`,
        movieIds
      );
      countriesMap = countryRows.reduce((acc, cur) => {
        if (!acc[cur.movie_id]) acc[cur.movie_id] = [];
        acc[cur.movie_id].push(cur.name);
        return acc;
      }, {});
    }

    // Gắn genres và countries vào từng movie, đồng thời đảm bảo các trường cần thiết luôn có mặt
    const moviesWithGenresAndCountries = rows.map(row => ({
      ...row,
      age_limit: row.age_limit,
      original_title: row.original_title,
      release_year: row.release_year,
      is_series: row.is_series,
      imdb_rating: row.imdb_rating,
      quality: row.quality,
      genres: genresMap[row.id] || [],
      countries: countriesMap[row.id] || [],
    }));

    res.json(moviesWithGenresAndCountries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm phim (admin)
router.get('/recommendations', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.query.movie_id;
    if (!movieId) return res.status(400).json({ message: 'movie_id là bắt buộc' });
    const recommendations = await getSimilarMovies(db, movieId, clampLimit(req.query.limit));
    res.json(recommendations);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/recommendations/user/:userId', async (req, res) => {
  try {
    const db = getDb(req);
    const profileId = await resolveProfileId(db, req.params.userId, profileHeader(req));
    const includeTaste = ['1', 'true', 'yes'].includes(String(req.query.include_taste || '').toLowerCase());
    const tasteProfile = includeTaste
      ? await getProfileTasteProfile(db, req.params.userId, profileId).catch(() => null)
      : null;
    const recommendations = await getUserRecommendations(
      db,
      req.params.userId,
      clampLimit(req.query.limit),
      profileId,
      tasteProfile ? { tasteProfile } : {}
    );

    if (includeTaste) {
      const movieIds = recommendations.map((movie) => Number(movie.id)).filter(Boolean);
      const feedback = await getAiMovieFeedbackMap(db, {
        userId: req.params.userId,
        profileId,
        movieIds,
      }).catch(() => ({}));

      return res.json({
        movies: recommendations,
        source: 'personalized',
        profile_id: profileId,
        taste_profile: compactTasteProfile(tasteProfile),
        feedback,
      });
    }

    res.json(recommendations);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/people/:type/:id', async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  const config = {
    actors: {
      table: 'actors',
      linkTable: 'movie_actors',
      linkColumn: 'actor_id',
      role: 'actor',
      role_label: 'Diễn viên',
      movies_title: 'Các phim đã tham gia',
    },
    directors: {
      table: 'directors',
      linkTable: 'movie_directors',
      linkColumn: 'director_id',
      role: 'director',
      role_label: 'Đạo diễn',
      movies_title: 'Các phim đã đạo diễn',
    },
  }[type];
  const personId = Number.parseInt(req.params.id, 10);

  if (!config || !Number.isInteger(personId) || personId <= 0) {
    return res.status(400).json({ message: 'Person type hoặc id không hợp lệ' });
  }

  try {
    const db = getDb(req);
    const [peopleRows] = await db.execute(
      `SELECT id, name, profile_pic_url, bio FROM ${config.table} WHERE id = ? LIMIT 1`,
      [personId]
    );

    if (!peopleRows.length) {
      return res.status(404).json({ message: 'Không tìm thấy người này' });
    }

    const person = {
      ...peopleRows[0],
      profile_pic_url: cleanImageUrl(peopleRows[0].profile_pic_url),
      role: config.role,
      role_label: config.role_label,
    };

    const [movieRows] = await db.execute(
      `
        SELECT
          m.id,
          m.title,
          m.original_title,
          m.slug,
          m.description,
          m.poster_url,
          m.release_year,
          m.duration,
          m.imdb_rating,
          m.quality,
          m.status,
          m.is_series,
          m.views,
          m.created_at,
          MAX(b.bg_url) AS bg_url,
          COUNT(DISTINCT e.id) AS episode_count
        FROM ${config.linkTable} mp
        JOIN movies m ON mp.movie_id = m.id
        LEFT JOIN banners b ON b.movie_id = m.id
        LEFT JOIN episodes e ON e.movie_id = m.id
        WHERE mp.${config.linkColumn} = ?
          AND m.is_visible = 1
        GROUP BY
          m.id, m.title, m.original_title, m.slug, m.description, m.poster_url,
          m.release_year, m.duration, m.imdb_rating, m.quality, m.status,
          m.is_series, m.views, m.created_at
        ORDER BY COALESCE(m.release_year, 0) DESC, m.created_at DESC, m.id DESC
      `,
      [personId]
    );

    const movies = await attachMovieGenresAndCountries(db, movieRows);
    const yearCounts = movies.reduce((acc, movie) => {
      const year = movie.release_year || 'Đang cập nhật';
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});

    res.json({
      person,
      movies,
      movies_title: config.movies_title,
      stats: {
        movie_count: movies.length,
        first_year: movies.reduce((min, movie) => {
          const year = Number(movie.release_year);
          return Number.isFinite(year) && year > 0 ? Math.min(min || year, year) : min;
        }, null),
        latest_year: movies.reduce((max, movie) => {
          const year = Number(movie.release_year);
          return Number.isFinite(year) && year > 0 ? Math.max(max || year, year) : max;
        }, null),
        year_counts: yearCounts,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/movies/smart-search', async (req, res) => {
  try {
    const db = getDb(req);
    const result = await smartSearchMovies(db, req.query.q, { limit: req.query.limit });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/ai/status', (req, res) => {
  res.json({ ...getAiStatus(), dense_embedding: getDenseEmbeddingStatus() });
});

router.get('/admin/ai-health', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const chat = await getAiChatStats(db);
    const feedback = await getAiFeedbackStats(db);
    const analytics = await getRecommendationAnalytics(db, { days: req.query?.days || 30 });
    const embeddings = await getMovieEmbeddingStatus(db);
    res.json({
      status: getAiStatus(),
      chat,
      feedback,
      analytics,
      embeddings,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/admin/ai-taste', requireAdminMiddleware, async (req, res) => {
  try {
    const result = await getAdminAiTasteDashboard(getDb(req), {
      profileId: req.query?.profile_id,
      limit: req.query?.limit,
      days: req.query?.days,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/admin/ai-taste/feedback/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const deleted = await deleteAdminAiFeedback(getDb(req), req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/admin/ai-taste/profiles/:profileId/reset', requireAdminMiddleware, async (req, res) => {
  try {
    const deleted = await resetAdminProfileAiFeedback(getDb(req), req.params.profileId);
    res.json({ deleted });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/admin/ai-taste/feedback/hide', requireAdminMiddleware, async (req, res) => {
  try {
    const feedback = await hideAdminMovieForProfile(getDb(req), {
      profileId: req.body?.profile_id,
      movieId: req.body?.movie_id,
    });
    res.json({ feedback });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/admin/movies/description', requireAdminMiddleware, async (req, res) => {
  try {
    const result = await generateMovieDescription(req.body?.movie || req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/ai/chat', async (req, res) => {
  try {
    res.json(await runAiChatRequest(req));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/ai/chat/stream', async (req, res) => {
  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const send = (event, data) => {
    if (!closed && !res.writableEnded) writeSseEvent(res, event, data);
  };

  try {
    setupSseResponse(res);
    send('status', { phase: 'received', message: 'Đã nhận yêu cầu tư vấn phim.' });

    const result = await runAiChatRequest(req);
    if (closed) return;

    send('session', {
      session_id: result.session_id,
      session_persisted: result.session_persisted,
    });
    send('status', { phase: 'reply', message: 'Đang viết câu trả lời.' });

    for (const chunk of splitStreamText(result.reply || '')) {
      if (closed) return;
      send('reply_delta', { text: chunk });
      await delay(CHAT_STREAM_CHUNK_DELAY_MS);
    }

    send('recommendations', {
      request_id: result.request_id,
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      suggested_replies: Array.isArray(result.suggested_replies) ? result.suggested_replies : [],
      conversation: result.conversation || null,
      source: result.source || 'rule-based',
      provider: result.provider || null,
      model: result.model || null,
      ai_error: result.ai_error || null,
      grounding: result.grounding || null,
    });
    send('done', result);
  } catch (err) {
    if (!res.headersSent) setupSseResponse(res);
    send('error', {
      message: err.message || 'Mình bị gián đoạn một chút.',
      status: err.statusCode || 500,
    });
  } finally {
    if (!closed && !res.writableEnded) res.end();
  }
});

router.get('/ai/chat/history', async (req, res) => {
  try {
    const db = getDb(req);
    const userId = req.query?.user_id || req.headers?.['x-user-id'];
    const profileId = req.query?.profile_id || req.headers?.['x-profile-id'];
    const history = await getLatestChatHistory(db, {
      userId,
      profileId,
      limit: req.query?.limit,
    });
    res.json(history);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/ai/recommendation-events', async (req, res) => {
  try {
    const db = getDb(req);
    const userId = getUserId(req) || null;
    const profileId = userId
      ? await resolveProfileId(db, userId, profileHeader(req))
      : null;
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    const events = rawEvents.slice(0, 40).map((event) => {
      const metadata = event?.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? event.metadata
        : {};
      return {
        event_type: event?.event_type || event?.type,
        event_key: event?.event_key,
        request_id: event?.request_id,
        session_id: event?.session_id,
        movie_id: event?.movie_id,
        position: event?.position,
        source: event?.source || 'chatbot',
        provider: event?.provider,
        latency_ms: event?.latency_ms,
        metadata: {
          ui_variant: metadata.ui_variant ? String(metadata.ui_variant).slice(0, 40) : null,
          feedback_type: metadata.feedback_type ? String(metadata.feedback_type).slice(0, 40) : null,
        },
      };
    });
    const result = await recordRecommendationEvents(db, {
      userId,
      profileId,
      sessionId: req.body?.session_id,
      requestId: req.body?.request_id,
      source: req.body?.source || 'chatbot',
      provider: req.body?.provider,
      events,
    });
    res.status(202).json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/ai/movie-feedback/list', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chua dang nhap' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const feedback = await listAiMovieFeedback(db, {
      userId,
      profileId,
      limit: req.query?.limit,
    });
    res.json({ profile_id: profileId, feedback });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/ai/movie-feedback', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chua dang nhap' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const feedback = await getAiMovieFeedbackMap(db, {
      userId,
      profileId,
      movieIds: req.query?.movie_ids || req.query?.movie_id,
    });
    res.json({ feedback });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/ai/profile-taste', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.json({
        signals_count: 0,
        positive: { genres: [], countries: [] },
        negative: { genres: [], countries: [] },
        duration: { preference: null, average_minutes: null, buckets: { short: 0, medium: 0, long: 0, series: 0 } },
        reason_signals: {},
        summary: [],
      });
    }
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const taste = await getProfileTasteProfile(db, userId, profileId);
    res.json({
      profile_id: profileId,
      ...taste,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/ai/movie-feedback', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Can dang nhap de luu gu phim' });
    const feedbackType = normalizeAiFeedbackType(req.body?.feedback_type || req.body?.type);
    if (!feedbackType) return res.status(400).json({ message: 'feedback_type khong hop le' });
    const clientMetadata = req.body?.metadata
      && typeof req.body.metadata === 'object'
      && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};

    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    let feedback = await setAiMovieFeedback(db, {
      userId,
      profileId,
      movieId: req.body?.movie_id,
      feedbackType,
      active: req.body?.active !== false,
      sessionId: req.body?.session_id,
      source: req.body?.source || 'chatbot',
      metadata: {
        reason: clientMetadata.reason ? String(clientMetadata.reason).slice(0, 80) : null,
        reason_label: clientMetadata.reason_label ? String(clientMetadata.reason_label).slice(0, 120) : null,
        reason_type: clientMetadata.reason_type ? String(clientMetadata.reason_type).slice(0, 40) : null,
        ui_variant: clientMetadata.ui_variant ? String(clientMetadata.ui_variant).slice(0, 40) : null,
        request_id: clientMetadata.request_id ? String(clientMetadata.request_id).slice(0, 64) : null,
        position: toPositiveInt(clientMetadata.position),
        user_agent: req.headers['user-agent'] || null,
      },
    });

    if (req.body?.active !== false && clientMetadata.reason === 'seen_before' && feedbackType !== 'watched') {
      feedback = await setAiMovieFeedback(db, {
        userId,
        profileId,
        movieId: req.body?.movie_id,
        feedbackType: 'watched',
        active: true,
        sessionId: req.body?.session_id,
        source: req.body?.source || 'chatbot',
        metadata: {
          inferred_from: feedbackType,
          reason: 'seen_before',
          request_id: clientMetadata.request_id ? String(clientMetadata.request_id).slice(0, 64) : null,
        },
      });
    }

    if (req.body?.active !== false) {
      const requestId = clientMetadata.request_id ? String(clientMetadata.request_id).slice(0, 64) : null;
      const analyticsKey = clientMetadata.event_key
        ? String(clientMetadata.event_key).slice(0, 160)
        : `feedback:${requestId || req.body?.session_id || crypto.randomUUID()}:${req.body?.movie_id}:${feedbackType}`;
      await recordRecommendationEvents(db, {
        userId,
        profileId,
        sessionId: req.body?.session_id,
        requestId,
        source: req.body?.source || 'chatbot',
        events: [{
          event_type: 'feedback',
          event_key: analyticsKey,
          movie_id: req.body?.movie_id,
          position: clientMetadata.position,
          metadata: {
            feedback_type: feedbackType,
            ui_variant: clientMetadata.ui_variant || null,
          },
        }],
      }).catch((error) => console.warn('[Recommendation analytics]', error.message));
    }
    res.json({ success: true, movie_id: Number(req.body?.movie_id), feedback });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/ai/movie-feedback', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Can dang nhap de cap nhat gu phim' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const deleted = await clearAiMovieFeedback(db, {
      userId,
      profileId,
      movieId: req.body?.movie_id || req.query?.movie_id,
      feedbackType: req.body?.feedback_type || req.query?.feedback_type,
    });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/ai/subtitles/translate', requireAdminMiddleware, async (req, res) => {
  try {
    const result = await translateSubtitle({
      content: req.body?.content,
      source_language: req.body?.source_language,
      target_language: req.body?.target_language,
      format: req.body?.format,
      bilingual: req.body?.bilingual,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/admin/subtitle-providers', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const providers = await listSubtitleProviders(db);
    res.json({ providers });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Không thể tải danh sách provider phụ đề.' });
  }
});

router.put('/admin/subtitle-providers/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const provider = await updateSubtitleProvider(db, req.params.id, req.body || {});
    res.json({ provider });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Không thể cập nhật provider phụ đề.' });
  }
});

router.post('/admin/subtitles/search-online', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const result = await searchOnlineSubtitles(db, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Không thể tìm phụ đề online.' });
  }
});

router.post('/admin/subtitles/import-online', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const result = await importOnlineSubtitle(db, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      message: err.message || 'Không thể import phụ đề online.',
      sync_report: err.syncReport || null,
    });
  }
});

router.post('/admin/subtitles/generate-from-audio', requireAdminMiddleware, async (req, res) => {
  try {
    const result = await generateSubtitleFromEpisodeAudio(getDb(req), req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      message: err.message || 'Không thể tạo phụ đề từ hội thoại.',
      sync_report: err.syncReport || null,
    });
  }
});

router.post('/subtitles/preview', requireAdminMiddleware, async (req, res) => {
  try {
    const content = String(req.body?.content || '');
    if (!content.trim()) return res.status(400).json({ message: 'Thiếu nội dung phụ đề' });
    if (content.length > 500000) return res.status(413).json({ message: 'Phụ đề quá lớn' });

    const format = String(req.body?.format || 'auto').toLowerCase();
    const sourceName = format === 'auto' ? 'subtitle.txt' : `subtitle.${format}`;
    res.json({
      vtt_content: ensureWebVtt(content, sourceName),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot preview subtitle' });
  }
});

router.get('/subtitles/episodes/:episodeId.vtt', async (req, res) => {
  try {
    const db = getDb(req);
    const result = await loadEpisodeSubtitleAsVtt(db, req.params.episodeId);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.content);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Subtitle not available' });
  }
});

router.get('/subtitles/episodes/:episodeId/:subtitleId.vtt', async (req, res) => {
  try {
    const db = getDb(req);
    const result = await loadStoredSubtitleAsVtt(db, req.params.episodeId, req.params.subtitleId);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.content);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Subtitle not available' });
  }
});

router.get('/subtitles/episodes/:episodeId/manage', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const result = await listEpisodeSubtitles(db, req.params.episodeId);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot load subtitles' });
  }
});

router.post('/subtitles/episodes/:episodeId', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const subtitle = await saveEpisodeSubtitle(db, req.params.episodeId, req.body);
    res.json({ message: 'Đã lưu phụ đề cho tập phim.', subtitle });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot save subtitle' });
  }
});

router.get('/subtitles/:subtitleId', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const subtitle = await getEpisodeSubtitle(db, req.params.subtitleId);
    res.json({ subtitle });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot load subtitle' });
  }
});

router.put('/subtitles/:subtitleId', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const subtitle = await updateEpisodeSubtitle(db, req.params.subtitleId, req.body);
    res.json({ message: 'Đã cập nhật phụ đề.', subtitle });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot update subtitle' });
  }
});

router.delete('/subtitles/:subtitleId', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await deleteEpisodeSubtitle(db, req.params.subtitleId);
    res.json({ message: 'Đã xóa phụ đề.' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/movies', requireAdminMiddleware, async (req, res) => {
  const { title, description, poster_url, age_limit, original_title, release_year, duration, is_series, trailer_url, imdb_rating, quality, views, is_visible } = req.body;
  try {
    const db = getDb(req);
    const initialViews = Number(views) >= 0 ? Number(views) : randomTestViews();
    const [result] = await db.execute(
      'INSERT INTO movies (title, description, poster_url, age_limit, original_title, release_year, duration, is_series, trailer_url, imdb_rating, quality, views, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description, poster_url, age_limit, original_title, release_year, duration, is_series, trailer_url, imdb_rating, quality, initialViews, is_visible === false ? 0 : 1]
    );
    res.json({ message: 'Movie added', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa phim (admin)
router.put('/movies/:id', requireAdminMiddleware, async (req, res) => {
  const { title, description, poster_url, age_limit, original_title, release_year, duration, is_series, trailer_url, imdb_rating, quality, is_visible } = req.body;
  try {
    const db = getDb(req);
    await db.execute(
      'UPDATE movies SET title=?, description=?, poster_url=?, age_limit=?, original_title=?, release_year=?, duration=?, is_series=?, trailer_url=?, imdb_rating=?, quality=?, is_visible=? WHERE id=?',
      [title, description, poster_url, age_limit, original_title, release_year, duration, is_series, trailer_url, imdb_rating, quality, is_visible === false || is_visible === 0 ? 0 : 1, req.params.id]
    );
    res.json({ message: 'Movie updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/movies/tmdb-enrich-missing', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const result = await enrichMissingMoviesWithTmdb(db, {
      limit: req.body?.limit || 10,
      overwrite: req.body?.overwrite === true,
      replaceImportedImages: req.body?.replace_imported_images !== false,
      castLimit: req.body?.cast_limit || 8,
      directorLimit: req.body?.director_limit || 4,
      delayMs: 0,
    });
    res.json({
      message: 'Đã chạy bổ sung dữ liệu TMDb hàng loạt.',
      ...result,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/movies/:id/tmdb-enrich', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const result = await enrichMovieWithTmdb(db, req.params.id, {
      overwrite: req.body?.overwrite === true,
      replaceImportedImages: req.body?.replace_imported_images !== false,
      castLimit: req.body?.cast_limit || 8,
      directorLimit: req.body?.director_limit || 4,
    });
    res.json({
      message: 'Đã kiểm tra và bổ sung dữ liệu từ TMDb.',
      ...result,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/movies/:id/visibility', async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const isVisible = req.body.is_visible === false || req.body.is_visible === 0 ? 0 : 1;
  try {
    await auth.db.execute('UPDATE movies SET is_visible = ? WHERE id = ?', [isVisible, req.params.id]);
    res.json({ success: true, is_visible: isVisible });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa phim (admin)
router.delete('/movies/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM movies WHERE id=?', [req.params.id]);
    res.json({ message: 'Movie deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Đặt vé
router.post('/bookings', async (req, res) => {
  const { user_id, movie_id } = req.body;
  try {
    const db = getDb(req);
    await db.execute('INSERT INTO bookings (user_id, movie_id) VALUES (?, ?)', [user_id, movie_id]);
    res.json({ message: 'Booking successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy vé của user
router.get('/bookings/:user_id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT b.*, m.title FROM bookings b JOIN movies m ON b.movie_id = m.id WHERE b.user_id = ?', [req.params.user_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy danh sách quốc gia
router.get('/countries', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM countries ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm quốc gia mới
router.post('/countries', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiểm tra trùng tên
    const [rows] = await db.execute('SELECT id FROM countries WHERE name = ?', [name]);
    if (rows.length > 0) return res.status(400).json({ message: 'Tên quốc gia đã tồn tại' });
    await db.execute('INSERT INTO countries (name) VALUES (?)', [name]);
    res.json({ message: 'Thêm quốc gia thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa quốc gia
router.put('/countries/:id', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiểm tra trùng tên (trừ chính nó)
    const [rows] = await db.execute('SELECT id FROM countries WHERE name = ? AND id != ?', [name, req.params.id]);
    if (rows.length > 0) return res.status(400).json({ message: 'Tên quốc gia đã tồn tại' });
    const [result] = await db.execute('UPDATE countries SET name = ? WHERE id = ?', [name, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Quốc gia không tồn tại' });
    res.json({ message: 'Cập nhật quốc gia thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa quốc gia
router.delete('/countries/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    // Kiểm tra quốc gia có đang được liên kết với phim không
    const [used] = await db.execute('SELECT 1 FROM movie_countries WHERE country_id = ? LIMIT 1', [req.params.id]);
    if (used.length > 0) return res.status(400).json({ message: 'Không thể xóa: Quốc gia đang được sử dụng cho phim!' });
    const [result] = await db.execute('DELETE FROM countries WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Quốc gia không tồn tại' });
    res.json({ message: 'Đã xóa quốc gia thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy danh sách thể loại
router.get('/genres', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM genres ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm thể loại mới
router.post('/genres', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiểm tra trùng tên
    const [rows] = await db.execute('SELECT id FROM genres WHERE name = ?', [name]);
    if (rows.length > 0) return res.status(400).json({ message: 'Tên thể loại đã tồn tại' });
    await db.execute('INSERT INTO genres (name) VALUES (?)', [name]);
    res.json({ message: 'Thêm thể loại thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa thể loại
router.put('/genres/:id', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiểm tra trùng tên (trừ chính nó)
    const [rows] = await db.execute('SELECT id FROM genres WHERE name = ? AND id != ?', [name, req.params.id]);
    if (rows.length > 0) return res.status(400).json({ message: 'Tên thể loại đã tồn tại' });
    const [result] = await db.execute('UPDATE genres SET name = ? WHERE id = ?', [name, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Thể loại không tồn tại' });
    res.json({ message: 'Cập nhật thể loại thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa thể loại
router.delete('/genres/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    // Kiểm tra thể loại có đang được liên kết với phim không
    const [used] = await db.execute('SELECT 1 FROM movie_genres WHERE genre_id = ? LIMIT 1', [req.params.id]);
    if (used.length > 0) return res.status(400).json({ message: 'Không thể xóa: Thể loại đang được sử dụng cho phim!' });
    const [result] = await db.execute('DELETE FROM genres WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Thể loại không tồn tại' });
    res.json({ message: 'Đã xóa thể loại thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy phim theo thể loại
router.get('/genres/:id/movies', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute(`
      SELECT DISTINCT m.* 
      FROM movies m 
      JOIN movie_genres mg ON m.id = mg.movie_id 
      WHERE mg.genre_id = ?
      ORDER BY m.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy thể loại theo tên (tìm kiếm)
router.get('/genres/search/:name', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute(`
      SELECT * FROM genres 
      WHERE name LIKE ? 
      ORDER BY name
    `, [`%${req.params.name}%`]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Quên mật khẩu: gửi OTP đặt lại mật khẩu
router.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });

  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT id, email, is_active FROM users WHERE email = ? LIMIT 1', [email]);

    // Không tiết lộ email có tồn tại hay không.
    if (!rows.length) {
      return res.json({ message: 'Nếu email tồn tại, mã OTP đặt lại mật khẩu đã được gửi.' });
    }

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });

    const otp = generateOtp();
    await setPasswordResetOtp(db, user.id, otp);
    await sendOtpEmail(user.email, otp, 'reset-password');

    res.json({ message: 'Mã OTP đặt lại mật khẩu đã được gửi đến email của bạn.', email: user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xác nhận OTP và đặt mật khẩu mới
router.post('/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const password = String(req.body.password || '');

  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập email, OTP và mật khẩu mới' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  try {
    const db = getDb(req);
    const [rows] = await db.execute(
      'SELECT id, password_reset_otp, password_reset_expires, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    if (!user.password_reset_otp || user.password_reset_otp !== hashOtp(otp)) {
      return res.status(400).json({ message: 'Mã OTP không đúng' });
    }
    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ message: 'Mã OTP đã hết hạn' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      'UPDATE users SET password=?, password_reset_otp=NULL, password_reset_expires=NULL WHERE id=?',
      [hash, user.id]
    );

    res.json({ message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy tối đa 6 banner mới nhất, kèm thông tin phim và genres
router.get('/banners', async (req, res) => {
  try {
    const db = getDb(req);
    // Join banners with movies
    const [rows] = await db.execute(`
      SELECT b.*, m.imdb_rating, m.quality, m.age_limit, m.release_year, m.duration, m.description, m.title as movie_title, m.id as movie_id
      FROM banners b
      JOIN movies m ON b.movie_id = m.id
      WHERE m.is_visible = 1
      ORDER BY b.id DESC
      LIMIT 6
    `);

    // Get all movie_ids for banners
    const movieIds = rows.map(row => row.movie_id);
    let genresMap = {};
    if (movieIds.length > 0) {
      // Get genres for all movies in one query
      const [genreRows] = await db.query(`
        SELECT mg.movie_id, g.name
        FROM movie_genres mg
        JOIN genres g ON mg.genre_id = g.id
        WHERE mg.movie_id IN (${movieIds.map(() => '?').join(',')})
      `, movieIds);

      // Group genres by movie_id
      genresMap = genreRows.reduce((acc, cur) => {
        if (!acc[cur.movie_id]) acc[cur.movie_id] = [];
        acc[cur.movie_id].push(cur.name);
        return acc;
      }, {});
    }

    // Xử lý badges: loại bỏ trường sx nếu có
    const cleanRows = rows.map(row => {
      let badges = [];
      try {
        badges = JSON.parse(row.badges || '[]').map(b => {
          if (typeof b === 'object' && b !== null) {
            const { sx, ...rest } = b;
            return rest;
          }
          return b;
        });
      } catch (e) {}
      return {
        ...row,
        badges,
        genres: genresMap[row.movie_id] || [],
      };
    });

    res.json(cleanRows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm banner mới
router.post('/banners', requireAdminMiddleware, async (req, res) => {
  const { movie_id, bg_url, title_url, thumbnails } = req.body;
  if (!movie_id || !bg_url) return res.status(400).json({ message: 'Missing required fields' });
  try {
    const db = getDb(req);
    await db.execute(
      'INSERT INTO banners (movie_id, bg_url, title_url, thumbnails) VALUES (?, ?, ?, ?)',
      [movie_id, bg_url, title_url || null, JSON.stringify(thumbnails || [])]
    );
    res.json({ message: 'Banner added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy chi tiết phim
router.get('/movie/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.params.id;

    // 1. Thông tin phim chính
    const [movieRows] = await db.execute(
      'SELECT * FROM movies WHERE id = ?', [movieId]
    );
    if (!movieRows.length || !movieRows[0].is_visible) return res.status(404).json({ message: 'Movie not found' });
    const movie = movieRows[0];

    // 2. Banner/bg
    const [bannerRows] = await db.execute(
      'SELECT bg_url, title_url FROM banners WHERE movie_id = ? LIMIT 1', [movieId]
    );
    const bg_url = bannerRows.length ? cleanImageUrl(bannerRows[0].bg_url) : null;
    const title_url = bannerRows.length ? cleanImageUrl(bannerRows[0].title_url) : null;

    // 3. Genres
    const [genreRows] = await db.execute(
      `SELECT g.name FROM movie_genres mg JOIN genres g ON mg.genre_id = g.id WHERE mg.movie_id = ?`, [movieId]
    );
    const genres = genreRows.map(g => g.name);

    // 4. Countries
    const [countryRows] = await db.execute(
      `SELECT c.name FROM movie_countries mc JOIN countries c ON mc.country_id = c.id WHERE mc.movie_id = ?`, [movieId]
    );
    const countries = countryRows.map(c => c.name);

    // 5. Producers
    const [producerRows] = await db.execute(
      `SELECT p.name FROM movie_producer mp JOIN producers p ON mp.producer_id = p.id WHERE mp.movie_id = ?`, [movieId]
    );
    const producers = producerRows.map(p => p.name);

    // 6. Directors
    const [directorRows] = await db.execute(
      `SELECT d.id, d.name, d.profile_pic_url, d.bio FROM movie_directors md JOIN directors d ON md.director_id = d.id WHERE md.movie_id = ?`, [movieId]
    );

    // 7. Episodes
    const [episodeRows] = await db.execute(
      `SELECT id, episode_number, title, video_url, hls_url, thumbnail_url, preview_url, duration_seconds, description, subtitle_url, dubbed_video_url FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC`, [movieId]
    );
    const subtitleTracksByEpisode = await getEpisodeSubtitleTracks(db, episodeRows.map((episode) => episode.id));
    const episodes = attachSubtitleTracks(episodeRows, subtitleTracksByEpisode);

    // 8. Actors
    const [actorRows] = await db.execute(
      `SELECT a.id, a.name, a.profile_pic_url, a.bio FROM movie_actors ma JOIN actors a ON ma.actor_id = a.id WHERE ma.movie_id = ?`, [movieId]
    );

    // 9. Suggested movies (top imdb_rating, trừ phim hiện tại)
    const suggestedRows = await getSimilarMovies(db, movieId, 12);

    // 10. Kết quả trả về
    res.json({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      poster_url: cleanImageUrl(movie.poster_url),
      bg_url,
      title_url,
      age_limit: movie.age_limit,
      release_year: movie.release_year,
      duration: movie.duration,
      description: movie.description,
      trailer_url: movie.trailer_url,
      imdb_rating: movie.imdb_rating,
      quality: movie.quality,
      status: movie.status,
      is_series: movie.is_series,
      views: movie.views,
      genres,
      countries,
      producers,
      directors: directorRows,
      episodes,
      actors: actorRows,
      suggested: suggestedRows
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API: /api/watch/:id - Trả về thông tin phim, genres, danh sách tập
router.get('/watch/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.params.id;

    // 1. Thông tin phim
    const [movieRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
    if (!movieRows.length || !movieRows[0].is_visible) return res.status(404).json({ message: 'Movie not found' });
    await recordMovieView(db, req, movieId);
    const [updatedMovieRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
    const movie = updatedMovieRows[0];

    // 2. Genres
    const [genreRows] = await db.execute(
      `SELECT g.id, g.name FROM movie_genres mg JOIN genres g ON mg.genre_id = g.id WHERE mg.movie_id = ?`, [movieId]
    );

    const [countryRows] = await db.execute(
      `SELECT c.name FROM movie_countries mc JOIN countries c ON mc.country_id = c.id WHERE mc.movie_id = ?`, [movieId]
    );
    const countries = countryRows.map(c => c.name);

    const [directorRows] = await db.execute(
      `SELECT d.id, d.name, d.profile_pic_url, d.bio FROM movie_directors md JOIN directors d ON md.director_id = d.id WHERE md.movie_id = ?`, [movieId]
    );

    const [actorRows] = await db.execute(
      `SELECT a.id, a.name, a.profile_pic_url, a.bio FROM movie_actors ma JOIN actors a ON ma.actor_id = a.id WHERE ma.movie_id = ?`, [movieId]
    );

    // 3. Danh sách tập
    const [episodeRows] = await db.execute(
      `SELECT id, episode_number, title, video_url, hls_url, thumbnail_url, preview_url, duration_seconds, description, subtitle_url, dubbed_video_url FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC`, [movieId]
    );
    const subtitleTracksByEpisode = await getEpisodeSubtitleTracks(db, episodeRows.map((episode) => episode.id));
    const episodes = attachSubtitleTracks(episodeRows, subtitleTracksByEpisode);
    const suggestedRows = await getSimilarMovies(db, movieId, 12);

    res.json({
      movie: {
        ...movie,
        genres: genreRows.map((genre) => genre.name),
        countries,
        directors: directorRows,
        actors: actorRows,
      },
      genres: genreRows,
      countries,
      directors: directorRows,
      actors: actorRows,
      suggested: suggestedRows,
      episodes
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API filter phim
router.get('/movies/filter', async (req, res) => {
  try {
    const db = getDb(req);
    const {
      country, // tên quốc gia
      genre,   // tên thể loại
      type,    // 'Phim lẻ', 'Phim bộ', 'Tất cả'
      rating,  // age_limit
      year,    // năm sản xuất
      sort     // sắp xếp
    } = req.query;

    let sql = `SELECT DISTINCT m.* FROM movies m`;
    let joins = [];
    let wheres = ['m.is_visible = 1'];
    let params = [];

    // Join với bảng liên quan nếu cần
    if (country && country.length > 0 && country !== 'Tất cả') {
      let countries = country;
      if (typeof countries === 'string') {
        // Nếu là chuỗi có dấu phẩy, tách ra array
        if (countries.includes(',')) {
          countries = countries.split(',').map(s => s.trim());
        } else {
          countries = [countries];
        }
      }
      joins.push('JOIN movie_countries mc ON m.id = mc.movie_id');
      joins.push('JOIN countries c ON mc.country_id = c.id');
      wheres.push(`c.name IN (${countries.map(() => '?').join(',')})`);
      params.push(...countries);
    }
    if (genre && genre.length > 0) {
      // Đảm bảo genre là array
      let genres = genre;
      if (typeof genres === 'string') {
        if (genres.includes(',')) {
          genres = genres.split(',').map(s => s.trim());
        } else {
          genres = [genres];
        }
      }
      joins.push('JOIN movie_genres mg ON m.id = mg.movie_id');
      joins.push('JOIN genres g ON mg.genre_id = g.id');
      wheres.push(`g.name IN (${genres.map(() => '?').join(',')})`);
      params.push(...genres);
    }
    if (type && type !== 'Tất cả') {
      if (type === 'Phim lẻ') {
        wheres.push('(m.is_series = 0 OR m.is_series IS NULL)');
      } else if (type === 'Phim bộ') {
        wheres.push('m.is_series = 1');
      }
    }
    if (rating && rating.length > 0 && rating !== 'Tất cả') {
      let ratings = rating;
      if (typeof ratings === 'string') {
        if (ratings.includes(',')) {
          ratings = ratings.split(',').map(s => s.trim());
        } else {
          ratings = [ratings];
        }
      }
      wheres.push(`m.age_limit IN (${ratings.map(() => '?').join(',')})`);
      params.push(...ratings);
    }
    if (year && year.length > 0 && year !== 'Tất cả') {
      let years = year;
      if (typeof years === 'string') {
        if (years.includes(',')) {
          years = years.split(',').map(s => s.trim());
        } else {
          years = [years];
        }
      }
      wheres.push(`m.release_year IN (${years.map(() => '?').join(',')})`);
      params.push(...years);
    }

    // Ghép các join và where
    if (joins.length) sql += ' ' + joins.join(' ');
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');

    // Sau khi ghép where, thêm GROUP BY m.id nếu có filter thể loại để tránh duplicate
    if (joins.some(j => j.includes('movie_genres'))) {
      sql += ' GROUP BY m.id';
    }

    // Sắp xếp
    let order = 'm.created_at DESC';
    if (sort) {
      if (sort === 'Mới nhất') order = 'm.release_year DESC, m.created_at DESC';
      else if (sort === 'Mới cập nhật') order = 'm.created_at DESC';
      else if (sort === 'Điểm IMDb') order = 'm.imdb_rating DESC';
      else if (sort === 'Lượt xem') order = 'm.views DESC'; // nếu có trường views
    }
    sql += ` ORDER BY ${order}`;

    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy danh sách diễn viên
router.get('/actors', async (req, res) => {
  try {
    const db = getDb(req);
    const imagePriority = req.query.image_priority === 'true';
    const withStats = req.query.with_stats === 'true';
    const [rows] = await db.execute(
      withStats
        ? `SELECT
             a.*,
             COALESCE(stats.movie_count, 0) AS movie_count
           FROM actors a
           LEFT JOIN (
             SELECT actor_id, COUNT(DISTINCT movie_id) AS movie_count
             FROM movie_actors
             GROUP BY actor_id
           ) stats ON stats.actor_id = a.id
           ORDER BY ${imagePriority ? "CASE WHEN a.profile_pic_url IS NULL OR a.profile_pic_url = '' THEN 1 ELSE 0 END," : ''}
                    movie_count DESC, a.name ASC`
        : `SELECT *
           FROM actors
           ORDER BY ${imagePriority ? "CASE WHEN profile_pic_url IS NULL OR profile_pic_url = '' THEN 1 ELSE 0 END," : ''}
                    name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy danh sách tập phim cho 1 movie
router.get('/movies/:id/episodes', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm tập phim mới cho phim
router.post('/movies/:id/episodes', requireAdminMiddleware, async (req, res) => {
  const {
    episode_number,
    title,
    video_url,
    hls_url,
    thumbnail_url,
    preview_url,
    duration_seconds,
    description,
    subtitle_url,
  } = req.body;
  if (!episode_number || !title || (!video_url && !hls_url)) {
    return res.status(400).json({ message: 'Thiếu thông tin tập phim' });
  }
  try {
    const db = getDb(req);
    await db.execute(
      `INSERT INTO episodes
       (movie_id, episode_number, title, video_url, hls_url, thumbnail_url, preview_url, duration_seconds, description, subtitle_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        episode_number,
        title,
        video_url || null,
        hls_url || null,
        thumbnail_url || null,
        preview_url || null,
        duration_seconds || null,
        description || null,
        subtitle_url || null,
      ]
    );
    res.json({ message: 'Đã thêm tập phim' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa tập phim
router.put('/episodes/:id', requireAdminMiddleware, async (req, res) => {
  const {
    episode_number,
    title,
    video_url,
    hls_url,
    thumbnail_url,
    preview_url,
    duration_seconds,
    description,
    subtitle_url,
  } = req.body;
  try {
    const db = getDb(req);
    await db.execute(
      `UPDATE episodes
       SET episode_number=?, title=?, video_url=?, hls_url=?, thumbnail_url=?, preview_url=?, duration_seconds=?, description=?, subtitle_url=?
       WHERE id=?`,
      [
        episode_number,
        title,
        video_url || null,
        hls_url || null,
        thumbnail_url || null,
        preview_url || null,
        duration_seconds || null,
        description || null,
        subtitle_url || null,
        req.params.id,
      ]
    );
    res.json({ message: 'Episode updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa tập phim
router.delete('/episodes/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM episodes WHERE id=?', [req.params.id]);
    res.json({ message: 'Episode deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/dubbing/voices', requireAdminMiddleware, async (req, res) => {
  const status = await getKokoroStatus();
  res.json({ voices: KOKORO_VOICES, service: status });
});

router.post('/admin/episodes/:id/dubbing/preview', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [episodes] = await db.execute('SELECT id FROM episodes WHERE id = ? LIMIT 1', [req.params.id]);
    if (!episodes.length) return res.status(404).json({ message: 'Tập phim không tồn tại.' });

    const result = await synthesizeEpisodePreview({
      episodeId: req.params.id,
      text: req.body?.text,
      voice: req.body?.voice,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.statusCode || 502).json({ message: err.message });
  }
});

router.get('/admin/dubbing/jobs', requireAdminMiddleware, async (req, res) => {
  try {
    const jobs = await listDubbingJobs(getDb(req), toPositiveInt(req.query.episode_id));
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/dubbing/jobs/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const job = await getDubbingJob(getDb(req), req.params.id);
    if (!job) return res.status(404).json({ message: 'Job lồng tiếng không tồn tại.' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/episodes/:id/dubbing/jobs', requireAdminMiddleware, async (req, res) => {
  try {
    const job = await createDubbingJob(getDb(req), {
      episodeId: req.params.id,
      subtitleId: toPositiveInt(req.body?.subtitle_id),
      voice: req.body?.voice || 'diem_trinh',
      sourceMode: req.body?.source_mode || 'subtitle',
      originalAudioVolume: req.body?.original_audio_volume,
      syncEnabled: req.body?.sync_enabled !== false,
      requestedBy: req.admin.userId,
    });
    res.status(201).json(job);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/admin/dubbing/jobs/:id/cancel', requireAdminMiddleware, async (req, res) => {
  try {
    const job = await cancelDubbingJob(getDb(req), req.params.id);
    if (!job) return res.status(404).json({ message: 'Job lồng tiếng không tồn tại.' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/episodes/:id/dubbing', requireAdminMiddleware, async (req, res) => {
  try {
    await removeEpisodeDubbing(getDb(req), req.params.id);
    res.json({ message: 'Đã xóa bản lồng tiếng của tập phim.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== CRUD ACTORS =====
router.post('/actors', requireAdminMiddleware, async (req, res) => {
  const { name, profile_pic_url, bio } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    await db.execute('INSERT INTO actors (name, profile_pic_url, bio) VALUES (?, ?, ?)', [name, profile_pic_url || null, bio || null]);
    res.json({ message: 'Actor added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.put('/actors/:id', requireAdminMiddleware, async (req, res) => {
  const { name, profile_pic_url, bio } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE actors SET name=?, profile_pic_url=?, bio=? WHERE id=?', [name, profile_pic_url || null, bio || null, req.params.id]);
    res.json({ message: 'Actor updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.delete('/actors/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM actors WHERE id=?', [req.params.id]);
    res.json({ message: 'Actor deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== CRUD DIRECTORS =====
router.get('/directors', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM directors ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.post('/directors', requireAdminMiddleware, async (req, res) => {
  const { name, profile_pic_url, bio } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    await db.execute('INSERT INTO directors (name, profile_pic_url, bio) VALUES (?, ?, ?)', [name, profile_pic_url || null, bio || null]);
    res.json({ message: 'Director added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.put('/directors/:id', requireAdminMiddleware, async (req, res) => {
  const { name, profile_pic_url, bio } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE directors SET name=?, profile_pic_url=?, bio=? WHERE id=?', [name, profile_pic_url || null, bio || null, req.params.id]);
    res.json({ message: 'Director updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.delete('/directors/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM directors WHERE id=?', [req.params.id]);
    res.json({ message: 'Director deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== CRUD BANNERS (update, delete) =====
router.put('/banners/:id', requireAdminMiddleware, async (req, res) => {
  const { movie_id, bg_url, title_url, thumbnails } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE banners SET movie_id=?, bg_url=?, title_url=?, thumbnails=? WHERE id=?', [movie_id, bg_url, title_url, JSON.stringify(thumbnails || []), req.params.id]);
    res.json({ message: 'Banner updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.delete('/banners/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM banners WHERE id=?', [req.params.id]);
    res.json({ message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== MOVIE RELATIONSHIP API =====
// Gắn thể loại cho phim
router.post('/movies/:id/genres', requireAdminMiddleware, async (req, res) => {
  const { genre_ids } = req.body; // array
  if (!Array.isArray(genre_ids)) return res.status(400).json({ message: 'genre_ids must be array' });
  try {
    const db = getDb(req);
    // Xóa hết genre cũ
    await db.execute('DELETE FROM movie_genres WHERE movie_id=?', [req.params.id]);
    // Thêm mới
    for (const gid of genre_ids) {
      await db.execute('INSERT INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [req.params.id, gid]);
    }
    res.json({ message: 'Genres updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Gắn quốc gia cho phim
router.post('/movies/:id/countries', requireAdminMiddleware, async (req, res) => {
  const { country_ids } = req.body;
  if (!Array.isArray(country_ids)) return res.status(400).json({ message: 'country_ids must be array' });
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM movie_countries WHERE movie_id=?', [req.params.id]);
    for (const cid of country_ids) {
      await db.execute('INSERT INTO movie_countries (movie_id, country_id) VALUES (?, ?)', [req.params.id, cid]);
    }
    res.json({ message: 'Countries updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Gắn diễn viên cho phim
router.post('/movies/:id/actors', requireAdminMiddleware, async (req, res) => {
  const { actor_ids } = req.body;
  if (!Array.isArray(actor_ids)) return res.status(400).json({ message: 'actor_ids must be array' });
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM movie_actors WHERE movie_id=?', [req.params.id]);
    for (const aid of actor_ids) {
      await db.execute('INSERT INTO movie_actors (movie_id, actor_id) VALUES (?, ?)', [req.params.id, aid]);
    }
    res.json({ message: 'Actors updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Gắn đạo diễn cho phim
router.post('/movies/:id/directors', requireAdminMiddleware, async (req, res) => {
  const { director_ids } = req.body;
  if (!Array.isArray(director_ids)) return res.status(400).json({ message: 'director_ids must be array' });
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM movie_directors WHERE movie_id=?', [req.params.id]);
    for (const did of director_ids) {
      await db.execute('INSERT INTO movie_directors (movie_id, director_id) VALUES (?, ?)', [req.params.id, did]);
    }
    res.json({ message: 'Directors updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====== USER LIBRARY API ======
router.get('/user/favorites', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    res.json(await getMovieCardsByJoin(db, 'user_favorites', userId, profileId));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/user/favorites', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { movie_id } = req.body;
    if (!userId || !movie_id) return res.status(400).json({ message: 'Thiếu user_id hoặc movie_id' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute('INSERT IGNORE INTO user_favorites (user_id, profile_id, movie_id) VALUES (?, ?, ?)', [userId, profileId, movie_id]);
    res.json({ success: true, message: 'Da them vao yeu thich' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/user/favorites/:movieId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute('DELETE FROM user_favorites WHERE user_id=? AND profile_id=? AND movie_id=?', [userId, profileId, req.params.movieId]);
    res.json({ success: true, message: 'Da xoa khoi yeu thich' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/user/watchlist', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    res.json(await getMovieCardsByJoin(db, 'user_watchlist', userId, profileId));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/user/watchlist', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { movie_id } = req.body;
    if (!userId || !movie_id) return res.status(400).json({ message: 'Thiếu user_id hoặc movie_id' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute('INSERT IGNORE INTO user_watchlist (user_id, profile_id, movie_id) VALUES (?, ?, ?)', [userId, profileId, movie_id]);
    res.json({ success: true, message: 'Da them vao danh sach' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/user/watchlist/:movieId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute('DELETE FROM user_watchlist WHERE user_id=? AND profile_id=? AND movie_id=?', [userId, profileId, req.params.movieId]);
    res.json({ success: true, message: 'Da xoa khoi danh sach' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/user/library-status/:movieId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ favorite: false, watchlist: false });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const [favoriteRows] = await db.execute(
      'SELECT 1 FROM user_favorites WHERE user_id=? AND profile_id=? AND movie_id=? LIMIT 1',
      [userId, profileId, req.params.movieId]
    );
    const [watchlistRows] = await db.execute(
      'SELECT 1 FROM user_watchlist WHERE user_id=? AND profile_id=? AND movie_id=? LIMIT 1',
      [userId, profileId, req.params.movieId]
    );
    res.json({ favorite: favoriteRows.length > 0, watchlist: watchlistRows.length > 0 });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/user/notifications', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chua dang nhap' });
    const db = getDb(req);
    const [rows] = await db.execute(
      `SELECT id, type, title, message, link_url, is_read, created_at
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(rows.map((row) => ({ ...row, is_read: Boolean(row.is_read) })));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/user/notifications/:id/read', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chua dang nhap' });
    const db = getDb(req);
    await db.execute(
      'UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/user/history', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const [rows] = await db.execute(
      `SELECT h.id AS history_id, h.episode_id, h.episode_number, h.progress_seconds,
              h.duration_seconds, h.completed, h.last_watched_at,
              m.id, m.title, m.original_title, m.poster_url, m.release_year, m.duration,
              m.imdb_rating, m.quality, e.title AS episode_title
       FROM user_watch_history h
       JOIN movies m ON h.movie_id = m.id
       LEFT JOIN episodes e ON h.episode_id = e.id
       WHERE h.user_id = ? AND h.profile_id = ?
       ORDER BY h.last_watched_at DESC`,
      [userId, profileId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/user/continue', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const limit = req.query.limit ? clampLimit(req.query.limit, 12) : null;
    const [rows] = await db.execute(
      `SELECT h.id AS history_id, h.episode_id, h.episode_number, h.progress_seconds,
              h.duration_seconds, h.completed, h.last_watched_at,
              m.id, m.title, m.original_title, m.poster_url, m.release_year, m.duration,
              m.imdb_rating, m.quality, e.title AS episode_title
       FROM user_watch_history h
       JOIN movies m ON h.movie_id = m.id
       LEFT JOIN episodes e ON h.episode_id = e.id
       WHERE h.user_id = ? AND h.profile_id = ?
         AND h.completed = 0
       ORDER BY h.last_watched_at DESC
       ${limit ? `LIMIT ${limit}` : ''}`,
      [userId, profileId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/user/watch-stats', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const watchedSecondsSql = `
      CASE
        WHEN h.completed = 1 AND h.duration_seconds > 0 THEN h.duration_seconds
        WHEN h.duration_seconds > 0 THEN LEAST(h.progress_seconds, h.duration_seconds)
        ELSE h.progress_seconds
      END
    `;

    const [[summary]] = await db.execute(
      `SELECT
         COUNT(*) AS total_entries,
         COUNT(DISTINCT h.movie_id) AS total_movies,
         SUM(CASE WHEN h.episode_id IS NOT NULL OR h.episode_number IS NOT NULL THEN 1 ELSE 0 END) AS total_episodes,
         SUM(CASE WHEN h.completed = 1 THEN 1 ELSE 0 END) AS completed_episodes,
         SUM(CASE WHEN h.completed = 0 THEN 1 ELSE 0 END) AS in_progress_count,
         COALESCE(SUM(${watchedSecondsSql}), 0) AS watch_seconds,
         COALESCE(AVG(CASE WHEN h.duration_seconds > 0 THEN LEAST(h.progress_seconds, h.duration_seconds) / h.duration_seconds ELSE NULL END), 0) AS avg_progress,
         COUNT(DISTINCT DATE(h.last_watched_at)) AS active_days,
         MIN(h.created_at) AS first_watched_at,
         MAX(h.last_watched_at) AS last_watched_at
       FROM user_watch_history h
       WHERE h.user_id = ? AND h.profile_id = ?`,
      [userId, profileId]
    );

    const [dayRows] = await db.execute(
      `SELECT DISTINCT DATE(last_watched_at) AS watch_date
       FROM user_watch_history
       WHERE user_id = ? AND profile_id = ?
       ORDER BY watch_date ASC`,
      [userId, profileId]
    );

    const [recentRows] = await db.execute(
      `SELECT DATE(h.last_watched_at) AS watch_date,
              COUNT(*) AS entries,
              COALESCE(SUM(${watchedSecondsSql}), 0) AS watch_seconds,
              SUM(CASE WHEN h.completed = 1 THEN 1 ELSE 0 END) AS completed_entries
       FROM user_watch_history h
       WHERE h.user_id = ? AND h.profile_id = ?
         AND h.last_watched_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(h.last_watched_at)
       ORDER BY watch_date ASC`,
      [userId, profileId]
    );

    const [topGenres] = await db.execute(
      `SELECT g.id, g.name,
              COUNT(*) AS entries,
              COUNT(DISTINCT h.movie_id) AS movies,
              COALESCE(SUM(${watchedSecondsSql}), 0) AS watch_seconds
       FROM user_watch_history h
       JOIN movie_genres mg ON h.movie_id = mg.movie_id
       JOIN genres g ON mg.genre_id = g.id
       WHERE h.user_id = ? AND h.profile_id = ?
       GROUP BY g.id, g.name
       ORDER BY watch_seconds DESC, entries DESC, g.name ASC
       LIMIT 5`,
      [userId, profileId]
    );

    const [topCountries] = await db.execute(
      `SELECT c.id, c.name,
              COUNT(*) AS entries,
              COUNT(DISTINCT h.movie_id) AS movies,
              COALESCE(SUM(${watchedSecondsSql}), 0) AS watch_seconds
       FROM user_watch_history h
       JOIN movie_countries mc ON h.movie_id = mc.movie_id
       JOIN countries c ON mc.country_id = c.id
       WHERE h.user_id = ? AND h.profile_id = ?
       GROUP BY c.id, c.name
       ORDER BY watch_seconds DESC, entries DESC, c.name ASC
       LIMIT 5`,
      [userId, profileId]
    );

    const [topMovies] = await db.execute(
      `SELECT m.id, m.title, m.original_title, m.poster_url,
              COUNT(*) AS entries,
              SUM(CASE WHEN h.completed = 1 THEN 1 ELSE 0 END) AS completed_entries,
              COALESCE(SUM(${watchedSecondsSql}), 0) AS watch_seconds,
              MAX(h.last_watched_at) AS last_watched_at
       FROM user_watch_history h
       JOIN movies m ON h.movie_id = m.id
       WHERE h.user_id = ? AND h.profile_id = ?
       GROUP BY m.id, m.title, m.original_title, m.poster_url
       ORDER BY watch_seconds DESC, last_watched_at DESC
       LIMIT 5`,
      [userId, profileId]
    );

    const totalEntries = Number(summary.total_entries) || 0;
    const completedEpisodes = Number(summary.completed_episodes) || 0;
    const completionRate = totalEntries > 0 ? Math.round((completedEpisodes / totalEntries) * 100) : 0;
    const streaks = calculateWatchStreaks(dayRows);

    res.json({
      total_entries: totalEntries,
      total_movies: Number(summary.total_movies) || 0,
      total_episodes: Number(summary.total_episodes) || totalEntries,
      completed_episodes: completedEpisodes,
      in_progress_count: Number(summary.in_progress_count) || 0,
      watch_seconds: Number(summary.watch_seconds) || 0,
      watch_minutes: Math.round((Number(summary.watch_seconds) || 0) / 60),
      avg_progress_percent: Math.round((Number(summary.avg_progress) || 0) * 100),
      active_days: Number(summary.active_days) || 0,
      completion_rate: completionRate,
      first_watched_at: summary.first_watched_at || null,
      last_watched_at: summary.last_watched_at || null,
      ...streaks,
      recent_activity: buildRecentWatchActivity(recentRows),
      top_genres: topGenres.map((item) => ({
        ...item,
        entries: Number(item.entries) || 0,
        movies: Number(item.movies) || 0,
        watch_seconds: Number(item.watch_seconds) || 0,
      })),
      top_countries: topCountries.map((item) => ({
        ...item,
        entries: Number(item.entries) || 0,
        movies: Number(item.movies) || 0,
        watch_seconds: Number(item.watch_seconds) || 0,
      })),
      top_movies: topMovies.map((item) => ({
        ...item,
        entries: Number(item.entries) || 0,
        completed_entries: Number(item.completed_entries) || 0,
        watch_seconds: Number(item.watch_seconds) || 0,
      })),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/watch-history/progress', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const movieId = toPositiveInt(req.query.movie_id);
    const episodeId = req.query.episode_id ? toPositiveInt(req.query.episode_id) : null;
    const episodeNumber = req.query.episode_number ? toPositiveInt(req.query.episode_number) : null;

    if (!movieId) return res.status(400).json({ message: 'Thiếu movie_id hợp lệ' });
    if (!episodeId && !episodeNumber) {
      return res.status(400).json({ message: 'Thiếu episode_id hoặc episode_number hợp lệ' });
    }

    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const params = [userId, profileId, movieId, episodeId || episodeNumber];
    const episodeCondition = episodeId ? 'h.episode_id = ?' : 'h.episode_number = ?';
    const [rows] = await db.execute(
      `SELECT h.id AS history_id, h.movie_id, h.episode_id, h.episode_number,
              h.progress_seconds, h.duration_seconds, h.completed, h.last_watched_at
       FROM user_watch_history h
       WHERE h.user_id = ? AND h.profile_id = ? AND h.movie_id = ? AND ${episodeCondition}
       LIMIT 1`,
      params
    );

    const progress = rows[0] || null;
    const shouldResume = Boolean(
      progress
      && Number(progress.duration_seconds) > 0
      && Number(progress.progress_seconds) > 5
      && Number(progress.progress_seconds) / Number(progress.duration_seconds) < 0.9
      && !progress.completed
    );

    res.json({ progress, should_resume: shouldResume });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/watch-history/progress', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const input = await getValidatedWatchProgressInput(db, req.body);
    await upsertWatchProgress(db, userId, profileId, input);

    res.json({
      success: true,
      progress_seconds: input.progress,
      duration_seconds: input.duration,
      completed: input.completed,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/user/history', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    const input = await getValidatedWatchProgressInput(db, req.body);
    await upsertWatchProgress(db, userId, profileId, input);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.delete('/user/history/:historyId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute('DELETE FROM user_watch_history WHERE user_id=? AND profile_id=? AND id=?', [userId, profileId, req.params.historyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

// ===== MOVIE FEEDBACK: RATINGS, COMMENTS, REPORTS =====
const COMMENT_SORTS = new Set(['newest', 'oldest', 'popular']);

function normalizeCommentText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toBooleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function getCommentSort(value) {
  const sort = String(value || 'newest').trim().toLowerCase();
  return COMMENT_SORTS.has(sort) ? sort : 'newest';
}

function sortCommentRoots(comments, sort) {
  return [...comments].sort((left, right) => {
    if (sort === 'oldest') return new Date(left.created_at) - new Date(right.created_at);
    if (sort === 'popular') {
      const likeGap = Number(right.like_count || 0) - Number(left.like_count || 0);
      if (likeGap) return likeGap;
      const replyGap = Number(right.reply_count || 0) - Number(left.reply_count || 0);
      if (replyGap) return replyGap;
    }
    return new Date(right.created_at) - new Date(left.created_at);
  });
}

function buildCommentTree(rows, sort) {
  const byId = new Map();
  const roots = [];

  for (const row of rows) {
    const comment = {
      ...row,
      is_spoiler: Boolean(row.is_spoiler),
      my_liked: Boolean(row.my_liked),
      like_count: Number(row.like_count) || 0,
      report_count: Number(row.report_count) || 0,
      reply_count: 0,
      replies: [],
    };
    byId.set(Number(comment.id), comment);
  }

  for (const comment of byId.values()) {
    const parentId = Number(comment.parent_id);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  for (const root of roots) {
    root.replies.sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
    root.reply_count = root.replies.length;
  }

  return sortCommentRoots(roots, sort);
}

async function assertCommentVisible(db, commentId) {
  const [rows] = await db.execute(
    `SELECT c.id, c.movie_id, c.parent_id, c.status, m.is_visible
     FROM movie_comments c
     JOIN movies m ON m.id = c.movie_id
     WHERE c.id = ?
     LIMIT 1`,
    [commentId]
  );
  const comment = rows[0];
  if (!comment || comment.status !== 'visible' || Number(comment.is_visible) !== 1) {
    const error = new Error('Bình luận không tồn tại');
    error.statusCode = 404;
    throw error;
  }
  return comment;
}

async function ensureCommentCanPost(db, userId, movieId, content) {
  const [recentRows] = await db.execute(
    `SELECT content, created_at
     FROM movie_comments
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const latest = recentRows[0];
  if (latest && Date.now() - new Date(latest.created_at).getTime() < 30 * 1000) {
    const error = new Error('Bạn gửi bình luận hơi nhanh. Thử lại sau vài giây nhé.');
    error.statusCode = 429;
    throw error;
  }

  const [duplicateRows] = await db.execute(
    `SELECT id
     FROM movie_comments
     WHERE user_id = ?
       AND movie_id = ?
       AND LOWER(TRIM(content)) = LOWER(TRIM(?))
       AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     LIMIT 1`,
    [userId, movieId, content]
  );
  if (duplicateRows.length) {
    const error = new Error('Bình luận này vừa được gửi. Hãy viết thêm nội dung khác nhé.');
    error.statusCode = 429;
    throw error;
  }
}

const REPORT_STATUSES = new Set(['new', 'processing', 'resolved', 'rejected']);
const REPORT_TYPES = new Set(['playback', 'wrong_episode', 'audio', 'subtitle', 'dead_link', 'metadata', 'other']);

function normalizeReportSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function normalizeReportType(value, reason = '') {
  const direct = String(value || '').trim().toLowerCase();
  if (REPORT_TYPES.has(direct)) return direct;

  const normalizedReason = normalizeReportSearchText(reason);
  if (normalizedReason.includes('link') || normalizedReason.includes('die')) return 'dead_link';
  if (normalizedReason.includes('sai tap')) return 'wrong_episode';
  if (normalizedReason.includes('am thanh') || normalizedReason.includes('audio')) return 'audio';
  if (normalizedReason.includes('phu de') || normalizedReason.includes('subtitle') || normalizedReason.includes('sub')) return 'subtitle';
  if (normalizedReason.includes('thong tin')) return 'metadata';
  if (normalizedReason.includes('video') || normalizedReason.includes('khong phat') || normalizedReason.includes('khong chay')) return 'playback';
  return 'other';
}

async function createMovieReport(db, { userId, movieId, episodeId, reason, description, reportType }) {
  const normalizedMovieId = toPositiveInt(movieId);
  const normalizedEpisodeId = episodeId ? toPositiveInt(episodeId) : null;
  const cleanReason = normalizeCommentText(reason).slice(0, 100);
  const cleanDescription = normalizeCommentText(description).slice(0, 1000) || null;
  const cleanType = normalizeReportType(reportType, cleanReason);

  if (!normalizedMovieId) {
    const error = new Error('Thieu movie_id hop le');
    error.statusCode = 400;
    throw error;
  }
  if (!cleanReason) {
    const error = new Error('Vui long chon ly do bao loi');
    error.statusCode = 400;
    throw error;
  }

  const [movieRows] = await db.execute('SELECT id FROM movies WHERE id = ? LIMIT 1', [normalizedMovieId]);
  if (!movieRows.length) {
    const error = new Error('Phim khong ton tai');
    error.statusCode = 404;
    throw error;
  }

  if (normalizedEpisodeId) {
    const [episodeRows] = await db.execute(
      'SELECT id FROM episodes WHERE id = ? AND movie_id = ? LIMIT 1',
      [normalizedEpisodeId, normalizedMovieId]
    );
    if (!episodeRows.length) {
      const error = new Error('Tap phim khong ton tai hoac khong thuoc phim nay');
      error.statusCode = 400;
      throw error;
    }
  }

  const [result] = await db.execute(
    `INSERT INTO movie_reports (user_id, movie_id, episode_id, reason, report_type, description, status)
     VALUES (?, ?, ?, ?, ?, ?, 'new')`,
    [userId || null, normalizedMovieId, normalizedEpisodeId, cleanReason, cleanType, cleanDescription]
  );

  return {
    id: result.insertId,
    movie_id: normalizedMovieId,
    episode_id: normalizedEpisodeId,
    report_type: cleanType,
    reason: cleanReason,
    status: 'new',
  };
}

async function notifyReportResolved(db, reportId, adminNote = '') {
  const [rows] = await db.execute(
    `SELECT r.id, r.user_id, r.movie_id, r.episode_id, r.reason, r.admin_note, r.notified_at,
            m.title AS movie_title, e.episode_number
     FROM movie_reports r
     JOIN movies m ON m.id = r.movie_id
     LEFT JOIN episodes e ON e.id = r.episode_id
     WHERE r.id = ?
     LIMIT 1`,
    [reportId]
  );
  const report = rows[0];
  if (!report?.user_id || report.notified_at) return false;

  const episodeText = report.episode_number ? ` - Tap ${report.episode_number}` : '';
  const note = normalizeCommentText(adminNote || report.admin_note);
  await db.execute(
    `INSERT INTO user_notifications (user_id, type, title, message, link_url)
     VALUES (?, 'report_resolved', ?, ?, ?)`,
    [
      report.user_id,
      'Bao loi video da duoc xu ly',
      `Bao loi cua ban cho "${report.movie_title}${episodeText}" da duoc xu ly.${note ? ` Ghi chu admin: ${note}` : ''}`,
      `/watch/${report.movie_id}${report.episode_number ? `?ep=${report.episode_number}` : ''}`,
    ]
  );
  await db.execute('UPDATE movie_reports SET notified_at = NOW() WHERE id = ?', [reportId]);
  return true;
}

router.get('/movies/:id/ratings', async (req, res) => {
  try {
    const db = getDb(req);
    const userId = getUserId(req);
    const [[summary]] = await db.execute(
      'SELECT ROUND(AVG(rating), 1) AS average_rating, COUNT(*) AS rating_count FROM movie_ratings WHERE movie_id = ?',
      [req.params.id]
    );
    let myRating = null;
    if (userId) {
      const profileId = await resolveProfileId(db, userId, profileHeader(req));
      const [mine] = await db.execute(
        'SELECT rating FROM movie_ratings WHERE movie_id = ? AND user_id = ? AND profile_id = ? LIMIT 1',
        [req.params.id, userId, profileId]
      );
      myRating = mine[0]?.rating || null;
    }
    res.json({
      average_rating: summary.average_rating ? Number(summary.average_rating) : 0,
      rating_count: Number(summary.rating_count) || 0,
      my_rating: myRating,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/movies/:id/ratings', async (req, res) => {
  try {
    const userId = getUserId(req);
    const rating = Number(req.body.rating);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return res.status(400).json({ message: 'Điểm đánh giá phải từ 1 đến 10' });
    }
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, profileHeader(req));
    await db.execute(
      `INSERT INTO movie_ratings (user_id, profile_id, movie_id, rating)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()`,
      [userId, profileId, req.params.id, rating]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/movies/:id/comments', async (req, res, next) => {
  if (req.query.legacy === '1') return next();
  try {
    const db = getDb(req);
    const userId = getUserId(req) || 0;
    const sort = getCommentSort(req.query.sort);
    const [rows] = await db.execute(
      `SELECT c.id, c.parent_id, c.content, c.is_spoiler, c.status, c.report_count,
              c.created_at, c.updated_at, u.username,
              COALESCE(likes.like_count, 0) AS like_count,
              CASE WHEN my_like.user_id IS NULL THEN 0 ELSE 1 END AS my_liked
       FROM movie_comments c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN (
         SELECT comment_id, COUNT(*) AS like_count
         FROM movie_comment_likes
         GROUP BY comment_id
       ) likes ON likes.comment_id = c.id
       LEFT JOIN movie_comment_likes my_like
         ON my_like.comment_id = c.id AND my_like.user_id = ?
       WHERE c.movie_id = ? AND c.status = 'visible'
       ORDER BY c.created_at ASC`,
      [userId, req.params.id]
    );

    res.json({
      sort,
      total: rows.length,
      comments: buildCommentTree(rows, sort),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/movies/:id/comments/legacy', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute(
      `SELECT c.id, c.content, c.created_at, c.updated_at, u.username
       FROM movie_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.movie_id = ? AND c.status = 'visible'
       ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/movies/:id/comments', async (req, res, next) => {
  if (req.query.legacy === '1') return next();
  try {
    const userId = getUserId(req);
    const content = normalizeCommentText(req.body.content);
    const parentId = req.body.parent_id ? toPositiveInt(req.body.parent_id) : null;
    const isSpoiler = toBooleanFlag(req.body.is_spoiler);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    if (!content) return res.status(400).json({ message: 'Nội dung bình luận không được trống' });
    if (content.length > 1000) return res.status(400).json({ message: 'Bình luận tối đa 1000 ký tự' });

    const db = getDb(req);
    const movieId = toPositiveInt(req.params.id);
    if (!movieId) return res.status(400).json({ message: 'Thiếu movie_id hợp lệ' });

    if (parentId) {
      const [parentRows] = await db.execute(
        `SELECT id
         FROM movie_comments
         WHERE id = ? AND movie_id = ? AND status = 'visible'
         LIMIT 1`,
        [parentId, movieId]
      );
      if (!parentRows.length) return res.status(404).json({ message: 'Bình luận gốc không tồn tại' });
    }

    await ensureCommentCanPost(db, userId, movieId, content);
    await db.execute(
      'INSERT INTO movie_comments (user_id, movie_id, parent_id, content, is_spoiler, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, movieId, parentId, content, isSpoiler ? 1 : 0, 'visible']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/movies/:id/comments/legacy', async (req, res) => {
  try {
    const userId = getUserId(req);
    const content = String(req.body.content || '').trim();
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    if (!content) return res.status(400).json({ message: 'Nội dung bình luận không được trống' });
    if (content.length > 1000) return res.status(400).json({ message: 'Binh luan toi da 1000 ky tu' });
    const db = getDb(req);
    await db.execute(
      'INSERT INTO movie_comments (user_id, movie_id, content) VALUES (?, ?, ?)',
      [userId, req.params.id, content]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/comments/:id/like', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chua dang nhap' });

    const db = getDb(req);
    const comment = await assertCommentVisible(db, req.params.id);
    const [existing] = await db.execute(
      'SELECT 1 FROM movie_comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1',
      [comment.id, userId]
    );

    let liked = false;
    if (existing.length) {
      await db.execute(
        'DELETE FROM movie_comment_likes WHERE comment_id = ? AND user_id = ?',
        [comment.id, userId]
      );
    } else {
      await db.execute(
        'INSERT IGNORE INTO movie_comment_likes (comment_id, user_id) VALUES (?, ?)',
        [comment.id, userId]
      );
      liked = true;
    }

    const [[summary]] = await db.execute(
      'SELECT COUNT(*) AS like_count FROM movie_comment_likes WHERE comment_id = ?',
      [comment.id]
    );
    res.json({ success: true, liked, like_count: Number(summary.like_count) || 0 });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/comments/:id/report', async (req, res) => {
  try {
    const userId = getUserId(req) || null;
    const reason = normalizeCommentText(req.body.reason || 'Noi dung khong phu hop').slice(0, 120);
    const description = normalizeCommentText(req.body.description).slice(0, 1000) || null;

    if (!reason) return res.status(400).json({ message: 'Vui long chon ly do bao cao' });

    const db = getDb(req);
    const comment = await assertCommentVisible(db, req.params.id);
    await db.execute(
      `INSERT INTO movie_comment_reports (comment_id, user_id, reason, description)
       VALUES (?, ?, ?, ?)`,
      [comment.id, userId, reason, description]
    );
    await db.execute(
      `UPDATE movie_comments
       SET report_count = report_count + 1,
           status = CASE WHEN report_count + 1 >= 3 THEN 'pending' ELSE status END
       WHERE id = ?`,
      [comment.id]
    );

    res.json({ success: true, message: 'Da gui bao cao binh luan.' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/movies/:id/reports', async (req, res) => {
  try {
    const userId = getUserId(req) || null;
    const db = getDb(req);
    const report = await createMovieReport(db, {
      userId,
      movieId: req.params.id,
      episodeId: req.body.episode_id,
      reason: req.body.reason,
      description: req.body.description,
      reportType: req.body.report_type,
    });
    res.json({ success: true, report, message: 'Da gui bao loi video.' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/movie-reports', async (req, res) => {
  try {
    const userId = getUserId(req) || null;
    const db = getDb(req);
    const report = await createMovieReport(db, {
      userId,
      movieId: req.body?.movie_id,
      episodeId: req.body?.episode_id,
      reason: req.body?.reason,
      description: req.body?.description,
      reportType: req.body?.report_type,
    });

    res.json({ success: true, report, message: 'Da gui bao loi video.' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/admin/comments', async (req, res) => {  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const [rows] = await auth.db.execute(
      `SELECT c.id, c.parent_id, c.content, c.status, c.is_spoiler, c.report_count,
              c.created_at, c.updated_at,
              u.username, u.email, m.id AS movie_id, m.title AS movie_title,
              COALESCE(likes.like_count, 0) AS like_count,
              COALESCE(replies.reply_count, 0) AS reply_count,
              COALESCE(open_reports.open_report_count, 0) AS open_report_count
       FROM movie_comments c
       JOIN users u ON c.user_id = u.id
       JOIN movies m ON c.movie_id = m.id
       LEFT JOIN (
         SELECT comment_id, COUNT(*) AS like_count
         FROM movie_comment_likes
         GROUP BY comment_id
       ) likes ON likes.comment_id = c.id
       LEFT JOIN (
         SELECT parent_id, COUNT(*) AS reply_count
         FROM movie_comments
         WHERE parent_id IS NOT NULL AND status <> 'deleted'
         GROUP BY parent_id
       ) replies ON replies.parent_id = c.id
       LEFT JOIN (
         SELECT comment_id, COUNT(*) AS open_report_count
         FROM movie_comment_reports
         WHERE status = 'open'
         GROUP BY comment_id
       ) open_reports ON open_reports.comment_id = c.id
       WHERE c.status <> 'deleted'
       ORDER BY FIELD(c.status, 'pending', 'visible', 'hidden', 'deleted'), c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/admin/comments/:id', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const allowedStatuses = new Set(['pending', 'visible', 'hidden', 'deleted']);
    const status = allowedStatuses.has(req.body.status) ? req.body.status : 'visible';
    await auth.db.execute('UPDATE movie_comments SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/comments/:id', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    await auth.db.execute('DELETE FROM movie_comments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/reports', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const filters = [];
    const params = [];
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const reportType = String(req.query.type || 'all').trim().toLowerCase();
    const priority = String(req.query.priority || 'all').trim().toLowerCase();

    if (REPORT_STATUSES.has(status)) {
      filters.push('r.status = ?');
      params.push(status);
    }
    if (REPORT_TYPES.has(reportType)) {
      filters.push('r.report_type = ?');
      params.push(reportType);
    }
    if (priority === 'high') {
      filters.push("COALESCE(priority_report.active_report_count, 1) >= 2");
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await auth.db.execute(
      `SELECT r.id, r.reason, r.report_type, r.description, r.status, r.admin_note,
              r.resolved_at, r.notified_at, r.created_at, r.updated_at,
              u.username, u.email, m.id AS movie_id, m.title AS movie_title,
              e.id AS episode_id, e.episode_number, e.title AS episode_title, e.video_url,
              COALESCE(priority_report.duplicate_count, 1) AS duplicate_count,
              COALESCE(priority_report.active_report_count, 1) AS active_report_count
       FROM movie_reports r
       LEFT JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       LEFT JOIN episodes e ON r.episode_id = e.id
       LEFT JOIN (
         SELECT movie_id, COALESCE(episode_id, 0) AS episode_key, report_type,
                COUNT(*) AS duplicate_count,
                SUM(CASE WHEN status IN ('new', 'processing') THEN 1 ELSE 0 END) AS active_report_count
         FROM movie_reports
         GROUP BY movie_id, COALESCE(episode_id, 0), report_type
        ) priority_report
          ON priority_report.movie_id = r.movie_id
         AND priority_report.episode_key = COALESCE(r.episode_id, 0)
         AND priority_report.report_type = r.report_type
        ${whereSql}
        ORDER BY FIELD(r.status, 'new', 'processing', 'resolved', 'rejected'),
                active_report_count DESC, duplicate_count DESC, r.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/admin/reports/:id', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const status = REPORT_STATUSES.has(req.body.status) ? req.body.status : 'new';
    const adminNote = String(req.body.admin_note || '').trim() || null;
    await auth.db.execute(
      `UPDATE movie_reports
       SET status = ?,
           admin_note = ?,
           resolved_at = CASE WHEN ? = 'resolved' THEN NOW() ELSE resolved_at END
       WHERE id = ?`,
      [status, adminNote, status, req.params.id]
    );
    const notificationSent = status === 'resolved'
      ? await notifyReportResolved(auth.db, req.params.id, adminNote)
      : false;
    res.json({ success: true, notification_sent: notificationSent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/reports/:id/test-link', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const [rows] = await auth.db.execute(
      `SELECT r.id, r.movie_id, r.episode_id, e.video_url
       FROM movie_reports r
       LEFT JOIN episodes e ON e.id = r.episode_id
       WHERE r.id = ?
       LIMIT 1`,
      [req.params.id]
    );
    const report = rows[0];
    if (!report) return res.status(404).json({ message: 'Report khong ton tai' });
    if (!report.video_url) {
      return res.json({ ok: false, status: null, video_url: null, message: 'Report chua co link tap de test.' });
    }

    let status = null;
    let ok = true;
    let message = 'Link co dinh dang hop le.';
    if (/^https?:\/\//i.test(report.video_url)) {
      try {
        const response = await fetch(report.video_url, { method: 'HEAD' });
        status = response.status;
        ok = response.ok || response.status === 403 || response.status === 405;
        message = ok ? 'Link co phan hoi.' : 'Link co the dang loi.';
      } catch (error) {
        ok = false;
        message = error.message || 'Khong the kiem tra link.';
      }
    }

    res.json({ ok, status, video_url: report.video_url, message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/reports/:id', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    await auth.db.execute('DELETE FROM movie_reports WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ====== PROFILE API ======
// Lấy thông tin profile user
router.get('/user/profile', async (req, res) => {
  try {
    // Lấy user_id từ query hoặc session (ở đây giả lập lấy từ query)
    const user_id = req.query?.user_id || req.body?.user_id || req.headers?.['x-user-id'];
    if (!user_id) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const db = getDb(req);
    const [rows] = await db.execute(
      'SELECT id, username, email, gender, avatar_url, phone, birth_date FROM users WHERE id = ?',
      [user_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy user' });
    const profile = rows[0];
    res.json({
      ...profile,
      avatar: profile.avatar_url,
      birth_date: formatDateOnly(profile.birth_date),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cập nhật thông tin profile user
router.put('/user/profile', async (req, res) => {
  try {
    // Lấy user_id từ body hoặc headers (giả lập)
    const user_id = req.body?.user_id || req.headers?.['x-user-id'];
    if (!user_id) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const { username, gender, avatar_url, avatar, phone, birth_date } = req.body;
    if (!username) return res.status(400).json({ error: 'Thiếu tên hiển thị' });
    const db = getDb(req);
    const cleanAvatar = cleanImageUrl(avatar_url || avatar);
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanBirthDate = birth_date ? String(birth_date).slice(0, 10) : null;
    await db.execute(
      'UPDATE users SET username = ?, gender = ?, avatar_url = ?, phone = ?, birth_date = ? WHERE id = ?',
      [username, gender || 'other', cleanAvatar, cleanPhone, cleanBirthDate, user_id]
    );
    const [rows] = await db.execute(
      'SELECT id, username, email, gender, avatar_url, phone, birth_date, is_admin, email_verified, is_active FROM users WHERE id = ?',
      [user_id]
    );
    const profile = rows[0];
    res.json({
      success: true,
      user: {
        ...profile,
        avatar: profile.avatar_url,
        birth_date: formatDateOnly(profile.birth_date),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đổi mật khẩu
router.post('/user/change-password', async (req, res) => {
  try {
    const user_id = req.body?.user_id || req.headers?.['x-user-id'];
    const { oldPassword, newPassword } = req.body;
    if (!user_id || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Thiếu thông tin' });
    }
    const db = getDb(req);
    // Lấy user
    const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [user_id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy user' });
    const user = rows[0];
    // So sánh mật khẩu cũ
    const match = await require('bcrypt').compare(oldPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Mật khẩu cũ không đúng' });
    // Hash mật khẩu mới
    const hash = await require('bcrypt').hash(newPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hash, user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CRUD PRODUCERS =====
router.get('/producers', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM producers ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.post('/producers', requireAdminMiddleware, async (req, res) => {
  const { name, country_id } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    await db.execute('INSERT INTO producers (name, country_id) VALUES (?, ?)', [name, country_id || null]);
    res.json({ message: 'Producer added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.put('/producers/:id', requireAdminMiddleware, async (req, res) => {
  const { name, country_id } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE producers SET name=?, country_id=? WHERE id=?', [name, country_id || null, req.params.id]);
    res.json({ message: 'Producer updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.delete('/producers/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM producers WHERE id=?', [req.params.id]);
    res.json({ message: 'Producer deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== USER MANAGEMENT (ADMIN) =====
// Lấy danh sách user
router.get('/users', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT id, username, email, is_admin, email_verified, is_active, gender, vip_until, (vip_until IS NOT NULL AND vip_until > NOW()) AS is_vip, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Cập nhật quyền admin
router.put('/users/:id/admin', requireAdminMiddleware, async (req, res) => {
  const { is_admin } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE users SET is_admin=? WHERE id=?', [is_admin ? 1 : 0, req.params.id]);
    res.json({ message: 'Cập nhật quyền admin thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật trạng thái khóa/mở khóa tài khoản
router.put('/users/:id/status', requireAdminMiddleware, async (req, res) => {
  const { is_active } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE users SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
    res.json({ message: 'Cập nhật trạng thái tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Xóa user
router.delete('/users/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa thông tin user
router.put('/users/:id', requireAdminMiddleware, async (req, res) => {
  const { username, email, gender } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE users SET username=?, email=?, gender=? WHERE id=?', [username, email, gender, req.params.id]);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== ADMIN DASHBOARD STATS =====

// ==================== ADMIN DASHBOARD STATS API ====================
router.get('/admin/dashboard-stats', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const range = req.query.range || '7d';
    
    // Determine the date filter for queries that depend on range
    let dateCondition = '';
    let viewsDateCondition = '';
    
    if (range === '7d') {
      dateCondition = '>= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
      viewsDateCondition = '>= DATE_SUB(CURDATE(), INTERVAL 6 DAY)'; // Keep 7 days including today
    } else if (range === '30d') {
      dateCondition = '>= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      viewsDateCondition = '>= DATE_SUB(CURDATE(), INTERVAL 29 DAY)';
    }

    // 1. Overview Stats
    const [[{ total_movies }]] = await db.query('SELECT COUNT(*) as total_movies FROM movies');
    const [[{ total_episodes }]] = await db.query('SELECT COUNT(*) as total_episodes FROM episodes');
    const [[{ total_users }]] = await db.query('SELECT COUNT(*) as total_users FROM users');
    const [[{ total_views }]] = await db.query('SELECT COALESCE(SUM(views), 0) as total_views FROM movies');
    const [[{ ongoing_movies }]] = await db.query("SELECT COUNT(*) as ongoing_movies FROM movies WHERE status='ongoing'");
    
    // Report workflow
    const [[{ open_reports }]] = await db.query("SELECT COUNT(*) as open_reports FROM movie_reports WHERE status IN ('new', 'processing')");
    const [[{ new_reports }]] = await db.query("SELECT COUNT(*) as new_reports FROM movie_reports WHERE status='new'");
    const [[{ processing_reports }]] = await db.query("SELECT COUNT(*) as processing_reports FROM movie_reports WHERE status='processing'");
    
    // New comments (created today or within range, let's just count comments created in the range, or just today if all)
    let newCommentsQuery = "SELECT COUNT(*) as new_comments FROM movie_comments";
    if (dateCondition) {
      newCommentsQuery += ` WHERE created_at ${dateCondition}`;
    }
    const [[{ new_comments }]] = await db.query(newCommentsQuery);

    const [[{ total_subtitles }]] = await db.query('SELECT COUNT(*) as total_subtitles FROM episode_subtitles');
    const active_providers = [
      process.env.OPENSUBTITLES_API_KEY,
      process.env.SUBDL_API_KEY
    ].filter(Boolean).length;

    // 2. Charts Data
    
    // Daily views
    let dailyViewsQuery = `
      SELECT DATE(viewed_at) AS date, COUNT(*) AS views
      FROM movie_views
    `;
    if (viewsDateCondition) {
      dailyViewsQuery += ` WHERE viewed_at ${viewsDateCondition}`;
    }
    dailyViewsQuery += `
      GROUP BY DATE(viewed_at)
      ORDER BY DATE(viewed_at) ASC
    `;
    const [daily_views] = await db.query(dailyViewsQuery);

    // Top movies
    let topMoviesQuery = `
      SELECT id, title, poster_url, views 
      FROM movies 
      ORDER BY views DESC, created_at DESC 
      LIMIT 10
    `;
    // Note: since movie views aren't aggregated by date in the movies table, 
    // the true 'top movies in range' would require joining movie_views.
    // For simplicity and performance, if range is not 'all', we calculate top movies from movie_views.
    if (dateCondition) {
      topMoviesQuery = `
        SELECT m.id, m.title, m.poster_url, COUNT(v.id) as views
        FROM movies m
        JOIN movie_views v ON m.id = v.movie_id
        WHERE v.viewed_at ${dateCondition}
        GROUP BY m.id, m.title, m.poster_url
        ORDER BY views DESC
        LIMIT 10
      `;
    }
    const [top_movies] = await db.query(topMoviesQuery);

    // Top genres
    // Similar logic: if range provided, count from movie_views, else sum from movies
    let topGenresQuery = `
      SELECT g.name, COALESCE(SUM(m.views), 0) AS views
      FROM genres g
      JOIN movie_genres mg ON g.id = mg.genre_id
      JOIN movies m ON mg.movie_id = m.id
      GROUP BY g.id, g.name
      ORDER BY views DESC
      LIMIT 5
    `;
    if (dateCondition) {
      topGenresQuery = `
        SELECT g.name, COUNT(v.id) AS views
        FROM genres g
        JOIN movie_genres mg ON g.id = mg.genre_id
        JOIN movie_views v ON mg.movie_id = v.movie_id
        WHERE v.viewed_at ${dateCondition}
        GROUP BY g.id, g.name
        ORDER BY views DESC
        LIMIT 5
      `;
    }
    const [top_genres] = await db.query(topGenresQuery);

    // Top countries
    let topCountriesQuery = `
      SELECT c.name, COALESCE(SUM(m.views), 0) AS views
      FROM countries c
      JOIN movie_countries mc ON c.id = mc.country_id
      JOIN movies m ON mc.movie_id = m.id
      GROUP BY c.id, c.name
      ORDER BY views DESC
      LIMIT 5
    `;
    if (dateCondition) {
      topCountriesQuery = `
        SELECT c.name, COUNT(v.id) AS views
        FROM countries c
        JOIN movie_countries mc ON c.id = mc.country_id
        JOIN movie_views v ON mc.movie_id = v.movie_id
        WHERE v.viewed_at ${dateCondition}
        GROUP BY c.id, c.name
        ORDER BY views DESC
        LIMIT 5
      `;
    }
    const [top_countries] = await db.query(topCountriesQuery);

    // Movie Types (Single vs Series)
    const [[{ series_count }]] = await db.query("SELECT COUNT(*) as series_count FROM movies WHERE is_series = 1");
    const [[{ single_count }]] = await db.query("SELECT COUNT(*) as single_count FROM movies WHERE is_series = 0");
    const movie_types = [
      { name: 'Phim bộ', value: series_count },
      { name: 'Phim lẻ', value: single_count }
    ];

    // Report Stats
    let reportStatsQuery = `
      SELECT status, COUNT(*) as count 
      FROM movie_reports 
    `;
    if (dateCondition) {
      reportStatsQuery += ` WHERE created_at ${dateCondition} `;
    }
    reportStatsQuery += ` GROUP BY status `;
    const [reportStatsRows] = await db.query(reportStatsQuery);
    
    const report_stats = {
      new: 0,
      processing: 0,
      resolved: 0,
      rejected: 0
    };
    reportStatsRows.forEach(row => {
      if (report_stats[row.status] !== undefined) {
        report_stats[row.status] = row.count;
      }
    });

    let reportTypeStatsQuery = `
      SELECT report_type, COUNT(*) AS count
      FROM movie_reports
    `;
    if (dateCondition) {
      reportTypeStatsQuery += ` WHERE created_at ${dateCondition} `;
    }
    reportTypeStatsQuery += ' GROUP BY report_type ORDER BY count DESC ';
    const [report_type_stats] = await db.query(reportTypeStatsQuery);

    const [top_report_groups] = await db.query(`
      SELECT r.movie_id, r.episode_id, r.report_type, COUNT(*) AS report_count,
             SUM(CASE WHEN r.status IN ('new', 'processing') THEN 1 ELSE 0 END) AS active_count,
             m.title AS movie_title, e.episode_number
      FROM movie_reports r
      JOIN movies m ON m.id = r.movie_id
      LEFT JOIN episodes e ON e.id = r.episode_id
      WHERE r.status IN ('new', 'processing')
      GROUP BY r.movie_id, r.episode_id, r.report_type, m.title, e.episode_number
      ORDER BY active_count DESC, report_count DESC, MAX(r.created_at) DESC
      LIMIT 8
    `);

    // 3. Report Table (Recent reports)
    let recentReportsQuery = `
      SELECT r.*, m.title as movie_title, u.username as reporter_name, e.episode_number
      FROM movie_reports r
      LEFT JOIN movies m ON r.movie_id = m.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN episodes e ON r.episode_id = e.id
    `;
    if (dateCondition) {
      recentReportsQuery += ` WHERE r.created_at ${dateCondition} `;
    }
    recentReportsQuery += ` ORDER BY r.created_at DESC LIMIT 10 `;
    const [recent_reports] = await db.query(recentReportsQuery);

    res.json({
      overview: {
        total_movies,
        total_episodes,
        total_users,
        total_views: Number(total_views) || 0,
        ongoing_movies,
        open_reports,
        new_reports,
        processing_reports,
        new_comments,
        total_subtitles,
        active_providers
      },
      charts: {
        daily_views,
        top_movies,
        top_genres,
        top_countries,
        movie_types,
        report_stats,
        report_type_stats,
        top_report_groups
      },
      recent_reports
    });

  } catch (err) {
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/admin/stats', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [[{ total_movies }]] = await db.query('SELECT COUNT(*) as total_movies FROM movies');
    const [[{ total_genres }]] = await db.query('SELECT COUNT(*) as total_genres FROM genres');
    const [[{ total_countries }]] = await db.query('SELECT COUNT(*) as total_countries FROM countries');
    const [[{ total_users }]] = await db.query('SELECT COUNT(*) as total_users FROM users');
    const [[{ ongoing_movies }]] = await db.query("SELECT COUNT(*) as ongoing_movies FROM movies WHERE status='ongoing'");
    const [[{ completed_movies }]] = await db.query("SELECT COUNT(*) as completed_movies FROM movies WHERE status='completed'");
    const [[{ total_views }]] = await db.query('SELECT COALESCE(SUM(views), 0) as total_views FROM movies');
    const [[{ today_views }]] = await db.query('SELECT COUNT(*) as today_views FROM movie_views WHERE DATE(viewed_at) = CURDATE()');
    const [recent_movies] = await db.query('SELECT id, title, poster_url, created_at FROM movies ORDER BY created_at DESC LIMIT 8');
    const [top_viewed_movies] = await db.query('SELECT id, title, poster_url, views FROM movies ORDER BY views DESC, created_at DESC LIMIT 8');
    const [daily_views] = await db.query(`
      SELECT DATE(viewed_at) AS date, COUNT(*) AS views
      FROM movie_views
      WHERE viewed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(viewed_at)
      ORDER BY DATE(viewed_at) ASC
    `);
    const [genre_views] = await db.query(`
      SELECT g.name, COALESCE(SUM(m.views), 0) AS views, COUNT(DISTINCT m.id) AS movie_count
      FROM genres g
      JOIN movie_genres mg ON g.id = mg.genre_id
      JOIN movies m ON mg.movie_id = m.id
      GROUP BY g.id, g.name
      ORDER BY views DESC, movie_count DESC
      LIMIT 8
    `);
    res.json({
      total_movies,
      total_genres,
      total_countries,
      total_users,
      ongoing_movies,
      completed_movies,
      total_views: Number(total_views) || 0,
      today_views: Number(today_views) || 0,
      recent_movies,
      top_viewed_movies,
      daily_views,
      genre_views
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy thông báo khẩn cấp cho Alert Center
router.get('/admin/dashboard-alerts', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [[{ has_backdrop_column }]] = await db.query(`
      SELECT COUNT(*) AS has_backdrop_column
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'movies'
        AND COLUMN_NAME = 'backdrop_url'
    `);
    const movieImageWhere = has_backdrop_column
      ? "poster_url IS NULL OR poster_url = '' OR backdrop_url IS NULL OR backdrop_url = ''"
      : "poster_url IS NULL OR poster_url = ''";

    // 1. Report mới
    const [[{ new_reports }]] = await db.query("SELECT COUNT(*) AS count FROM movie_reports WHERE status = 'new'");

    // 2. Video lỗi nhiều người báo
    const [[{ high_report_episodes }]] = await db.query(`
      SELECT COUNT(*) AS count FROM (
        SELECT episode_id FROM movie_reports 
        WHERE status IN ('new', 'processing') AND episode_id IS NOT NULL 
        GROUP BY episode_id HAVING COUNT(*) >= 2
      ) t
    `);

    // 3. Phim thiếu poster/backdrop
    const [[{ missing_images }]] = await db.query(`
      SELECT COUNT(*) AS count FROM movies
      WHERE ${movieImageWhere}
    `);

    // 4. Tập thiếu nguồn phát
    const [[{ missing_video_url }]] = await db.query(`
      SELECT COUNT(*) AS count FROM episodes 
      WHERE (video_url IS NULL OR video_url = '')
        AND (hls_url IS NULL OR hls_url = '')
    `);

    // 5. Phụ đề import lỗi (Mock)
    const subtitle_import_errors = 0;

    // 6. API chưa cấu hình
    const apiKeys = {
      TMDb: process.env.TMDB_API_KEY,
      Gemini: process.env.GEMINI_API_KEY,
      OpenSubtitles: process.env.OPENSUBTITLES_API_KEY,
      SubDL: process.env.SUBDL_API_KEY
    };
    const unconfigured_apis = Object.keys(apiKeys).filter(key => !apiKeys[key]);

    res.json({
      new_reports: Number(new_reports) || 0,
      high_report_episodes: Number(high_report_episodes) || 0,
      missing_images: Number(missing_images) || 0,
      missing_video_url: Number(missing_video_url) || 0,
      subtitle_import_errors,
      unconfigured_apis
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy danh sách hàng đợi vận hành (Operational Queue)
router.get('/admin/dashboard-queue', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [[{ has_backdrop_column }]] = await db.query(`
      SELECT COUNT(*) AS has_backdrop_column
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'movies'
        AND COLUMN_NAME = 'backdrop_url'
    `);
    const movieMetadataWhere = has_backdrop_column
      ? "poster_url IS NULL OR poster_url = '' OR backdrop_url IS NULL OR backdrop_url = '' OR description IS NULL OR description = ''"
      : "poster_url IS NULL OR poster_url = '' OR description IS NULL OR description = ''";
    const [episodeColumnRows] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'episodes'
        AND COLUMN_NAME IN ('title', 'name', 'episode_number')
    `);
    const episodeColumns = new Set(episodeColumnRows.map((row) => row.COLUMN_NAME));
    const episodeFallbackTitle = episodeColumns.has('episode_number')
      ? "CONCAT('Tập ', e.episode_number)"
      : "CONCAT('Tập #', e.id)";
    const episodeTitleExpr = episodeColumns.has('title')
      ? `COALESCE(NULLIF(e.title, ''), ${episodeFallbackTitle})`
      : episodeColumns.has('name')
        ? `COALESCE(NULLIF(e.name, ''), ${episodeFallbackTitle})`
        : episodeFallbackTitle;

    // 1. Video reports mới
    const [movieReports] = await db.query(`
      SELECT 
        'movie_report' AS type, 
        r.id AS item_id,
        r.movie_id,
        r.episode_id,
        m.title AS movie_title,
        r.reason AS title,
        r.description AS content,
        r.created_at
      FROM movie_reports r
      LEFT JOIN movies m ON r.movie_id = m.id
      WHERE r.status = 'new'
      ORDER BY r.created_at DESC 
      LIMIT 10
    `);

    // 2. Comment bị report
    const [commentReports] = await db.query(`
      SELECT 
        'comment_report' AS type, 
        cr.id AS item_id,
        c.movie_id,
        NULL AS episode_id,
        m.title AS movie_title,
        cr.reason AS title,
        c.content AS content,
        cr.created_at
      FROM movie_comment_reports cr
      JOIN movie_comments c ON cr.comment_id = c.id
      LEFT JOIN movies m ON c.movie_id = m.id
      WHERE cr.status IN ('pending', 'new')
      ORDER BY cr.created_at DESC 
      LIMIT 10
    `);

    // 3. Phim thiếu metadata
    const [missingMetadata] = await db.query(`
      SELECT 
        'missing_metadata' AS type,
        id AS item_id,
        id AS movie_id,
        NULL AS episode_id,
        title AS movie_title,
        'Thiếu metadata' AS title,
        'Thiếu Poster, Backdrop hoặc Description' AS content,
        created_at
      FROM movies
      WHERE ${movieMetadataWhere}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // 4. Phim chưa có tập
    const [missingEpisodes] = await db.query(`
      SELECT 
        'missing_episodes' AS type,
        m.id AS item_id,
        m.id AS movie_id,
        NULL AS episode_id,
        m.title AS movie_title,
        'Chưa có tập' AS title,
        'Phim chưa có tập nào được cập nhật' AS content,
        m.created_at
      FROM movies m
      LEFT JOIN episodes e ON m.id = e.movie_id
      WHERE e.id IS NULL AND m.is_series = 1
      ORDER BY m.created_at DESC
      LIMIT 10
    `);

    // 5. Tập chưa có phụ đề
    const [missingSubtitles] = await db.query(`
      SELECT 
        'missing_subtitle' AS type,
        e.id AS item_id,
        e.movie_id,
        e.id AS episode_id,
        m.title AS movie_title,
        ${episodeTitleExpr} AS title,
        'Tập phim chưa có phụ đề' AS content,
        e.created_at
      FROM episodes e
      JOIN movies m ON e.movie_id = m.id
      LEFT JOIN episode_subtitles es ON e.id = es.episode_id
      WHERE es.id IS NULL
      ORDER BY e.created_at DESC
      LIMIT 10
    `);

    // Merge & Sort
    const queue = [
      ...movieReports,
      ...commentReports,
      ...missingMetadata,
      ...missingEpisodes,
      ...missingSubtitles
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

    res.json(queue);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==================== CATEGORIES API ====================

// Lấy tất cả danh mục
router.get('/categories', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM categories ORDER BY id DESC');
    
    // Lấy thông tin genres và countries cho từng category
    const categoriesWithDetails = await Promise.all(rows.map(async (category) => {
      // Lấy genres của category
      const [genres] = await db.execute(
        `SELECT g.* FROM genres g
         JOIN category_genres cg ON g.id = cg.genre_id
         WHERE cg.category_id = ?`,
        [category.id]
      );
      
      // Lấy countries của category (thử-catch để tránh lỗi nếu bảng chưa tồn tại)
      let countries = [];
      try {
        const [countryRows] = await db.execute(
          `SELECT c.* FROM countries c
           JOIN category_countries cc ON c.id = cc.country_id
           WHERE cc.category_id = ?`,
          [category.id]
        );
        countries = countryRows;
      } catch (err) {
        console.log('Bảng category_countries chưa tồn tại:', err.message);
      }
      
      return {
        ...category,
        genres,
        countries
      };
    }));
    
    res.json(categoriesWithDetails);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Thêm danh mục mới
router.post('/categories', requireAdminMiddleware, async (req, res) => {
  const { name, genreIds, countryIds } = req.body;
  if (!name) return res.status(400).json({ message: 'Tên danh mục không được để trống' });
  
  try {
    const db = getDb(req);
    const [result] = await db.execute('INSERT INTO categories (name, created_at) VALUES (?, NOW())', [name]);
    const categoryId = result.insertId;
    
    // Thêm liên kết với thể loại nếu có
    if (Array.isArray(genreIds) && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await db.execute('INSERT INTO category_genres (category_id, genre_id) VALUES (?, ?)', [categoryId, genreId]);
      }
    }
    
    // Thêm liên kết với quốc gia nếu có
    try {
      if (Array.isArray(countryIds) && countryIds.length > 0) {
        for (const countryId of countryIds) {
          await db.execute('INSERT INTO category_countries (category_id, country_id) VALUES (?, ?)', [categoryId, countryId]);
        }
      }
    } catch (err) {
      console.log('Bảng category_countries chưa tồn tại, bỏ qua xử lý quốc gia:', err.message);
    }
    
    res.json({ success: true, id: categoryId, message: 'Thêm danh mục thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa danh mục
router.put('/categories/:id', requireAdminMiddleware, async (req, res) => {
  const { name, genreIds, countryIds } = req.body;
  const categoryId = req.params.id;
  
  console.log('PUT /categories/:id', { categoryId, name, genreIds, countryIds });
  
  if (!name) return res.status(400).json({ message: 'Tên danh mục không được để trống' });
  
  try {
    const db = getDb(req);
    await db.execute('UPDATE categories SET name = ? WHERE id = ?', [name, categoryId]);
    
    // Xóa các liên kết thể loại cũ
    await db.execute('DELETE FROM category_genres WHERE category_id = ?', [categoryId]);
    
    // Thêm lại các liên kết thể loại mới
    if (Array.isArray(genreIds) && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await db.execute('INSERT INTO category_genres (category_id, genre_id) VALUES (?, ?)', [categoryId, genreId]);
      }
    }
    
    // Xóa các liên kết quốc gia cũ (nếu bảng tồn tại)
    try {
      await db.execute('DELETE FROM category_countries WHERE category_id = ?', [categoryId]);
      
      // Thêm lại các liên kết quốc gia mới
      if (Array.isArray(countryIds) && countryIds.length > 0) {
        for (const countryId of countryIds) {
          await db.execute('INSERT INTO category_countries (category_id, country_id) VALUES (?, ?)', [categoryId, countryId]);
        }
      }
    } catch (err) {
      console.log('Bảng category_countries chưa tồn tại, bỏ qua xử lý quốc gia:', err.message);
    }
    
    res.json({ success: true, message: 'Cập nhật danh mục thành công' });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ message: err.message });
  }
});

// Xóa danh mục
router.delete('/categories/:id', requireAdminMiddleware, async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    // Xóa các liên kết trước khi xóa category
    await db.execute('DELETE FROM category_genres WHERE category_id = ?', [categoryId]);
    
    // Xóa liên kết quốc gia nếu bảng tồn tại
    try {
      await db.execute('DELETE FROM category_countries WHERE category_id = ?', [categoryId]);
    } catch (err) {
      console.log('Bảng category_countries chưa tồn tại, bỏ qua:', err.message);
    }
    
    await db.execute('DELETE FROM categories WHERE id = ?', [categoryId]);
    res.json({ success: true, message: 'Xóa danh mục thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy thể loại của danh mục
router.get('/categories/:id/genres', async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    const [rows] = await db.execute(
      `SELECT g.* FROM genres g
       JOIN category_genres cg ON g.id = cg.genre_id
       WHERE cg.category_id = ?`,
      [categoryId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy quốc gia của danh mục
router.get('/categories/:id/countries', async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    const [rows] = await db.execute(
      `SELECT c.* FROM countries c
       JOIN category_countries cc ON c.id = cc.country_id
       WHERE cc.category_id = ?`,
      [categoryId]
    );
    res.json(rows);
  } catch (err) {
    console.log('Lỗi khi lấy quốc gia của danh mục:', err.message);
    // Trả về mảng rỗng nếu bảng chưa tồn tại
    res.json([]);
  }
});

// Lấy phim theo danh mục (dựa trên các thể loại và quốc gia của danh mục)
router.get('/categories/:id/movies', async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    const limit = req.query.limit ? clampLimit(req.query.limit, 12) : null;
    
    // Lấy các genre_id của category này
    const [genres] = await db.execute(
      'SELECT genre_id FROM category_genres WHERE category_id = ?',
      [categoryId]
    );
    
    // Lấy các country_id của category này
    const [countries] = await db.execute(
      'SELECT country_id FROM category_countries WHERE category_id = ?',
      [categoryId]
    );
    
    if (genres.length === 0 && countries.length === 0) {
      return res.json([]);
    }
    
    const genreIds = genres.map(g => g.genre_id);
    const countryIds = countries.map(c => c.country_id);
    
    let sql = 'SELECT DISTINCT m.* FROM movies m';
    let params = [];
    let conditions = ['m.is_visible = 1'];
    
    // Thêm điều kiện genre nếu có
    if (genreIds.length > 0) {
      sql += ' JOIN movie_genres mg ON m.id = mg.movie_id';
      conditions.push(`mg.genre_id IN (${genreIds.map(() => '?').join(',')})`);
      params.push(...genreIds);
    }
    
    // Thêm điều kiện country nếu có
    if (countryIds.length > 0) {
      sql += ' JOIN movie_countries mc ON m.id = mc.movie_id';
      conditions.push(`mc.country_id IN (${countryIds.map(() => '?').join(',')})`);
      params.push(...countryIds);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ` ORDER BY m.created_at DESC${limit ? ` LIMIT ${limit}` : ''}`;
    
    const [movies] = await db.execute(sql, params);
    
    // Thêm thông tin genres và countries cho từng phim
    const moviesWithDetails = await Promise.all(movies.map(async (movie) => {
      // Lấy genres của phim
      const [movieGenres] = await db.execute(
        `SELECT g.* FROM genres g
         JOIN movie_genres mg ON g.id = mg.genre_id
         WHERE mg.movie_id = ?`,
        [movie.id]
      );
      
      // Lấy countries của phim
      const [movieCountries] = await db.execute(
        `SELECT c.* FROM countries c
         JOIN movie_countries mc ON c.id = mc.country_id
         WHERE mc.movie_id = ?`,
        [movie.id]
      );
      
      return {
        ...movie,
        genres: movieGenres,
        countries: movieCountries
      };
    }));
    
    res.json(moviesWithDetails);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API để tạo bảng category_countries (chỉ dùng một lần)
router.post('/setup/category-countries', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`category_countries\` (
        \`category_id\` int(11) NOT NULL,
        \`country_id\` int(11) NOT NULL,
        PRIMARY KEY (\`category_id\`, \`country_id\`),
        FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`country_id\`) REFERENCES \`countries\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    res.json({ success: true, message: 'Bảng category_countries đã được tạo thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===== VIP & ADVERTISEMENTS =====
function isVipUntil(value) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

function makeMockMomoToken() {
  return crypto.randomBytes(24).toString('hex');
}

function makeMockMomoTransactionRef(orderId) {
  return `MOMO-DEMO-${Date.now()}-${orderId}`;
}

async function activatePaidVipOrder(db, orderId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT o.*, p.duration_days
       FROM vip_orders o
       JOIN vip_plans p ON p.id = o.plan_id
       WHERE o.id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (!rows.length) {
      await conn.rollback();
      return { ok: false, status: 404, message: 'Không tìm thấy đơn VIP' };
    }

    const order = rows[0];
    if (order.payment_status === 'paid' && order.status === 'approved') {
      await conn.commit();
      return { ok: true, duplicate: true, order };
    }

    await conn.execute(
      `UPDATE vip_orders
       SET payment_status = 'paid',
           status = 'approved',
           paid_at = NOW(),
           approved_at = NOW(),
           transaction_ref = COALESCE(transaction_ref, ?)
       WHERE id = ?`,
      [makeMockMomoTransactionRef(order.id), order.id]
    );

    await conn.execute(
      `UPDATE users
       SET vip_until = DATE_ADD(
         IF(vip_until IS NOT NULL AND vip_until > NOW(), vip_until, NOW()),
         INTERVAL ? DAY
       )
       WHERE id = ?`,
      [order.duration_days, order.user_id]
    );

    await conn.commit();
    return { ok: true, duplicate: false, order };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

router.get('/vip/status', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ is_vip: false, vip_until: null });
    const db = getDb(req);
    const [rows] = await db.execute('SELECT vip_until FROM users WHERE id = ?', [userId]);
    const vipUntil = rows[0]?.vip_until || null;
    res.json({ is_vip: isVipUntil(vipUntil), vip_until: vipUntil });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/vip/plans', async (req, res) => {
  try {
    const [rows] = await getDb(req).execute('SELECT * FROM vip_plans WHERE is_active = 1 ORDER BY duration_days');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Tạo một giao dịch MoMo mô phỏng và trả URL thanh toán nội bộ.
router.post('/vip/mock-momo/create', async (req, res) => {
  try {
    const userId = toPositiveInt(getUserId(req));
    const planId = toPositiveInt(req.body?.plan_id);
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    if (!planId) return res.status(400).json({ message: 'Gói VIP không hợp lệ' });

    const db = getDb(req);
    const [plans] = await db.execute('SELECT * FROM vip_plans WHERE id=? AND is_active=1', [planId]);
    if (!plans.length) return res.status(404).json({ message: 'Không tìm thấy gói VIP' });

    const [pending] = await db.execute(
      `SELECT id, payment_token
       FROM vip_orders
       WHERE user_id = ?
         AND payment_method = 'mock_momo'
         AND payment_status = 'pending'
         AND payment_token IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (pending.length) {
      return res.status(409).json({
        message: 'Bạn đang có một giao dịch MoMo chờ xử lý.',
        payment_url: `/vip/mock-momo/${pending[0].payment_token}`,
      });
    }

    const paymentToken = makeMockMomoToken();
    const [result] = await db.execute(
      `INSERT INTO vip_orders
       (user_id, plan_id, amount, payment_note, payment_method, payment_status, payment_token, status)
       VALUES (?, ?, ?, ?, 'mock_momo', 'pending', ?, 'pending')`,
      [userId, planId, plans[0].price, `Thanh toán MoMo Sandbox Demo cho ${plans[0].name}`, paymentToken]
    );

    res.status(201).json({
      id: result.insertId,
      payment_url: `/vip/mock-momo/${paymentToken}`,
      message: 'Đã tạo giao dịch MoMo Sandbox Demo',
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/vip/mock-momo/:token', async (req, res) => {
  try {
    const userId = toPositiveInt(getUserId(req));
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    const [rows] = await getDb(req).execute(
      `SELECT o.id, o.amount, o.payment_status, o.status, o.created_at,
              p.name AS plan_name, p.duration_days
       FROM vip_orders o
       JOIN vip_plans p ON p.id = o.plan_id
       WHERE o.payment_token = ? AND o.user_id = ?
       LIMIT 1`,
      [String(req.params.token || ''), userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Endpoint mô phỏng callback của MoMo. Chỉ dùng trong môi trường demo/đồ án.
router.post('/vip/mock-momo/:token/complete', async (req, res) => {
  try {
    const userId = toPositiveInt(getUserId(req));
    const result = String(req.body?.result || '').toLowerCase();
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    if (!['success', 'failed', 'cancelled'].includes(result)) {
      return res.status(400).json({ message: 'Kết quả mô phỏng không hợp lệ' });
    }

    const db = getDb(req);
    const [rows] = await db.execute(
      `SELECT id, payment_status
       FROM vip_orders
       WHERE payment_token = ? AND user_id = ?
       LIMIT 1`,
      [String(req.params.token || ''), userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy giao dịch' });

    const order = rows[0];
    if (order.payment_status !== 'pending') {
      return res.status(409).json({ message: 'Giao dịch này đã được xử lý', payment_status: order.payment_status });
    }

    if (result === 'success') {
      const activated = await activatePaidVipOrder(db, order.id);
      return res.json({
        message: activated.duplicate ? 'Giao dịch đã được xác nhận trước đó' : 'Thanh toán thành công. VIP đã được kích hoạt.',
        payment_status: 'paid',
      });
    }

    const paymentStatus = result === 'cancelled' ? 'cancelled' : 'failed';
    await db.execute(
      `UPDATE vip_orders
       SET payment_status = ?, status = 'rejected'
       WHERE id = ? AND payment_status = 'pending'`,
      [paymentStatus, order.id]
    );
    return res.json({
      message: result === 'cancelled' ? 'Bạn đã hủy giao dịch.' : 'Thanh toán mô phỏng thất bại.',
      payment_status: paymentStatus,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/vip/orders/my', async (req, res) => {
  try {
    const userId = toPositiveInt(getUserId(req));
    if (!userId) return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    const [rows] = await getDb(req).execute(
      `SELECT o.*, p.name AS plan_name, p.duration_days FROM vip_orders o JOIN vip_plans p ON p.id=o.plan_id
       WHERE o.user_id=? ORDER BY o.created_at DESC`, [userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/vip/plans', requireAdminMiddleware, async (req, res) => {
  try { const [rows] = await getDb(req).execute('SELECT * FROM vip_plans ORDER BY duration_days'); res.json(rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
router.post('/admin/vip/plans', requireAdminMiddleware, async (req, res) => {
  try {
    const { name, duration_days, price, description, is_active=true } = req.body;
    if (!name || !toPositiveInt(duration_days)) return res.status(400).json({ message: 'Thiếu tên hoặc số ngày' });
    const [result] = await getDb(req).execute('INSERT INTO vip_plans (name,duration_days,price,description,is_active) VALUES (?,?,?,?,?)', [name, duration_days, Number(price)||0, description||null, is_active?1:0]);
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.put('/admin/vip/plans/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const { name, duration_days, price, description, is_active } = req.body;
    await getDb(req).execute('UPDATE vip_plans SET name=?,duration_days=?,price=?,description=?,is_active=? WHERE id=?', [name,duration_days,Number(price)||0,description||null,is_active?1:0,req.params.id]);
    res.json({ message: 'Đã cập nhật gói VIP' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/vip/orders', requireAdminMiddleware, async (req, res) => {
  try {
    const [rows] = await getDb(req).execute(`SELECT o.*,u.username,u.email,p.name AS plan_name,p.duration_days
      FROM vip_orders o JOIN users u ON u.id=o.user_id JOIN vip_plans p ON p.id=o.plan_id ORDER BY o.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.patch('/admin/vip/orders/:id', requireAdminMiddleware, async (req, res) => {
  const status = req.body?.status;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  const db = getDb(req);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(`SELECT o.*,p.duration_days FROM vip_orders o JOIN vip_plans p ON p.id=o.plan_id WHERE o.id=? FOR UPDATE`, [req.params.id]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Không tìm thấy đơn' }); }
    if (rows[0].status !== 'pending') { await conn.rollback(); return res.status(409).json({ message: 'Đơn đã được xử lý' }); }
    await conn.execute('UPDATE vip_orders SET status=?,approved_by=?,approved_at=NOW() WHERE id=?', [status,getUserId(req),req.params.id]);
    if (status === 'approved') {
      await conn.execute(`UPDATE users SET vip_until=DATE_ADD(IF(vip_until IS NOT NULL AND vip_until>NOW(),vip_until,NOW()), INTERVAL ? DAY) WHERE id=?`, [rows[0].duration_days,rows[0].user_id]);
      await conn.execute(`UPDATE vip_orders SET payment_status='paid', paid_at=COALESCE(paid_at,NOW()) WHERE id=?`, [req.params.id]);
    }
    await conn.commit();
    res.json({ message: status === 'approved' ? 'Đã kích hoạt VIP' : 'Đã từ chối đơn' });
  } catch (err) { await conn.rollback(); res.status(500).json({ message: err.message }); }
  finally { conn.release(); }
});

router.get('/ads', async (req, res) => {
  try {
    const db = getDb(req);
    const userId = toPositiveInt(getUserId(req));
    if (userId) {
      const [users] = await db.execute('SELECT vip_until FROM users WHERE id=?', [userId]);
      if (isVipUntil(users[0]?.vip_until)) return res.json([]);
    }
    const placement = String(req.query.placement || '').trim();
    const params = [];
    let sql = `SELECT * FROM advertisements WHERE is_active=1 AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW())`;
    if (placement) { sql += ' AND placement=?'; params.push(placement); }
    sql += ' ORDER BY id DESC';
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.get('/admin/ads', requireAdminMiddleware, async (req, res) => {
  try { const [rows] = await getDb(req).execute('SELECT * FROM advertisements ORDER BY id DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});
router.post('/admin/ads', requireAdminMiddleware, async (req, res) => {
  try {
    const { name,image_url,target_url,placement,is_active=true,start_at,end_at } = req.body;
    if (!name || !image_url || !placement) return res.status(400).json({ message: 'Thiếu tên, ảnh hoặc vị trí' });
    const [result] = await getDb(req).execute('INSERT INTO advertisements (name,image_url,target_url,placement,is_active,start_at,end_at) VALUES (?,?,?,?,?,?,?)', [name,image_url,target_url||null,placement,is_active?1:0,start_at||null,end_at||null]);
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.put('/admin/ads/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const { name,image_url,target_url,placement,is_active,start_at,end_at } = req.body;
    await getDb(req).execute('UPDATE advertisements SET name=?,image_url=?,target_url=?,placement=?,is_active=?,start_at=?,end_at=? WHERE id=?', [name,image_url,target_url||null,placement,is_active?1:0,start_at||null,end_at||null,req.params.id]);
    res.json({ message: 'Đã cập nhật quảng cáo' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.delete('/admin/ads/:id', requireAdminMiddleware, async (req, res) => {
  try { await getDb(req).execute('DELETE FROM advertisements WHERE id=?', [req.params.id]); res.json({ message: 'Đã xóa quảng cáo' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router; 
