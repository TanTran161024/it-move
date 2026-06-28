import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ForgotPasswordDialog from '../../components/auth/ForgotPasswordDialog';
import LoginDialog from '../../components/auth/LoginDialog';
import RegisterDialog from '../../components/auth/RegisterDialog';
import './DetailMovies.css';

const API = 'http://localhost:5000/api';

const reportReasons = [
  'Video không phát',
  'Sai tập phim',
  'Âm thanh/phụ đề lỗi',
  'Thông tin phim sai',
  'Lỗi khác',
];

const DetailMovies = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('episodes');
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState({ favorite: false, watchlist: false });
  const [ratingInfo, setRatingInfo] = useState({ average_rating: 0, rating_count: 0, my_rating: null });
  const [reviewRating, setReviewRating] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportText, setReportText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [forgotPromptOpen, setForgotPromptOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/movie/${id}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        if (json.episodes?.length) setSelectedEpisode(json.episodes[0].episode_number);
        setLoading(false);
      })
      .catch(() => {
        setError('Không thể tải dữ liệu phim');
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!user.id) return;
    fetch(`${API}/user/library-status/${id}`, { headers: { 'x-user-id': user.id } })
      .then((res) => res.json())
      .then((status) => setLibraryStatus({
        favorite: Boolean(status.favorite),
        watchlist: Boolean(status.watchlist),
      }))
      .catch(() => {});
  }, [id, user.id]);

  const fetchFeedback = () => {
    const headers = user.id ? { 'x-user-id': user.id } : {};
    Promise.all([
      fetch(`${API}/movies/${id}/ratings`, { headers }).then((res) => res.json()),
      fetch(`${API}/movies/${id}/comments`).then((res) => res.json()),
    ])
      .then(([ratings, commentsData]) => {
        setRatingInfo(ratings);
        setReviewRating(Number(ratings.my_rating) || 0);
        setComments(Array.isArray(commentsData) ? commentsData : []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchFeedback();
  }, [id, user.id]);

  const handleGenreClick = (genre) => {
    navigate(`/movies?genre=${encodeURIComponent(genre)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const requireLogin = () => {
    setFeedbackMessage('Vui lòng đăng nhập để sử dụng chức năng này.');
    setLoginPromptOpen(true);
  };

  const toggleLibraryItem = async (type) => {
    if (!user.id) {
      requireLogin();
      return;
    }

    const active = libraryStatus[type];
    const endpoint = type === 'favorite' ? '/user/favorites' : '/user/watchlist';
    const res = await fetch(`${API}${active ? `${endpoint}/${id}` : endpoint}`, {
      method: active ? 'DELETE' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: active ? undefined : JSON.stringify({ movie_id: id }),
    });

    if (res.ok) setLibraryStatus((prev) => ({ ...prev, [type]: !active }));
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!user.id) {
      setFeedbackMessage('Vui lòng đăng nhập để đánh giá và bình luận.');
      return;
    }
    if (!reviewRating) {
      setFeedbackMessage('Vui lòng chọn điểm đánh giá.');
      return;
    }
    if (!commentText.trim()) {
      setFeedbackMessage('Vui lòng nhập bình luận.');
      return;
    }

    const headers = { 'Content-Type': 'application/json', 'x-user-id': user.id };
    const ratingRes = await fetch(`${API}/movies/${id}/ratings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating: reviewRating }),
    });
    const commentRes = await fetch(`${API}/movies/${id}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: commentText.trim() }),
    });

    if (ratingRes.ok && commentRes.ok) {
      setCommentText('');
      setFeedbackMessage('Đã gửi đánh giá và bình luận.');
      fetchFeedback();
      return;
    }

    const errorBody = await (ratingRes.ok ? commentRes : ratingRes).json().catch(() => ({}));
    setFeedbackMessage(errorBody.message || 'Không thể gửi đánh giá và bình luận.');
  };

  const handleSubmitReport = async (event) => {
    event.preventDefault();
    const selected = data.episodes?.find((ep) => ep.episode_number === selectedEpisode);
    const res = await fetch(`${API}/movies/${id}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.id ? { 'x-user-id': user.id } : {}),
      },
      body: JSON.stringify({
        reason: reportReason,
        description: reportText,
        episode_id: selected?.id || null,
      }),
    });

    if (res.ok) {
      setReportText('');
      setFeedbackMessage('Cảm ơn bạn, báo lỗi đã được gửi cho admin.');
    } else {
      const body = await res.json().catch(() => ({}));
      setFeedbackMessage(body.message || 'Không thể gửi báo lỗi.');
    }
  };

  if (loading) return <div className="detail-state">Đang tải dữ liệu phim...</div>;
  if (error || !data) return <div className="detail-state">{error || 'Không tìm thấy phim'}</div>;

  const bgImage = data.bg_url || data.poster_url;
  const selectedEpisodeQuery = selectedEpisode > 1 ? `?ep=${selectedEpisode}` : '';

  return (
    <>
    <div className="detail-movies-bg">
      <div className="detail-hero-bg" style={{ backgroundImage: `url('${bgImage}')` }} />
      <div className="detail-movies-container">
        <section className="detail-top-banner" style={{ backgroundImage: `url('${bgImage}')` }}>
          <div className="detail-top-banner-shade">
            {data.title_url ? (
              <img className="detail-title-image" src={data.title_url} alt={data.title} />
            ) : (
              <div className="detail-banner-title">{data.title}</div>
            )}
          </div>
        </section>
        <aside className="detail-left-panel">
          <img className="detail-poster" src={data.poster_url} alt={data.title} />
          <h1 className="detail-title">{data.title}</h1>
          {data.original_title && data.original_title !== data.title && (
            <div className="detail-original-title">{data.original_title}</div>
          )}

          <div className="detail-badge-row">
            {data.imdb_rating && <span className="detail-badge imdb">IMDb {Number(data.imdb_rating).toFixed(1)}</span>}
            {data.age_limit && <span className="detail-badge">{data.age_limit}</span>}
            {data.release_year && <span className="detail-badge">{data.release_year}</span>}
            {data.duration && <span className="detail-badge">{data.duration}</span>}
          </div>

          <div className="detail-genre-row">
            {data.genres?.map((genre) => (
              <button type="button" key={genre} onClick={() => handleGenreClick(genre)}>
                {genre}
              </button>
            ))}
          </div>

          <section className="detail-side-section">
            <h2>Giới thiệu</h2>
            <p className={expanded ? 'expanded' : ''}>{data.description}</p>
            <button type="button" className="detail-text-link" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Thu gọn' : 'Hiển thị thêm'}
            </button>
          </section>

          <section className="detail-side-section detail-facts">
            {data.countries?.length > 0 && <div><strong>Quốc gia:</strong> {data.countries.join(', ')}</div>}
            {data.directors?.length > 0 && <div><strong>Đạo diễn:</strong> {data.directors.join(', ')}</div>}
            {data.producers?.length > 0 && <div><strong>Sản xuất:</strong> {data.producers.join(', ')}</div>}
          </section>

          <section className="detail-side-section">
            <h2>Diễn viên</h2>
            <div className="detail-actor-grid">
              {data.actors?.length > 0 ? data.actors.slice(0, 8).map((actor) => (
                <div className="detail-actor" key={actor.id || actor.name}>
                  <img
                    src={actor.profile_pic_url || '/avatar-actor.svg'}
                    alt={actor.name}
                    onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }}
                  />
                  <span>{actor.name}</span>
                </div>
              )) : <div className="detail-empty-small">Chưa có diễn viên</div>}
            </div>
          </section>
        </aside>

        <main className="detail-main-panel">
          <section className="detail-action-shell">
            <button
              type="button"
              className="detail-watch-button"
              onClick={() => navigate(`/watch/${id}${selectedEpisodeQuery}`)}
            >
              <span>▶</span>
              Xem Ngay
            </button>
            <button
              type="button"
              className={`detail-icon-action${libraryStatus.favorite ? ' active' : ''}`}
              onClick={() => toggleLibraryItem('favorite')}
            >
              <span>♡</span>
              {libraryStatus.favorite ? 'Đã thích' : 'Yêu thích'}
            </button>
            <button
              type="button"
              className={`detail-icon-action${libraryStatus.watchlist ? ' active' : ''}`}
              onClick={() => toggleLibraryItem('watchlist')}
            >
              <span>＋</span>
              {libraryStatus.watchlist ? 'Đã thêm' : 'Thêm vào'}
            </button>
            <button type="button" className="detail-icon-action" onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}>
              <span>☰</span>
              Bình luận
            </button>
            <div className="detail-rating-pill">
              <span>★</span>
              <strong>{ratingInfo.average_rating || 0}</strong>
              <small>{ratingInfo.rating_count || 0} đánh giá</small>
            </div>
          </section>

          <nav className="detail-tabs">
            <button type="button" className={activeTab === 'episodes' ? 'active' : ''} onClick={() => setActiveTab('episodes')}>Tập phim</button>
            <button type="button" className={activeTab === 'actors' ? 'active' : ''} onClick={() => setActiveTab('actors')}>Diễn viên</button>
            <button type="button" className={activeTab === 'suggested' ? 'active' : ''} onClick={() => setActiveTab('suggested')}>Gợi ý tương tự</button>
          </nav>

          {activeTab === 'episodes' && (
            <section className="detail-content-block">
              <div className="detail-section-heading">
                <h2>Phần 1</h2>
                <span>{data.episodes?.length || 0} tập</span>
              </div>
              <div className="episode-list">
                {data.episodes?.length > 0 ? data.episodes.map((episode) => (
                  <button
                    type="button"
                    key={episode.id || episode.episode_number}
                    className={`episode-btn${selectedEpisode === episode.episode_number ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedEpisode(episode.episode_number);
                      navigate(`/watch/${id}?ep=${episode.episode_number}`);
                    }}
                  >
                    <span>▶</span>
                    <span className="episode-label">Tập {episode.episode_number}</span>
                  </button>
                )) : <div className="detail-empty-small">Chưa có tập phim</div>}
              </div>
            </section>
          )}

          {activeTab === 'actors' && (
            <section className="detail-content-block">
              <div className="detail-section-heading"><h2>Diễn viên</h2></div>
              <div className="detail-actor-wide-grid">
                {data.actors?.length > 0 ? data.actors.map((actor) => (
                  <div className="detail-actor-wide" key={actor.id || actor.name}>
                    <img src={actor.profile_pic_url || '/avatar-actor.svg'} alt={actor.name} onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} />
                    <div>
                      <strong>{actor.name}</strong>
                      {actor.bio && <p>{actor.bio}</p>}
                    </div>
                  </div>
                )) : <div className="detail-empty-small">Chưa có diễn viên</div>}
              </div>
            </section>
          )}

          {activeTab === 'suggested' && (
            <section className="detail-content-block">
              <div className="detail-section-heading"><h2>Gợi ý tương tự</h2></div>
              <div className="detail-suggested-grid">
                {data.suggested?.length > 0 ? data.suggested.map((movie) => (
                  <button type="button" className="detail-suggested-card" key={movie.id} onClick={() => navigate(`/movies/${movie.id}`)}>
                    <img src={movie.poster_url} alt={movie.title} />
                    <span>{movie.title}</span>
                  </button>
                )) : <div className="detail-empty-small">Không có đề xuất</div>}
              </div>
            </section>
          )}

          <section className="movie-comments-card" id="comments">
            <div className="detail-section-heading">
              <h2>Bình luận ({comments.length})</h2>
              <span>Gửi kèm điểm đánh giá phim</span>
            </div>
            <form className="movie-review-form" onSubmit={handleSubmitReview}>
              <div className="movie-rating-summary">
                <span className="movie-rating-score">{ratingInfo.average_rating || 0}</span>
                <span>/10</span>
                <span className="movie-rating-count">{ratingInfo.rating_count || 0} lượt đánh giá</span>
              </div>
              <div className="movie-rating-buttons" aria-label="Chọn điểm đánh giá">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
                  <button
                    type="button"
                    key={score}
                    className={Number(reviewRating) === score ? 'active' : ''}
                    onClick={() => setReviewRating(score)}
                    title={`${score}/10`}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={user.id ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
                disabled={!user.id}
                maxLength={1000}
              />
              <div className="movie-review-footer">
                <span>{commentText.length}/1000</span>
                <button type="submit" disabled={!user.id || !reviewRating || !commentText.trim()}>
                  Gửi
                </button>
              </div>
            </form>
            {feedbackMessage && <div className="movie-feedback-message">{feedbackMessage}</div>}
            <div className="movie-comments-list">
              {comments.length > 0 ? comments.map((comment) => (
                <article className="movie-comment-item" key={comment.id}>
                  <div className="movie-comment-avatar">{comment.username?.[0]?.toUpperCase() || '?'}</div>
                  <div>
                    <div className="movie-comment-header">
                      <strong>{comment.username}</strong>
                      <span>{new Date(comment.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    <p>{comment.content}</p>
                  </div>
                </article>
              )) : <div className="movie-comments-empty">Chưa có bình luận nào.</div>}
            </div>
          </section>

          <form className="movie-report-form" onSubmit={handleSubmitReport}>
            <div className="detail-section-heading">
              <h2>Báo lỗi phim</h2>
              <span>Admin sẽ kiểm tra trong trang quản trị</span>
            </div>
            <div className="movie-report-row">
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                {reportReasons.map((reason) => <option key={reason}>{reason}</option>)}
              </select>
              <button type="submit">Gửi báo lỗi</button>
            </div>
            <textarea
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
              placeholder="Mô tả lỗi bạn gặp..."
            />
          </form>
        </main>
      </div>
    </div>
    <LoginDialog
      open={loginPromptOpen}
      onClose={() => setLoginPromptOpen(false)}
      onRegister={() => {
        setLoginPromptOpen(false);
        setRegisterPromptOpen(true);
      }}
      onForgot={() => {
        setLoginPromptOpen(false);
        setForgotPromptOpen(true);
      }}
    />
    <RegisterDialog
      open={registerPromptOpen}
      onClose={() => setRegisterPromptOpen(false)}
      onLogin={() => {
        setRegisterPromptOpen(false);
        setLoginPromptOpen(true);
      }}
    />
    <ForgotPasswordDialog
      open={forgotPromptOpen}
      onClose={() => setForgotPromptOpen(false)}
      onLogin={() => {
        setForgotPromptOpen(false);
        setLoginPromptOpen(true);
      }}
    />
    </>
  );
};

export default DetailMovies;
