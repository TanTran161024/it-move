require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { chatWithMovieAdvisor } = require('../services/aiService');

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
}

function idsOf(result) {
  return (result.recommendations || []).map((movie) => Number(movie.id)).filter(Boolean);
}

function historyFrom(turns) {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

async function countMoviesByIds(db, ids) {
  if (!ids.length) return 0;
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count FROM movies WHERE is_visible = 1 AND id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return Number(rows[0]?.count) || 0;
}

async function assertRealMovies(db, result, label) {
  const ids = idsOf(result);
  assert(ids.length > 0, `${label}: expected at least one recommendation`);
  assert(new Set(ids).size === ids.length, `${label}: duplicated recommendation ids`);
  const realCount = await countMoviesByIds(db, ids);
  assert(realCount === ids.length, `${label}: response contains movie not visible/existing in DB`);
}

async function main() {
  if (process.env.TEST_CHATBOT_DISABLE_GEMINI !== 'false') {
    process.env.GEMINI_API_KEY = '';
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });

  try {
    const turns = [];

    const first = await chatWithMovieAdvisor(db, {
      message: 'Toi muon xem phim hanh dong hai',
      history: [],
      shown_movie_ids: [],
    });
    await assertRealMovies(db, first, 'first request');
    turns.push({ role: 'user', content: 'Toi muon xem phim hanh dong hai' });
    turns.push({ role: 'assistant', content: first.reply });

    const firstIds = idsOf(first);
    const second = await chatWithMovieAdvisor(db, {
      message: 'phim khac',
      history: historyFrom(turns),
      shown_movie_ids: firstIds,
    });
    await assertRealMovies(db, second, 'follow-up phim khac');
    assert(second.conversation?.follow_up === true, 'phim khac should be detected as follow-up');
    const repeated = idsOf(second).filter((id) => firstIds.includes(id));
    assert(repeated.length === 0, `phim khac repeated previous ids: ${repeated.join(', ')}`);
    turns.push({ role: 'user', content: 'phim khac' });
    turns.push({ role: 'assistant', content: second.reply });

    const shownIds = [...new Set([...firstIds, ...idsOf(second)])];
    const third = await chatWithMovieAdvisor(db, {
      message: 'ngan thoi',
      history: historyFrom(turns),
      shown_movie_ids: shownIds,
    });
    await assertRealMovies(db, third, 'follow-up ngan thoi');
    assert(third.conversation?.follow_up === true, 'ngan thoi should be detected as follow-up');
    assert(third.conversation?.refinement?.shorter === true, 'ngan thoi should set shorter refinement');

    const offTopic = await chatWithMovieAdvisor(db, {
      message: 'toi muon mua laptop',
      history: historyFrom(turns),
      shown_movie_ids: shownIds,
    });
    assert(offTopic.source === 'off-topic', 'off-topic request should be redirected');
    assert((offTopic.recommendations || []).length === 0, 'off-topic response should not recommend movies');

    console.log('Chatbot smoke test passed');
    console.log(JSON.stringify({
      first_ids: firstIds,
      second_ids: idsOf(second),
      third_ids: idsOf(third),
      provider: first.provider,
      fallback_safe: !process.env.GEMINI_API_KEY,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
