const { messageSignals, normalizeText } = require('./recommendationService');
const { parseDurationMinutes } = require('./chatIntentService');
const { compactTasteProfile } = require('./profileTasteService');

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

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function listText(values, limit = 3) {
  if (!Array.isArray(values)) return '';
  return values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, limit).join(', ');
}

function normalizedList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function findTasteMatches(tasteItems, movieValues) {
  const movieSet = new Set(normalizedList(movieValues));
  return (tasteItems || [])
    .filter((item) => movieSet.has(normalizeText(item?.name)))
    .map((item) => item.name)
    .filter(Boolean);
}

function matchesAny(movieValues, aliases) {
  const text = normalizeText(Array.isArray(movieValues) ? movieValues.join(' ') : movieValues);
  return aliases.some((alias) => text.includes(normalizeText(alias)));
}

function buildRefinementDetails(movie, refinement = {}) {
  const details = [];
  const genres = movie.genres || [];
  const countries = movie.countries || [];
  const duration = formatDuration(movie.duration);
  const rating = formatRating(movie.imdb_rating);

  if (refinement.newer && movie.release_year) {
    details.push(`Đang ưu tiên phim mới; phim này phát hành năm ${movie.release_year}.`);
  }
  if (refinement.higherRated && rating) {
    details.push(`Đang ưu tiên điểm cao; phim này có ${rating}.`);
  }
  if (refinement.shorter && duration) {
    details.push(`Đang ưu tiên xem gọn; thời lượng hiện có là ${duration}.`);
  }
  if (refinement.noSeries && !movie.is_series) {
    details.push('Bạn chọn không phim bộ, phim này đang được đánh dấu là phim lẻ.');
  }
  if (refinement.seriesOnly && movie.is_series) {
    details.push('Bạn chọn phim bộ/series, phim này thuộc nhóm phim bộ.');
  }
  if (refinement.animeOnly && matchesAny(genres, ['anime', 'hoạt hình'])) {
    details.push('Bạn chọn anime/hoạt hình, phim này có thể loại phù hợp.');
  }
  if (refinement.noAnime && !matchesAny(genres, ['anime', 'hoạt hình'])) {
    details.push('Bạn muốn bỏ anime/hoạt hình, phim này không nằm trong nhóm đó theo metadata hiện có.');
  }
  if (refinement.noHorror && !matchesAny(genres, ['kinh dị', 'horror'])) {
    details.push('Bạn muốn tránh kinh dị, metadata hiện có không gắn phim này với thể loại kinh dị.');
  }
  if (refinement.koreanOnly && matchesAny(countries, ['Hàn Quốc', 'Korea'])) {
    details.push('Bạn chọn phim Hàn, phim này thuộc Hàn Quốc.');
  }
  if (refinement.chineseOnly && matchesAny(countries, ['Trung Quốc', 'China', 'Hoa ngữ'])) {
    details.push('Bạn chọn phim Trung Quốc, phim này thuộc nhóm quốc gia phù hợp.');
  }
  if (refinement.japaneseOnly && matchesAny(countries, ['Nhật Bản', 'Japan'])) {
    details.push('Bạn chọn phim Nhật, phim này thuộc Nhật Bản.');
  }
  if (refinement.lighter && matchesAny(genres, ['hài', 'tình cảm', 'gia đình', 'học đường', 'hoạt hình'])) {
    details.push('Bạn muốn nhẹ nhàng hơn, phim này có thể loại dễ xem hơn trong kho dữ liệu.');
  }
  if (refinement.moreIntense && matchesAny(genres, ['hành động', 'gay cấn', 'kinh dị', 'hình sự', 'bí ẩn'])) {
    details.push('Bạn muốn căng hơn, phim này có nhịp thể loại mạnh hơn.');
  }
  if (refinement.funnier && matchesAny(genres, ['hài', 'hài hước', 'gia đình'])) {
    details.push('Bạn muốn vui hơn, phim này có tín hiệu hài/gia đình.');
  }

  return details;
}

function buildTasteDetails(movie, tasteProfile) {
  if (!tasteProfile?.signals_count) return [];
  const details = [];
  const genreMatches = findTasteMatches(tasteProfile.positive?.genres, movie.genres);
  const countryMatches = findTasteMatches(tasteProfile.positive?.countries, movie.countries);
  const duration = formatDuration(movie.duration);
  const minutes = parseDurationMinutes(movie.duration);
  const preference = tasteProfile.duration?.preference;

  if (genreMatches.length) details.push(`Hợp gu thể loại profile: ${listText(genreMatches)}.`);
  if (countryMatches.length) details.push(`Hợp gu quốc gia profile: ${listText(countryMatches)}.`);
  if (preference === 'short' && minutes && minutes <= 45) details.push(`Profile hay xem phim ngắn, phim này chỉ khoảng ${duration}.`);
  if (preference === 'medium' && minutes && minutes > 45 && minutes <= 105) details.push(`Profile hay xem thời lượng vừa, phim này khoảng ${duration}.`);
  if (preference === 'series' && movie.is_series) details.push('Profile có xu hướng xem phim bộ/tập ngắn, phim này là phim bộ.');

  return details;
}

function buildMovieExplanation(movie, message, intent = {}, tasteProfile = null) {
  const signals = messageSignals(message);
  const wanted = readableWanted(signals.wanted);
  const details = [];
  const genres = listText(movie.genres);
  const countries = listText(movie.countries);
  const matchReasons = Array.isArray(movie.match_reasons)
    ? movie.match_reasons.filter((reason) => !String(reason || '').toLowerCase().startsWith('có từ khóa')).slice(0, 3)
    : [];

  if (wanted.length) details.push(`Khớp yêu cầu bạn vừa nhập: ${wanted.join(', ')}.`);
  if (matchReasons.length) details.push(`Điểm khớp từ hệ thống: ${matchReasons.join('; ')}.`);
  details.push(...buildRefinementDetails(movie, intent.refinement || {}));
  details.push(...buildTasteDetails(movie, tasteProfile));

  const metadata = [
    genres ? `thể loại ${genres}` : null,
    countries ? `quốc gia ${countries}` : null,
    movie.release_year ? `năm ${movie.release_year}` : null,
    formatRating(movie.imdb_rating),
    formatDuration(movie.duration),
  ].filter(Boolean);
  if (metadata.length) details.push(`Metadata nổi bật: ${metadata.join(' · ')}.`);

  const cleanDetails = unique(details).slice(0, 6);
  const summary = cleanDetails[0]
    || 'Phim này nằm trong nhóm phù hợp nhất từ kho dữ liệu hiện có.';

  return {
    summary,
    details: cleanDetails.length ? cleanDetails : [summary],
  };
}

function attachRecommendationExplanations(recommendations, message, intent, tasteProfile) {
  return recommendations.map((movie) => ({
    ...movie,
    why_recommended: buildMovieExplanation(movie, message, intent, tasteProfile),
  }));
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

function buildGroundedReply(message, recommendations, intent = {}, tasteProfile = null) {
  if (!recommendations.length) {
    return 'Gu này hơi hẹp, mình cần thêm một chút manh mối.\nBạn thử đổi thể loại, quốc gia hoặc mood muốn xem nhé.';
  }

  const signals = messageSignals(message);
  const wanted = readableWanted(signals.wanted);
  const tasteSummary = Array.isArray(tasteProfile?.summary) ? tasteProfile.summary.slice(0, 3) : [];
  const refinement = intent.refinement || {};
  let intro = wanted.length
    ? `Mình chọn vài phim hợp gu ${wanted.join(', ')} cho bạn:`
    : tasteSummary.length
      ? `Dựa trên gu profile (${tasteSummary.join(', ')}), mình chọn vài phim cho bạn:`
      : 'Mình chọn vài phim đáng xem cho bạn:';

  if (wanted.length && tasteSummary.length) {
    intro = `Mình chọn vài phim hợp ${wanted.join(', ')} và vẫn ưu tiên gu profile của bạn:`;
  }

  if (refinement.alternative) intro = 'Mình đổi sang vài lựa chọn khác cho bạn:';
  if (refinement.lighter) intro = 'Mình chuyển sang vài phim nhẹ nhàng hơn:';
  if (refinement.shorter) intro = 'Mình ưu tiên vài phim gọn hơn để xem nhanh:';
  if (refinement.moreIntense) intro = 'Mình tăng nhịp lên vài phim căng hơn:';
  if (refinement.funnier) intro = 'Mình chọn vài phim vui hơn cho dễ xem:';
  if (refinement.newer) intro = 'Mình ưu tiên các phim mới hơn cho bạn:';
  if (refinement.higherRated) intro = 'Mình ưu tiên các phim có IMDb cao hơn:';
  if (refinement.noSeries) intro = 'Mình lọc sang phim lẻ, không ưu tiên phim bộ:';
  if (refinement.seriesOnly) intro = 'Mình chuyển sang phim bộ/series:';
  if (refinement.animeOnly) intro = 'Mình lọc riêng anime/hoạt hình cho bạn:';
  if (refinement.noAnime) intro = 'Mình bỏ anime/hoạt hình và chọn hướng khác:';
  if (refinement.noHorror) intro = 'Mình bỏ hướng kinh dị và chọn vài phim dễ xem hơn:';
  if (refinement.koreanOnly) intro = 'Mình ưu tiên phim Hàn Quốc:';
  if (refinement.chineseOnly) intro = 'Mình ưu tiên phim Trung Quốc:';
  if (refinement.japaneseOnly) intro = 'Mình ưu tiên phim Nhật Bản:';

  const topMovies = recommendations
    .slice(0, 3)
    .map((movie, index) => `${index + 1}. ${formatMovie(movie)}`)
    .join('\n');

  return `${intro}\n\n${topMovies}\n\nMuốn mình đổi mood, rút ngắn hơn hoặc chọn phim khác không?`;
}

function buildSuggestedReplies(recommendations, intent = {}) {
  if (!recommendations.length) {
    return ['Hài nhẹ nhàng', 'Hành động Hàn Quốc', 'Anime Nhật', 'IMDb cao hơn', 'Không kinh dị'];
  }

  const refinement = intent.refinement || {};
  const replies = ['Phim khác'];
  if (!refinement.shorter) replies.push('Ngắn thôi');
  if (!refinement.newer) replies.push('Mới hơn');
  if (!refinement.higherRated) replies.push('IMDb cao hơn');
  if (!refinement.noSeries) replies.push('Không phim bộ');
  if (!refinement.animeOnly) replies.push('Anime thôi');
  if (!refinement.noHorror) replies.push('Không kinh dị');
  if (!refinement.koreanOnly) replies.push('Phim Hàn');
  if (!refinement.lighter) replies.push('Nhẹ nhàng hơn');
  if (!refinement.moreIntense) replies.push('Căng hơn');
  return replies.slice(0, 8);
}

function buildGrounding(source, candidates, recommendations, tasteProfile = null) {
  return {
    mode: 'mysql-catalog',
    source,
    context_count: candidates.length,
    verified_ids: recommendations.map((movie) => Number(movie.id)).filter(Boolean),
    no_fake_data: true,
    taste_profile: compactTasteProfile(tasteProfile),
  };
}

function buildResponse({ message, candidates, recommendations, source, provider, model = null, aiError = null, intent = {}, tasteProfile = null, limit = 6 }) {
  const verified = attachRecommendationExplanations(recommendations.slice(0, limit), message, intent, tasteProfile);
  return {
    reply: buildGroundedReply(message, verified, intent, tasteProfile),
    recommendations: verified,
    suggested_replies: buildSuggestedReplies(verified, intent),
    conversation: {
      memory_used: Boolean(intent.hasMemory),
      follow_up: Boolean(intent.isFollowUp),
      refinement: intent.refinement || {},
      taste_summary: tasteProfile?.summary || [],
    },
    source,
    provider,
    model,
    ai_error: aiError,
    grounding: buildGrounding(source, candidates, verified, tasteProfile),
  };
}

module.exports = {
  buildGrounding,
  buildResponse,
};
