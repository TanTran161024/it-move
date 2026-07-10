const {
  getAiExcludedFeedbackMovieIds,
  getAiNegativeFeedbackSeeds,
  getAiPositiveFeedbackSeeds,
} = require('./aiFeedbackService');
const { getProfileTasteProfile, scoreMovieWithTaste } = require('./profileTasteService');
const { getDenseSearchScores } = require('./denseEmbeddingService');
const { rerankCandidates } = require('./hybridRerankerService');
const { getMovieEngagementScores } = require('./recommendationAnalyticsService');

const DEFAULT_LIMIT = 12;
const MAX_POOL_SIZE = 240;
const CURRENT_YEAR = new Date().getFullYear();
const VECTOR_MIN_SIMILARITY = 0.16;
const VECTOR_STRONG_SIMILARITY = 0.24;
const VECTOR_SCORE_WEIGHT = 95;
const DENSE_MIN_SIMILARITY = Number(process.env.DENSE_SEARCH_MIN_SIMILARITY || 0.35);
const DENSE_STRONG_SIMILARITY = Number(process.env.DENSE_SEARCH_STRONG_SIMILARITY || 0.52);
const DENSE_SCORE_WEIGHT = Number(process.env.DENSE_SEARCH_SCORE_WEIGHT || 80);
const COUNTRY_SIGNALS = new Set(['trung quoc', 'han quoc', 'nhat ban', 'viet nam', 'my']);
const STOP_WORDS = new Set([
  'toi', 'minh', 'ban', 'muon', 'can', 'xem', 'phim', 'bo', 'tap', 'co',
  'khong', 'goi', 'y', 'tu', 'van', 'cho', 'hay', 'nao', 'gi', 'mot',
  'cac', 'nhung', 'the', 'loai', 'hom', 'nay', 'that', 'su',
]);
const VECTOR_STOP_WORDS = new Set([
  ...STOP_WORDS,
  'khac', 'them', 'nua', 'doi', 'chon', 'loc', 'neu', 'duoc', 'giup', 'voi',
  'sau', 'luc', 'dang', 'thu', 'kieu', 'hoi', 'nhieu', 'it', 'gio', 'lam',
]);

const NEGATION_PREFIXES = [
  'khong',
  'khong thich',
  'khong muon',
  'khong can',
  'bo',
  'tranh',
  'it',
  'bot',
  'dung',
];

const SEMANTIC_CONCEPTS = [
  {
    id: 'light',
    label: 'nhẹ nhàng/dễ xem',
    query: ['nhe nhang', 'nhe nhang hon', 'chill', 'thu gian', 'de xem', 'am ap', 'doi thuong', 'khong nang dau'],
    movie: ['hai', 'hai huoc', 'tinh cam', 'lang man', 'gia dinh', 'hoc duong', 'doi thuong', 'de thuong'],
    wanted: ['nhe nhang', 'hai', 'tinh cam', 'hoc duong'],
    weight: 34,
  },
  {
    id: 'intense',
    label: 'gay cấn/hồi hộp',
    query: ['gay can', 'cang thang', 'hoi hop', 'nghet tho', 'kich tinh', 'cang hon'],
    movie: ['gay can', 'cang thang', 'hoi hop', 'hinh su', 'hanh dong', 'chien dau', 'sat thu', 'bi an'],
    wanted: ['gay can', 'hanh dong', 'bi an'],
    weight: 32,
  },
  {
    id: 'horror',
    label: 'kinh dị',
    query: ['kinh di', 'ma', 'am anh', 'horror'],
    movie: ['kinh di', 'ma', 'am anh', 'quy', 'horror'],
    wanted: ['kinh di'],
    weight: 42,
    hardExclude: true,
  },
  {
    id: 'anime',
    label: 'anime/hoạt hình',
    query: ['anime', 'hoat hinh', 'cartoon'],
    movie: ['anime', 'hoat hinh', 'animation', 'cartoon'],
    wanted: ['hoat hinh'],
    weight: 42,
    hardExclude: true,
  },
  {
    id: 'short',
    label: 'thời lượng ngắn',
    query: ['ngan', 'ngan thoi', 'xem nhanh', 'gon hon', 'tap ngan', 'duoi 90 phut', 'duoi mot tieng', 'duoi 1 tieng', 'khong dai'],
    weight: 30,
    matchProfile: (profile) => {
      const minutes = parseMovieDurationMinutes(profile.duration);
      return (minutes && minutes <= 60) || Boolean(profile.is_series);
    },
  },
  {
    id: 'long',
    label: 'thời lượng dài',
    query: ['dai', 'dai tap', 'xem lau', 'marathon', 'nhieu tap'],
    weight: 24,
    hardExclude: true,
    matchProfile: (profile) => {
      const minutes = parseMovieDurationMinutes(profile.duration);
      return (minutes && minutes > 120) || Boolean(profile.is_series);
    },
  },
  {
    id: 'series',
    label: 'phim bộ/series',
    query: ['phim bo', 'series', 'nhieu tap'],
    movie: ['phim bo', 'series'],
    weight: 28,
    hardExclude: true,
    matchProfile: (profile) => Boolean(profile.is_series),
  },
  {
    id: 'movie',
    label: 'phim lẻ',
    query: ['phim le', 'mot tap', 'khong phim bo', 'khong series'],
    weight: 28,
    matchProfile: (profile) => !Boolean(profile.is_series),
  },
  {
    id: 'high_rating',
    label: 'đánh giá cao',
    query: ['imdb cao', 'diem cao', 'rating cao', 'danh gia cao', 'chat luong'],
    weight: 24,
    matchProfile: (profile) => Number(profile.imdb_rating) >= 7,
  },
  {
    id: 'new_release',
    label: 'phim mới',
    query: ['phim moi', 'moi nhat', 'gan day', 'nam moi', 'moi hon'],
    weight: 22,
    matchProfile: (profile) => Number(profile.release_year) >= CURRENT_YEAR - 5,
  },
  {
    id: 'korean',
    label: 'Hàn Quốc',
    query: ['han quoc', 'phim han', 'han', 'korean'],
    movie: ['han quoc', 'korea', 'korean'],
    wanted: ['han quoc'],
    weight: 40,
    hardExclude: true,
    structuredOnly: true,
  },
  {
    id: 'chinese',
    label: 'Trung Quốc',
    query: ['trung quoc', 'phim trung', 'trung', 'hoa ngu', 'chinese'],
    movie: ['trung quoc', 'hoa ngu', 'china', 'chinese'],
    wanted: ['trung quoc'],
    weight: 40,
    hardExclude: true,
    structuredOnly: true,
  },
  {
    id: 'japanese',
    label: 'Nhật Bản',
    query: ['nhat ban', 'phim nhat', 'nhat', 'japan', 'japanese'],
    movie: ['nhat ban', 'japan', 'japanese'],
    wanted: ['nhat ban'],
    weight: 40,
    hardExclude: true,
    structuredOnly: true,
  },
  {
    id: 'american',
    label: 'Mỹ/Âu Mỹ',
    query: ['my', 'au my', 'hollywood', 'us', 'american'],
    movie: ['my', 'au my', 'hollywood', 'american'],
    wanted: ['my'],
    weight: 36,
    hardExclude: true,
    structuredOnly: true,
  },
  {
    id: 'documentary',
    label: 'tài liệu',
    query: ['tai lieu', 'documentary', 'doi thuc'],
    movie: ['tai lieu', 'documentary'],
    wanted: ['tai lieu'],
    weight: 38,
  },
  {
    id: 'martial_arts',
    label: 'võ thuật/kiếm hiệp',
    query: ['vo thuat', 'kiem hiep', 'kungfu'],
    movie: ['vo thuat', 'kiem hiep', 'kungfu', 'hanh dong', 'co trang'],
    wanted: ['vo thuat', 'co trang'],
    weight: 38,
  },
];

const VECTOR_SYNONYM_GROUPS = [
  ['chua lanh', 'healing', 'heal', 'am ap', 'doi thuong', 'nhe nhang', 'de xem', 'thu gian', 'chill', 'feel good', 'gia dinh', 'tinh cam'],
  ['cang thang', 'gay can', 'hoi hop', 'nghet tho', 'thriller', 'bi an', 'hinh su', 'trinh tham'],
  ['cuoi', 'vui', 'vui ve', 'hai huoc', 'hai', 'comedy', 'giai tri'],
  ['buon', 'cam dong', 'nuoc mat', 'tam ly', 'chinh kich', 'drama'],
  ['phep thuat', 'ma thuat', 'magic', 'magical', 'fantasy', 'vien tuong', 'than thoai', 'isekai', 'xuyen khong', 'chuyen sinh'],
  ['bong da', 'the thao', 'sport', 'sports', 'tai lieu', 'doi thuc'],
  ['yeu', 'love', 'romance', 'romantic', 'lang man', 'tinh cam'],
  ['hoc sinh', 'truong hoc', 'hoc duong', 'thanh xuan', 'tuoi tre'],
  ['anime', 'hoat hinh', 'animation', 'cartoon', 'nhat ban'],
  ['han quoc', 'korean', 'phim han', 'lang man', 'tam ly'],
  ['trung quoc', 'hoa ngu', 'co trang', 'kiem hiep', 'vo thuat'],
];

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function clampPoolLimit(value, fallback = MAX_POOL_SIZE) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_POOL_SIZE);
}

function parseIdList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseNameList(value) {
  if (!value) return [];
  return String(value)
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}(\\s|$)`);
  return pattern.test(text);
}

function phraseWords(phrase) {
  return normalizeText(phrase).split(' ').filter((word) => word.length >= 2);
}

function isNegatedPhrase(text, phrase) {
  return NEGATION_PREFIXES.some((prefix) => {
    const candidate = `${prefix} ${phrase}`;
    if (!containsPhrase(text, candidate)) return false;

    // "phim bo nhieu tap" means a series; "bo" is not the verb "skip" here.
    if (prefix === 'bo' && containsPhrase(text, `phim ${candidate}`)) return false;
    return true;
  });
}

function addSignalWords(target, phrases) {
  phrases.forEach((phrase) => {
    phraseWords(phrase).forEach((word) => target.add(word));
  });
}

function parseMovieDurationMinutes(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const hourMatch = normalized.match(/(\d+)\s*(gio|h)/);
  const minuteMatch = normalized.match(/(\d+)\s*(phut|p|min)/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  if (hours || minutes) return (hours * 60) + minutes;
  const numberMatch = normalized.match(/\b(\d{1,3})\b/);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function profileSemanticText(profile) {
  return normalizeText([
    profile.title,
    profile.original_title,
    profile.description,
    profile.genres.join(' '),
    profile.countries.join(' '),
    profile.actors.slice(0, 8).join(' '),
    profile.directors.join(' '),
    profile.is_series ? 'phim bo series nhieu tap' : 'phim le mot tap',
  ].join(' '));
}

function profileStructuredText(profile) {
  return normalizeText([
    profile.genres.join(' '),
    profile.countries.join(' '),
    profile.is_series ? 'phim bo series nhieu tap' : 'phim le mot tap',
  ].join(' '));
}

function conceptAliases(concept) {
  return [...(concept.movie || []), ...(concept.query || [])].map(normalizeText).filter(Boolean);
}

function conceptMatchesProfile(profile, concept, haystack = profileSemanticText(profile)) {
  if (concept.matchProfile?.(profile)) return true;
  const targetText = concept.structuredOnly ? profileStructuredText(profile) : haystack;
  return conceptAliases(concept).some((alias) => containsPhrase(targetText, alias));
}

function buildSemanticSignals(message, signals) {
  const normalized = signals?.normalized || normalizeText(message);
  const wantedSet = new Set(signals?.wanted || []);
  const include = [];
  const exclude = [];

  SEMANTIC_CONCEPTS.forEach((concept) => {
    const queryAliases = (concept.query || []).map(normalizeText).filter(Boolean);
    const wantedMatch = (concept.wanted || []).some((wanted) => wantedSet.has(wanted));
    const positiveMatch = queryAliases.some((alias) => containsPhrase(normalized, alias) && !isNegatedPhrase(normalized, alias));
    const negativeMatch = queryAliases.some((alias) => containsPhrase(normalized, alias) && isNegatedPhrase(normalized, alias));

    if (negativeMatch) {
      exclude.push(concept);
      return;
    }
    if (positiveMatch || wantedMatch) include.push(concept);
  });

  const excludedIds = new Set(exclude.map((concept) => concept.id));
  return {
    include: include.filter((concept, index, list) => !excludedIds.has(concept.id) && list.findIndex((item) => item.id === concept.id) === index),
    exclude: exclude.filter((concept, index, list) => list.findIndex((item) => item.id === concept.id) === index),
  };
}

function scoreSemanticMatch(profile, semantic) {
  const haystack = profileSemanticText(profile);
  let score = 0;
  let positiveMatches = 0;
  let blocked = false;
  const reasons = [];

  for (const concept of semantic.include || []) {
    if (!conceptMatchesProfile(profile, concept, haystack)) continue;
    positiveMatches += 1;
    score += concept.weight || 24;
    reasons.push(`Hợp ý ${concept.label}`);
  }

  for (const concept of semantic.exclude || []) {
    if (!conceptMatchesProfile(profile, concept, haystack)) continue;
    score -= Math.max(36, concept.weight || 24);
    if (concept.hardExclude) blocked = true;
  }

  return {
    score,
    positiveMatches,
    blocked,
    reasons: unique(reasons).slice(0, 4),
  };
}

function addVectorValue(vector, feature, weight = 1) {
  if (!feature || !Number.isFinite(weight) || weight === 0) return;
  const key = String(feature).trim();
  if (!key) return;
  vector.set(key, (vector.get(key) || 0) + weight);
}

function vectorTokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length >= 2 && !VECTOR_STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

function addTextToVector(vector, value, weight = 1) {
  const tokens = vectorTokens(value);
  tokens.forEach((token) => {
    addVectorValue(vector, `tok:${token}`, weight);
    if (token.length >= 5) addVectorValue(vector, `stem:${token.slice(0, 5)}`, weight * 0.35);
  });

  for (let index = 0; index < tokens.length - 1; index += 1) {
    addVectorValue(vector, `bi:${tokens[index]} ${tokens[index + 1]}`, weight * 1.35);
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    addVectorValue(vector, `tri:${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`, weight * 0.75);
  }
}

function normalizeVector(vector) {
  let magnitude = 0;
  vector.forEach((value) => {
    magnitude += value * value;
  });
  magnitude = Math.sqrt(magnitude);
  if (!magnitude) return { values: vector, magnitude: 0 };

  const normalized = new Map();
  vector.forEach((value, key) => {
    normalized.set(key, value / magnitude);
  });
  return { values: normalized, magnitude: 1 };
}

function cosineSparse(left, right) {
  if (!left?.values?.size || !right?.values?.size) return 0;
  const smaller = left.values.size <= right.values.size ? left.values : right.values;
  const larger = left.values.size <= right.values.size ? right.values : left.values;
  let total = 0;
  smaller.forEach((value, key) => {
    if (larger.has(key)) total += value * larger.get(key);
  });
  return total;
}

function addSynonymExpansion(vector, sourceText, weight = 0.85) {
  const normalized = normalizeText(sourceText);
  VECTOR_SYNONYM_GROUPS.forEach((group) => {
    const aliases = group.map(normalizeText).filter(Boolean);
    if (!aliases.some((alias) => containsPhrase(normalized, alias))) return;
    aliases.forEach((alias) => addTextToVector(vector, alias, weight));
  });
}

function buildQueryVector(message, signals, semantic) {
  const vector = new Map();
  const normalized = signals?.normalized || normalizeText(message);
  addTextToVector(vector, normalized, 1.35);
  addSynonymExpansion(vector, normalized, 1.1);

  (signals?.wanted || []).forEach((wanted) => {
    addTextToVector(vector, wanted, 1.6);
  });

  (semantic?.include || []).forEach((concept) => {
    addTextToVector(vector, concept.label, 1.2);
    (concept.query || []).forEach((alias) => addTextToVector(vector, alias, 1.15));
    (concept.movie || []).forEach((alias) => addTextToVector(vector, alias, 1.25));
  });

  const meaningfulTokens = vectorTokens(normalized);
  return {
    ...normalizeVector(vector),
    active: meaningfulTokens.length > 0 || (signals?.wanted || []).length > 0 || (semantic?.include || []).length > 0,
    terms: meaningfulTokens.slice(0, 8),
  };
}

function buildProfileVector(profile) {
  const vector = new Map();
  addTextToVector(vector, profile.title, 2.4);
  addTextToVector(vector, profile.original_title, 1.5);
  addTextToVector(vector, profile.description, 0.85);
  addTextToVector(vector, profile.genres.join(' '), 2.3);
  addTextToVector(vector, profile.countries.join(' '), 1.7);
  addTextToVector(vector, profile.actors.slice(0, 8).join(' '), 0.35);
  addTextToVector(vector, profile.directors.join(' '), 0.45);
  addTextToVector(vector, profile.is_series ? 'phim bo series nhieu tap' : 'phim le mot tap', 0.7);

  const profileText = profileSemanticText(profile);
  addSynonymExpansion(vector, profileText, 0.55);
  SEMANTIC_CONCEPTS.forEach((concept) => {
    if (!conceptMatchesProfile(profile, concept, profileText)) return;
    addTextToVector(vector, concept.label, 0.45);
    (concept.query || []).forEach((alias) => addTextToVector(vector, alias, 0.45));
  });

  return normalizeVector(vector);
}

function scoreVectorMatch(profile, queryVector) {
  if (!queryVector?.active || !queryVector.values?.size) {
    return { score: 0, similarity: 0, matched: false, strong: false, reasons: [] };
  }

  const similarity = cosineSparse(queryVector, buildProfileVector(profile));
  const matched = similarity >= VECTOR_MIN_SIMILARITY;
  const strong = similarity >= VECTOR_STRONG_SIMILARITY;
  const score = matched ? Math.round(similarity * VECTOR_SCORE_WEIGHT) : 0;

  return {
    score,
    similarity,
    matched,
    strong,
    reasons: strong ? ['Gần nghĩa với yêu cầu'] : [],
  };
}

function profileMatchesWanted(profile, wanted, haystack) {
  const aliasesByWanted = {
    'hanh dong': ['hanh dong'],
    hai: ['hai', 'hai huoc'],
    'tinh cam': ['tinh cam', 'lang man'],
    'kinh di': ['kinh di'],
    'gay can': ['gay can', 'hinh su', 'bi an', 'kinh di'],
    'bi an': ['bi an', 'trinh tham', 'hinh su'],
    'vien tuong': ['vien tuong', 'khoa hoc'],
    'phieu luu': ['phieu luu'],
    'hoat hinh': ['hoat hinh', 'anime'],
    'tam ly': ['tam ly', 'chinh kich'],
    'vo thuat': ['vo thuat'],
    'co trang': ['co trang', 'kiem hiep', 'than thoai'],
    'nhe nhang': ['hai huoc', 'tinh cam', 'gia dinh'],
    'tai lieu': ['tai lieu'],
    'hoc duong': ['hoc duong'],
    'trung quoc': ['trung quoc'],
    'han quoc': ['han quoc'],
    'nhat ban': ['nhat ban'],
    'viet nam': ['viet nam'],
    my: ['my', 'au my'],
  };

  const aliases = aliasesByWanted[wanted] || [wanted];
  const genreText = normalizeText(profile.genres.join(' '));
  const countryText = normalizeText(profile.countries.join(' '));
  const structuredText = `${genreText} ${countryText}`;

  if (aliases.some((alias) => containsPhrase(structuredText, alias))) return true;
  if (wanted === 'hoat hinh' && containsPhrase(countryText, 'nhat ban')) return true;
  if (wanted === 'vo thuat' && containsPhrase(countryText, 'trung quoc')) {
    return ['hanh dong', 'co trang', 'than thoai', 'phieu luu'].some((alias) => containsPhrase(genreText, alias));
  }
  if (wanted === 'hai' || wanted === 'my') return false;
  return aliases.some((alias) => containsPhrase(haystack, alias));
}

function readableSignal(label) {
  const labels = {
    'hanh dong': 'hành động',
    hai: 'hài',
    'tinh cam': 'tình cảm',
    'kinh di': 'kinh dị',
    'gay can': 'gay cấn/căng thẳng',
    'bi an': 'bí ẩn',
    'vien tuong': 'viễn tưởng',
    'phieu luu': 'phiêu lưu',
    'hoat hinh': 'anime/hoạt hình',
    'tam ly': 'tâm lý',
    'vo thuat': 'võ thuật',
    'co trang': 'cổ trang',
    'nhe nhang': 'nhẹ nhàng',
    'tai lieu': 'tài liệu',
    'hoc duong': 'học đường',
    'trung quoc': 'Trung Quốc',
    'han quoc': 'Hàn Quốc',
    'nhat ban': 'Nhật Bản',
    'viet nam': 'Việt Nam',
    my: 'Mỹ/Âu Mỹ',
  };
  return labels[label] || label;
}

function signalWeight(label) {
  if (COUNTRY_SIGNALS.has(label)) return 46;
  if (label === 'nhe nhang' || label === 'gay can' || label === 'bi an') return 30;
  return 52;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function nameOverlap(left, right) {
  const leftSet = new Set(left.map(normalizeText));
  return right.filter((item) => leftSet.has(normalizeText(item)));
}

function hydrateProfile(row) {
  return {
    id: row.id,
    title: row.title,
    original_title: row.original_title,
    slug: row.slug,
    description: row.description,
    poster_url: row.poster_url,
    release_year: row.release_year,
    duration: row.duration,
    is_series: row.is_series,
    imdb_rating: row.imdb_rating,
    quality: row.quality,
    status: row.status,
    views: Number(row.views) || 0,
    genre_ids: parseIdList(row.genre_ids),
    country_ids: parseIdList(row.country_ids),
    actor_ids: parseIdList(row.actor_ids),
    director_ids: parseIdList(row.director_ids),
    genres: parseNameList(row.genres),
    countries: parseNameList(row.countries),
    actors: parseNameList(row.actors),
    directors: parseNameList(row.directors),
  };
}

function toMovieCard(profile, extra = {}) {
  return {
    id: profile.id,
    title: profile.title,
    original_title: profile.original_title,
    slug: profile.slug,
    poster_url: profile.poster_url,
    release_year: profile.release_year,
    duration: profile.duration,
    is_series: profile.is_series,
    imdb_rating: profile.imdb_rating,
    quality: profile.quality,
    status: profile.status,
    description: profile.description,
    genres: profile.genres,
    countries: profile.countries,
    score: extra.score || 0,
    matched: extra.matched || { genres: [], countries: [], actors: [], directors: [] },
    match_score: extra.score || 0,
    match_reasons: extra.reasons || [],
    dense_similarity: Number.isFinite(extra.denseSimilarity) ? Number(extra.denseSimilarity.toFixed(4)) : null,
    rerank_score: Number.isFinite(extra.rerankScore) ? extra.rerankScore : null,
  };
}

async function getMovieProfiles(db, options = {}) {
  const params = [];
  const where = ['m.is_visible = 1'];

  if (options.ids?.length) {
    where.push(`m.id IN (${options.ids.map(() => '?').join(',')})`);
    params.push(...options.ids);
  }

  if (options.excludeIds?.length) {
    where.push(`m.id NOT IN (${options.excludeIds.map(() => '?').join(',')})`);
    params.push(...options.excludeIds);
  }

  const limit = clampPoolLimit(options.limit, MAX_POOL_SIZE);
  const [rows] = await db.execute(
    `
      SELECT
        m.id, m.title, m.original_title, m.slug, m.description, m.poster_url,
        m.release_year, m.duration, m.is_series, m.imdb_rating, m.quality, m.status,
        COALESCE(m.views, 0) AS views,
        GROUP_CONCAT(DISTINCT mg.genre_id) AS genre_ids,
        GROUP_CONCAT(DISTINCT mc.country_id) AS country_ids,
        GROUP_CONCAT(DISTINCT ma.actor_id) AS actor_ids,
        GROUP_CONCAT(DISTINCT md.director_id) AS director_ids,
        GROUP_CONCAT(DISTINCT g.name SEPARATOR '||') AS genres,
        GROUP_CONCAT(DISTINCT c.name SEPARATOR '||') AS countries,
        GROUP_CONCAT(DISTINCT a.name SEPARATOR '||') AS actors,
        GROUP_CONCAT(DISTINCT d.name SEPARATOR '||') AS directors
      FROM movies m
      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
      LEFT JOIN genres g ON mg.genre_id = g.id
      LEFT JOIN movie_countries mc ON m.id = mc.movie_id
      LEFT JOIN countries c ON mc.country_id = c.id
      LEFT JOIN movie_actors ma ON m.id = ma.movie_id
      LEFT JOIN actors a ON ma.actor_id = a.id
      LEFT JOIN movie_directors md ON m.id = md.movie_id
      LEFT JOIN directors d ON md.director_id = d.id
      WHERE ${where.join(' AND ')}
      GROUP BY
        m.id, m.title, m.original_title, m.slug, m.description, m.poster_url,
        m.release_year, m.duration, m.is_series, m.imdb_rating, m.quality, m.status, m.views
      ORDER BY COALESCE(m.views, 0) DESC, COALESCE(m.imdb_rating, 0) DESC, m.created_at DESC
      LIMIT ${limit}
    `,
    params
  );

  return rows.map(hydrateProfile);
}

function scoreAgainstSeed(seed, candidate) {
  const reasons = [];
  const matched = { genres: [], countries: [], actors: [], directors: [] };
  let score = 0;
  let contentScore = 0;

  const genreMatches = overlap(seed.genre_ids, candidate.genre_ids);
  if (genreMatches.length) {
    const points = genreMatches.length * 40;
    score += points;
    contentScore += points;
    matched.genres = nameOverlap(seed.genres, candidate.genres);
    reasons.push(`Trùng ${genreMatches.length} thể loại`);
  }

  const countryMatches = overlap(seed.country_ids, candidate.country_ids);
  if (countryMatches.length) {
    const points = countryMatches.length * 25;
    score += points;
    contentScore += points;
    matched.countries = nameOverlap(seed.countries, candidate.countries);
    reasons.push('Cùng quốc gia');
  }

  const actorMatches = overlap(seed.actor_ids, candidate.actor_ids);
  if (actorMatches.length) {
    const points = actorMatches.length * 20;
    score += points;
    contentScore += points;
    matched.actors = nameOverlap(seed.actors, candidate.actors);
    reasons.push(`Chung ${actorMatches.length} diễn viên`);
  }

  const directorMatches = overlap(seed.director_ids, candidate.director_ids);
  if (directorMatches.length) {
    const points = directorMatches.length * 20;
    score += points;
    contentScore += points;
    matched.directors = nameOverlap(seed.directors, candidate.directors);
    reasons.push('Cùng đạo diễn');
  }

  if (
    seed.is_series !== null
    && seed.is_series !== undefined
    && candidate.is_series !== null
    && candidate.is_series !== undefined
    && Boolean(seed.is_series) === Boolean(candidate.is_series)
  ) {
    score += 10;
    contentScore += 10;
    reasons.push(Boolean(candidate.is_series) ? 'Cùng là phim bộ' : 'Cùng là phim lẻ');
  }

  if (seed.release_year && candidate.release_year) {
    const yearGap = Math.abs(Number(seed.release_year) - Number(candidate.release_year));
    if (yearGap <= 2) {
      score += 15;
      contentScore += 15;
      reasons.push('Năm phát hành gần nhau');
    } else if (yearGap <= 5) {
      score += 8;
      contentScore += 8;
    }
  }

  if (seed.imdb_rating && candidate.imdb_rating) {
    const ratingGap = Math.abs(Number(seed.imdb_rating) - Number(candidate.imdb_rating));
    if (ratingGap <= 0.5) score += 8;
    else if (ratingGap <= 1) score += 4;
  }

  if (candidate.imdb_rating) score += Math.min(Number(candidate.imdb_rating), 10);
  score += Math.min(Math.log10((candidate.views || 0) + 1) * 2, 8);

  return {
    score: Math.round(score),
    contentScore,
    reasons: unique(reasons).slice(0, 4),
    matched,
  };
}

async function getPopularMovies(db, options = {}) {
  const profiles = await getMovieProfiles(db, {
    excludeIds: options.excludeIds || [],
    limit: clampLimit(options.limit, DEFAULT_LIMIT),
  });
  return profiles.map((profile) => toMovieCard(profile, {
    score: 0,
    reasons: ['Đang được xem nhiều'],
    matched: { genres: [], countries: [], actors: [], directors: [] },
  }));
}

async function getTasteOnlyRecommendations(db, tasteProfile, options = {}) {
  if (!tasteProfile?.signals_count) return [];

  const targetLimit = clampLimit(options.limit, DEFAULT_LIMIT);
  const candidates = await getMovieProfiles(db, {
    excludeIds: options.excludeIds || [],
    limit: MAX_POOL_SIZE,
  });

  const ranked = candidates
    .map((candidate) => {
      const taste = scoreMovieWithTaste(candidate, tasteProfile);
      const score = (taste.score * 6)
        + Math.min(Number(candidate.imdb_rating) || 0, 10)
        + Math.min(Math.log10((candidate.views || 0) + 1) * 2, 8);
      return {
        candidate,
        score: Math.round(score),
        contentScore: Math.max(0, taste.score),
        matched: { genres: [], countries: [], actors: [], directors: [] },
        reasons: taste.reasons?.length ? taste.reasons : ['Hợp gu profile'],
      };
    })
    .filter((item) => item.contentScore > 0)
    .sort((left, right) => right.score - left.score || (right.candidate.views || 0) - (left.candidate.views || 0))
    .slice(0, targetLimit)
    .map((item) => toMovieCard(item.candidate, item));

  if (ranked.length >= targetLimit) return ranked;

  const fallback = await getPopularMovies(db, {
    excludeIds: unique([...(options.excludeIds || []), ...ranked.map((movie) => movie.id)]),
    limit: targetLimit - ranked.length,
  });

  return [...ranked, ...fallback];
}

async function getSimilarMovies(db, movieId, limit = DEFAULT_LIMIT) {
  const targetLimit = clampLimit(limit);
  const numericId = Number(movieId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    const error = new Error('movie_id không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const [seed] = await getMovieProfiles(db, { ids: [numericId], limit: 1 });
  if (!seed) {
    const error = new Error('Không tìm thấy phim');
    error.statusCode = 404;
    throw error;
  }

  const candidates = await getMovieProfiles(db, { excludeIds: [numericId], limit: MAX_POOL_SIZE });
  const ranked = candidates
    .map((candidate) => {
      const result = scoreAgainstSeed(seed, candidate);
      return { candidate, ...result };
    })
    .filter((item) => item.contentScore > 0)
    .sort((left, right) => right.score - left.score || (right.candidate.views || 0) - (left.candidate.views || 0))
    .slice(0, targetLimit)
    .map((item) => toMovieCard(item.candidate, item));

  if (ranked.length >= targetLimit) return ranked;

  const fallback = await getPopularMovies(db, {
    excludeIds: [numericId, ...ranked.map((movie) => movie.id)],
    limit: targetLimit - ranked.length,
  });

  return [...ranked, ...fallback];
}

async function ensureUserExists(db, userId) {
  const [rows] = await db.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows.length > 0;
}

async function getCompletedMovieIds(db, userId, profileId = null) {
  const [rows] = await db.execute(
    `SELECT DISTINCT movie_id
     FROM user_watch_history
     WHERE user_id = ?
       AND (? IS NULL OR profile_id = ?)
       AND completed = 1`,
    [userId, profileId, profileId]
  );
  return rows.map((row) => Number(row.movie_id)).filter(Boolean);
}

function seedLastSeenTime(value) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeSeedRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const movieId = Number(row.movie_id);
    if (!movieId) return;
    const weight = Number(row.weight) || 1;
    const lastSeen = row.last_seen || null;
    const current = map.get(movieId);
    if (
      !current
      || weight > current.weight
      || (weight === current.weight && seedLastSeenTime(lastSeen) > seedLastSeenTime(current.last_seen))
    ) {
      map.set(movieId, { movie_id: movieId, weight, last_seen: lastSeen });
    }
  });

  return [...map.values()]
    .sort((left, right) => right.weight - left.weight || seedLastSeenTime(right.last_seen) - seedLastSeenTime(left.last_seen))
    .slice(0, 12);
}

async function getUserSeedMovies(db, userId, profileId = null) {
  const [rows] = await db.execute(
    `
      SELECT movie_id, MAX(weight) AS weight, MAX(last_seen) AS last_seen
      FROM (
        SELECT movie_id, 5 AS weight, created_at AS last_seen
        FROM user_favorites
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
        UNION ALL
        SELECT movie_id, 4 AS weight, created_at AS last_seen
        FROM user_watchlist
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
        UNION ALL
        SELECT
          movie_id,
          CASE
            WHEN rating >= 8 THEN 5
            WHEN rating >= 6 THEN 4
            ELSE 2
          END AS weight,
          updated_at AS last_seen
        FROM movie_ratings
        WHERE user_id = ?
        UNION ALL
        SELECT movie_id, 3 AS weight, last_watched_at AS last_seen
        FROM user_watch_history
        WHERE user_id = ? AND (? IS NULL OR profile_id = ?)
      ) seeds
      GROUP BY movie_id
      ORDER BY weight DESC, last_seen DESC
      LIMIT 10
    `,
    [userId, profileId, profileId, userId, profileId, profileId, userId, userId, profileId, profileId]
  );
  const aiFeedbackRows = await getAiPositiveFeedbackSeeds(db, userId, profileId);
  return mergeSeedRows([...rows, ...aiFeedbackRows])
    .map((row) => ({
      movie_id: row.movie_id,
      weight: row.weight,
    }));
}

async function getUserRecommendations(db, userId, limit = DEFAULT_LIMIT, profileId = null, options = {}) {
  const targetLimit = clampLimit(limit);
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    const error = new Error('userId không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const userExists = await ensureUserExists(db, numericUserId);
  if (!userExists) {
    const error = new Error('Không tìm thấy người dùng');
    error.statusCode = 404;
    throw error;
  }

  const providedTasteProfile = options.tasteProfile || null;
  const [completedIds, feedbackExcludedIds, seedRows, negativeSeedRows, tasteProfile] = await Promise.all([
    getCompletedMovieIds(db, numericUserId, profileId),
    getAiExcludedFeedbackMovieIds(db, numericUserId, profileId),
    getUserSeedMovies(db, numericUserId, profileId),
    getAiNegativeFeedbackSeeds(db, numericUserId, profileId),
    providedTasteProfile ? Promise.resolve(providedTasteProfile) : getProfileTasteProfile(db, numericUserId, profileId).catch(() => null),
  ]);
  const excludedIds = unique([...completedIds, ...feedbackExcludedIds]);

  if (!seedRows.length && tasteProfile?.signals_count) {
    const tasteOnly = await getTasteOnlyRecommendations(db, tasteProfile, {
      excludeIds,
      limit: targetLimit,
    });
    if (tasteOnly.length) return tasteOnly;
  }

  if (!seedRows.length) {
    return getPopularMovies(db, { excludeIds, limit: targetLimit });
  }

  const seedIds = seedRows.map((row) => row.movie_id);
  const seedWeights = new Map(seedRows.map((row) => [row.movie_id, row.weight]));
  const negativeSeedIds = negativeSeedRows.map((row) => row.movie_id);
  const negativeSeedWeights = new Map(negativeSeedRows.map((row) => [row.movie_id, row.weight]));
  const seeds = await getMovieProfiles(db, { ids: seedIds, limit: seedIds.length });
  const negativeSeeds = negativeSeedIds.length
    ? await getMovieProfiles(db, { ids: negativeSeedIds, limit: negativeSeedIds.length })
    : [];
  const candidates = await getMovieProfiles(db, {
    excludeIds: unique([...seedIds, ...excludedIds]),
    limit: MAX_POOL_SIZE,
  });
  const scores = new Map();

  for (const candidate of candidates) {
    let total = 0;
    let contentTotal = 0;
    const reasonSet = new Set();
    const matched = { genres: new Set(), countries: new Set(), actors: new Set(), directors: new Set() };

    for (const seed of seeds) {
      const result = scoreAgainstSeed(seed, candidate);
      if (result.contentScore <= 0) continue;

      const weight = seedWeights.get(seed.id) || 1;
      total += result.score * weight;
      contentTotal += result.contentScore * weight;
      result.reasons.forEach((reason) => reasonSet.add(reason));
      Object.entries(result.matched).forEach(([key, values]) => {
        values.forEach((value) => matched[key].add(value));
      });
    }

    const taste = scoreMovieWithTaste(candidate, tasteProfile);
    if (taste.score) {
      total += taste.score * 5;
      contentTotal += Math.max(0, taste.score);
      taste.reasons.forEach((reason) => reasonSet.add(reason));
    }

    for (const negativeSeed of negativeSeeds) {
      const result = scoreAgainstSeed(negativeSeed, candidate);
      if (result.contentScore <= 0) continue;
      const weight = negativeSeedWeights.get(negativeSeed.id) || 1;
      const penalty = Math.round(Math.min(result.contentScore, 90) * weight * 0.35);
      total -= penalty;
      contentTotal -= penalty;
    }

    if (contentTotal <= 0) continue;

    scores.set(candidate.id, {
      candidate,
      score: Math.round(total),
      contentScore: contentTotal,
      matched: {
        genres: [...matched.genres],
        countries: [...matched.countries],
        actors: [...matched.actors],
        directors: [...matched.directors],
      },
      reasons: [...reasonSet].slice(0, 4),
    });
  }

  const ranked = [...scores.values()]
    .sort((left, right) => right.score - left.score || (right.candidate.views || 0) - (left.candidate.views || 0))
    .slice(0, targetLimit)
    .map((item) => toMovieCard(item.candidate, item));

  if (ranked.length >= targetLimit) return ranked;

  const fallback = await getPopularMovies(db, {
    excludeIds: unique([...seedIds, ...excludedIds, ...ranked.map((movie) => movie.id)]),
    limit: targetLimit - ranked.length,
  });

  return [...ranked, ...fallback];
}

function messageSignals(message) {
  const normalized = normalizeText(message);
  const rawTerms = unique(normalized
    .split(' ')
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word)));
  const wanted = [];

  const groups = [
    ['hanh dong', ['hanh dong', 'chien dau', 'sat thu', 'action']],
    ['hai', ['hai', 'hai huoc', 'vui', 'cuoi', 'comedy']],
    ['tinh cam', ['tinh cam', 'lang man', 'love', 'romance']],
    ['kinh di', ['kinh di', 'ma', 'am anh', 'horror']],
    ['gay can', ['gay can', 'cang thang', 'hoi hop', 'nghet tho', 'thriller']],
    ['bi an', ['bi an', 'trinh tham', 'mystery']],
    ['vien tuong', ['vien tuong', 'khoa hoc', 'sci fi', 'robot']],
    ['phieu luu', ['phieu luu', 'adventure']],
    ['hoat hinh', ['hoat hinh', 'anime', 'cartoon']],
    ['tam ly', ['tam ly', 'drama', 'chinh kich']],
    ['vo thuat', ['vo thuat', 'kiem hiep', 'kungfu']],
    ['co trang', ['co trang', 'lich su']],
    ['nhe nhang', ['nhe nhang', 'thu gian', 'chill', 'de thuong']],
    ['tai lieu', ['tai lieu', 'documentary']],
    ['hoc duong', ['hoc duong', 'truong hoc']],
    ['trung quoc', ['trung quoc', 'phim trung', 'trung', 'hoa ngu']],
    ['han quoc', ['han quoc', 'phim han', 'han', 'hanh quoc', 'korean']],
    ['nhat ban', ['nhat ban', 'phim nhat', 'nhat', 'japan']],
    ['viet nam', ['viet nam', 'vietnam']],
    ['my', ['my', 'au my', 'hollywood']],
  ];

  const ignoredSignalWords = new Set();
  for (const [label, aliases] of groups) {
    const normalizedAliases = aliases.map(normalizeText);
    const hasPositiveAlias = normalizedAliases.some((alias) => containsPhrase(normalized, alias) && !isNegatedPhrase(normalized, alias));
    const hasNegatedAlias = normalizedAliases.some((alias) => containsPhrase(normalized, alias) && isNegatedPhrase(normalized, alias));
    if (hasPositiveAlias) wanted.push(label);
    if (hasNegatedAlias) addSignalWords(ignoredSignalWords, [label, ...aliases]);
  }

  const wantedWords = new Set();
  for (const [label, aliases] of groups) {
    if (!wanted.includes(label)) continue;
    addSignalWords(wantedWords, [label, ...aliases]);
  }
  const semanticWords = new Set();
  SEMANTIC_CONCEPTS.forEach((concept) => {
    (concept.query || []).forEach((alias) => {
      const normalizedAlias = normalizeText(alias);
      if (containsPhrase(normalized, normalizedAlias)) addSignalWords(semanticWords, [normalizedAlias]);
    });
  });
  VECTOR_SYNONYM_GROUPS.forEach((group) => {
    const normalizedAliases = group.map(normalizeText).filter(Boolean);
    if (normalizedAliases.some((alias) => containsPhrase(normalized, alias))) {
      addSignalWords(semanticWords, normalizedAliases);
    }
  });

  const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
  return {
    normalized,
    terms: rawTerms.filter((term) => (
      !wantedWords.has(term)
      && !ignoredSignalWords.has(term)
      && !semanticWords.has(term)
      && !VECTOR_STOP_WORDS.has(term)
    )),
    wanted: unique(wanted),
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

function scoreMessageMatch(profile, signals) {
  const haystack = normalizeText([
    profile.title,
    profile.original_title,
    profile.description,
    profile.genres.join(' '),
    profile.countries.join(' '),
    profile.actors.slice(0, 8).join(' '),
    profile.directors.join(' '),
  ].join(' '));

  let score = 0;
  const reasons = [];
  let strongMatches = 0;
  let keywordMatches = 0;

  for (const wanted of signals.wanted) {
    if (profileMatchesWanted(profile, wanted, haystack)) {
      score += signalWeight(wanted);
      strongMatches += 1;
      reasons.push(`Phù hợp ${readableSignal(wanted)}`);
    }
  }

  for (const term of signals.terms) {
    if (term.length >= 3 && haystack.includes(term)) {
      score += 7;
      keywordMatches += 1;
      if (reasons.length < 3) reasons.push(`Có từ khóa "${term}"`);
    }
  }

  if (signals.year && profile.release_year) {
    const yearGap = Math.abs(Number(profile.release_year) - signals.year);
    if (yearGap === 0) {
      score += 20;
      strongMatches += 1;
      reasons.push(`Đúng năm ${signals.year}`);
    } else if (yearGap <= 2) {
      score += 8;
    }
  }

  if (strongMatches || keywordMatches || signals.wanted.length === 0) {
    score += Math.min(Math.log10((profile.views || 0) + 1) * 2, 8);
    if (profile.imdb_rating) score += Math.min(Number(profile.imdb_rating), 10) / 2;
  }

  return { score, reasons, strongMatches, keywordMatches };
}

async function searchMoviesForMessage(db, message, options = {}) {
  const signals = messageSignals(message);
  const semantic = buildSemanticSignals(message, signals);
  const queryVector = buildQueryVector(message, signals, semantic);
  const hasSemanticIntent = semantic.include.length > 0 || semantic.exclude.length > 0;
  const hasVectorIntent = queryVector.active;
  const tasteProfile = options.tasteProfile || null;
  const [profiles, denseResult] = await Promise.all([
    getMovieProfiles(db, { limit: MAX_POOL_SIZE }),
    options.denseResult
      ? Promise.resolve(options.denseResult)
      : getDenseSearchScores(db, message),
  ]);
  const hasDenseIntent = Boolean(
    denseResult?.available
    && denseResult.scores?.size
    && denseResult.confident !== false
  );
  const denseMatchThreshold = Number(denseResult?.matchThreshold) || DENSE_MIN_SIMILARITY;
  const denseStrongThreshold = Number(denseResult?.strongThreshold) || DENSE_STRONG_SIMILARITY;
  const hasSpecificIntent = signals.wanted.length > 0
    || Boolean(signals.year)
    || signals.terms.length > 0
    || hasSemanticIntent
    || hasVectorIntent
    || hasDenseIntent;
  const requiredConcepts = semantic.include.filter((concept) => (
    concept.structuredOnly || ['series', 'movie'].includes(concept.id)
  ));
  const requiredCountries = signals.wanted.filter((wanted) => COUNTRY_SIGNALS.has(wanted));
  const candidates = profiles
    .map((profile) => {
      const result = scoreMessageMatch(profile, signals);
      const semanticResult = scoreSemanticMatch(profile, semantic);
      const vectorResult = scoreVectorMatch(profile, queryVector);
      const taste = scoreMovieWithTaste(profile, tasteProfile, signals);
      const denseSimilarity = hasDenseIntent ? Number(denseResult.scores.get(Number(profile.id))) || 0 : 0;
      const denseMatched = hasDenseIntent && denseSimilarity >= denseMatchThreshold;
      const denseStrong = hasDenseIntent && denseSimilarity >= denseStrongThreshold;
      const denseScore = denseMatched
        ? Math.round(Math.max(0, (denseSimilarity - denseMatchThreshold) / (1 - denseMatchThreshold)) * DENSE_SCORE_WEIGHT)
        : 0;
      const requiredIncludesSatisfied = requiredConcepts.every((concept) => conceptMatchesProfile(profile, concept))
        && requiredCountries.every((country) => profileMatchesWanted(profile, country, profileSemanticText(profile)));
      const keywordReasons = (result.reasons || []).filter((reason) => String(reason).startsWith('Có từ khóa'));
      const structuredReasons = (result.reasons || []).filter((reason) => !String(reason).startsWith('Có từ khóa'));
      const reasons = unique([
        ...structuredReasons,
        ...(semanticResult.reasons || []),
        ...(denseStrong ? ['Khớp ngữ nghĩa sâu'] : []),
        ...(vectorResult.reasons || []),
        ...(taste.reasons || []),
        ...keywordReasons,
      ]).slice(0, 4);
      return {
        profile,
        ...result,
        semanticMatches: semanticResult.positiveMatches,
        semanticBlocked: semanticResult.blocked,
        vectorMatches: vectorResult.matched ? 1 : 0,
        vectorStrong: vectorResult.strong,
        vectorSimilarity: vectorResult.similarity,
        denseMatched,
        denseStrong,
        denseSimilarity,
        requiredIncludesSatisfied,
        tasteScore: taste.score,
        score: result.score + semanticResult.score + vectorResult.score + denseScore + taste.score,
        reasons,
      };
    })
    .filter((item) => {
      if (item.semanticBlocked) return false;
      if (!item.requiredIncludesSatisfied) return false;
      if (!hasSpecificIntent) return true;
      if (signals.wanted.length > 0 || signals.year || semantic.include.length > 0) {
        return item.strongMatches > 0
          || item.semanticMatches > 0
          || item.keywordMatches >= 2
          || item.vectorStrong
          || item.denseStrong;
      }
      if (semantic.exclude.length > 0) return true;
      return item.keywordMatches > 0 || item.vectorMatches > 0 || item.denseStrong;
    });

  if (!candidates.length) {
    return hasSpecificIntent ? [] : getPopularMovies(db, { limit: options.limit || DEFAULT_LIMIT });
  }

  const engagementScores = await getMovieEngagementScores(
    db,
    candidates.map((item) => item.profile.id),
    Number(process.env.HYBRID_RERANK_ENGAGEMENT_DAYS) || 90
  ).catch(() => new Map());
  const ranked = rerankCandidates(candidates, {
    denseAvailable: hasDenseIntent,
    engagementScores,
    limit: clampLimit(options.limit, DEFAULT_LIMIT),
  });

  return ranked.map((item) => toMovieCard(item.profile, {
    ...item,
    score: item.score,
  }));
}

module.exports = {
  clampLimit,
  getMovieProfiles,
  getSimilarMovies,
  getUserRecommendations,
  getPopularMovies,
  searchMoviesForMessage,
  messageSignals,
  normalizeText,
};
