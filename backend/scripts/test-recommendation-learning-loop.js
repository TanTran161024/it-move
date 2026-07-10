const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

process.env.AI_ANALYTICS_DISABLED = 'false';

const mysql = require('mysql2/promise');
const {
  createRecommendationRequestId,
  getRecommendationAnalytics,
  recordRecommendationEvents,
  recordRecommendationResponse,
} = require('../services/recommendationAnalyticsService');
const { getAiMovieFeedbackMap, setAiMovieFeedback } = require('../services/aiFeedbackService');
const { getProfileTasteProfile, scoreMovieWithTaste } = require('../services/profileTasteService');
const { getAdminAiTasteDashboard } = require('../services/adminAiTasteService');

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
}

async function createDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_website',
  });
}

async function main() {
  const db = await createDb();
  const requestId = createRecommendationRequestId();
  let transactionStarted = false;

  try {
    const [profiles] = await db.execute('SELECT id, user_id FROM user_profiles ORDER BY id LIMIT 2');
    const [movies] = await db.execute(
      `SELECT id, title, duration, is_series
       FROM movies
       WHERE is_visible = 1
       ORDER BY id
       LIMIT 1`
    );
    assert(profiles.length >= 2, 'Cần ít nhất 2 profile để kiểm tra cách ly dữ liệu');
    assert(movies.length >= 1, 'Cần ít nhất 1 phim đang hiển thị để chạy test');

    const profileA = profiles[0];
    const profileB = profiles[1];
    const movie = movies[0];
    await db.beginTransaction();
    transactionStarted = true;

    const responseResult = await recordRecommendationResponse(db, {
      requestId,
      userId: profileA.user_id,
      profileId: profileA.id,
      latencyMs: 240,
      message: 'phim ngan de xem',
      result: {
        source: 'rule-based',
        provider: 'database-rules',
        recommendations: [{ id: movie.id }],
      },
    });
    assert(responseResult.recorded === 1, 'Không ghi được response analytics');

    const eventKey = `impression:${requestId}:${movie.id}`;
    const interactionResult = await recordRecommendationEvents(db, {
      userId: profileA.user_id,
      profileId: profileA.id,
      requestId,
      source: 'chatbot',
      events: [
        { event_type: 'impression', event_key: eventKey, movie_id: movie.id, position: 1 },
        { event_type: 'why_open', event_key: `why_open:${requestId}:${movie.id}`, movie_id: movie.id, position: 1 },
        { event_type: 'detail_click', event_key: `detail_click:${requestId}:${movie.id}`, movie_id: movie.id, position: 1 },
        { event_type: 'play', event_key: `play:${requestId}:${movie.id}`, movie_id: movie.id, position: 1 },
        { event_type: 'save', event_key: `save:${requestId}:${movie.id}`, movie_id: movie.id, position: 1 },
      ],
    });
    assert(interactionResult.recorded === 5, `Mong đợi 5 interaction events, nhận ${interactionResult.recorded}`);

    const duplicateResult = await recordRecommendationEvents(db, {
      userId: profileA.user_id,
      profileId: profileA.id,
      requestId,
      events: [{ event_type: 'impression', event_key: eventKey, movie_id: movie.id, position: 1 }],
    });
    assert(duplicateResult.recorded === 0, 'Event trùng khóa không được ghi lần hai');

    await setAiMovieFeedback(db, {
      userId: profileA.user_id,
      profileId: profileA.id,
      movieId: movie.id,
      feedbackType: 'dislike',
      active: true,
      source: 'learning-loop-test',
      metadata: { reason: 'too_long', reason_label: 'Quá dài', request_id: requestId },
    });
    await recordRecommendationEvents(db, {
      userId: profileA.user_id,
      profileId: profileA.id,
      requestId,
      events: [{
        event_type: 'feedback',
        event_key: `feedback:${requestId}:${movie.id}:dislike`,
        movie_id: movie.id,
        position: 1,
        metadata: { feedback_type: 'dislike' },
      }],
    });

    const [feedbackA, feedbackB, tasteA, analytics] = await Promise.all([
      getAiMovieFeedbackMap(db, { userId: profileA.user_id, profileId: profileA.id, movieIds: [movie.id] }),
      getAiMovieFeedbackMap(db, { userId: profileB.user_id, profileId: profileB.id, movieIds: [movie.id] }),
      getProfileTasteProfile(db, profileA.user_id, profileA.id),
      getRecommendationAnalytics(db, { profileId: profileA.id, days: 1 }),
    ]);

    assert(feedbackA[movie.id]?.dislike === true, 'Feedback không được lưu cho profile A');
    assert(feedbackB[movie.id]?.dislike !== true, 'Feedback của profile A bị rò sang profile B');
    assert(tasteA.reason_signals?.too_long > 0, 'Lý do quá dài chưa trở thành tín hiệu học gu');
    assert(analytics.totals.impressions >= 1, 'Analytics thiếu impression');
    assert(analytics.totals.plays >= 1, 'Analytics thiếu play');
    assert(analytics.totals.feedback >= 1, 'Analytics thiếu feedback');
    assert(analytics.rates.play_rate > 0, 'Không tính được play rate');
    assert(analytics.latency.p95_ms >= 240, 'Không tính đúng latency P95');
    assert(analytics.top_feedback_reasons.some((item) => item.label === 'Quá dài'), 'Admin analytics thiếu lý do feedback');

    const dashboard = await getAdminAiTasteDashboard(db, { profileId: profileA.id, days: 1, limit: 20 });
    assert(dashboard.analytics?.global?.available === true, 'Dashboard thiếu analytics toàn hệ thống');
    assert(dashboard.analytics?.profile?.totals?.plays >= 1, 'Dashboard thiếu analytics theo profile');
    assert(
      dashboard.feedbacks.some((item) => item.movie_id === Number(movie.id) && item.reason_label === 'Quá dài'),
      'Dashboard không hiển thị lý do feedback'
    );

    const shortScore = scoreMovieWithTaste({ duration: '30 phút', is_series: 0, genres: [], countries: [] }, tasteA).score;
    const longScore = scoreMovieWithTaste({ duration: '180 phút', is_series: 0, genres: [], countries: [] }, tasteA).score;
    assert(shortScore > longScore, `Phản hồi quá dài chưa ưu tiên phim ngắn (${shortScore} <= ${longScore})`);

    await db.rollback();
    transactionStarted = false;

    const [[eventCount]] = await db.execute(
      'SELECT COUNT(*) AS total FROM ai_recommendation_events WHERE request_id = ?',
      [requestId]
    );
    assert(Number(eventCount.total) === 0, 'Rollback không xóa hết analytics test');

    console.log('Recommendation analytics & learning loop test passed');
    console.log(JSON.stringify({
      events_recorded: 7,
      duplicate_blocked: true,
      profile_isolation: true,
      reason_learning: 'too_long',
      short_score: shortScore,
      long_score: longScore,
      rollback_clean: true,
    }, null, 2));
  } finally {
    if (transactionStarted) await db.rollback().catch(() => {});
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
