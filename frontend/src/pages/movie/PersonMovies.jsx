import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import ShareIcon from '@mui/icons-material/Share';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import { API_URL as API } from '../../config/api';

const typeConfig = {
  actor: {
    apiType: 'actors',
    roleLabel: 'Diễn viên',
    fallbackTitle: 'Các phim đã tham gia',
  },
  director: {
    apiType: 'directors',
    roleLabel: 'Đạo diễn',
    fallbackTitle: 'Các phim đã đạo diễn',
  },
};

function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

function parsePersonId(personKey) {
  const match = String(personKey || '').match(/^\d+/);
  return match ? Number(match[0]) : Number(personKey);
}

function formatYearRange(stats) {
  if (!stats?.first_year && !stats?.latest_year) return 'Đang cập nhật';
  if (stats.first_year && stats.latest_year && stats.first_year !== stats.latest_year) {
    return `${stats.first_year} - ${stats.latest_year}`;
  }
  return String(stats.latest_year || stats.first_year);
}

function groupMoviesByYear(movies) {
  return movies.reduce((groups, movie) => {
    const year = movie.release_year || 'Đang cập nhật';
    if (!groups[year]) groups[year] = [];
    groups[year].push(movie);
    return groups;
  }, {});
}

function ProfileImage({ person }) {
  const [failed, setFailed] = useState(false);
  const image = person?.profile_pic_url && !failed ? person.profile_pic_url : '';
  const name = person?.name || '';

  return (
    <div className="h-36 w-36 overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-2xl md:h-40 md:w-40">
      {image ? (
        <img
          src={image}
          alt={name}
          loading="eager"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-4xl font-black text-white">
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <dt className="text-sm font-black text-white">{label}</dt>
      <dd className="mt-2 text-sm leading-relaxed text-white/60">{value || 'Đang cập nhật'}</dd>
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  const options = [
    { value: 'all', label: 'Tất cả' },
    { value: 'time', label: 'Thời gian' },
  ];

  return (
    <div className="inline-flex h-9 overflow-hidden rounded-lg border border-white/20 bg-white/[0.04] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 text-sm font-bold transition-colors ${
            value === option.value
              ? 'bg-white text-background'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ roleLabel }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-16 text-center">
      <MovieFilterIcon sx={{ fontSize: 42 }} className="mx-auto mb-4 text-white/25" />
      <h2 className="text-xl font-black text-white">Chưa có phim liên quan</h2>
      <p className="mt-2 text-sm text-white/55">Danh sách phim của {roleLabel.toLowerCase()} này sẽ hiển thị tại đây.</p>
    </div>
  );
}

export default function PersonMovies({ type = 'actor' }) {
  const config = typeConfig[type] || typeConfig.actor;
  const { personKey } = useParams();
  const personId = parsePersonId(personKey);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('all');
  const [liked, setLiked] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const favoriteKey = Number.isFinite(personId) && personId > 0
    ? `itmove_person_favorite:${type}:${personId}`
    : '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    if (!Number.isFinite(personId) || personId <= 0) {
      setError('Đường dẫn người không hợp lệ.');
      setLoading(false);
      return undefined;
    }

    fetch(`${API}/people/${config.apiType}/${personId}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Không thể tải dữ liệu.');
        return payload;
      })
      .then((payload) => setData(payload))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message || 'Không thể tải dữ liệu.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [config.apiType, personId]);

  useEffect(() => {
    if (!favoriteKey) return;
    setLiked(localStorage.getItem(favoriteKey) === '1');
  }, [favoriteKey]);

  const movies = data?.movies || [];
  const groupedMovies = useMemo(() => groupMoviesByYear(movies), [movies]);
  const orderedYears = useMemo(() => Object.keys(groupedMovies).sort((left, right) => {
    if (left === 'Đang cập nhật') return 1;
    if (right === 'Đang cập nhật') return -1;
    return Number(right) - Number(left);
  }), [groupedMovies]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      setShareCopied(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 pb-16 pt-28 text-white md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[300px_1fr]">
          <div className="space-y-5">
            <div className="h-40 w-40 rounded-[2rem] bg-white/10" />
            <div className="h-8 w-44 rounded bg-white/10" />
            <div className="h-9 w-52 rounded-full bg-white/10" />
            <div className="space-y-3 pt-4">
              <div className="h-4 w-full rounded bg-white/10" />
              <div className="h-4 w-2/3 rounded bg-white/10" />
              <div className="h-4 w-4/5 rounded bg-white/10" />
            </div>
          </div>
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div className="h-8 w-56 rounded bg-white/10" />
              <div className="h-9 w-36 rounded-lg bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <MovieCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 pt-24 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-black">Không tải được dữ liệu</h1>
          <p className="mt-3 text-white/60">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/movies')}
            className="mt-6 rounded-full bg-primary px-5 py-3 text-sm font-black text-white transition-colors hover:bg-primary/80"
          >
            Quay lại danh sách phim
          </button>
        </div>
      </div>
    );
  }

  const person = data?.person || {};
  const stats = data?.stats || {};
  const moviesTitle = data?.movies_title || config.fallbackTitle;

  return (
    <div className="min-h-screen bg-background px-4 pb-16 pt-24 text-white md:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start lg:border-r lg:border-white/10 lg:pr-8">
          <ProfileImage person={person} />

          <div className="mt-7">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-primary/80">{config.roleLabel}</p>
            <h1 className="text-3xl font-black leading-tight text-white">{person.name}</h1>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setLiked((current) => {
                const next = !current;
                if (favoriteKey) {
                  if (next) localStorage.setItem(favoriteKey, '1');
                  else localStorage.removeItem(favoriteKey);
                }
                return next;
              })}
              className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-black transition-colors ${
                liked
                  ? 'border-primary/50 bg-primary text-white'
                  : 'border-white/10 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/10'
              }`}
            >
              {liked ? <FavoriteIcon sx={{ fontSize: 17 }} /> : <FavoriteBorderIcon sx={{ fontSize: 17 }} />}
              {liked ? 'Đã thích' : 'Yêu thích'}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition-colors hover:border-white/25 hover:bg-white/10"
            >
              <ShareIcon sx={{ fontSize: 17 }} />
              {shareCopied ? 'Đã chép' : 'Chia sẻ'}
            </button>
          </div>

          <dl className="mt-8 space-y-7">
            <InfoRow label="Tên gọi khác:" value="Đang cập nhật" />
            <InfoRow label="Giới thiệu:" value={person.bio || 'Đang cập nhật'} />
            <InfoRow label="Số phim:" value={`${stats.movie_count || movies.length} phim`} />
            <InfoRow label="Thời gian:" value={formatYearRange(stats)} />
          </dl>
        </aside>

        <section className="min-w-0">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-white">{moviesTitle}</h2>
              <p className="mt-2 text-sm text-white/55">
                {movies.length} phim liên quan đến {person.name}
              </p>
            </div>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>

          {movies.length === 0 ? (
            <EmptyState roleLabel={config.roleLabel} />
          ) : viewMode === 'time' ? (
            <div className="space-y-10">
              {orderedYears.map((year) => (
                <section key={year}>
                  <div className="mb-4 flex items-center gap-4">
                    <h3 className="text-xl font-black text-white">{year}</h3>
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs font-bold text-white/45">{groupedMovies[year].length} phim</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                    {groupedMovies[year].map((movie) => (
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                        onClick={() => navigate(`/movies/${movie.id}`)}
                        onPlay={() => navigate(`/watch/${movie.id}`)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {movies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onClick={() => navigate(`/movies/${movie.id}`)}
                  onPlay={() => navigate(`/watch/${movie.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
