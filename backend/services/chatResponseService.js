const { messageSignals } = require('./recommendationService');
const { parseDurationMinutes } = require('./chatIntentService');

function formatRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? `IMDb ${rating.toFixed(1)}` : null;
}

function formatDuration(value) {
  const minutes = parseDurationMinutes(value);
  if (!minutes) return null;
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function formatMovie(movie) {
  const meta = [
    movie.release_year ? String(movie.release_year) : null,
    formatRating(movie.imdb_rating),
    formatDuration(movie.duration),
  ].filter(Boolean);

  return `${movie.title}${meta.length ? ` (${meta.join(' · ')})` : ''}`;
}

function readableWanted(labels) {
  const dictionary = {
    'hanh dong': 'hành động',
    hai: 'hài',
    'tinh cam': 'tình cảm',
    'kinh di': 'kinh dị',
    'vien tuong': 'viễn tưởng',
    'phieu luu': 'phiêu lưu',
    'hoat hinh': 'hoạt hình/anime',
    'tam ly': 'tâm lý',
    'vo thuat': 'võ thuật',
    'hoc duong': 'học đường',
    'trung quoc': 'Trung Quốc',
    'han quoc': 'Hàn Quốc',
    'nhat ban': 'Nhật Bản',
    'viet nam': 'Việt Nam',
    my: 'Mỹ',
  };
  return labels.map((label) => dictionary[label] || label);
}

function buildGroundedReply(message, recommendations, intent = {}) {
  if (!recommendations.length) {
    return 'Gu này hơi hẹp, mình cần thêm một chút manh mối.\nBạn thử đổi thể loại, quốc gia hoặc mood muốn xem nhé.';
  }

  const signals = messageSignals(message);
  const wanted = readableWanted(signals.wanted);
  const refinement = intent.refinement || {};
  let intro = wanted.length
    ? `Mình chọn vài phim hợp gu ${wanted.join(', ')} cho bạn:`
    : 'Mình chọn vài phim đáng xem cho bạn:';

  if (refinement.alternative) intro = 'Mình đổi sang vài lựa chọn khác cho bạn:';
  if (refinement.lighter) intro = 'Mình chuyển sang vài phim nhẹ nhàng hơn:';
  if (refinement.shorter) intro = 'Mình ưu tiên vài phim gọn hơn để xem nhanh:';
  if (refinement.moreIntense) intro = 'Mình tăng nhịp lên vài phim căng hơn:';
  if (refinement.funnier) intro = 'Mình chọn vài phim vui hơn cho dễ xem:';

  const topMovies = recommendations
    .slice(0, 3)
    .map((movie, index) => `${index + 1}. ${formatMovie(movie)}`)
    .join('\n');

  return `${intro}\n\n${topMovies}\n\nMuốn mình đổi mood, rút ngắn hơn hoặc chọn phim khác không?`;
}

function buildSuggestedReplies(recommendations, intent = {}) {
  if (!recommendations.length) {
    return ['Hài nhẹ nhàng', 'Hành động Hàn Quốc', 'Anime Nhật'];
  }

  const refinement = intent.refinement || {};
  const replies = ['Phim khác'];
  if (!refinement.lighter) replies.push('Nhẹ nhàng hơn');
  if (!refinement.shorter) replies.push('Ngắn thôi');
  if (!refinement.moreIntense) replies.push('Căng hơn');
  return replies.slice(0, 4);
}

function buildGrounding(source, candidates, recommendations) {
  return {
    mode: 'mysql-catalog',
    source,
    context_count: candidates.length,
    verified_ids: recommendations.map((movie) => Number(movie.id)).filter(Boolean),
    no_fake_data: true,
  };
}

function buildResponse({ message, candidates, recommendations, source, provider, model = null, aiError = null, intent = {}, limit = 6 }) {
  const verified = recommendations.slice(0, limit);
  return {
    reply: buildGroundedReply(message, verified, intent),
    recommendations: verified,
    suggested_replies: buildSuggestedReplies(verified, intent),
    conversation: {
      memory_used: Boolean(intent.hasMemory),
      follow_up: Boolean(intent.isFollowUp),
      refinement: intent.refinement || {},
    },
    source,
    provider,
    model,
    ai_error: aiError,
    grounding: buildGrounding(source, candidates, verified),
  };
}

module.exports = {
  buildGrounding,
  buildResponse,
};
