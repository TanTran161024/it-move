const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

if (process.env.TEST_CHATBOT_ANALYTICS !== 'true') {
  process.env.AI_ANALYTICS_DISABLED = 'true';
}

const express = require('express');
const mysql = require('mysql2/promise');
const { chatWithMovieAdvisor } = require('../services/aiService');
const { searchMoviesForMessage, normalizeText } = require('../services/recommendationService');
const { parseDurationMinutes } = require('../services/chatIntentService');
const routes = require('../routes');

const DEFAULT_LIMIT = 6;
const MIN_SCORE = Number(process.env.TEST_CHATBOT_QUALITY_MIN_SCORE || 85);
const MAX_CRITICAL_FAILURES = Number(process.env.TEST_CHATBOT_QUALITY_MAX_CRITICAL_FAILURES || 0);

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
}

function idsOf(result) {
  return (result.recommendations || result || []).map((movie) => Number(movie.id)).filter(Boolean);
}

function movieText(movie) {
  return normalizeText([
    movie.title,
    movie.original_title,
    movie.description,
    Array.isArray(movie.genres) ? movie.genres.join(' ') : '',
    Array.isArray(movie.countries) ? movie.countries.join(' ') : '',
  ].join(' '));
}

function hasAny(movie, aliases) {
  const haystack = movieText(movie);
  const words = new Set(haystack.split(' ').filter(Boolean));
  return aliases.some((alias) => {
    const normalized = normalizeText(alias);
    return normalized.includes(' ') ? haystack.includes(normalized) : words.has(normalized);
  });
}

function countMatches(movies, predicate) {
  return movies.filter(predicate).length;
}

function isHorror(movie) {
  return hasAny(movie, ['kinh di', 'horror', 'ma', 'quy', 'am anh']);
}

function isLight(movie) {
  return hasAny(movie, ['nhe nhang', 'chill', 'tinh cam', 'lang man', 'hai', 'hai huoc', 'gia dinh', 'hoc duong', 'de thuong']);
}

function isAnime(movie) {
  return hasAny(movie, ['anime', 'hoat hinh', 'animation', 'cartoon']);
}

function isKorean(movie) {
  return hasAny(movie, ['han quoc', 'korea', 'korean']);
}

function isJapanese(movie) {
  return hasAny(movie, ['nhat ban', 'japan', 'japanese']);
}

function isRomanceOrDrama(movie) {
  return hasAny(movie, ['tinh cam', 'lang man', 'tam ly', 'chinh kich', 'drama', 'romance']);
}

function isShort(movie) {
  const minutes = parseDurationMinutes(movie.duration);
  return Boolean(minutes && minutes <= 60);
}

function isSeries(movie) {
  return movie.is_series === true || Number(movie.is_series) === 1 || hasAny(movie, ['phim bo', 'series']);
}

function isChinese(movie) {
  return hasAny(movie, ['trung quoc', 'china', 'chinese', 'hoa ngu']);
}

function isAmerican(movie) {
  return hasAny(movie, ['my', 'au my', 'american', 'hollywood']);
}

function isVietnamese(movie) {
  return hasAny(movie, ['viet nam', 'vietnam']);
}

function isDocumentary(movie) {
  return hasAny(movie, ['tai lieu', 'documentary']);
}

function isAction(movie) {
  return hasAny(movie, ['hanh dong', 'chien dau', 'vo thuat', 'action']);
}

function isComedy(movie) {
  return hasAny(movie, ['hai', 'hai huoc', 'comedy']);
}

function isCostumeOrMartialArts(movie) {
  return hasAny(movie, ['co trang', 'vo thuat', 'kiem hiep', 'kungfu', 'than thoai']);
}

function isEmotionalDrama(movie) {
  return hasAny(movie, ['tam ly', 'chinh kich', 'tinh cam', 'drama']);
}

function isFantasy(movie) {
  return hasAny(movie, ['vien tuong', 'than thoai', 'phep thuat', 'fantasy', 'xuyen khong', 'chuyen sinh']);
}

function hasReason(movie, fragment) {
  const expected = normalizeText(fragment);
  return Array.isArray(movie.match_reasons)
    && movie.match_reasons.some((reason) => normalizeText(reason).includes(expected));
}

function averageRating(movies) {
  const ratings = movies
    .map((movie) => Number(movie.imdb_rating))
    .filter((rating) => Number.isFinite(rating) && rating > 0);
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
}

function assertMovieCardShape(movies, label) {
  movies.forEach((movie, index) => {
    assert(Number.isInteger(Number(movie.id)) && Number(movie.id) > 0, `${label}: movie ${index + 1} has invalid id`);
    assert(typeof movie.title === 'string' && movie.title.trim(), `${label}: movie ${movie.id} has no title`);
    assert(Array.isArray(movie.genres), `${label}: movie ${movie.id} genres must be an array`);
    assert(Array.isArray(movie.countries), `${label}: movie ${movie.id} countries must be an array`);
    assert(Array.isArray(movie.match_reasons), `${label}: movie ${movie.id} match_reasons must be an array`);
    assert(Number.isFinite(Number(movie.match_score)), `${label}: movie ${movie.id} has invalid match_score`);
  });
}

async function countVisibleMoviesByIds(db, ids) {
  if (!ids.length) return 0;
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count FROM movies WHERE is_visible = 1 AND id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return Number(rows[0]?.count) || 0;
}

async function assertRealMovies(db, movies, label, minCount = 1) {
  const ids = idsOf(movies);
  assert(ids.length >= minCount, `${label}: expected at least ${minCount} recommendations`);
  assert(new Set(ids).size === ids.length, `${label}: duplicated recommendation ids`);

  const realCount = await countVisibleMoviesByIds(db, ids);
  assert(realCount === ids.length, `${label}: response contains movie not visible/existing in DB`);
}

async function search(db, message, limit = DEFAULT_LIMIT, options = {}) {
  const movies = await searchMoviesForMessage(db, message, { limit, ...options });
  await assertRealMovies(db, movies, message);
  return movies;
}

function historyFrom(turns) {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

async function createDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });
}

function parseSseEvents(text) {
  return String(text || '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let event = 'message';
      const dataLines = [];
      block.split(/\r?\n/).forEach((line) => {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      });
      return {
        event,
        data: dataLines.length ? JSON.parse(dataLines.join('\n')) : {},
      };
    });
}

async function withTestServer(db, callback) {
  const app = express();
  app.locals.db = db;
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', routes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, 'localhost', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    return await callback(`http://localhost:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runCase(results, name, testFn) {
  const started = Date.now();
  const category = String(name).split(':', 1)[0] || 'other';
  try {
    await testFn();
    results.push({ name, category, critical: true, passed: true, ms: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, category, critical: true, passed: false, ms: Date.now() - started, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function main() {
  if (process.env.TEST_CHATBOT_DISABLE_GEMINI !== 'false') {
    process.env.GEMINI_API_KEY = '';
  }

  const db = await createDb();
  const results = [];

  try {
    await runCase(results, 'semantic: không kinh dị + nhẹ nhàng', async () => {
      const movies = await search(db, 'khong kinh di nhe nhang de xem');
      const horrorCount = countMatches(movies, isHorror);
      const lightCount = countMatches(movies, isLight);
      assert(horrorCount === 0, `expected 0 horror movies, got ${horrorCount}`);
      assert(lightCount >= 1, 'expected at least one light/romance/comedy match');
    });

    await runCase(results, 'vector: chữa lành sau giờ làm', async () => {
      const movies = await search(db, 'toi can phim chua lanh sau gio lam');
      const lightCount = countMatches(movies, isLight);
      const vectorReasonCount = countMatches(movies, (movie) => (
        Array.isArray(movie.match_reasons)
        && movie.match_reasons.some((reason) => normalizeText(reason).includes('gan nghia'))
      ));

      assert(lightCount >= 1, 'expected at least one light/healing match');
      assert(vectorReasonCount >= 1, 'expected at least one vector similarity reason');
    });

    await runCase(results, 'hybrid: anime Nhật + IMDb cao', async () => {
      const movies = await search(db, 'anime Nhat IMDb cao');
      const japaneseCount = countMatches(movies, isJapanese);
      const animeCount = countMatches(movies, isAnime);
      const rated = movies.map((movie) => Number(movie.imdb_rating)).filter((rating) => Number.isFinite(rating) && rating > 0);
      const averageRating = rated.length ? rated.reduce((sum, rating) => sum + rating, 0) / rated.length : 0;

      assert(japaneseCount >= 2, `expected at least 2 Japanese matches, got ${japaneseCount}`);
      assert(animeCount >= 2, `expected at least 2 anime/animation matches, got ${animeCount}`);
      assert(averageRating >= 6.5, `expected average IMDb >= 6.5, got ${averageRating.toFixed(1)}`);
    });

    await runCase(results, 'hybrid: phim Hàn chill tình cảm', async () => {
      const movies = await search(db, 'phim Han chill tinh cam');
      const koreanCount = countMatches(movies, isKorean);
      const softCount = countMatches(movies, (movie) => isLight(movie) || isRomanceOrDrama(movie));

      assert(koreanCount >= 2, `expected at least 2 Korean matches, got ${koreanCount}`);
      assert(softCount >= 1, 'expected at least one chill/romance/drama match');
    });

    await runCase(results, 'semantic: phim ngắn xem nhanh', async () => {
      const movies = await search(db, 'phim ngan xem nhanh');
      const shortCount = countMatches(movies, isShort);
      assert(shortCount >= 2, `expected at least 2 short-duration matches, got ${shortCount}`);
    });

    await runCase(results, 'semantic: phim lẻ không phim bộ', async () => {
      const movies = await search(db, 'phim le khong phim bo');
      const seriesCount = countMatches(movies, isSeries);
      assert(seriesCount === 0, `expected no series movies, got ${seriesCount}`);
    });

    await runCase(results, 'semantic: kinh di gay can', async () => {
      const movies = await search(db, 'phim kinh di gay can');
      const horrorCount = countMatches(movies, isHorror);
      assert(horrorCount >= 3, `expected at least 3 horror matches, got ${horrorCount}`);
      assert(countMatches(movies, (movie) => hasReason(movie, 'kinh di')) >= 3, 'expected horror explanations');
    });

    await runCase(results, 'semantic: hai vui ve', async () => {
      const movies = await search(db, 'phim hai vui ve');
      const comedyCount = countMatches(movies, isComedy);
      assert(comedyCount >= 4, `expected at least 4 comedy matches, got ${comedyCount}`);
    });

    await runCase(results, 'hybrid: Trung Quoc co trang vo thuat', async () => {
      const movies = await search(db, 'phim Trung Quoc co trang vo thuat');
      const chineseCount = countMatches(movies, isChinese);
      const costumeCount = countMatches(movies, isCostumeOrMartialArts);
      assert(chineseCount >= 4, `expected at least 4 Chinese matches, got ${chineseCount}`);
      assert(costumeCount >= 3, `expected at least 3 costume/martial arts matches, got ${costumeCount}`);
    });

    await runCase(results, 'semantic: tai lieu doi thuc', async () => {
      const movies = await search(db, 'phim tai lieu doi thuc');
      const documentaryCount = countMatches(movies, isDocumentary);
      assert(documentaryCount >= 3, `expected at least 3 documentaries, got ${documentaryCount}`);
    });

    await runCase(results, 'ranking: phim moi IMDb cao', async () => {
      const movies = await search(db, 'phim moi IMDb cao');
      const recentCount = countMatches(movies, (movie) => Number(movie.release_year) >= new Date().getFullYear() - 5);
      const highRatedCount = countMatches(movies, (movie) => Number(movie.imdb_rating) >= 7);
      const ratingAverage = averageRating(movies);
      assert(recentCount >= 4, `expected at least 4 recent movies, got ${recentCount}`);
      assert(highRatedCount >= 4, `expected at least 4 highly rated movies, got ${highRatedCount}`);
      assert(ratingAverage >= 7.5, `expected average IMDb >= 7.5, got ${ratingAverage.toFixed(1)}`);
    });

    await runCase(results, 'semantic: phim bo nhieu tap', async () => {
      const movies = await search(db, 'phim bo nhieu tap');
      const seriesCount = countMatches(movies, isSeries);
      assert(seriesCount === movies.length, `expected series-only results, got ${seriesCount}/${movies.length}`);
      assert(countMatches(movies, (movie) => hasReason(movie, 'phim bo')) >= 1, 'expected a series explanation');
    });

    await runCase(results, 'hybrid: My hanh dong', async () => {
      const movies = await search(db, 'phim My hanh dong');
      const americanCount = countMatches(movies, isAmerican);
      const actionCount = countMatches(movies, isAction);
      assert(americanCount >= 4, `expected at least 4 US/Western matches, got ${americanCount}`);
      assert(actionCount >= 4, `expected at least 4 action matches, got ${actionCount}`);
    });

    await runCase(results, 'negative: Nhat Ban khong anime', async () => {
      const movies = await search(db, 'phim Nhat Ban khong anime');
      const japaneseCount = countMatches(movies, isJapanese);
      const animeCount = countMatches(movies, isAnime);
      assert(japaneseCount >= 4, `expected at least 4 Japanese matches, got ${japaneseCount}`);
      assert(animeCount === 0, `expected anime to be excluded, got ${animeCount}`);
    });

    await runCase(results, 'vector: tam ly cam dong', async () => {
      const movies = await search(db, 'phim tam ly cam dong');
      const dramaCount = countMatches(movies, isEmotionalDrama);
      assert(dramaCount >= 4, `expected at least 4 drama matches, got ${dramaCount}`);
      assert(countMatches(movies, (movie) => hasReason(movie, 'gan nghia')) >= 1, 'expected vector explanation');
    });

    await runCase(results, 'vector: phep thuat xuyen khong', async () => {
      const movies = await search(db, 'phim phep thuat xuyen khong');
      const fantasyCount = countMatches(movies, isFantasy);
      assert(fantasyCount >= 4, `expected at least 4 fantasy matches, got ${fantasyCount}`);
      assert(countMatches(movies, (movie) => hasReason(movie, 'gan nghia')) >= 1, 'expected a vector explanation');
    });

    await runCase(results, 'vector: hoc duong thanh xuan', async () => {
      const movies = await search(db, 'phim hoc duong thanh xuan');
      const softCount = countMatches(movies, (movie) => isLight(movie) || isEmotionalDrama(movie));
      assert(softCount >= 4, `expected at least 4 youth/light matches, got ${softCount}`);
      assert(countMatches(movies, (movie) => hasReason(movie, 'gan nghia')) >= 2, 'expected vector explanations');
    });

    await runCase(results, 'dense: semantic candidate enters reranker', async () => {
      const [rows] = await db.execute(
        'SELECT id FROM movies WHERE is_visible = 1 ORDER BY COALESCE(views, 0) ASC, id ASC LIMIT 1'
      );
      const targetId = Number(rows[0]?.id);
      assert(targetId > 0, 'expected a dense target movie');
      const movies = await search(db, 'hanh trinh noi tam tim lai hy vong bi danh mat', DEFAULT_LIMIT, {
        denseResult: {
          available: true,
          coverage: 1,
          scores: new Map([[targetId, 0.96]]),
        },
      });
      assert(idsOf(movies).includes(targetId), 'dense candidate should enter final recommendations');
      const target = movies.find((movie) => Number(movie.id) === targetId);
      assert(hasReason(target, 'ngu nghia sau'), 'dense candidate should explain deep semantic match');
      assert(Number(target.dense_similarity) >= 0.9, 'dense similarity should be exposed on the card contract');
    });

    await runCase(results, 'dense: hard country filter survives reranking', async () => {
      const [rows] = await db.execute(
        `SELECT m.id,
                COALESCE(GROUP_CONCAT(DISTINCT c.name SEPARATOR '||'), '') AS countries
         FROM movies m
         LEFT JOIN movie_countries mc ON mc.movie_id = m.id
         LEFT JOIN countries c ON c.id = mc.country_id
         WHERE m.is_visible = 1
         GROUP BY m.id`
      );
      const denseScores = new Map(rows.map((row) => [
        Number(row.id),
        normalizeText(row.countries).includes('viet nam') ? 0.55 : 0.99,
      ]));
      const movies = await search(db, 'phim Viet Nam', DEFAULT_LIMIT, {
        denseResult: { available: true, coverage: denseScores.size, scores: denseScores },
      });
      assert(movies.length > 0, 'expected Vietnamese recommendations');
      assert(movies.every(isVietnamese), 'dense reranker must not bypass the Vietnamese country filter');
    });

    await runCase(results, 'structured: dung nam phat hanh', async () => {
      const expectedYear = new Date().getFullYear();
      const movies = await search(db, `phim nam ${expectedYear}`);
      const exactYearCount = countMatches(movies, (movie) => Number(movie.release_year) === expectedYear);
      assert(exactYearCount === movies.length, `expected year ${expectedYear}, got ${exactYearCount}/${movies.length}`);
      assert(countMatches(movies, (movie) => hasReason(movie, `nam ${expectedYear}`)) >= 1, 'expected exact-year explanation');
    });

    await runCase(results, 'structured: phim Viet Nam', async () => {
      const movies = await search(db, 'phim Viet Nam');
      const vietnameseCount = countMatches(movies, isVietnamese);
      assert(vietnameseCount === movies.length, `expected Vietnamese-only results, got ${vietnameseCount}/${movies.length}`);
    });

    await runCase(results, 'negative: lang man khong kinh di', async () => {
      const movies = await search(db, 'phim lang man khong kinh di');
      const romanceCount = countMatches(movies, isRomanceOrDrama);
      const horrorCount = countMatches(movies, isHorror);
      assert(romanceCount >= 4, `expected at least 4 romance/drama matches, got ${romanceCount}`);
      assert(horrorCount === 0, `expected horror to be excluded, got ${horrorCount}`);
    });

    await runCase(results, 'normalization: co dau va khong dau tuong duong', async () => {
      const accented = await search(db, 'phim Hàn Quốc tình cảm');
      const plain = await search(db, 'phim Han Quoc tinh cam');
      const accentedIds = idsOf(accented);
      const overlap = idsOf(plain).filter((id) => accentedIds.includes(id));
      assert(overlap.length >= 4, `expected at least 4 shared results, got ${overlap.length}`);
    });

    await runCase(results, 'contract: limit uniqueness va movie card shape', async () => {
      const movies = await search(db, 'phim hai vui ve', 3);
      assert(movies.length > 0 && movies.length <= 3, `expected 1-3 movies, got ${movies.length}`);
      assertMovieCardShape(movies, 'movie card contract');
    });

    await runCase(results, 'safety: truy van rac khong tu tao ket qua', async () => {
      const movies = await searchMoviesForMessage(db, 'qzxwvplm nfrtkgb', { limit: DEFAULT_LIMIT });
      assert(movies.length === 0, `expected no result for nonsense query, got ${movies.length}`);
    });

    await runCase(results, 'unit: chuan hoa thoi luong', async () => {
      assert(parseDurationMinutes('2h05m') === 125, 'expected 2h05m = 125 minutes');
      assert(parseDurationMinutes('45 phut/tap') === 45, 'expected 45 minutes per episode');
      assert(parseDurationMinutes('01:30') === 90, 'expected 01:30 = 90 minutes');
    });

    await runCase(results, 'chat: response shape + explanations', async () => {
      const result = await chatWithMovieAdvisor(db, {
        message: 'anime Nhat IMDb cao',
        history: [],
        shown_movie_ids: [],
      });

      await assertRealMovies(db, result, 'chat response');
      assert(result.provider === 'database-rules', `expected database-rules provider, got ${result.provider}`);
      assert(result.grounding?.no_fake_data === true, 'expected no_fake_data grounding flag');
      assert(Array.isArray(result.suggested_replies) && result.suggested_replies.length > 0, 'expected suggested replies');

      const missingExplanations = result.recommendations
        .slice(0, 3)
        .filter((movie) => !movie.why_recommended?.summary || !movie.why_recommended?.details?.length);
      assert(missingExplanations.length === 0, 'top recommendations should include why_recommended details');
    });

    await runCase(results, 'chat: follow-up không lặp phim đã hiện', async () => {
      const turns = [];
      const first = await chatWithMovieAdvisor(db, {
        message: 'Toi muon xem phim hanh dong hai',
        history: [],
        shown_movie_ids: [],
      });
      await assertRealMovies(db, first, 'first chat request');
      turns.push({ role: 'user', content: 'Toi muon xem phim hanh dong hai' });
      turns.push({ role: 'assistant', content: first.reply });

      const firstIds = idsOf(first);
      const second = await chatWithMovieAdvisor(db, {
        message: 'phim khac',
        history: historyFrom(turns),
        shown_movie_ids: firstIds,
      });
      await assertRealMovies(db, second, 'follow-up chat request');
      assert(second.conversation?.follow_up === true, 'expected follow_up = true');

      const repeated = idsOf(second).filter((id) => firstIds.includes(id));
      assert(repeated.length === 0, `follow-up repeated previous ids: ${repeated.join(', ')}`);
    });

    await runCase(results, 'chat: off-topic không trả phim', async () => {
      const result = await chatWithMovieAdvisor(db, {
        message: 'toi muon mua laptop',
        history: [],
        shown_movie_ids: [],
      });

      assert(result.source === 'off-topic', `expected off-topic source, got ${result.source}`);
      assert((result.recommendations || []).length === 0, 'off-topic should not return recommendations');
    });

    await runCase(results, 'chat: yeu cau chung can hoi lai', async () => {
      const result = await chatWithMovieAdvisor(db, {
        message: 'goi y phim hay',
        history: [],
        shown_movie_ids: [],
      });

      assert(result.source === 'clarification', `expected clarification source, got ${result.source}`);
      assert(typeof result.reply === 'string' && result.reply.trim(), 'expected a clarification reply');
      assert(Array.isArray(result.suggested_replies) && result.suggested_replies.length >= 3, 'expected clarification choices');
      assert(result.grounding?.no_fake_data === true, 'expected safe grounding for clarification');
    });

    await runCase(results, 'chat: tin nhan rong bi tu choi', async () => {
      let rejected = null;
      try {
        await chatWithMovieAdvisor(db, {
          message: '   ',
          history: [],
          shown_movie_ids: [],
        });
      } catch (error) {
        rejected = error;
      }

      assert(rejected, 'expected empty chat message to be rejected');
      assert(rejected.statusCode === 400, `expected status 400, got ${rejected.statusCode}`);
    });

    await runCase(results, 'http: SSE stream trả reply_delta và done', async () => {
      await withTestServer(db, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'anime Nhat IMDb cao',
            history: [],
            shown_movie_ids: [],
          }),
        });

        assert(response.ok, `expected SSE response ok, got ${response.status}`);
        assert(String(response.headers.get('content-type') || '').includes('text/event-stream'), 'expected text/event-stream content-type');

        const events = parseSseEvents(await response.text());
        const eventNames = events.map((item) => item.event);
        assert(eventNames.includes('reply_delta'), 'expected at least one reply_delta event');
        assert(eventNames.includes('recommendations'), 'expected recommendations event');
        assert(eventNames.includes('done'), 'expected done event');

        const streamedText = events
          .filter((item) => item.event === 'reply_delta')
          .map((item) => item.data?.text || '')
          .join('');
        const done = events.find((item) => item.event === 'done')?.data || {};
        assert(streamedText.trim().length > 0, 'expected streamed reply text');
        assert(Array.isArray(done.recommendations) && done.recommendations.length > 0, 'expected done recommendations');
        assert(streamedText === done.reply, 'streamed chunks must reconstruct the final reply exactly');

        const firstDeltaIndex = eventNames.indexOf('reply_delta');
        const recommendationsIndex = eventNames.indexOf('recommendations');
        const doneIndex = eventNames.indexOf('done');
        assert(eventNames[0] === 'status', `expected status first, got ${eventNames[0]}`);
        assert(firstDeltaIndex > 0, 'expected reply_delta after initial status');
        assert(recommendationsIndex > firstDeltaIndex, 'expected recommendations after reply chunks');
        assert(doneIndex > recommendationsIndex, 'expected done to be the final data event');

        const recommendationEvent = events.find((item) => item.event === 'recommendations')?.data || {};
        assert(
          JSON.stringify(idsOf(recommendationEvent)) === JSON.stringify(idsOf(done)),
          'recommendations event and done payload must contain the same movie ids'
        );
      });
    });

    await runCase(results, 'http: SSE off-topic khong tra phim', async () => {
      await withTestServer(db, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: 'toi muon mua laptop', history: [], shown_movie_ids: [] }),
        });
        const events = parseSseEvents(await response.text());
        const done = events.find((item) => item.event === 'done')?.data || {};
        assert(events.some((item) => item.event === 'reply_delta'), 'expected off-topic reply chunks');
        assert(done.source === 'off-topic', `expected off-topic source, got ${done.source}`);
        assert(Array.isArray(done.recommendations) && done.recommendations.length === 0, 'off-topic stream should not return movies');
      });
    });

    await runCase(results, 'http: SSE loi validation co cau truc', async () => {
      await withTestServer(db, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: '   ' }),
        });
        const events = parseSseEvents(await response.text());
        const errorEvent = events.find((item) => item.event === 'error')?.data;
        assert(errorEvent, 'expected an SSE error event');
        assert(errorEvent.status === 400, `expected validation status 400, got ${errorEvent.status}`);
        assert(typeof errorEvent.message === 'string' && errorEvent.message.trim(), 'expected a readable validation message');
        assert(!events.some((item) => item.event === 'done'), 'validation failure must not emit done');
      });
    });
  } finally {
    await db.end();
  }

  const passed = results.filter((item) => item.passed).length;
  const total = results.length;
  const score = Math.round((passed / total) * 100);
  const failed = results.filter((item) => !item.passed);
  const criticalFailures = failed.filter((item) => item.critical).length;
  const categories = [...new Set(results.map((item) => item.category))].reduce((summary, category) => {
    const categoryResults = results.filter((item) => item.category === category);
    const categoryPassed = categoryResults.filter((item) => item.passed).length;
    summary[category] = {
      passed: categoryPassed,
      total: categoryResults.length,
      score: Math.round((categoryPassed / categoryResults.length) * 100),
    };
    return summary;
  }, {});

  console.log('\nChatbot quality report');
  console.log(JSON.stringify({
    passed,
    total,
    score,
    min_score: MIN_SCORE,
    critical_failures: criticalFailures,
    max_critical_failures: MAX_CRITICAL_FAILURES,
    duration_ms: results.reduce((sum, item) => sum + item.ms, 0),
    fallback_safe: !process.env.GEMINI_API_KEY,
    categories,
    failed: failed.map((item) => ({ name: item.name, error: item.error })),
  }, null, 2));

  if (score < MIN_SCORE || criticalFailures > MAX_CRITICAL_FAILURES) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
