const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getSimilarMovies, getUserRecommendations, clampLimit } = require('./services/recommendationService');
const { chatWithMovieAdvisor, getAiStatus } = require('./services/aiService');
const { ensureChatSession, getAiChatStats, getLatestChatHistory, saveChatExchange } = require('./services/chatSessionService');
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

const OTP_EXPIRATION_MINUTES = 10;
const TEST_VIEW_MIN = Number(process.env.TEST_VIEW_MIN || 1000);
const TEST_VIEW_MAX = Number(process.env.TEST_VIEW_MAX || 10000);

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

function attachSubtitleTracks(episodes, tracksByEpisode) {
  return episodes.map((episode) => {
    const storedTracks = tracksByEpisode.get(Number(episode.id)) || [];
    const subtitleTracks = storedTracks.length
      ? storedTracks
      : normalizeSubtitleUrl(episode.subtitle_url)
        ? [{
            id: `legacy-${episode.id}`,
            label: 'Phá»¥ Ä‘á»',
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
    ? 'XÃ¡c nháº­n email IT Move'
    : type === 'reset-password'
      ? 'Äáº·t láº¡i máº­t kháº©u IT Move'
      : 'MÃ£ OTP IT Move';

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"IT Move" <no-reply@itmove.local>',
    to: email,
    subject,
    text: `MÃ£ xÃ¡c nháº­n cá»§a báº¡n lÃ : ${otp}\n\nMÃ£ cÃ³ hiá»‡u lá»±c trong ${OTP_EXPIRATION_MINUTES} phÃºt.`,
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

// Láº¥y pool káº¿t ná»‘i tá»« app.locals
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
      const error = new Error('Profile khÃ´ng thuá»™c tÃ i khoáº£n nÃ y');
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
    const error = new Error('Thiáº¿u movie_id há»£p lá»‡');
    error.statusCode = 400;
    throw error;
  }

  const [movieRows] = await db.execute('SELECT id FROM movies WHERE id = ? LIMIT 1', [movieId]);
  if (!movieRows.length) {
    const error = new Error('Phim khÃ´ng tá»“n táº¡i');
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
      const error = new Error('Táº­p phim khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng thuá»™c phim nÃ y');
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

// ÄÄƒng kÃ½ tÃ i khoáº£n vÃ  gá»­i OTP xÃ¡c nháº­n email
router.post('/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) return res.status(400).json({ message: 'Thiáº¿u thÃ´ng tin Ä‘Äƒng kÃ½' });
  try {
    const db = getDb(req);
    const normalizedEmail = email.trim().toLowerCase();
    const [existingByEmail] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (existingByEmail.length > 0) {
      const user = existingByEmail[0];
      if (user.email_verified) return res.status(400).json({ message: 'Email Ä‘Ã£ Ä‘Æ°á»£c Ä‘Äƒng kÃ½' });
      const otp = generateOtp();
      await setUserOtp(db, user.id, otp);
      await sendOtpEmail(normalizedEmail, otp, 'register');
      return res.json({ message: 'TÃ i khoáº£n chÆ°a xÃ¡c nháº­n. MÃ£ OTP má»›i Ä‘Ã£ Ä‘Æ°á»£c gá»­i.', requiresVerification: true, email: normalizedEmail });
    }

    const [existingByUsername] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existingByUsername.length > 0) return res.status(400).json({ message: 'TÃªn Ä‘Äƒng nháº­p Ä‘Ã£ tá»“n táº¡i' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (username, password, email, email_verified, is_active) VALUES (?, ?, ?, 0, 1)',
      [username, hash, normalizedEmail]
    );
    const otp = generateOtp();
    await setUserOtp(db, result.insertId, otp);
    await sendOtpEmail(normalizedEmail, otp, 'register');
    res.json({ message: 'ÄÄƒng kÃ½ thÃ nh cÃ´ng. Vui lÃ²ng nháº­p mÃ£ OTP Ä‘Ã£ gá»­i email Ä‘á»ƒ xÃ¡c nháº­n tÃ i khoáº£n.', requiresVerification: true, email: normalizedEmail });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// XÃ¡c nháº­n email báº±ng OTP
router.post('/auth/verify-email', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Thiáº¿u email hoáº·c mÃ£ OTP' });
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (!rows.length) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n' });
    const user = rows[0];
    if (user.email_verified) return res.json({ message: 'Email Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n' });
    if (!user.email_otp || user.email_otp !== hashOtp(otp)) return res.status(400).json({ message: 'MÃ£ OTP khÃ´ng Ä‘Ãºng' });
    if (user.email_otp_expires && new Date(user.email_otp_expires) < new Date()) return res.status(400).json({ message: 'MÃ£ OTP Ä‘Ã£ háº¿t háº¡n' });
    await db.execute('UPDATE users SET email_verified=1, email_otp=NULL, email_otp_expires=NULL WHERE id=?', [user.id]);
    res.json({ message: 'XÃ¡c nháº­n email thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Gá»­i láº¡i OTP xÃ¡c nháº­n email
router.post('/auth/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Thiáº¿u email' });
  try {
    const db = getDb(req);
    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!rows.length) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n' });
    if (rows[0].email_verified) return res.json({ message: 'Email Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n' });
    const otp = generateOtp();
    await setUserOtp(db, rows[0].id, otp);
    await sendOtpEmail(normalizedEmail, otp, 'register');
    res.json({ message: 'MÃ£ OTP má»›i Ä‘Ã£ Ä‘Æ°á»£c gá»­i' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ÄÄƒng nháº­p báº±ng username hoáº·c email
router.post('/auth/login', async (req, res) => {
  const { username, email, password } = req.body;
  const identifier = (username || email || '').trim();
  if (!identifier || !password) return res.status(400).json({ message: 'Thiáº¿u thÃ´ng tin Ä‘Äƒng nháº­p' });
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ message: 'ThÃ´ng tin Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ khÃ³a' });
    if (!user.email_verified) return res.status(403).json({ message: 'Vui lÃ²ng xÃ¡c nháº­n email trÆ°á»›c khi Ä‘Äƒng nháº­p', requiresVerification: true, email: user.email });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'ThÃ´ng tin Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡' });
    res.json(formatUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ÄÄƒng nháº­p báº±ng Google Identity credential
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
      if (!user.is_active) return res.status(403).json({ message: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ khÃ³a' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    const db = getDb(req);
    const { name, avatarColor, avatarUrl, isKids, settings } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'TÃªn profile khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng' });

    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?', [userId]);
    if (Number(count) >= 5) return res.status(400).json({ message: 'Má»—i tÃ i khoáº£n tá»‘i Ä‘a 5 profile' });

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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    const { name, avatarColor, avatarUrl, isKids, settings } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'TÃªn profile khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng' });

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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÃ†Â°a Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    const db = getDb(req);
    const profileId = await resolveProfileId(db, userId, req.params.profileId);
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?', [userId]);
    if (Number(count) <= 1) return res.status(400).json({ message: 'TÃ i khoáº£n cáº§n Ã­t nháº¥t 1 profile' });

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

    // Láº¥y genres vÃ  countries cho táº¥t cáº£ movies
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

    // Gáº¯n genres vÃ  countries vÃ o tá»«ng movie, Ä‘á»“ng thá»i Ä‘áº£m báº£o cÃ¡c trÆ°á»ng cáº§n thiáº¿t luÃ´n cÃ³ máº·t
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

// ThÃªm phim (admin)
router.get('/recommendations', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.query.movie_id;
    if (!movieId) return res.status(400).json({ message: 'movie_id lÃ  báº¯t buá»™c' });
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
    const recommendations = await getUserRecommendations(db, req.params.userId, clampLimit(req.query.limit), profileId);
    res.json(recommendations);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
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
  res.json(getAiStatus());
});

router.get('/admin/ai-health', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const chat = await getAiChatStats(db);
    res.json({
      status: getAiStatus(),
      chat,
    });
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
    const db = getDb(req);
    const userId = req.body?.user_id || req.headers?.['x-user-id'];
    const profileId = req.body?.profile_id || req.headers?.['x-profile-id'];
    const session = await ensureChatSession(db, {
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
    await saveChatExchange(db, {
      sessionId: session.id,
      userMessage: req.body?.message,
      assistantResult: result,
    });
    res.json({
      ...result,
      session_id: session.id,
      session_persisted: session.persisted,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
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

router.post('/subtitles/preview', requireAdminMiddleware, async (req, res) => {
  try {
    const content = String(req.body?.content || '');
    if (!content.trim()) return res.status(400).json({ message: 'Thiáº¿u ná»™i dung phá»¥ Ä‘á»' });
    if (content.length > 500000) return res.status(413).json({ message: 'Phá»¥ Ä‘á» quÃ¡ lá»›n' });

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
    res.json({ message: 'ÄÃ£ lÆ°u phá»¥ Ä‘á» cho táº­p phim.', subtitle });
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
    res.json({ message: 'ÄÃ£ cáº­p nháº­t phá»¥ Ä‘á».', subtitle });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || 'Cannot update subtitle' });
  }
});

router.delete('/subtitles/:subtitleId', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await deleteEpisodeSubtitle(db, req.params.subtitleId);
    res.json({ message: 'ÄÃ£ xÃ³a phá»¥ Ä‘á».' });
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

// Sá»­a phim (admin)
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
      message: 'ÄÃ£ cháº¡y bá»• sung dá»¯ liá»‡u TMDb hÃ ng loáº¡t.',
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
      message: 'ÄÃ£ kiá»ƒm tra vÃ  bá»• sung dá»¯ liá»‡u tá»« TMDb.',
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

// XÃ³a phim (admin)
router.delete('/movies/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM movies WHERE id=?', [req.params.id]);
    res.json({ message: 'Movie deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Äáº·t vÃ©
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

// Láº¥y vÃ© cá»§a user
router.get('/bookings/:user_id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT b.*, m.title FROM bookings b JOIN movies m ON b.movie_id = m.id WHERE b.user_id = ?', [req.params.user_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y danh sÃ¡ch quá»‘c gia
router.get('/countries', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM countries ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ThÃªm quá»‘c gia má»›i
router.post('/countries', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiá»ƒm tra trÃ¹ng tÃªn
    const [rows] = await db.execute('SELECT id FROM countries WHERE name = ?', [name]);
    if (rows.length > 0) return res.status(400).json({ message: 'TÃªn quá»‘c gia Ä‘Ã£ tá»“n táº¡i' });
    await db.execute('INSERT INTO countries (name) VALUES (?)', [name]);
    res.json({ message: 'ThÃªm quá»‘c gia thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sá»­a quá»‘c gia
router.put('/countries/:id', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiá»ƒm tra trÃ¹ng tÃªn (trá»« chÃ­nh nÃ³)
    const [rows] = await db.execute('SELECT id FROM countries WHERE name = ? AND id != ?', [name, req.params.id]);
    if (rows.length > 0) return res.status(400).json({ message: 'TÃªn quá»‘c gia Ä‘Ã£ tá»“n táº¡i' });
    const [result] = await db.execute('UPDATE countries SET name = ? WHERE id = ?', [name, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Quá»‘c gia khÃ´ng tá»“n táº¡i' });
    res.json({ message: 'Cáº­p nháº­t quá»‘c gia thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// XÃ³a quá»‘c gia
router.delete('/countries/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    // Kiá»ƒm tra quá»‘c gia cÃ³ Ä‘ang Ä‘Æ°á»£c liÃªn káº¿t vá»›i phim khÃ´ng
    const [used] = await db.execute('SELECT 1 FROM movie_countries WHERE country_id = ? LIMIT 1', [req.params.id]);
    if (used.length > 0) return res.status(400).json({ message: 'KhÃ´ng thá»ƒ xÃ³a: Quá»‘c gia Ä‘ang Ä‘Æ°á»£c sá»­ dá»¥ng cho phim!' });
    const [result] = await db.execute('DELETE FROM countries WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Quá»‘c gia khÃ´ng tá»“n táº¡i' });
    res.json({ message: 'ÄÃ£ xÃ³a quá»‘c gia thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y danh sÃ¡ch thá»ƒ loáº¡i
router.get('/genres', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM genres ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ThÃªm thá»ƒ loáº¡i má»›i
router.post('/genres', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiá»ƒm tra trÃ¹ng tÃªn
    const [rows] = await db.execute('SELECT id FROM genres WHERE name = ?', [name]);
    if (rows.length > 0) return res.status(400).json({ message: 'TÃªn thá»ƒ loáº¡i Ä‘Ã£ tá»“n táº¡i' });
    await db.execute('INSERT INTO genres (name) VALUES (?)', [name]);
    res.json({ message: 'ThÃªm thá»ƒ loáº¡i thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sá»­a thá»ƒ loáº¡i
router.put('/genres/:id', requireAdminMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Missing name' });
  try {
    const db = getDb(req);
    // Kiá»ƒm tra trÃ¹ng tÃªn (trá»« chÃ­nh nÃ³)
    const [rows] = await db.execute('SELECT id FROM genres WHERE name = ? AND id != ?', [name, req.params.id]);
    if (rows.length > 0) return res.status(400).json({ message: 'TÃªn thá»ƒ loáº¡i Ä‘Ã£ tá»“n táº¡i' });
    const [result] = await db.execute('UPDATE genres SET name = ? WHERE id = ?', [name, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Thá»ƒ loáº¡i khÃ´ng tá»“n táº¡i' });
    res.json({ message: 'Cáº­p nháº­t thá»ƒ loáº¡i thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// XÃ³a thá»ƒ loáº¡i
router.delete('/genres/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    // Kiá»ƒm tra thá»ƒ loáº¡i cÃ³ Ä‘ang Ä‘Æ°á»£c liÃªn káº¿t vá»›i phim khÃ´ng
    const [used] = await db.execute('SELECT 1 FROM movie_genres WHERE genre_id = ? LIMIT 1', [req.params.id]);
    if (used.length > 0) return res.status(400).json({ message: 'KhÃ´ng thá»ƒ xÃ³a: Thá»ƒ loáº¡i Ä‘ang Ä‘Æ°á»£c sá»­ dá»¥ng cho phim!' });
    const [result] = await db.execute('DELETE FROM genres WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Thá»ƒ loáº¡i khÃ´ng tá»“n táº¡i' });
    res.json({ message: 'ÄÃ£ xÃ³a thá»ƒ loáº¡i thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y phim theo thá»ƒ loáº¡i
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

// Láº¥y thá»ƒ loáº¡i theo tÃªn (tÃ¬m kiáº¿m)
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

// QuÃªn máº­t kháº©u: gá»­i OTP Ä‘áº·t láº¡i máº­t kháº©u
router.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Vui lÃ²ng nháº­p email' });

  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT id, email, is_active FROM users WHERE email = ? LIMIT 1', [email]);

    // KhÃ´ng tiáº¿t lá»™ email cÃ³ tá»“n táº¡i hay khÃ´ng.
    if (!rows.length) {
      return res.json({ message: 'Náº¿u email tá»“n táº¡i, mÃ£ OTP Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c gá»­i.' });
    }

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ khÃ³a' });

    const otp = generateOtp();
    await setPasswordResetOtp(db, user.id, otp);
    await sendOtpEmail(user.email, otp, 'reset-password');

    res.json({ message: 'MÃ£ OTP Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c gá»­i Ä‘áº¿n email cá»§a báº¡n.', email: user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// XÃ¡c nháº­n OTP vÃ  Ä‘áº·t máº­t kháº©u má»›i
router.post('/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const password = String(req.body.password || '');

  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'Vui lÃ²ng nháº­p email, OTP vÃ  máº­t kháº©u má»›i' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Máº­t kháº©u má»›i pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±' });
  }

  try {
    const db = getDb(req);
    const [rows] = await db.execute(
      'SELECT id, password_reset_otp, password_reset_expires, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(404).json({ message: 'KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n' });

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ message: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ khÃ³a' });
    if (!user.password_reset_otp || user.password_reset_otp !== hashOtp(otp)) {
      return res.status(400).json({ message: 'MÃ£ OTP khÃ´ng Ä‘Ãºng' });
    }
    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ message: 'MÃ£ OTP Ä‘Ã£ háº¿t háº¡n' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      'UPDATE users SET password=?, password_reset_otp=NULL, password_reset_expires=NULL WHERE id=?',
      [hash, user.id]
    );

    res.json({ message: 'Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng. Báº¡n cÃ³ thá»ƒ Ä‘Äƒng nháº­p báº±ng máº­t kháº©u má»›i.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y tá»‘i Ä‘a 6 banner má»›i nháº¥t, kÃ¨m thÃ´ng tin phim vÃ  genres
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

    // Xá»­ lÃ½ badges: loáº¡i bá» trÆ°á»ng sx náº¿u cÃ³
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

// ThÃªm banner má»›i
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

// Láº¥y chi tiáº¿t phim
router.get('/movie/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.params.id;

    // 1. ThÃ´ng tin phim chÃ­nh
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
      `SELECT id, episode_number, title, video_url, subtitle_url FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC`, [movieId]
    );
    const subtitleTracksByEpisode = await getEpisodeSubtitleTracks(db, episodeRows.map((episode) => episode.id));
    const episodes = attachSubtitleTracks(episodeRows, subtitleTracksByEpisode);

    // 8. Actors
    const [actorRows] = await db.execute(
      `SELECT a.id, a.name, a.profile_pic_url, a.bio FROM movie_actors ma JOIN actors a ON ma.actor_id = a.id WHERE ma.movie_id = ?`, [movieId]
    );

    // 9. Suggested movies (top imdb_rating, trá»« phim hiá»‡n táº¡i)
    const suggestedRows = await getSimilarMovies(db, movieId, 12);

    // 10. Káº¿t quáº£ tráº£ vá»
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

// API: /api/watch/:id - Tráº£ vá» thÃ´ng tin phim, genres, danh sÃ¡ch táº­p
router.get('/watch/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const movieId = req.params.id;

    // 1. ThÃ´ng tin phim
    const [movieRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
    if (!movieRows.length || !movieRows[0].is_visible) return res.status(404).json({ message: 'Movie not found' });
    await recordMovieView(db, req, movieId);
    const [updatedMovieRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [movieId]);
    const movie = updatedMovieRows[0];

    // 2. Genres
    const [genreRows] = await db.execute(
      `SELECT g.id, g.name FROM movie_genres mg JOIN genres g ON mg.genre_id = g.id WHERE mg.movie_id = ?`, [movieId]
    );

    // 3. Danh sÃ¡ch táº­p
    const [episodeRows] = await db.execute(
      `SELECT id, episode_number, title, video_url, subtitle_url FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC`, [movieId]
    );
    const subtitleTracksByEpisode = await getEpisodeSubtitleTracks(db, episodeRows.map((episode) => episode.id));
    const episodes = attachSubtitleTracks(episodeRows, subtitleTracksByEpisode);

    res.json({
      movie,
      genres: genreRows,
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
      country, // tÃªn quá»‘c gia
      genre,   // tÃªn thá»ƒ loáº¡i
      type,    // 'Phim lẻ', 'Phim bộ', 'Tất cả'
      rating,  // age_limit
      year,    // nÄƒm sáº£n xuáº¥t
      sort     // sáº¯p xáº¿p
    } = req.query;

    let sql = `SELECT DISTINCT m.* FROM movies m`;
    let joins = [];
    let wheres = ['m.is_visible = 1'];
    let params = [];

    // Join vá»›i báº£ng liÃªn quan náº¿u cáº§n
    if (country && country.length > 0 && country !== 'Tất cả') {
      let countries = country;
      if (typeof countries === 'string') {
        // Náº¿u lÃ  chuá»—i cÃ³ dáº¥u pháº©y, tÃ¡ch ra array
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
      // Äáº£m báº£o genre lÃ  array
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

    // GhÃ©p cÃ¡c join vÃ  where
    if (joins.length) sql += ' ' + joins.join(' ');
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');

    // Sau khi ghÃ©p where, thÃªm GROUP BY m.id náº¿u cÃ³ filter thá»ƒ loáº¡i Ä‘á»ƒ trÃ¡nh duplicate
    if (joins.some(j => j.includes('movie_genres'))) {
      sql += ' GROUP BY m.id';
    }

    // Sáº¯p xáº¿p
    let order = 'm.created_at DESC';
    if (sort) {
      if (sort === 'Má»›i nháº¥t') order = 'm.release_year DESC, m.created_at DESC';
      else if (sort === 'Má»›i cáº­p nháº­t') order = 'm.created_at DESC';
      else if (sort === 'Äiá»ƒm IMDb') order = 'm.imdb_rating DESC';
      else if (sort === 'LÆ°á»£t xem') order = 'm.views DESC'; // náº¿u cÃ³ trÆ°á»ng views
    }
    sql += ` ORDER BY ${order}`;

    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y danh sÃ¡ch diá»…n viÃªn
router.get('/actors', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM actors ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y danh sÃ¡ch táº­p phim cho 1 movie
router.get('/movies/:id/episodes', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM episodes WHERE movie_id = ? ORDER BY episode_number ASC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ThÃªm táº­p phim má»›i cho phim
router.post('/movies/:id/episodes', requireAdminMiddleware, async (req, res) => {
  const { episode_number, title, video_url, subtitle_url } = req.body;
  if (!episode_number || !title || !video_url) {
    return res.status(400).json({ message: 'Thiáº¿u thÃ´ng tin táº­p phim' });
  }
  try {
    const db = getDb(req);
    await db.execute(
      'INSERT INTO episodes (movie_id, episode_number, title, video_url, subtitle_url) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, episode_number, title, video_url, subtitle_url || null]
    );
    res.json({ message: 'ÄÃ£ thÃªm táº­p phim' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sá»­a táº­p phim
router.put('/episodes/:id', requireAdminMiddleware, async (req, res) => {
  const { episode_number, title, video_url, subtitle_url } = req.body;
  try {
    const db = getDb(req);
    await db.execute(
      'UPDATE episodes SET episode_number=?, title=?, video_url=?, subtitle_url=? WHERE id=?',
      [episode_number, title, video_url, subtitle_url || null, req.params.id]
    );
    res.json({ message: 'Episode updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// XÃ³a táº­p phim
router.delete('/episodes/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM episodes WHERE id=?', [req.params.id]);
    res.json({ message: 'Episode deleted' });
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
// Gáº¯n thá»ƒ loáº¡i cho phim
router.post('/movies/:id/genres', requireAdminMiddleware, async (req, res) => {
  const { genre_ids } = req.body; // array
  if (!Array.isArray(genre_ids)) return res.status(400).json({ message: 'genre_ids must be array' });
  try {
    const db = getDb(req);
    // XÃ³a háº¿t genre cÅ©
    await db.execute('DELETE FROM movie_genres WHERE movie_id=?', [req.params.id]);
    // ThÃªm má»›i
    for (const gid of genre_ids) {
      await db.execute('INSERT INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [req.params.id, gid]);
    }
    res.json({ message: 'Genres updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Gáº¯n quá»‘c gia cho phim
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
// Gáº¯n diá»…n viÃªn cho phim
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
// Gáº¯n Ä‘áº¡o diá»…n cho phim
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId || !movie_id) return res.status(400).json({ message: 'Thiáº¿u user_id hoáº·c movie_id' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId || !movie_id) return res.status(400).json({ message: 'Thiáº¿u user_id hoáº·c movie_id' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÃ†Â°a Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p' });

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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });

    const movieId = toPositiveInt(req.query.movie_id);
    const episodeId = req.query.episode_id ? toPositiveInt(req.query.episode_id) : null;
    const episodeNumber = req.query.episode_number ? toPositiveInt(req.query.episode_number) : null;

    if (!movieId) return res.status(400).json({ message: 'Thiáº¿u movie_id há»£p lá»‡' });
    if (!episodeId && !episodeNumber) {
      return res.status(400).json({ message: 'Thiáº¿u episode_id hoáº·c episode_number há»£p lá»‡' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });

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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
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
    const error = new Error('BÃ¬nh luáº­n khÃ´ng tá»“n táº¡i');
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
    const error = new Error('Báº¡n gá»­i bÃ¬nh luáº­n hÆ¡i nhanh. Thá»­ láº¡i sau vÃ i giÃ¢y nhÃ©.');
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
    const error = new Error('BÃ¬nh luáº­n nÃ y vá»«a Ä‘Æ°á»£c gá»­i. HÃ£y viáº¿t thÃªm ná»™i dung khÃ¡c nhÃ©.');
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
    .replace(/Ä‘/g, 'd')
    .replace(/Ä/g, 'd')
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return res.status(400).json({ message: 'Äiá»ƒm Ä‘Ã¡nh giÃ¡ pháº£i tá»« 1 Ä‘áº¿n 10' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    if (!content) return res.status(400).json({ message: 'Ná»™i dung bÃ¬nh luáº­n khÃ´ng Ä‘Æ°á»£c trá»‘ng' });
    if (content.length > 1000) return res.status(400).json({ message: 'BÃ¬nh luáº­n tá»‘i Ä‘a 1000 kÃ½ tá»±' });

    const db = getDb(req);
    const movieId = toPositiveInt(req.params.id);
    if (!movieId) return res.status(400).json({ message: 'Thiáº¿u movie_id há»£p lá»‡' });

    if (parentId) {
      const [parentRows] = await db.execute(
        `SELECT id
         FROM movie_comments
         WHERE id = ? AND movie_id = ? AND status = 'visible'
         LIMIT 1`,
        [parentId, movieId]
      );
      if (!parentRows.length) return res.status(404).json({ message: 'BÃ¬nh luáº­n gá»‘c khÃ´ng tá»“n táº¡i' });
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });
    if (!content) return res.status(400).json({ message: 'Ná»™i dung bÃ¬nh luáº­n khÃ´ng Ä‘Æ°á»£c trá»‘ng' });
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
// Láº¥y thÃ´ng tin profile user
router.get('/user/profile', async (req, res) => {
  try {
    // Láº¥y user_id tá»« query hoáº·c session (á»Ÿ Ä‘Ã¢y giáº£ láº­p láº¥y tá»« query)
    const user_id = req.query?.user_id || req.body?.user_id || req.headers?.['x-user-id'];
    if (!user_id) return res.status(401).json({ error: 'ChÆ°a Ä‘Äƒng nháº­p' });
    const db = getDb(req);
    const [rows] = await db.execute(
      'SELECT id, username, email, gender, avatar_url, phone, birth_date FROM users WHERE id = ?',
      [user_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y user' });
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

// Cáº­p nháº­t thÃ´ng tin profile user
router.put('/user/profile', async (req, res) => {
  try {
    // Láº¥y user_id tá»« body hoáº·c headers (giáº£ láº­p)
    const user_id = req.body?.user_id || req.headers?.['x-user-id'];
    if (!user_id) return res.status(401).json({ error: 'ChÆ°a Ä‘Äƒng nháº­p' });
    const { username, gender, avatar_url, avatar, phone, birth_date } = req.body;
    if (!username) return res.status(400).json({ error: 'Thiáº¿u tÃªn hiá»ƒn thá»‹' });
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

// Äá»•i máº­t kháº©u
router.post('/user/change-password', async (req, res) => {
  try {
    const user_id = req.body?.user_id || req.headers?.['x-user-id'];
    const { oldPassword, newPassword } = req.body;
    if (!user_id || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Thiáº¿u thÃ´ng tin' });
    }
    const db = getDb(req);
    // Láº¥y user
    const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [user_id]);
    if (!rows.length) return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y user' });
    const user = rows[0];
    // So sÃ¡nh máº­t kháº©u cÅ©
    const match = await require('bcrypt').compare(oldPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Máº­t kháº©u cÅ© khÃ´ng Ä‘Ãºng' });
    // Hash máº­t kháº©u má»›i
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
// Láº¥y danh sÃ¡ch user
router.get('/users', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT id, username, email, is_admin, email_verified, is_active, gender, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Cáº­p nháº­t quyá»n admin
router.put('/users/:id/admin', requireAdminMiddleware, async (req, res) => {
  const { is_admin } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE users SET is_admin=? WHERE id=?', [is_admin ? 1 : 0, req.params.id]);
    res.json({ message: 'Cáº­p nháº­t quyá»n admin thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cáº­p nháº­t tráº¡ng thÃ¡i khÃ³a/má»Ÿ khÃ³a tÃ i khoáº£n
router.put('/users/:id/status', requireAdminMiddleware, async (req, res) => {
  const { is_active } = req.body;
  try {
    const db = getDb(req);
    await db.execute('UPDATE users SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
    res.json({ message: 'Cáº­p nháº­t tráº¡ng thÃ¡i tÃ i khoáº£n thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// XÃ³a user
router.delete('/users/:id', requireAdminMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sá»­a thÃ´ng tin user
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
        new_comments
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

// ==================== CATEGORIES API ====================

// Láº¥y táº¥t cáº£ danh má»¥c
router.get('/categories', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.execute('SELECT * FROM categories ORDER BY id DESC');
    
    // Láº¥y thÃ´ng tin genres vÃ  countries cho tá»«ng category
    const categoriesWithDetails = await Promise.all(rows.map(async (category) => {
      // Láº¥y genres cá»§a category
      const [genres] = await db.execute(
        `SELECT g.* FROM genres g
         JOIN category_genres cg ON g.id = cg.genre_id
         WHERE cg.category_id = ?`,
        [category.id]
      );
      
      // Láº¥y countries cá»§a category (thá»­-catch Ä‘á»ƒ trÃ¡nh lá»—i náº¿u báº£ng chÆ°a tá»“n táº¡i)
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
        console.log('Báº£ng category_countries chÆ°a tá»“n táº¡i:', err.message);
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

// ThÃªm danh má»¥c má»›i
router.post('/categories', requireAdminMiddleware, async (req, res) => {
  const { name, genreIds, countryIds } = req.body;
  if (!name) return res.status(400).json({ message: 'TÃªn danh má»¥c khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng' });
  
  try {
    const db = getDb(req);
    const [result] = await db.execute('INSERT INTO categories (name, created_at) VALUES (?, NOW())', [name]);
    const categoryId = result.insertId;
    
    // ThÃªm liÃªn káº¿t vá»›i thá»ƒ loáº¡i náº¿u cÃ³
    if (Array.isArray(genreIds) && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await db.execute('INSERT INTO category_genres (category_id, genre_id) VALUES (?, ?)', [categoryId, genreId]);
      }
    }
    
    // ThÃªm liÃªn káº¿t vá»›i quá»‘c gia náº¿u cÃ³
    try {
      if (Array.isArray(countryIds) && countryIds.length > 0) {
        for (const countryId of countryIds) {
          await db.execute('INSERT INTO category_countries (category_id, country_id) VALUES (?, ?)', [categoryId, countryId]);
        }
      }
    } catch (err) {
      console.log('Báº£ng category_countries chÆ°a tá»“n táº¡i, bá» qua xá»­ lÃ½ quá»‘c gia:', err.message);
    }
    
    res.json({ success: true, id: categoryId, message: 'ThÃªm danh má»¥c thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sá»­a danh má»¥c
router.put('/categories/:id', requireAdminMiddleware, async (req, res) => {
  const { name, genreIds, countryIds } = req.body;
  const categoryId = req.params.id;
  
  console.log('PUT /categories/:id', { categoryId, name, genreIds, countryIds });
  
  if (!name) return res.status(400).json({ message: 'TÃªn danh má»¥c khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng' });
  
  try {
    const db = getDb(req);
    await db.execute('UPDATE categories SET name = ? WHERE id = ?', [name, categoryId]);
    
    // XÃ³a cÃ¡c liÃªn káº¿t thá»ƒ loáº¡i cÅ©
    await db.execute('DELETE FROM category_genres WHERE category_id = ?', [categoryId]);
    
    // ThÃªm láº¡i cÃ¡c liÃªn káº¿t thá»ƒ loáº¡i má»›i
    if (Array.isArray(genreIds) && genreIds.length > 0) {
      for (const genreId of genreIds) {
        await db.execute('INSERT INTO category_genres (category_id, genre_id) VALUES (?, ?)', [categoryId, genreId]);
      }
    }
    
    // XÃ³a cÃ¡c liÃªn káº¿t quá»‘c gia cÅ© (náº¿u báº£ng tá»“n táº¡i)
    try {
      await db.execute('DELETE FROM category_countries WHERE category_id = ?', [categoryId]);
      
      // ThÃªm láº¡i cÃ¡c liÃªn káº¿t quá»‘c gia má»›i
      if (Array.isArray(countryIds) && countryIds.length > 0) {
        for (const countryId of countryIds) {
          await db.execute('INSERT INTO category_countries (category_id, country_id) VALUES (?, ?)', [categoryId, countryId]);
        }
      }
    } catch (err) {
      console.log('Báº£ng category_countries chÆ°a tá»“n táº¡i, bá» qua xá»­ lÃ½ quá»‘c gia:', err.message);
    }
    
    res.json({ success: true, message: 'Cáº­p nháº­t danh má»¥c thÃ nh cÃ´ng' });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ message: err.message });
  }
});

// XÃ³a danh má»¥c
router.delete('/categories/:id', requireAdminMiddleware, async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    // XÃ³a cÃ¡c liÃªn káº¿t trÆ°á»›c khi xÃ³a category
    await db.execute('DELETE FROM category_genres WHERE category_id = ?', [categoryId]);
    
    // XÃ³a liÃªn káº¿t quá»‘c gia náº¿u báº£ng tá»“n táº¡i
    try {
      await db.execute('DELETE FROM category_countries WHERE category_id = ?', [categoryId]);
    } catch (err) {
      console.log('Báº£ng category_countries chÆ°a tá»“n táº¡i, bá» qua:', err.message);
    }
    
    await db.execute('DELETE FROM categories WHERE id = ?', [categoryId]);
    res.json({ success: true, message: 'XÃ³a danh má»¥c thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Láº¥y thá»ƒ loáº¡i cá»§a danh má»¥c
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

// Láº¥y quá»‘c gia cá»§a danh má»¥c
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
    console.log('Lá»—i khi láº¥y quá»‘c gia cá»§a danh má»¥c:', err.message);
    // Tráº£ vá» máº£ng rá»—ng náº¿u báº£ng chÆ°a tá»“n táº¡i
    res.json([]);
  }
});

// Láº¥y phim theo danh má»¥c (dá»±a trÃªn cÃ¡c thá»ƒ loáº¡i vÃ  quá»‘c gia cá»§a danh má»¥c)
router.get('/categories/:id/movies', async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const db = getDb(req);
    const limit = req.query.limit ? clampLimit(req.query.limit, 12) : null;
    
    // Láº¥y cÃ¡c genre_id cá»§a category nÃ y
    const [genres] = await db.execute(
      'SELECT genre_id FROM category_genres WHERE category_id = ?',
      [categoryId]
    );
    
    // Láº¥y cÃ¡c country_id cá»§a category nÃ y
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
    
    // ThÃªm Ä‘iá»u kiá»‡n genre náº¿u cÃ³
    if (genreIds.length > 0) {
      sql += ' JOIN movie_genres mg ON m.id = mg.movie_id';
      conditions.push(`mg.genre_id IN (${genreIds.map(() => '?').join(',')})`);
      params.push(...genreIds);
    }
    
    // ThÃªm Ä‘iá»u kiá»‡n country náº¿u cÃ³
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
    
    // ThÃªm thÃ´ng tin genres vÃ  countries cho tá»«ng phim
    const moviesWithDetails = await Promise.all(movies.map(async (movie) => {
      // Láº¥y genres cá»§a phim
      const [movieGenres] = await db.execute(
        `SELECT g.* FROM genres g
         JOIN movie_genres mg ON g.id = mg.genre_id
         WHERE mg.movie_id = ?`,
        [movie.id]
      );
      
      // Láº¥y countries cá»§a phim
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

// API Ä‘á»ƒ táº¡o báº£ng category_countries (chá»‰ dÃ¹ng má»™t láº§n)
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
    res.json({ success: true, message: 'Báº£ng category_countries Ä‘Ã£ Ä‘Æ°á»£c táº¡o thÃ nh cÃ´ng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 


