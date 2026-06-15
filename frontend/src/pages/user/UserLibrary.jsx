import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import '../movie/WatchMovie.css';
import './Profile.css';
import './UserLibrary.css';

const PAGE_CONFIG = {
  '/user/favorites': {
    title: 'Yêu thích',
    description: 'Những bộ phim bạn đã đánh dấu để xem lại.',
    endpoint: '/api/user/favorites',
    empty: 'Bạn chưa có phim yêu thích.',
    icon: FavoriteBorderIcon,
    removeEndpoint: (id) => `/api/user/favorites/${id}`,
  },
  '/user/list': {
    title: 'Danh sách phim',
    description: 'Danh sách phim bạn muốn lưu lại để xem sau.',
    endpoint: '/api/user/watchlist',
    empty: 'Danh sách của bạn đang trống.',
    icon: AddIcon,
    removeEndpoint: (id) => `/api/user/watchlist/${id}`,
  },
  '/user/history': {
    title: 'Lịch sử xem',
    description: 'Các tập phim bạn đã mở gần đây.',
    endpoint: '/api/user/history',
    empty: 'Bạn chưa xem phim nào.',
    icon: HistoryIcon,
    removeEndpoint: (_, item) => `/api/user/history/${item.history_id}`,
  },
  '/user/continue': {
    title: 'Tiếp tục xem',
    description: 'Quay lại đúng tập phim đang xem dở.',
    endpoint: '/api/user/continue',
    empty: 'Chưa có phim đang xem dở.',
    icon: PlayCircleOutlineIcon,
    removeEndpoint: (_, item) => `/api/user/history/${item.history_id}`,
  },
  '/user/notifications': {
    title: 'Thông báo',
    description: 'Các cập nhật và thông báo tài khoản của bạn.',
    endpoint: null,
    empty: 'Bạn chưa có thông báo nào.',
    icon: NotificationsNoneIcon,
    removeEndpoint: null,
  },
};

function getUser() {
  return JSON.parse(localStorage.getItem('user') || '{}');
}

function progressPercent(item) {
  if (!item.duration_seconds) return 0;
  return Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100));
}

function hasPreciseProgress(item) {
  return Number(item.duration_seconds) > 0;
}

function formatProgress(item) {
  if (!item.progress_seconds || !item.duration_seconds) return '';
  return `${Math.floor(item.progress_seconds / 60)} phút / ${Math.floor(item.duration_seconds / 60)} phút`;
}

function formatWatchedAt(value) {
  if (!value) return 'Đã mở gần đây';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Đã mở gần đây';
  return `Đã mở lúc ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function UserLibrary() {
  const location = useLocation();
  const navigate = useNavigate();
  const config = PAGE_CONFIG[location.pathname] || PAGE_CONFIG['/user/favorites'];
  const Icon = config.icon;
  const user = useMemo(getUser, []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user.id) {
      setLoading(false);
      setMessage('Bạn cần đăng nhập để xem mục này.');
      return;
    }

    setLoading(true);
    setMessage('');

    if (!config.endpoint) {
      setItems([]);
      setLoading(false);
      return;
    }

    fetch(config.endpoint, { headers: { 'x-user-id': user.id } })
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setMessage('Không thể tải dữ liệu. Vui lòng thử lại.');
        setLoading(false);
      });
  }, [config.endpoint, user.id]);

  const handleRemove = async (item) => {
    if (!config.removeEndpoint) return;
    const endpoint = config.removeEndpoint(item.id, item);
    await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'x-user-id': user.id },
    });
    setItems((current) => current.filter((movie) => movie !== item));
  };

  const handleOpen = (item) => {
    if (location.pathname === '/user/history' || location.pathname === '/user/continue') {
      const params = new URLSearchParams();
      if (item.episode_number) params.set('ep', item.episode_number);
      if (item.progress_seconds) params.set('t', item.progress_seconds);
      const query = params.toString();
      navigate(`/watch/${item.id}${query ? `?${query}` : ''}`);
      return;
    }
    navigate(`/movies/${item.id}`);
  };

  return (
    <div className="profile-bg">
      <div className="watch-movie-container profile-container">
        <ProfileSidebar user={user} />
        <main className="profile-main">
          <div className="library-page profile-library-page">
            <div className="library-heading">
              <div className="library-title-row">
                <Icon className="library-title-icon" />
                <h1>{config.title}</h1>
              </div>
              <p>{config.description}</p>
            </div>

            {loading ? (
              <div className="library-state">Đang tải...</div>
            ) : message ? (
              <div className="library-state">{message}</div>
            ) : items.length === 0 ? (
              <div className="library-empty">
                <Icon />
                <p>{config.empty}</p>
                <button type="button" onClick={() => navigate('/movies')}>Khám phá phim</button>
              </div>
            ) : (
              <div className="library-grid">
                {items.map((item) => (
                  <article className="library-card" key={`${item.history_id || 'movie'}-${item.id}`}>
                    <button type="button" className="library-poster" onClick={() => handleOpen(item)}>
                      <img src={item.poster_url || '/posters/the-matrix.jpg'} alt={item.title} />
                      {(location.pathname === '/user/continue' || location.pathname === '/user/history') && (
                        <span className="library-play-badge">
                          Tập {item.episode_number || 1}
                        </span>
                      )}
                    </button>
                    <div className="library-card-body">
                      <button type="button" className="library-card-title" onClick={() => handleOpen(item)}>
                        {item.title}
                      </button>
                      {item.original_title && item.original_title !== item.title && (
                        <div className="library-card-subtitle">{item.original_title}</div>
                      )}
                      <div className="library-meta">
                        {item.release_year && <span>{item.release_year}</span>}
                        {item.quality && <span>{item.quality}</span>}
                        {item.imdb_rating && <span>IMDb {Number(item.imdb_rating).toFixed(1)}</span>}
                      </div>
                      {(location.pathname === '/user/continue' || location.pathname === '/user/history') && (
                        <div className={`library-progress-wrap${hasPreciseProgress(item) ? '' : ' iframe'}`}>
                          {hasPreciseProgress(item) ? (
                            <>
                              <div className="library-progress-text">
                                <span>{formatProgress(item)}</span>
                                <span>{progressPercent(item)}%</span>
                              </div>
                              <div className="library-progress">
                                <span style={{ width: `${progressPercent(item)}%` }} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="library-progress-text">
                                <span>{formatWatchedAt(item.last_watched_at)}</span>
                                <span>KKPhim</span>
                              </div>
                              <div className="library-progress library-progress-indeterminate">
                                <span />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <div className="library-card-actions">
                        <button type="button" onClick={() => handleOpen(item)}>
                          {location.pathname === '/user/continue' ? 'Tiếp tục xem' : 'Mở phim'}
                        </button>
                        {config.removeEndpoint && (
                          <button type="button" className="library-remove" onClick={() => handleRemove(item)} title="Xóa">
                            <DeleteOutlineIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
