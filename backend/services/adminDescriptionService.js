const { callGeminiJson, getGeminiModel } = require('./aiProviderService');

const MAX_DESCRIPTION_LENGTH = 1200;

function cleanText(value, maxLength = 220) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanList(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMovieInput(input = {}) {
  return {
    title: cleanText(input.title, 180),
    original_title: cleanText(input.original_title, 180),
    release_year: cleanText(input.release_year, 12),
    duration: cleanText(input.duration, 40),
    quality: cleanText(input.quality, 40),
    age_limit: cleanText(input.age_limit, 40),
    imdb_rating: cleanText(input.imdb_rating, 20),
    is_series: input.is_series === true || input.is_series === 1 || input.is_series === '1',
    genres: cleanList(input.genres),
    countries: cleanList(input.countries),
    actors: cleanList(input.actors),
    directors: cleanList(input.directors),
    existing_description: cleanText(input.existing_description || input.description, 600),
  };
}

function validateMovieInput(movie) {
  if (!movie.title && !movie.original_title) {
    const error = new Error('Vui lòng nhập tên phim trước khi tạo mô tả.');
    error.statusCode = 400;
    throw error;
  }
}

function compactMovieData(movie) {
  return Object.fromEntries(
    Object.entries(movie).filter(([, value]) => (
      Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && value !== undefined
    ))
  );
}

function buildFallbackDescription(movie) {
  const name = movie.title || movie.original_title;
  const original = movie.original_title && movie.original_title !== movie.title
    ? `, tên gốc ${movie.original_title}`
    : '';
  const country = movie.countries.length ? ` đến từ ${movie.countries.join(', ')}` : '';
  const year = movie.release_year ? ` ra mắt năm ${movie.release_year}` : '';
  const genres = movie.genres.length ? ` thuộc nhóm ${movie.genres.join(', ')}` : ' có phong cách dễ theo dõi';
  const type = movie.is_series ? 'phim bộ' : 'phim';
  const people = [
    movie.directors.length ? `đạo diễn ${movie.directors.slice(0, 2).join(', ')}` : null,
    movie.actors.length ? `dàn diễn viên gồm ${movie.actors.slice(0, 4).join(', ')}` : null,
  ].filter(Boolean).join(' cùng ');
  const detail = [movie.duration ? `thời lượng ${movie.duration}` : null, movie.quality ? `chất lượng ${movie.quality}` : null].filter(Boolean).join(', ');

  return [
    `${name}${original} là ${type}${country}${year}, ${genres}.`,
    people ? `Tác phẩm có ${people}, phù hợp để giới thiệu nổi bật trên trang chi tiết phim.` : 'Tác phẩm phù hợp để giới thiệu nổi bật trên trang chi tiết phim.',
    detail ? `Thông tin hiển thị hiện có: ${detail}.` : 'Đây là lựa chọn phù hợp cho người xem muốn tìm một tác phẩm đúng gu đã chọn.',
  ].join(' ');
}

function trimDescription(value) {
  return cleanText(value, MAX_DESCRIPTION_LENGTH)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

function buildPrompt(movie) {
  return `
Bạn là biên tập nội dung cho website xem phim.
Hãy viết mô tả phim bằng tiếng Việt tự nhiên, hấp dẫn, chuyên nghiệp.

Quy tắc bắt buộc:
- Chỉ dựa trên MOVIE_DATA do admin nhập.
- Không bịa nội dung cốt truyện, diễn viên, đạo diễn, rating, năm phát hành, quốc gia hoặc chất lượng.
- Không nhắc Database, API, Gemini, AI, dữ liệu thiếu hoặc "theo thông tin được cung cấp".
- Viết 2 đến 4 câu, khoảng 80 đến 160 từ.
- Giọng văn phù hợp website streaming, dễ đọc, không quá quảng cáo.
- Nếu có mô tả cũ, có thể viết lại mượt hơn nhưng không thêm chi tiết ngoài dữ liệu.

MOVIE_DATA:
${JSON.stringify(compactMovieData(movie), null, 2)}

Trả về JSON hợp lệ, không markdown:
{
  "description": "mô tả tiếng Việt hoàn chỉnh"
}
`.trim();
}

async function generateMovieDescription(input = {}) {
  const movie = normalizeMovieInput(input);
  validateMovieInput(movie);

  const fallbackDescription = buildFallbackDescription(movie);

  if (!process.env.GEMINI_API_KEY) {
    return {
      description: trimDescription(fallbackDescription),
      provider: 'template',
      model: null,
      fallback: true,
    };
  }

  try {
    const result = await callGeminiJson(
      buildPrompt(movie),
      {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
        },
        required: ['description'],
      },
      {
        temperature: 0.45,
        maxOutputTokens: 900,
      }
    );

    const description = trimDescription(result?.description);
    if (!description) {
      return {
        description: trimDescription(fallbackDescription),
        provider: 'template',
        model: null,
        fallback: true,
      };
    }

    return {
      description,
      provider: 'gemini',
      model: getGeminiModel(),
      fallback: false,
    };
  } catch (error) {
    return {
      description: trimDescription(fallbackDescription),
      provider: 'template',
      model: null,
      fallback: true,
      ai_error: {
        code: error.publicCode || 'GEMINI_ERROR',
        message: error.publicMessage || 'Không thể tạo mô tả bằng Gemini lúc này.',
        http_status: error.httpStatus || null,
      },
    };
  }
}

module.exports = {
  generateMovieDescription,
};
