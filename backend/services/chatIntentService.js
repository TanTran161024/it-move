const { messageSignals, normalizeText } = require('./recommendationService');

const MAX_HISTORY_MESSAGES = 10;

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(normalizedText, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedPhrase)}(\\s|$)`);
  return pattern.test(normalizedText);
}

function hasAnyPhrase(normalizedText, phrases) {
  return phrases.some((phrase) => hasPhrase(normalizedText, phrase));
}

function includesWanted(signals, wanted) {
  return signals.wanted.includes(wanted);
}

function isMovieRelated(message) {
  const normalized = normalizeText(message);
  const movieTerms = [
    'phim', 'movie', 'xem', 'dien anh', 'tap', 'series', 'bo phim',
    'hanh dong', 'hai', 'kinh di', 'tinh cam', 'lang man', 'anime',
    'hoat hinh', 'vien tuong', 'vo thuat', 'trung quoc', 'han quoc',
    'nhat ban', 'my', 'dao dien', 'dien vien', 'imdb',
  ];
  return movieTerms.some((term) => normalized.includes(term));
}

function isClearlyOffTopic(message) {
  const normalized = normalizeText(message);
  const offTopicTerms = [
    'laptop', 'may tinh', 'dien thoai', 'thoi tiet', 'bong da',
    'nau an', 'code', 'lap trinh', 'chung khoan', 'crypto',
    'suc khoe', 'thuoc', 'du lich', 'khach san',
  ];
  return !isMovieRelated(message) && offTopicTerms.some((term) => normalized.includes(term));
}

function shouldAskClarifyingQuestion(message) {
  const normalized = normalizeText(message);
  const signals = messageSignals(message);
  const genericRequests = [
    'goi y', 'tu van', 'phim hay', 'muon xem phim', 'xem gi',
    'recommend', 'de xuat',
  ];

  const isGeneric = genericRequests.some((term) => normalized.includes(term));
  return isGeneric && signals.wanted.length === 0 && !signals.year && normalized.split(' ').length <= 8;
}

function parseChatRefinement(message) {
  const normalized = normalizeText(message);
  const signals = messageSignals(message);
  const noSeries = hasAnyPhrase(normalized, [
    'khong phim bo', 'khong series', 'khong nhieu tap', 'phim le thoi', 'chi phim le',
  ]);
  const noAnime = hasAnyPhrase(normalized, [
    'khong anime', 'bo anime', 'tranh anime', 'khong hoat hinh', 'bo hoat hinh',
  ]);
  const noHorror = hasAnyPhrase(normalized, [
    'khong kinh di', 'bo kinh di', 'tranh kinh di', 'khong ma', 'bo ma', 'it ma', 'bot ma',
  ]);

  return {
    alternative: hasAnyPhrase(normalized, [
      'khac', 'phim khac', 'doi phim', 'doi gu', 'goi y khac', 'lua chon khac', 'them phim', 'them nua',
    ]),
    lighter: signals.wanted.includes('nhe nhang') || hasAnyPhrase(normalized, [
      'nhe hon', 'nhe nhang hon', 'chill hon', 'de xem hon', 'bot cang', 'bot nang', 'thu gian hon',
    ]),
    shorter: hasAnyPhrase(normalized, [
      'ngan', 'ngan thoi', 'ngan hon', 'gon hon', 'xem nhanh', 'it tap', 'tap ngan', 'thoi luong ngan',
      'duoi 90 phut', 'duoi mot tieng', 'duoi 1 tieng', 'khong dai',
    ]),
    moreIntense: signals.wanted.includes('gay can') || hasAnyPhrase(normalized, [
      'cang hon', 'gay can hon', 'hoi hop hon', 'nghet tho hon', 'kich tinh hon',
    ]),
    funnier: signals.wanted.includes('hai') || hasAnyPhrase(normalized, [
      'hai hon', 'vui hon', 'buon cuoi hon',
    ]),
    newer: hasAnyPhrase(normalized, [
      'moi hon', 'phim moi', 'moi nhat', 'gan day', 'nam moi', 'doi moi hon',
    ]),
    higherRated: hasAnyPhrase(normalized, [
      'imdb cao', 'diem cao', 'rating cao', 'danh gia cao', 'chat luong hon', 'phim hay hon',
    ]),
    noSeries,
    seriesOnly: !noSeries && hasAnyPhrase(normalized, [
      'phim bo', 'series', 'nhieu tap', 'xem dai tap', 'co nhieu tap',
    ]),
    animeOnly: !noAnime && (
      includesWanted(signals, 'hoat hinh')
      || hasAnyPhrase(normalized, ['anime thoi', 'anime nhat', 'chi anime', 'hoat hinh thoi', 'chi hoat hinh'])
    ),
    noAnime,
    noHorror,
    koreanOnly: includesWanted(signals, 'han quoc') || hasAnyPhrase(normalized, ['phim han', 'han quoc thoi', 'chi han quoc']),
    chineseOnly: includesWanted(signals, 'trung quoc') || hasAnyPhrase(normalized, ['phim trung', 'trung quoc thoi', 'chi trung quoc']),
    japaneseOnly: includesWanted(signals, 'nhat ban') || hasAnyPhrase(normalized, ['phim nhat', 'anime nhat', 'nhat thoi', 'nhat ban thoi', 'chi nhat ban']),
  };
}

function hasRefinement(refinement) {
  return Object.values(refinement || {}).some(Boolean);
}

function isFollowUpMessage(message, history = []) {
  const normalized = normalizeText(message);
  const signals = messageSignals(message);
  const refinement = parseChatRefinement(message);
  const followUpTerms = ['khac', 'nua', 'them', 'tiep', 'hon', 'giong', 'nhu vay', 'doi gu'];
  const hasHistory = normalizeHistory(history).some((item) => item.role === 'user');

  return hasHistory && (
    hasRefinement(refinement)
    || (
      signals.wanted.length === 0
      && !signals.year
      && (normalized.split(' ').length <= 5 || followUpTerms.some((term) => normalized.includes(term)))
    )
  );
}

function getRecentUserText(history, count = 3) {
  return normalizeHistory(history)
    .filter((item) => item.role === 'user')
    .slice(-count)
    .map((item) => item.content)
    .join(' ');
}

function buildRetrievalMessage(message, history) {
  const cleanHistory = normalizeHistory(history);
  if (!isFollowUpMessage(message, cleanHistory) || !cleanHistory.length) return message;

  const recentUserContext = cleanHistory
    .filter((item) => item.role === 'user')
    .slice(-3)
    .map((item) => item.content)
    .join(' ');

  const refinement = parseChatRefinement(message);
  const refinementTerms = [
    refinement.lighter ? 'nhẹ nhàng thư giãn dễ xem' : null,
    refinement.shorter ? 'thời lượng ngắn xem nhanh' : null,
    refinement.moreIntense ? 'gay cấn hồi hộp căng thẳng' : null,
    refinement.funnier ? 'hài vui vẻ' : null,
    refinement.newer ? 'phim mới gần đây' : null,
    refinement.higherRated ? 'IMDb cao đánh giá cao' : null,
    refinement.noSeries ? 'phim lẻ' : null,
    refinement.seriesOnly ? 'phim bộ series nhiều tập' : null,
    refinement.animeOnly ? 'anime hoạt hình Nhật' : null,
    refinement.noAnime ? 'phim người đóng live action' : null,
    refinement.noHorror ? 'nhẹ nhàng hài tình cảm gia đình' : null,
    refinement.koreanOnly ? 'Hàn Quốc' : null,
    refinement.chineseOnly ? 'Trung Quốc' : null,
    refinement.japaneseOnly ? 'Nhật Bản' : null,
  ].filter(Boolean).join(' ');

  return [recentUserContext, message, refinementTerms].filter(Boolean).join(' ');
}

function buildConversationIntent(message, history) {
  const cleanHistory = normalizeHistory(history);
  const previousUserText = getRecentUserText(cleanHistory);
  const refinement = parseChatRefinement(message);
  const isFollowUp = isFollowUpMessage(message, cleanHistory);

  return {
    isFollowUp,
    refinement,
    previousUserText,
    hasMemory: Boolean(previousUserText),
  };
}

function parseDurationMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;

  const normalized = normalizeText(value);
  if (!normalized) return null;

  const colonMatch = normalized.match(/\b(\d{1,2})\s*:\s*(\d{2})(?::\d{2})?\b/);
  if (colonMatch) {
    const left = Number(colonMatch[1]);
    const right = Number(colonMatch[2]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return left <= 4 ? left * 60 + right : left + right / 60;
  }

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(h|gio|hour|hours)/);
  const minuteMatch = normalized.match(/(\d+)\s*(m|phut|min|mins|minute|minutes)/);
  const plainNumber = normalized.match(/\b(\d{2,3})\b/);
  let minutes = 0;

  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (!minutes && plainNumber) minutes = Number(plainNumber[1]);

  return minutes > 0 && Number.isFinite(minutes) ? minutes : null;
}

module.exports = {
  buildConversationIntent,
  buildRetrievalMessage,
  hasAnyPhrase,
  hasRefinement,
  isClearlyOffTopic,
  normalizeHistory,
  normalizeIdList,
  parseDurationMinutes,
  shouldAskClarifyingQuestion,
};
