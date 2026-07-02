const DEFAULT_LIMIT = 48;

const STOP_WORDS = new Set([
  'phim',
  'bo',
  'le',
  'tap',
  'xem',
  'muon',
  'toi',
  'cho',
  'tim',
  'kiem',
  'cua',
  've',
  'co',
  'mot',
  'nhung',
  'hay',
  'de',
  'voi',
  'va',
  'the',
  'loai',
  'xin',
  'chao',
  'hello',
  'hi',
  'alo',
  'ok',
  'okay',
  'cam',
  'on',
  'thanks',
  'thank',
]);

const COUNTRY_ALIASES = [
  { canonical: 'Hàn Quốc', aliases: ['han quoc', 'korea', 'korean'] },
  { canonical: 'Nhật Bản', aliases: ['nhat', 'nhat ban', 'japan', 'japanese'] },
  { canonical: 'Trung Quốc', aliases: ['trung quoc', 'china', 'chinese'] },
  { canonical: 'Âu Mỹ', aliases: ['my', 'au my', 'us', 'usa', 'america', 'american'] },
  { canonical: 'Thái Lan', aliases: ['thai', 'thai lan', 'thailand'] },
  { canonical: 'Việt Nam', aliases: ['viet nam', 'vietnam', 'vietnamese'] },
  { canonical: 'Ấn Độ', aliases: ['an do', 'india', 'indian'] },
  { canonical: 'Anh', aliases: ['anh', 'uk', 'britain', 'british'] },
];

const GENRE_ALIASES = [
  { canonical: 'Hành Động', aliases: ['hanh dong', 'action'] },
  { canonical: 'Hài Hước', aliases: ['hai', 'hai huoc', 'comedy'] },
  { canonical: 'Tình Cảm', aliases: ['tinh cam', 'lang man', 'romance', 'romantic'] },
  { canonical: 'Kinh Dị', aliases: ['kinh di', 'ma', 'horror', 'zombie', 'xac song'], keywords: ['zombie', 'xác sống'] },
  { canonical: 'Viễn Tưởng', aliases: ['vien tuong', 'sci fi', 'sci-fi', 'science fiction'] },
  { canonical: 'Cổ Trang', aliases: ['co trang'] },
  { canonical: 'Phiêu Lưu', aliases: ['phieu luu', 'adventure'] },
  { canonical: 'Tâm Lý', aliases: ['tam ly', 'psychological'] },
  { canonical: 'Hoạt Hình', aliases: ['hoat hinh', 'anime', 'animation', 'cartoon'] },
  { canonical: 'Học đường', aliases: ['hoc duong', 'school', 'student', 'students'] },
  { canonical: 'Gia đình', aliases: ['gia dinh', 'family'] },
  { canonical: 'Bí ẩn', aliases: ['bi an', 'mystery', 'detective', 'tham tu'] },
  { canonical: 'Gay cấn', aliases: ['gay can', 'thriller', 'hoi hop', 'cang thang'] },
  { canonical: 'Võ thuật', aliases: ['vo thuat', 'martial arts', 'kungfu', 'kung fu'] },
  { canonical: 'Chính Kịch', aliases: ['chinh kich', 'drama'] },
  { canonical: 'Thể thao', aliases: ['the thao', 'sport', 'sports', 'bong da'] },
  { canonical: 'Tài Liệu', aliases: ['tai lieu', 'documentary'] },
];

const KEYWORD_ALIASES = [
  { keyword: 'học đường', aliases: ['hoc duong', 'school', 'student', 'students'] },
  { keyword: 'gia đình', aliases: ['gia dinh', 'family'] },
  { keyword: 'zombie', aliases: ['zombie', 'zombiee', 'xac song'] },
  { keyword: 'nhẹ nhàng', aliases: ['nhe nhang', 'healing', 'feel good', 'feel-good'] },
  { keyword: 'anime', aliases: ['anime', 'hoat hinh'] },
  { keyword: 'thám tử', aliases: ['tham tu', 'detective', 'trinh tham'] },
  { keyword: 'siêu anh hùng', aliases: ['sieu anh hung', 'superhero'] },
  { keyword: 'xuyên không', aliases: ['xuyen khong', 'isekai', 'chuyen sinh'] },
  { keyword: 'phép thuật', aliases: ['phep thuat', 'magic', 'magical'] },
];

const MOOD_ALIASES = [
  { mood: 'nhẹ nhàng', aliases: ['nhe nhang', 'healing', 'thu gian'] },
  { mood: 'căng thẳng', aliases: ['cang thang', 'stressful'] },
  { mood: 'vui vẻ', aliases: ['vui ve', 'vui', 'feel good', 'feel-good'] },
  { mood: 'buồn', aliases: ['buon', 'sad'] },
  { mood: 'gay cấn', aliases: ['gay can', 'hoi hop', 'thriller'] },
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return normalizeText(value).split(' ').filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function fuzzyEquals(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const distance = levenshtein(left, right);
  const maxLength = Math.max(left.length, right.length);
  if (maxLength <= 5) return distance <= 1;
  if (maxLength <= 10) return distance <= 2;
  return distance / maxLength <= 0.25;
}

function containsAlias(query, alias) {
  const normalizedQuery = ` ${normalizeText(query)} `;
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  if (normalizedQuery.includes(` ${normalizedAlias} `)) return true;
  if (normalizedAlias.length <= 3) return false;

  const queryTokens = tokenize(query);
  const aliasTokens = tokenize(alias);
  if (!queryTokens.length || !aliasTokens.length) return false;

  for (let index = 0; index <= queryTokens.length - aliasTokens.length; index += 1) {
    const phrase = queryTokens.slice(index, index + aliasTokens.length).join(' ');
    if (aliasTokens.length > 1) {
      if (levenshtein(phrase, normalizedAlias) <= 1) return true;
    } else if (
      (normalizedAlias.length > 5 || phrase[0] === normalizedAlias[0])
      && fuzzyEquals(phrase, normalizedAlias)
    ) {
      return true;
    }
  }

  return false;
}

function resolveCanonicalNames(candidates, rows) {
  const byNormalizedName = new Map(rows.map((row) => [normalizeText(row.name), row.name]));

  return unique(candidates.map((candidate) => {
    const normalized = normalizeText(candidate);
    if (byNormalizedName.has(normalized)) return byNormalizedName.get(normalized);

    const exactIncludes = rows.find((row) => {
      const name = normalizeText(row.name);
      return name.includes(normalized) || normalized.includes(name);
    });
    if (exactIncludes) return exactIncludes.name;

    const fuzzy = rows.find((row) => fuzzyEquals(row.name, candidate));
    return fuzzy?.name || null;
  }));
}

function removeMatchedAliases(normalizedQuery, dictionaries) {
  let clean = ` ${normalizedQuery} `;
  dictionaries.flatMap((item) => item.aliases || []).forEach((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) return;
    clean = clean.replace(new RegExp(`\\b${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  });
  return clean.replace(/\s+/g, ' ').trim();
}

function parseIntent(query, lookups) {
  const normalizedQuery = normalizeText(query);
  const countries = [];
  const genres = [];
  const keywords = [];
  const people = [];
  const moods = [];
  const matchedDictionaries = [];

  COUNTRY_ALIASES.forEach((item) => {
    if (item.aliases.some((alias) => containsAlias(normalizedQuery, alias))) {
      countries.push(item.canonical);
      matchedDictionaries.push(item);
    }
  });

  GENRE_ALIASES.forEach((item) => {
    if (item.aliases.some((alias) => containsAlias(normalizedQuery, alias))) {
      genres.push(item.canonical);
      keywords.push(...(item.keywords || []));
      matchedDictionaries.push(item);
    }
  });

  KEYWORD_ALIASES.forEach((item) => {
    if (item.aliases.some((alias) => containsAlias(normalizedQuery, alias))) {
      keywords.push(item.keyword);
      matchedDictionaries.push(item);
    }
  });

  MOOD_ALIASES.forEach((item) => {
    if (item.aliases.some((alias) => containsAlias(normalizedQuery, alias))) {
      moods.push(item.mood);
      keywords.push(item.mood);
      matchedDictionaries.push(item);
    }
  });

  const yearMatch = normalizedQuery.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const allPeople = [...lookups.actors, ...lookups.directors];
  allPeople.forEach((person) => {
    const name = normalizeText(person.name);
    if (name.length >= 3 && (` ${normalizedQuery} `.includes(` ${name} `) || fuzzyEquals(name, normalizedQuery))) {
      people.push(person.name);
    }
  });

  const resolvedCountries = resolveCanonicalNames(countries, lookups.countries);
  const resolvedGenres = resolveCanonicalNames(genres, lookups.genres);
  const cleanQuery = removeMatchedAliases(normalizedQuery, [
    ...COUNTRY_ALIASES,
    ...GENRE_ALIASES,
    ...KEYWORD_ALIASES,
    ...MOOD_ALIASES,
  ]);
  const freeKeywords = cleanQuery
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));

  return {
    countries: resolvedCountries,
    genres: resolvedGenres,
    year,
    keywords: unique([...keywords, ...freeKeywords]).slice(0, 12),
    mood: moods[0] || null,
    people: unique(people).slice(0, 6),
  };
}

async function getLookups(db) {
  const [[genres], [countries], [actors], [directors]] = await Promise.all([
    db.execute('SELECT id, name FROM genres ORDER BY name'),
    db.execute('SELECT id, name FROM countries ORDER BY name'),
    db.execute('SELECT id, name FROM actors ORDER BY name'),
    db.execute('SELECT id, name FROM directors ORDER BY name'),
  ]);

  return { genres, countries, actors, directors };
}

async function getSearchableMovies(db) {
  const [rows] = await db.execute(`
    SELECT
      m.id,
      m.title,
      m.original_title,
      m.poster_url,
      m.release_year,
      m.age_limit,
      m.is_series,
      m.imdb_rating,
      m.quality,
      m.description,
      m.views,
      m.created_at,
      COALESCE(GROUP_CONCAT(DISTINCT g.name SEPARATOR '|||'), '') AS genres,
      COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '|||'), '') AS countries,
      COALESCE(GROUP_CONCAT(DISTINCT a.name SEPARATOR '|||'), '') AS actors,
      COALESCE(GROUP_CONCAT(DISTINCT d.name SEPARATOR '|||'), '') AS directors
    FROM movies m
    LEFT JOIN movie_genres mg ON mg.movie_id = m.id
    LEFT JOIN genres g ON g.id = mg.genre_id
    LEFT JOIN movie_countries mc ON mc.movie_id = m.id
    LEFT JOIN countries c ON c.id = mc.country_id
    LEFT JOIN movie_actors ma ON ma.movie_id = m.id
    LEFT JOIN actors a ON a.id = ma.actor_id
    LEFT JOIN movie_directors md ON md.movie_id = m.id
    LEFT JOIN directors d ON d.id = md.director_id
    WHERE m.is_visible = 1
    GROUP BY m.id
  `);

  return rows.map((movie) => ({
    ...movie,
    genres: movie.genres ? movie.genres.split('|||') : [],
    countries: movie.countries ? movie.countries.split('|||') : [],
    actors: movie.actors ? movie.actors.split('|||') : [],
    directors: movie.directors ? movie.directors.split('|||') : [],
  }));
}

function textContainsOrFuzzy(text, keyword, options = {}) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  const allowFuzzy = options.fuzzy !== false;
  if (!normalizedText || !normalizedKeyword) return false;
  if (normalizedText.includes(normalizedKeyword)) return true;
  if (!allowFuzzy || normalizedKeyword.length < 4) return false;
  return normalizedText.split(' ').some((token) => token.length > 2 && fuzzyEquals(token, normalizedKeyword));
}

function scoreMovie(movie, filters, query) {
  const normalizedQuery = normalizeText(query);
  const title = normalizeText(movie.title);
  const originalTitle = normalizeText(movie.original_title);
  const description = normalizeText(movie.description);
  const genres = movie.genres.map(normalizeText);
  const countries = movie.countries.map(normalizeText);
  const actors = movie.actors.map(normalizeText);
  const directors = movie.directors.map(normalizeText);

  let score = 0;
  const reasons = [];

  if (normalizedQuery && (title.includes(normalizedQuery) || originalTitle.includes(normalizedQuery))) {
    score += 80;
    reasons.push('title');
  }

  filters.genres.forEach((genre) => {
    const normalizedGenre = normalizeText(genre);
    if (genres.some((item) => item === normalizedGenre || item.includes(normalizedGenre) || normalizedGenre.includes(item))) {
      score += 35;
      reasons.push('genre');
    }
  });

  filters.countries.forEach((country) => {
    const normalizedCountry = normalizeText(country);
    if (countries.some((item) => item === normalizedCountry || item.includes(normalizedCountry) || normalizedCountry.includes(item))) {
      score += 30;
      reasons.push('country');
    }
  });

  filters.people.forEach((person) => {
    const normalizedPerson = normalizeText(person);
    if ([...actors, ...directors].some((item) => item.includes(normalizedPerson) || normalizedPerson.includes(item))) {
      score += 25;
      reasons.push('person');
    }
  });

  if (filters.year && Number(movie.release_year) === filters.year) {
    score += 20;
    reasons.push('year');
  }

  filters.keywords.forEach((keyword) => {
    if (textContainsOrFuzzy(movie.title, keyword) || textContainsOrFuzzy(movie.original_title, keyword)) {
      score += 20;
      reasons.push('keyword_title');
    } else if (textContainsOrFuzzy(movie.description, keyword, { fuzzy: false })) {
      score += 12;
      reasons.push('keyword_description');
    } else if ([...movie.genres, ...movie.countries, ...movie.actors, ...movie.directors].some((value) => textContainsOrFuzzy(value, keyword, { fuzzy: false }))) {
      score += 10;
      reasons.push('keyword_metadata');
    }
  });

  if (!filters.keywords.length && normalizedQuery) {
    tokenize(normalizedQuery).forEach((token) => {
      if (!STOP_WORDS.has(token) && (title.includes(token) || originalTitle.includes(token) || description.includes(token))) {
        score += 8;
      }
    });
  }

  if (score > 0) {
    const imdb = Number(movie.imdb_rating) || 0;
    if (imdb > 0) score += Math.min(10, imdb);
    const views = Number(movie.views) || 0;
    if (views > 0) score += Math.min(8, Math.log10(views + 1) * 2);
  }

  return { score: Math.round(score), reasons: unique(reasons) };
}

function hasStrictMismatch(movie, filters) {
  if (filters.countries.length) {
    const movieCountries = movie.countries.map(normalizeText);
    const matched = filters.countries.some((country) => {
      const normalized = normalizeText(country);
      return movieCountries.some((item) => item === normalized || item.includes(normalized) || normalized.includes(item));
    });
    if (!matched) return true;
  }
  if (filters.genres.length) {
    const movieGenres = movie.genres.map(normalizeText);
    const matched = filters.genres.some((genre) => {
      const normalized = normalizeText(genre);
      return movieGenres.some((item) => item === normalized || item.includes(normalized) || normalized.includes(item));
    });
    if (!matched) return true;
  }
  if (filters.year && Number(movie.release_year) !== filters.year) return true;
  if (filters.people.length) {
    const moviePeople = [...movie.actors, ...movie.directors].map(normalizeText);
    const matched = filters.people.some((person) => {
      const normalized = normalizeText(person);
      return moviePeople.some((item) => item.includes(normalized) || normalized.includes(item));
    });
    if (!matched) return true;
  }
  return false;
}

async function smartSearchMovies(db, rawQuery, options = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return {
      query,
      filters: { countries: [], genres: [], year: null, keywords: [], mood: null, people: [] },
      movies: [],
    };
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, 80));
  const lookups = await getLookups(db);
  const filters = parseIntent(query, lookups);
  const hasIntent = Boolean(
    filters.countries.length
    || filters.genres.length
    || filters.year
    || filters.keywords.length
    || filters.mood
    || filters.people.length
  );

  if (!hasIntent) {
    return {
      query,
      filters,
      relaxed: false,
      movies: [],
    };
  }

  const movies = await getSearchableMovies(db);

  const allScored = movies
    .map((movie) => {
      const result = scoreMovie(movie, filters, query);
      return { movie, ...result };
    })
    .filter((item) => item.score > 0);

  const hasHardFilters = Boolean(filters.countries.length || filters.genres.length || filters.year || filters.people.length);
  let scored = allScored;
  let relaxed = false;

  if (hasHardFilters) {
    const strictScored = allScored.filter((item) => !hasStrictMismatch(item.movie, filters));
    if (strictScored.length > 0) {
      scored = strictScored;
    } else {
      relaxed = allScored.length > 0;
      scored = allScored;
    }
  }

  scored.sort((a, b) => b.score - a.score || (Number(b.movie.views) || 0) - (Number(a.movie.views) || 0));

  return {
    query,
    filters,
    relaxed,
    movies: scored.slice(0, limit).map(({ movie, score }) => ({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      poster_url: movie.poster_url,
      release_year: movie.release_year,
      age_limit: movie.age_limit,
      is_series: movie.is_series,
      imdb_rating: movie.imdb_rating,
      quality: movie.quality,
      description: movie.description,
      views: movie.views,
      created_at: movie.created_at,
      genres: movie.genres,
      countries: movie.countries,
      score,
    })),
  };
}

module.exports = {
  smartSearchMovies,
  normalizeText,
  parseIntent,
  levenshtein,
};
