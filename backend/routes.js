const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getSimilarMovies, getUserRecommendations, clampLimit } = require('./services/recommendationService');
const { chatWithMovieAdvisor, getAiStatus } = require('./services/aiService');
const { ensureChatSession, getAiChatStats, saveChatExchange } = require('./services/chatSessionService');
const { translateSubtitle } = require('./services/subtitleTranslatorService');
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

function normalizeProfilePayload(body = {}) {
  const name = String(body.name || '').trim().slice(0, 60);
  const avatarColor = String(body.avatar_color || '#E50914').trim().slice(0, 20);
  const isKids = body.is_kids === true || body.is_kids === 1 || body.is_kids === '1';
  return { name, avatarColor, isKids };
}

async function ensureDefaultProfile(db, userId) {
  const [existing] = await db.execute(
    `SELECT id, user_id, name, avatar_color, is_kids, is_default
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
    'INSERT INTO user_profiles (user_id, name, avatar_color, is_kids, is_default) VALUES (?, ?, ?, 0, 1)',
    [userId, users[0].username || 'Profile', '#E50914']
  );
  return {
    id: result.insertId,
    user_id: Number(userId),
    name: users[0].username || 'Profile',
    avatar_color: '#E50914',
    is_kids: 0,
    is_default: 1,
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
      `SELECT id, user_id, name, avatar_color, is_kids, is_default, created_at, updated_at
       FROM user_profiles
       WHERE user_id = ?
       ORDER BY is_default DESC, id ASC`,
      [userId]
    );
    res.json(rows.map((profile) => ({
      ...profile,
      is_kids: Boolean(profile.is_kids),
      is_default: Boolean(profile.is_default),
    })));
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const db = getDb(req);
    const { name, avatarColor, isKids } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'Tên profile không được để trống' });

    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM user_profiles WHERE user_id = ?', [userId]);
    if (Number(count) >= 5) return res.status(400).json({ message: 'Mỗi tài khoản tối đa 5 profile' });

    const isDefault = Number(count) === 0 ? 1 : 0;
    const [result] = await db.execute(
      'INSERT INTO user_profiles (user_id, name, avatar_color, is_kids, is_default) VALUES (?, ?, ?, ?, ?)',
      [userId, name, avatarColor, isKids ? 1 : 0, isDefault]
    );
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ profile: rows[0] });
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
    const { name, avatarColor, isKids } = normalizeProfilePayload(req.body);
    if (!name) return res.status(400).json({ message: 'Tên profile không được để trống' });

    await db.execute(
      'UPDATE user_profiles SET name = ?, avatar_color = ?, is_kids = ? WHERE id = ? AND user_id = ?',
      [name, avatarColor, isKids ? 1 : 0, profileId, userId]
    );
    const [rows] = await db.execute('SELECT * FROM user_profiles WHERE id = ? LIMIT 1', [profileId]);
    res.json({ profile: rows[0] });
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
    res.json({ profile: rows[0] });
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
    const [rows] = await db.execute(
      `SELECT * FROM movies ${includeHidden ? '' : 'WHERE is_visible = 1'} ORDER BY created_at DESC`
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
      `SELECT d.name FROM movie_directors md JOIN directors d ON md.director_id = d.id WHERE md.movie_id = ?`, [movieId]
    );
    const directors = directorRows.map(d => d.name);

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

    // 9. Suggested movies (top imdb_rating, trừ phim hiện tại)
    const suggestedRows = await getSimilarMovies(db, movieId, 12);

    // 10. Kết quả trả về
    res.json({
      id: movie.id,
      title: movie.title,
      poster_url: cleanImageUrl(movie.poster_url),
      bg_url,
      title_url,
      age_limit: movie.age_limit,
      release_year: movie.release_year,
      duration: movie.duration,
      description: movie.description,
      imdb_rating: movie.imdb_rating,
      genres,
      countries,
      producers,
      directors,
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

    // 3. Danh sách tập
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
    const [rows] = await db.execute('SELECT * FROM actors ORDER BY name');
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
  const { episode_number, title, video_url, subtitle_url } = req.body;
  if (!episode_number || !title || !video_url) {
    return res.status(400).json({ message: 'Thiếu thông tin tập phim' });
  }
  try {
    const db = getDb(req);
    await db.execute(
      'INSERT INTO episodes (movie_id, episode_number, title, video_url, subtitle_url) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, episode_number, title, video_url, subtitle_url || null]
    );
    res.json({ message: 'Đã thêm tập phim' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sửa tập phim
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
       ORDER BY h.last_watched_at DESC`,
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
    if (!userId) return res.status(401).json({ message: 'ChÆ°a Ä‘Äƒng nháº­p' });

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
      const [mine] = await db.execute(
        'SELECT rating FROM movie_ratings WHERE movie_id = ? AND user_id = ? LIMIT 1',
        [req.params.id, userId]
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
    await db.execute(
      `INSERT INTO movie_ratings (user_id, movie_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()`,
      [userId, req.params.id, rating]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/movies/:id/comments', async (req, res) => {
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

router.post('/movies/:id/comments', async (req, res) => {
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

router.post('/movies/:id/reports', async (req, res) => {
  try {
    const userId = getUserId(req) || null;
    const reason = String(req.body.reason || '').trim();
    const description = String(req.body.description || '').trim();
    const episodeId = req.body.episode_id || null;
    if (!reason) return res.status(400).json({ message: 'Vui lòng chọn lý do báo lỗi' });
    const db = getDb(req);
    await db.execute(
      'INSERT INTO movie_reports (user_id, movie_id, episode_id, reason, description) VALUES (?, ?, ?, ?, ?)',
      [userId, req.params.id, episodeId, reason.slice(0, 100), description || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/movie-reports', async (req, res) => {
  try {
    const userId = getUserId(req) || null;
    const movieId = toPositiveInt(req.body?.movie_id);
    const episodeId = req.body?.episode_id ? toPositiveInt(req.body.episode_id) : null;
    const reason = String(req.body?.reason || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!movieId) return res.status(400).json({ message: 'Thiếu movie_id hợp lệ' });
    if (!reason) return res.status(400).json({ message: 'Vui lòng chọn lý do báo lỗi' });

    const db = getDb(req);
    const [movieRows] = await db.execute('SELECT id FROM movies WHERE id = ? LIMIT 1', [movieId]);
    if (!movieRows.length) return res.status(404).json({ message: 'Phim không tồn tại' });

    if (episodeId) {
      const [episodeRows] = await db.execute(
        'SELECT id FROM episodes WHERE id = ? AND movie_id = ? LIMIT 1',
        [episodeId, movieId]
      );
      if (!episodeRows.length) {
        return res.status(400).json({ message: 'Tập phim không tồn tại hoặc không thuộc phim này' });
      }
    }

    await db.execute(
      'INSERT INTO movie_reports (user_id, movie_id, episode_id, reason, description) VALUES (?, ?, ?, ?, ?)',
      [userId, movieId, episodeId, reason.slice(0, 100), description.slice(0, 1000) || null]
    );

    res.json({ success: true, message: 'Đã gửi báo lỗi video.' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.get('/admin/comments', async (req, res) => {
  try {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const [rows] = await auth.db.execute(
      `SELECT c.id, c.content, c.status, c.created_at, c.updated_at,
              u.username, u.email, m.id AS movie_id, m.title AS movie_title
       FROM movie_comments c
       JOIN users u ON c.user_id = u.id
       JOIN movies m ON c.movie_id = m.id
       ORDER BY c.created_at DESC`
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
    const status = req.body.status === 'hidden' ? 'hidden' : 'visible';
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
    const [rows] = await auth.db.execute(
      `SELECT r.id, r.reason, r.description, r.status, r.admin_note, r.created_at, r.updated_at,
              u.username, u.email, m.id AS movie_id, m.title AS movie_title,
              e.episode_number
       FROM movie_reports r
       LEFT JOIN users u ON r.user_id = u.id
       JOIN movies m ON r.movie_id = m.id
       LEFT JOIN episodes e ON r.episode_id = e.id
       ORDER BY FIELD(r.status, 'open', 'resolved', 'rejected'), r.created_at DESC`
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
    const allowed = ['open', 'resolved', 'rejected'];
    const status = allowed.includes(req.body.status) ? req.body.status : 'open';
    const adminNote = String(req.body.admin_note || '').trim() || null;
    await auth.db.execute(
      'UPDATE movie_reports SET status = ?, admin_note = ? WHERE id = ?',
      [status, adminNote, req.params.id]
    );
    res.json({ success: true });
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
    const [rows] = await db.execute('SELECT id, username, email, is_admin, email_verified, is_active, gender, created_at FROM users ORDER BY created_at DESC');
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
    
    // Open reports
    const [[{ open_reports }]] = await db.query("SELECT COUNT(*) as open_reports FROM movie_reports WHERE status='open'");
    
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
      open: 0,
      resolved: 0,
      rejected: 0
    };
    reportStatsRows.forEach(row => {
      if (report_stats[row.status] !== undefined) {
        report_stats[row.status] = row.count;
      }
    });

    // 3. Report Table (Recent reports)
    let recentReportsQuery = `
      SELECT r.*, m.title as movie_title, u.username as reporter_name
      FROM movie_reports r
      LEFT JOIN movies m ON r.movie_id = m.id
      LEFT JOIN users u ON r.user_id = u.id
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
        new_comments
      },
      charts: {
        daily_views,
        top_movies,
        top_genres,
        top_countries,
        movie_types,
        report_stats
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
    
    sql += ' ORDER BY m.created_at DESC';
    
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

module.exports = router; 

