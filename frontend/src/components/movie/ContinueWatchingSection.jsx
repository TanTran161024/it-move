import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronRight, FaClock, FaPlay } from 'react-icons/fa';
import { API_URL } from '../../config/api';
import { getProfileHeaders, getStoredUser, PROFILE_CHANGE_EVENT } from '../../utils/profile';

const LIMIT = 10;

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function progressPercent(item) {
  const duration = Number(item.duration_seconds) || 0;
  const progress = Number(item.progress_seconds) || 0;
  if (duration <= 0) return 0;
  return clampPercent((progress / duration) * 100);
}

function formatClock(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const rest = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatMinuteText(seconds) {
  const minutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  if (minutes <= 0) return 'Dưới 1 phút';
  return `${minutes} phút`;
}

function formatWatchedAt(value) {
  if (!value) return 'Mới xem gần đây';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Mới xem gần đây';

  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)} phút trước`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} giờ trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function buildWatchUrl(item) {
  const params = new URLSearchParams();
  if (item.episode_number) params.set('ep', item.episode_number);
  if (item.progress_seconds) params.set('t', Math.floor(Number(item.progress_seconds)));
  const query = params.toString();
  return `/watch/${item.id}${query ? `?${query}` : ''}`;
}

function isMeaningfulContinue(item) {
  return Number(item.progress_seconds) > 5;
}

function ContinueSkeleton() {
  return (
    <section className="space-y-4 pt-3 md:pt-5">
      <div className="h-7 w-48 rounded-lg bg-white/10 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-48 rounded-2xl bg-white/10 animate-pulse" />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ item, onContinue }) {
  const percent = progressPercent(item);
  const savedSeconds = Number(item.progress_seconds) || 0;
  const hasSavedProgress = savedSeconds > 5;
  const hasPreciseProgress = Number(item.duration_seconds) > 0 && hasSavedProgress;
  const remainingSeconds = Math.max(0, (Number(item.duration_seconds) || 0) - (Number(item.progress_seconds) || 0));
  const episodeLabel = item.episode_title || (item.episode_number ? `Tập ${item.episode_number}` : 'Đang xem');

  return (
    <article className="group relative min-h-[210px] overflow-hidden rounded-2xl border border-white/10 bg-[#151922] shadow-xl transition-colors duration-200 hover:border-white/25">
      <button
        type="button"
        onClick={() => onContinue(item)}
        className="absolute inset-0 text-left"
        aria-label={`Tiếp tục xem ${item.title}`}
      >
        <img
          src={item.poster_url || '/posters/the-matrix.jpg'}
          alt={item.title}
          className="h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/65 to-black/15" />
        <span className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/10" />
      </button>

      <div className="relative z-10 flex min-h-[210px] flex-col justify-between p-4 md:p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-black text-white shadow-lg shadow-primary/25">
              {episodeLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-bold text-white/80 backdrop-blur">
              <FaClock size={11} />
              {formatWatchedAt(item.last_watched_at)}
            </span>
          </div>

          <div>
            <h2 className="line-clamp-2 text-lg font-black leading-tight text-white md:text-xl">
              {item.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/70">
              {item.release_year && <span>{item.release_year}</span>}
              {item.quality && <span className="rounded border border-white/25 px-1.5 py-0.5 text-white/85">{item.quality}</span>}
              {item.imdb_rating && <span className="text-[#f5c518]">IMDb {Number(item.imdb_rating).toFixed(1)}</span>}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-white/75">
              <span>
                {hasPreciseProgress
                  ? `Đã xem ${formatMinuteText(savedSeconds)}`
                  : `Tiếp tục từ ${formatClock(savedSeconds)}`}
              </span>
              <span>{hasPreciseProgress ? `${percent}%` : 'Đã lưu'}</span>
            </div>
            {hasPreciseProgress ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-primary shadow-[0_0_14px_rgba(229,9,20,0.65)]"
                  style={{ width: `${Math.max(3, percent)}%` }}
                />
              </div>
            ) : (
              <div className="h-px bg-white/15" />
            )}
            {hasPreciseProgress ? (
              <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-white/45">
                <span>{formatClock(savedSeconds)}</span>
                <span>Còn khoảng {formatMinuteText(remainingSeconds)}</span>
              </div>
            ) : (
              <div className="mt-1 text-[11px] font-semibold text-white/45">
                Trình phát sẽ mở đúng tập và mốc đã lưu.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onContinue(item)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition-colors duration-200 hover:bg-primary hover:text-white"
          >
            <FaPlay size={12} />
            Tiếp tục xem
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ContinueWatchingSection() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());

  const isLoggedIn = Boolean(user.id);

  const fetchContinue = useCallback(() => {
    if (!isLoggedIn) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`${API_URL}/user/continue?limit=${LIMIT}`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải tiếp tục xem.');
        return res.json();
      })
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isLoggedIn]);

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener(PROFILE_CHANGE_EVENT, syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => fetchContinue(), [fetchContinue]);

  const visibleItems = useMemo(() => items.filter(isMeaningfulContinue).slice(0, 8), [items]);

  const handleContinue = (item) => {
    navigate(buildWatchUrl(item));
  };

  if (!isLoggedIn) return null;
  if (loading && visibleItems.length === 0) return <ContinueSkeleton />;
  if (!visibleItems.length) return null;

  return (
    <section className="space-y-4 pt-3 md:pt-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">Tiếp tục xem</h2>
          <p className="mt-1 text-sm font-medium text-text-secondary">Quay lại đúng tập và đúng phút bạn đã dừng.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/user/continue')}
          className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-white/10 sm:inline-flex"
        >
          Xem tất cả
          <FaChevronRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleItems.slice(0, 4).map((item) => (
          <ContinueCard key={`${item.history_id}-${item.id}`} item={item} onContinue={handleContinue} />
        ))}
      </div>
    </section>
  );
}
