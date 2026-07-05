import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import { API_URL } from '../../config/api';
import { getActiveProfile, getProfileHeaders, getStoredUser, PROFILE_CHANGE_EVENT } from '../../utils/profile';

const LIMIT = 36;

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

function getReasonText(movie, isLoggedIn) {
  if (Array.isArray(movie?.reasons) && movie.reasons.length) return movie.reasons[0];
  if (movie?.score > 0) return 'Hợp với gu xem gần đây';
  if (isLoggedIn) return 'Đang nổi bật trong thư viện';
  return 'Phổ biến và IMDb cao';
}

export default function ForYou() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('popular');
  const [session, setSession] = useState(() => ({
    user: getStoredUser(),
    profile: getActiveProfile(),
  }));

  const { user, profile } = session;
  const isLoggedIn = Boolean(user.id);

  const fetchForYou = useCallback(async () => {
    setLoading(true);
    setError('');

    const controller = new AbortController();
    try {
      if (isLoggedIn) {
        const response = await fetch(`${API_URL}/recommendations/user/${encodeURIComponent(user.id)}?limit=${LIMIT}`, {
          headers: getProfileHeaders(profile?.id ? { 'x-profile-id': profile.id } : {}),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Không thể tải gợi ý dành cho bạn.');
        const data = await response.json();
        setMovies(Array.isArray(data) ? data.map(normalizeMovie) : []);
        setSource('personalized');
        return;
      }

      const response = await fetch(`${API_URL}/movies`, { signal: controller.signal });
      if (!response.ok) throw new Error('Không thể tải phim phổ biến.');
      const data = await response.json();
      setMovies(rankFallbackMovies(Array.isArray(data) ? data : []));
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

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-16">
      <section className="mx-auto max-w-7xl px-4 md:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-100">
            {error}
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
              <h1 className="text-xl font-black md:text-2xl">
                {source === 'personalized' ? 'Phim hợp với bạn' : 'Phim đáng xem nhất'}
              </h1>
              <span className="text-sm text-text-secondary">{movies.length} phim</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6 animate-in fade-in duration-500">
              {movies.map((movie) => (
                <div key={movie.id} className="space-y-2">
                  <MovieCard
                    movie={movie}
                    showScore={source === 'personalized'}
                    onClick={() => navigate(`/movies/${movie.id}`)}
                    onPlay={() => navigate(`/watch/${movie.id}`)}
                  />
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[11px] font-semibold text-white/55">
                    {getReasonText(movie, isLoggedIn)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] px-6 py-24 text-center animate-in fade-in zoom-in-95">
            <h1 className="text-2xl font-black">Chưa có gợi ý phù hợp</h1>
            <p className="mx-auto mt-3 max-w-xl text-text-secondary text-base">
              Hãy xem vài phim, thêm vào yêu thích hoặc danh sách để hệ thống hiểu gu của bạn hơn.
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
