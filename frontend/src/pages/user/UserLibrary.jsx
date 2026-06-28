import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import ProfileSidebar from '../../components/user/ProfileSidebar';

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
    <div className="min-h-screen bg-background pt-24 pb-12">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl flex flex-col lg:flex-row gap-8">
        <ProfileSidebar user={user} />
        
        <main className="flex-1 min-w-0">
          <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-6 md:p-8 shadow-2xl min-h-[60vh]">
            <div className="mb-8 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <Icon className="text-primary text-3xl" />
                <h1 className="text-2xl md:text-3xl font-heading font-bold text-white">{config.title}</h1>
              </div>
              <p className="text-text-secondary text-sm md:text-base">{config.description}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-text-secondary animate-pulse">Đang tải...</div>
            ) : message ? (
              <div className="flex items-center justify-center h-40 text-red-400">{message}</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Icon className="text-6xl text-white/10 mb-4" />
                <p className="text-text-secondary mb-6 text-lg">{config.empty}</p>
                <button type="button" className="px-6 py-2.5 bg-primary hover:bg-red-600 text-white font-medium rounded-full transition-colors" onClick={() => navigate('/movies')}>Khám phá phim</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {items.map((item) => (
                  <article className="group relative rounded-xl overflow-hidden bg-surface/50 border border-white/5 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" key={`${item.history_id || 'movie'}-${item.id}`}>
                    <button type="button" className="w-full aspect-[2/3] relative overflow-hidden bg-black" onClick={() => handleOpen(item)}>
                      <img src={item.poster_url || '/posters/the-matrix.jpg'} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border-2 border-white bg-white/20 flex items-center justify-center backdrop-blur-sm text-white group-hover:scale-110 transition-transform">
                          <PlayCircleOutlineIcon />
                        </div>
                      </div>

                      {(location.pathname === '/user/continue' || location.pathname === '/user/history') && (
                        <span className="absolute top-2 left-2 bg-primary text-white text-xs font-bold px-2 py-1 rounded shadow-md">
                          Tập {item.episode_number || 1}
                        </span>
                      )}
                    </button>
                    
                    <div className="p-3">
                      <h3 className="text-white font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors cursor-pointer text-left" onClick={() => handleOpen(item)}>
                        {item.title}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-text-secondary font-medium">
                        {item.release_year && <span>{item.release_year}</span>}
                        {item.quality && <span className="border border-white/20 px-1 rounded">{item.quality}</span>}
                        {item.imdb_rating && <span className="text-[#f5c518]">★ {Number(item.imdb_rating).toFixed(1)}</span>}
                      </div>

                      {(location.pathname === '/user/continue' || location.pathname === '/user/history') && (
                        <div className="mt-3 relative">
                          <div className="flex justify-between text-[10px] text-text-secondary mb-1">
                            {hasPreciseProgress(item) ? (
                              <>
                                <span>{formatProgress(item)}</span>
                                <span>{progressPercent(item)}%</span>
                              </>
                            ) : (
                              <span>{formatWatchedAt(item.last_watched_at)}</span>
                            )}
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${hasPreciseProgress(item) ? progressPercent(item) : 100}%` }} />
                          </div>
                        </div>
                      )}

                      {config.removeEndpoint && (
                        <button type="button" className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); handleRemove(item); }} title="Xóa">
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </button>
                      )}
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
