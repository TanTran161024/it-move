import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import CategoryIcon from '@mui/icons-material/Category';
import PublicIcon from '@mui/icons-material/Public';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import { API_BASE_URL } from '../../config/api';
import { getProfileHeaders } from '../../utils/profile';

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

const WATCH_STATS_PATHS = new Set(['/user/history', '/user/continue']);

function getUser() {
  return JSON.parse(localStorage.getItem('user') || '{}');
}

function apiUrl(path) {
  if (!path) return '';
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
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

function formatWatchDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds) || 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} phút`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function formatActivityDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { weekday: 'short' });
}

function WatchStatsSkeleton() {
  return (
    <div className="mb-8 animate-pulse">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-white/10" />
        ))}
      </div>
      <div className="mt-4 h-40 rounded-2xl bg-white/10" />
    </div>
  );
}

function WatchStatCard({ icon, label, value, helper }) {
  const IconComponent = icon;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-text-secondary font-bold">{label}</div>
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <IconComponent sx={{ fontSize: 20 }} />
        </div>
      </div>
      <div className="mt-3 text-2xl font-black text-white leading-tight">{value}</div>
      {helper && <div className="mt-1 text-xs text-text-secondary line-clamp-1">{helper}</div>}
    </div>
  );
}

function WatchStatsPanel({ stats, loading, error }) {
  if (loading) return <WatchStatsSkeleton />;

  if (error) {
    return (
      <div className="mb-8 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
        {error}
      </div>
    );
  }

  if (!stats || !stats.total_entries) {
    return (
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-text-secondary">
        Chưa có dữ liệu xem để thống kê.
      </div>
    );
  }

  const recentActivity = Array.isArray(stats.recent_activity) ? stats.recent_activity : [];
  const maxRecentSeconds = Math.max(...recentActivity.map((item) => Number(item.watch_seconds) || 0), 1);
  const topGenres = Array.isArray(stats.top_genres) ? stats.top_genres : [];
  const topCountries = Array.isArray(stats.top_countries) ? stats.top_countries : [];
  const topMovies = Array.isArray(stats.top_movies) ? stats.top_movies : [];

  const cards = [
    {
      icon: AccessTimeIcon,
      label: 'Thời gian xem',
      value: formatWatchDuration(stats.watch_seconds),
      helper: `${formatCompactNumber(stats.active_days)} ngày hoạt động`,
    },
    {
      icon: MovieFilterIcon,
      label: 'Phim đã xem',
      value: formatCompactNumber(stats.total_movies),
      helper: `${formatCompactNumber(stats.total_episodes)} tập đã mở`,
    },
    {
      icon: DoneAllIcon,
      label: 'Hoàn thành',
      value: formatCompactNumber(stats.completed_episodes),
      helper: `${formatCompactNumber(stats.completion_rate)}% tỷ lệ hoàn thành`,
    },
    {
      icon: LocalFireDepartmentIcon,
      label: 'Chuỗi gần nhất',
      value: `${formatCompactNumber(stats.current_streak_days)} ngày`,
      helper: `Kỷ lục ${formatCompactNumber(stats.longest_streak_days)} ngày`,
    },
  ];

  return (
    <section className="mb-8 space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <WatchStatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">Hoạt động 7 ngày</h2>
              <p className="text-xs text-text-secondary mt-1">Tính theo thời lượng đã xem thực tế</p>
            </div>
            <AccessTimeIcon className="text-primary" />
          </div>

          <div className="h-32 flex items-end gap-2 md:gap-3">
            {recentActivity.map((item) => {
              const height = Math.max(8, Math.round(((Number(item.watch_seconds) || 0) / maxRecentSeconds) * 88));
              return (
                <div key={item.date} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                  <div className="w-full h-24 flex items-end justify-center rounded-xl bg-white/5 px-1">
                    <div
                      className="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-primary to-red-300"
                      style={{ height: `${height}px`, opacity: item.watch_seconds ? 1 : 0.25 }}
                      title={formatWatchDuration(item.watch_seconds)}
                    />
                  </div>
                  <div className="text-[10px] text-text-secondary uppercase truncate">{formatActivityDate(item.date)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
          <h2 className="text-white font-bold text-lg mb-4">Gu xem nổi bật</h2>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-white/90 mb-2">
                <CategoryIcon sx={{ fontSize: 18 }} className="text-primary" />
                Thể loại
              </div>
              <div className="flex flex-wrap gap-2">
                {topGenres.length > 0 ? topGenres.map((genre) => (
                  <span key={genre.id || genre.name} className="px-3 py-1 rounded-full bg-white/10 text-xs text-white border border-white/10">
                    {genre.name}
                  </span>
                )) : <span className="text-xs text-text-secondary">Chưa đủ dữ liệu</span>}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-white/90 mb-2">
                <PublicIcon sx={{ fontSize: 18 }} className="text-primary" />
                Quốc gia
              </div>
              <div className="flex flex-wrap gap-2">
                {topCountries.length > 0 ? topCountries.map((country) => (
                  <span key={country.id || country.name} className="px-3 py-1 rounded-full bg-white/10 text-xs text-white border border-white/10">
                    {country.name}
                  </span>
                )) : <span className="text-xs text-text-secondary">Chưa đủ dữ liệu</span>}
              </div>
            </div>

            {topMovies.length > 0 && (
              <div>
                <div className="text-sm font-bold text-white/90 mb-2">Xem nhiều nhất</div>
                <div className="space-y-2">
                  {topMovies.slice(0, 3).map((movie) => (
                    <div key={movie.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-text-secondary line-clamp-1">{movie.title}</span>
                      <span className="text-white/80 flex-shrink-0">{formatWatchDuration(movie.watch_seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
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
  const showWatchStats = WATCH_STATS_PATHS.has(location.pathname);
  const [watchStats, setWatchStats] = useState(null);
  const [watchStatsLoading, setWatchStatsLoading] = useState(false);
  const [watchStatsError, setWatchStatsError] = useState('');

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

    fetch(apiUrl(config.endpoint), { headers: getProfileHeaders() })
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

  useEffect(() => {
    if (!user.id || !showWatchStats) {
      setWatchStats(null);
      setWatchStatsLoading(false);
      setWatchStatsError('');
      return;
    }

    const controller = new AbortController();
    setWatchStatsLoading(true);
    setWatchStatsError('');

    fetch(apiUrl('/api/user/watch-stats'), {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải thống kê xem phim.');
        return res.json();
      })
      .then((data) => {
        setWatchStats(data);
        setWatchStatsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setWatchStats(null);
        setWatchStatsError(err.message || 'Không thể tải thống kê xem phim.');
        setWatchStatsLoading(false);
      });

    return () => controller.abort();
  }, [showWatchStats, user.id, items.length]);

  const handleRemove = async (item) => {
    if (!config.removeEndpoint) return;
    const endpoint = config.removeEndpoint(item.id, item);
    await fetch(apiUrl(endpoint), {
      method: 'DELETE',
      headers: getProfileHeaders(),
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

            {showWatchStats && user.id && (
              <WatchStatsPanel
                stats={watchStats}
                loading={watchStatsLoading}
                error={watchStatsError}
              />
            )}

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
