import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import MovieTasteFeedback from '../../components/movie/MovieTasteFeedback';
import { API_URL } from '../../config/api';
import { getActiveProfile, getProfileHeaders, getStoredUser, PROFILE_CHANGE_EVENT } from '../../utils/profile';

const LIMIT = 36;

const EMPTY_TASTE_PROFILE = {
  signals_count: 0,
  summary: [],
  positive: { genres: [], countries: [] },
  negative: { genres: [], countries: [] },
  duration: null,
};

function normalizeMovie(movie) {
  return {
    ...movie,
    poster: movie.poster_url || movie.poster,
    originalTitle: movie.original_title || movie.originalTitle || movie.title,
  };
}

function rankFallbackMovies(movies) {
  return [...movies]
    .filter((movie) => Number(movie?.id) > 0)
    .sort((left, right) => {
      const leftViews = Number(left.views) || 0;
      const rightViews = Number(right.views) || 0;
      if (rightViews !== leftViews) return rightViews - leftViews;
      return (Number(right.imdb_rating) || 0) - (Number(left.imdb_rating) || 0);
    })
    .slice(0, LIMIT)
    .map(normalizeMovie);
}

function getMovieReasons(movie, isLoggedIn) {
  const reasons = Array.isArray(movie?.match_reasons) && movie.match_reasons.length
    ? movie.match_reasons
    : Array.isArray(movie?.reasons)
      ? movie.reasons
      : [];
  if (reasons.length) return reasons.slice(0, 2);
  if (Number(movie?.score || movie?.match_score) > 0) return ['Hợp với gu xem gần đây'];
  if (isLoggedIn) return ['Đang nổi bật trong thư viện'];
  return ['Phổ biến và IMDb cao'];
}

function getTasteChips(tasteProfile) {
  const chips = [];
  (tasteProfile?.summary || []).slice(0, 6).forEach((item) => chips.push({ label: item, tone: 'good' }));
  (tasteProfile?.negative?.genres || []).slice(0, 2).forEach((item) => chips.push({ label: `Tránh ${item.name}`, tone: 'bad' }));
  return chips;
}

function getFeedbackStatus(feedbackMap, movieId) {
  return feedbackMap?.[movieId] || feedbackMap?.[String(movieId)] || null;
}

export default function ForYou() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [tasteProfile, setTasteProfile] = useState(EMPTY_TASTE_PROFILE);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [source, setSource] = useState('popular');
  const [session, setSession] = useState(() => ({
    user: getStoredUser(),
    profile: getActiveProfile(),
  }));

  const { user, profile } = session;
  const isLoggedIn = Boolean(user.id);
  const isPersonalized = source === 'personalized';
  const tasteChips = getTasteChips(tasteProfile);

  const fetchForYou = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionMessage('');

    const controller = new AbortController();
    try {
      if (isLoggedIn) {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          include_taste: '1',
        });
        const response = await fetch(`${API_URL}/recommendations/user/${encodeURIComponent(user.id)}?${params.toString()}`, {
          headers: getProfileHeaders(profile?.id ? { 'x-profile-id': profile.id } : {}),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Không thể tải gợi ý dành cho bạn.');
        const data = await response.json();
        const nextMovies = Array.isArray(data) ? data : data.movies;

        setMovies(Array.isArray(nextMovies) ? nextMovies.map(normalizeMovie) : []);
        setTasteProfile(data?.taste_profile || EMPTY_TASTE_PROFILE);
        setFeedbackMap(data?.feedback || {});
        setSource(data?.source || 'personalized');
        return;
      }

      const response = await fetch(`${API_URL}/movies`, { signal: controller.signal });
      if (!response.ok) throw new Error('Không thể tải phim phổ biến.');
      const data = await response.json();
      setMovies(rankFallbackMovies(Array.isArray(data) ? data : []));
      setTasteProfile(EMPTY_TASTE_PROFILE);
      setFeedbackMap({});
      setSource('popular');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMovies([]);
        setError(err.message || 'Không thể tải dữ liệu lúc này.');
      }
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [isLoggedIn, user.id, profile?.id]);

  useEffect(() => {
    fetchForYou();
  }, [fetchForYou]);

  useEffect(() => {
    const syncProfile = () => {
      setSession({
        user: getStoredUser(),
        profile: getActiveProfile(),
      });
    };
    window.addEventListener(PROFILE_CHANGE_EVENT, syncProfile);
    window.addEventListener('storage', syncProfile);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, syncProfile);
      window.removeEventListener('storage', syncProfile);
    };
  }, []);

  const handleTasteChanged = ({ movieId, type, active, feedback, message }) => {
    setFeedbackMap((current) => ({
      ...current,
      [movieId]: feedback,
    }));
    setActionMessage(message || 'Đã cập nhật gu phim.');

    if (active && (type === 'hide' || type === 'dislike')) {
      setMovies((current) => current.filter((movie) => Number(movie.id) !== Number(movieId)));
    }
  };

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-16">
      <section className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary/90">
              {isPersonalized ? 'For You theo profile' : 'Khám phá'}
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">
              {isPersonalized ? 'Phim hợp gu của bạn' : 'Phim đáng xem nhất'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-text-secondary md:text-base">
              {isPersonalized && tasteProfile?.signals_count
                ? `Đang ưu tiên gu của ${profile?.name || 'profile hiện tại'} từ ${tasteProfile.signals_count} tín hiệu xem, lưu và phản hồi.`
                : isPersonalized
                  ? 'Hãy thích, không thích hoặc ẩn vài phim để trang này bắt gu nhanh hơn.'
                  : 'Đăng nhập và chọn profile để nhận đề xuất cá nhân hóa.'}
            </p>
          </div>

          {isPersonalized && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80 lg:max-w-md">
              <div className="flex items-center justify-between gap-4">
                <span className="font-bold text-white">Tín hiệu gu</span>
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
                  {tasteProfile?.signals_count || 0}
                </span>
              </div>
              {tasteChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tasteChips.map((chip) => (
                    <span
                      key={`${chip.tone}-${chip.label}`}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        chip.tone === 'bad'
                          ? 'border-red-400/25 bg-red-500/10 text-red-100'
                          : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                      }`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-100">
            {error}
          </div>
        )}

        {actionMessage && (
          <div className="mb-6 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 text-sm font-semibold text-emerald-100">
            {actionMessage}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6">
            {Array.from({ length: 18 }).map((_, index) => (
              <MovieCardSkeleton key={index} />
            ))}
          </div>
        ) : movies.length ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black md:text-2xl">
                {isPersonalized ? 'Xếp theo gu hiện tại' : 'Đang thịnh hành'}
              </h2>
              <span className="text-sm text-text-secondary">{movies.length} phim</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6 animate-in fade-in duration-500">
              {movies.map((movie) => {
                const reasons = getMovieReasons(movie, isLoggedIn);
                return (
                  <div key={movie.id} className="space-y-2">
                    <MovieCard
                      movie={movie}
                      showScore={isPersonalized}
                      onClick={() => navigate(`/movies/${movie.id}`)}
                      onPlay={() => navigate(`/watch/${movie.id}`)}
                    />
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/60">
                      {reasons.map((reason) => (
                        <div key={reason} className="line-clamp-1">{reason}</div>
                      ))}
                    </div>
                    {isPersonalized && (
                      <MovieTasteFeedback
                        movieId={movie.id}
                        initialStatus={getFeedbackStatus(feedbackMap, movie.id)}
                        source="for-you"
                        variant="compact"
                        onChanged={handleTasteChanged}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] px-6 py-24 text-center animate-in fade-in zoom-in-95">
            <h1 className="text-2xl font-black">Chưa có gợi ý phù hợp</h1>
            <p className="mx-auto mt-3 max-w-xl text-text-secondary text-base">
              Hãy xem vài phim, thêm vào yêu thích hoặc phản hồi vài phim để hệ thống hiểu gu của bạn hơn.
            </p>
            <button
              type="button"
              onClick={() => navigate('/movies')}
              className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-600 shadow-lg shadow-primary/25"
            >
              Khám phá kho phim
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
