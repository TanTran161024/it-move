import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryIcon from '@mui/icons-material/Category';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import GroupsIcon from '@mui/icons-material/Groups';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import PersonIcon from '@mui/icons-material/Person';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PublicIcon from '@mui/icons-material/Public';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import StarIcon from '@mui/icons-material/Star';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ForgotPasswordDialog from '../../components/auth/ForgotPasswordDialog';
import LoginDialog from '../../components/auth/LoginDialog';
import RegisterDialog from '../../components/auth/RegisterDialog';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import { FALLBACK_POSTER } from '../../utils/imageFallbacks';
import { API_URL as API } from '../../config/api';
import { getProfileHeaders, getStoredUser } from '../../utils/profile';

const reportReasons = [
  'Video không phát',
  'Sai tập phim',
  'Âm thanh/phụ đề lỗi',
  'Thông tin phim sai',
  'Lỗi khác',
];

const tabs = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'episodes', label: 'Tập phim' },
  { id: 'cast', label: 'Diễn viên' },
  { id: 'comments', label: 'Bình luận' },
  { id: 'suggested', label: 'Đề xuất' },
];

const commentSortOptions = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'popular', label: 'Nổi bật' },
  { value: 'oldest', label: 'Cũ nhất' },
];

const commentReportReasons = [
  'Nội dung không phù hợp',
  'Spam hoặc quảng cáo',
  'Tiết lộ nội dung phim',
  'Công kích người khác',
  'Khác',
];

const getTrailerUrl = (movie) => String(movie?.trailer_url || movie?.trailerUrl || movie?.trailer || '').trim();

const getYoutubeVideoId = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host === 'youtu.be') return parts[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] || '';
    }
  } catch {
    const watchMatch = value.match(/[?&]v=([^?&/]+)/i);
    const shortMatch = value.match(/youtu\.be\/([^?&/]+)/i);
    const embedMatch = value.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/i);
    return watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || '';
  }

  return '';
};

const isDirectVideoUrl = (url) => /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || ''));

const getTrailerEmbedUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';

  const youtubeId = getYoutubeVideoId(value);
  if (youtubeId) return `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host.endsWith('vimeo.com') && parts[0]) return `https://player.vimeo.com/video/${parts[0]}?autoplay=1`;
  } catch {
    // Non-URL values fall through to direct video detection.
  }

  if (isDirectVideoUrl(value)) return value;
  return '';
};

const getPersonName = (person) => {
  if (typeof person === 'string') return person.trim();
  return String(person?.name || '').trim();
};

const slugifyPersonName = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getPersonPath = (pathBase, person) => {
  const id = Number(person?.id);
  if (!pathBase || !Number.isFinite(id) || id <= 0) return '';
  const slug = slugifyPersonName(getPersonName(person));
  return `${pathBase}/${id}${slug ? `-${slug}` : ''}`;
};

const normalizePeople = (people) => {
  if (!Array.isArray(people)) return [];
  return people
    .map((person) => (typeof person === 'string' ? { name: person } : person))
    .filter((person) => getPersonName(person));
};

const getLookupName = (item) => {
  if (typeof item === 'string') return item.trim();
  return String(item?.name || item?.title || '').trim();
};

const normalizeNameList = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(getLookupName).filter(Boolean);
};

const normalizeLookupRows = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === 'string') return { id: item || index, name: item };
      const name = getLookupName(item);
      return name ? { ...item, id: item?.id ?? name ?? index, name } : null;
    })
    .filter(Boolean);
};

async function fetchMovieDetailPayload(movieId, signal) {
  const primaryError = new Error('Không thể tải dữ liệu phim.');

  try {
    const response = await fetch(`${API}/movie/${movieId}`, { signal });
    if (response.ok) return response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
  }

  try {
    const [moviesResponse, episodesResponse] = await Promise.all([
      fetch(`${API}/movies`, { signal }),
      fetch(`${API}/movies/${movieId}/episodes`, { signal }),
    ]);

    if (!moviesResponse.ok) throw primaryError;

    const [movies, episodes] = await Promise.all([
      moviesResponse.json(),
      episodesResponse.ok ? episodesResponse.json() : Promise.resolve([]),
    ]);

    const movie = (Array.isArray(movies) ? movies : [])
      .find((item) => Number(item.id) === Number(movieId));

    if (!movie) throw primaryError;

    const genres = normalizeNameList(movie.genres);
    const countries = normalizeNameList(movie.countries);

    return {
      ...movie,
      bg_url: movie.bg_url || movie.backdrop_url || movie.poster_url,
      genres,
      countries,
      directors: normalizeLookupRows(movie.directors),
      producers: normalizeLookupRows(movie.producers),
      actors: normalizeLookupRows(movie.actors),
      episodes: Array.isArray(episodes) ? episodes : [],
      suggested: [],
    };
  } catch (fallbackError) {
    if (fallbackError.name === 'AbortError') throw fallbackError;
    throw primaryError;
  }
}

const getInitials = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
};

const formatNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return new Intl.NumberFormat('vi-VN', { notation: number > 9999 ? 'compact' : 'standard' }).format(number);
};

const formatWatchTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  if (minutes > 0) return `${minutes} phút`;
  return `${total} giây`;
};

const getStatusLabel = (movie, episodeCount) => {
  const raw = String(movie?.status || '').trim().toLowerCase();
  if (['completed', 'complete', 'full', 'hoan tat', 'hoàn tất'].includes(raw)) return 'Hoàn tất';
  if (['ongoing', 'airing', 'dang chieu', 'đang chiếu'].includes(raw)) return 'Đang chiếu';
  if (movie?.is_series) return episodeCount > 0 ? 'Đang cập nhật' : 'Sắp có tập';
  return 'Phim lẻ';
};

const getEpisodeLabel = (episode) => {
  if (!episode) return 'Tập 1';
  return episode.title || `Tập ${episode.episode_number || 1}`;
};

const buildRecommendationReasons = (movie) => {
  const matched = movie?.matched || {};
  const reasons = [];

  const pushMatched = (label, values) => {
    const list = Array.isArray(values) ? values.filter(Boolean).slice(0, 2) : [];
    if (list.length) reasons.push(`${label}: ${list.join(', ')}`);
  };

  pushMatched('Cùng thể loại', matched.genres);
  pushMatched('Cùng quốc gia', matched.countries);
  pushMatched('Cùng đạo diễn', matched.directors);
  pushMatched('Chung diễn viên', matched.actors);

  if (!reasons.length && Number(movie?.score) > 0) {
    reasons.push('Có nhiều thuộc tính tương đồng');
  }

  return reasons.slice(0, 3);
};

const countNestedComments = (items = []) => items.reduce(
  (total, comment) => total + 1 + countNestedComments(comment.replies || []),
  0
);

const updateCommentLikeState = (items, commentId, liked, likeCount) => items.map((comment) => {
  if (Number(comment.id) === Number(commentId)) {
    return {
      ...comment,
      my_liked: liked,
      like_count: likeCount,
    };
  }

  if (comment.replies?.length) {
    return {
      ...comment,
      replies: updateCommentLikeState(comment.replies, commentId, liked, likeCount),
    };
  }

  return comment;
});

function InfoPill({ icon, label, value }) {
  if (!value && value !== 0) return null;

  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">{label}</p>
        <p className="mt-1 truncate text-sm font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function TabButton({ tab, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 px-1 pb-4 text-base font-black transition-colors md:text-lg ${
        active ? 'text-white' : 'text-white/45 hover:text-white'
      }`}
    >
      {tab.label}
      {active && <span className="absolute bottom-0 left-0 h-1 w-full rounded-full bg-primary" />}
    </button>
  );
}

function PersonAvatar({ person, role, pathBase }) {
  const name = getPersonName(person);
  const image = person?.profile_pic_url;
  const personPath = getPersonPath(pathBase, person);

  const content = (
    <article className="group/person w-[180px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.08]">
      <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-white/10">
        {image ? (
          <img
            src={image}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover/person:scale-105"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
              event.currentTarget.nextSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`flex h-full w-full items-center justify-center text-xl font-black text-white ${image ? 'hidden' : ''}`}>
          {getInitials(name)}
        </div>
      </div>
      <div className="mt-4 text-center">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-primary/80">{role}</p>
        <h4 className="mt-1 line-clamp-2 min-h-[40px] text-sm font-black leading-tight text-white">{name}</h4>
        {person?.bio && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/45">{person.bio}</p>}
      </div>
    </article>
  );

  if (!personPath) return content;

  return (
    <Link to={personPath} className="block shrink-0 no-underline outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded-2xl">
      {content}
    </Link>
  );
}

function PeopleCarousel({ title, people, role, emptyText, pathBase }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-2xl font-black text-white">{title}</h3>
        {people.length > 0 && (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/55">
            {people.length} người
          </span>
        )}
      </div>
      {people.length > 0 ? (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
          {people.map((person) => (
            <PersonAvatar key={person.id || getPersonName(person)} person={person} role={role} pathBase={pathBase} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-8 text-white/55">{emptyText}</div>
      )}
    </section>
  );
}

function TrailerModal({ open, movie, trailerUrl, onClose }) {
  const embedUrl = getTrailerEmbedUrl(trailerUrl);
  const direct = isDirectVideoUrl(embedUrl);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-[#050505] shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">Trailer</p>
            <h3 className="truncate text-lg font-black text-white md:text-2xl">{movie?.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Đóng trailer"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="aspect-video bg-black">
          {embedUrl ? (
            direct ? (
              <video src={embedUrl} poster={movie?.bg_url || movie?.poster_url} controls autoPlay className="h-full w-full object-contain" />
            ) : (
              <iframe
                src={embedUrl}
                title={`Trailer ${movie?.title || ''}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <OndemandVideoIcon className="mb-4 text-6xl text-white/25" />
              <h4 className="text-xl font-black text-white">Trailer chưa hỗ trợ nhúng</h4>
              {trailerUrl && (
                <a
                  href={trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-black text-white transition-colors hover:bg-primary-hover"
                >
                  <PlayArrowIcon />
                  Mở trailer
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DetailMovies = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useMemo(getStoredUser, []);

  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState({ favorite: false, watchlist: false });
  const [ratingInfo, setRatingInfo] = useState({ average_rating: 0, rating_count: 0, my_rating: null });
  const [reviewRating, setReviewRating] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentSort, setCommentSort] = useState('newest');
  const [commentSpoiler, setCommentSpoiler] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [revealedSpoilers, setRevealedSpoilers] = useState(() => new Set());
  const [reportingCommentId, setReportingCommentId] = useState(null);
  const [commentReportReason, setCommentReportReason] = useState(commentReportReasons[0]);
  const [commentReportText, setCommentReportText] = useState('');
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportText, setReportText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [continueProgress, setContinueProgress] = useState(null);
  const [continueLoading, setContinueLoading] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [forgotPromptOpen, setForgotPromptOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setContinueProgress(null);
    setActiveTab('overview');

    fetchMovieDetailPayload(id, controller.signal)
      .then((json) => {
        setData(json);
        if (json.episodes?.length) setSelectedEpisode(json.episodes[0].episode_number);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Không thể tải dữ liệu phim.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setRecommendationLoading(true);
    setRecommendationError('');
    setRecommendedMovies([]);

    fetch(`${API}/recommendations?movie_id=${encodeURIComponent(id)}&limit=12`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải gợi ý tương tự.');
        return res.json();
      })
      .then((movies) => {
        setRecommendedMovies(Array.isArray(movies) ? movies : []);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setRecommendationError(err.message || 'Không thể tải gợi ý tương tự.');
        setRecommendedMovies([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecommendationLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!user.id) return undefined;
    const controller = new AbortController();

    fetch(`${API}/user/library-status/${id}`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (!status) return;
        setLibraryStatus({
          favorite: Boolean(status.favorite),
          watchlist: Boolean(status.watchlist),
        });
      })
      .catch(() => {});

    return () => controller.abort();
  }, [id, user.id]);

  useEffect(() => {
    if (!user.id || !data?.id) return undefined;

    const controller = new AbortController();
    setContinueLoading(true);

    fetch(`${API}/user/history`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const latest = (Array.isArray(rows) ? rows : []).find((item) => (
          Number(item.id) === Number(data.id)
          && !Number(item.completed)
          && Number(item.progress_seconds) > 5
          && (
            !Number(item.duration_seconds)
            || Number(item.progress_seconds) / Number(item.duration_seconds) < 0.9
          )
        ));

        if (latest) {
          setContinueProgress(latest);
          if (latest.episode_number) setSelectedEpisode(Number(latest.episode_number));
        } else {
          setContinueProgress(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setContinueProgress(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setContinueLoading(false);
      });

    return () => controller.abort();
  }, [data?.id, user.id]);

  const fetchFeedback = useCallback(() => {
    const headers = user.id ? getProfileHeaders() : {};
    Promise.all([
      fetch(`${API}/movies/${id}/ratings`, { headers }).then((res) => res.json()),
      fetch(`${API}/movies/${id}/comments?sort=${encodeURIComponent(commentSort)}`, { headers }).then((res) => res.json()),
    ])
      .then(([ratings, commentsData]) => {
        setRatingInfo(ratings);
        setReviewRating(Number(ratings.my_rating) || 0);
        setComments(Array.isArray(commentsData?.comments) ? commentsData.comments : (Array.isArray(commentsData) ? commentsData : []));
      })
      .catch(() => {});
  }, [commentSort, id, user.id]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const episodes = data?.episodes || [];
  const actors = useMemo(() => normalizePeople(data?.actors), [data?.actors]);
  const directors = useMemo(() => normalizePeople(data?.directors), [data?.directors]);
  const directorNames = useMemo(() => directors.map(getPersonName), [directors]);
  const trailerUrl = getTrailerUrl(data);
  const bgImage = data?.bg_url || data?.poster_url || FALLBACK_POSTER;
  const statusLabel = getStatusLabel(data, episodes.length);
  const selectedEpisodeData = episodes.find((episode) => Number(episode.episode_number) === Number(selectedEpisode)) || episodes[0];
  const continueEpisode = continueProgress?.episode_number || selectedEpisodeData?.episode_number || 1;
  const continueSeconds = Number(continueProgress?.progress_seconds || 0);
  const continueText = continueProgress
    ? `Bạn đã xem đến tập ${continueEpisode} - ${formatWatchTime(continueSeconds)}.`
    : continueLoading
      ? 'Đang kiểm tra tiến độ xem của bạn...'
      : user.id
        ? 'Bạn có thể bắt đầu xem từ tập đã chọn.'
        : 'Đăng nhập để lưu tiến độ xem trên mọi thiết bị.';

  const getWatchUrl = (episodeNumber = 1, seconds = 0) => {
    const params = new URLSearchParams();
    if (episodeNumber > 1) params.set('ep', String(episodeNumber));
    if (seconds > 5) params.set('t', String(Math.floor(seconds)));
    const query = params.toString();
    return `/watch/${id}${query ? `?${query}` : ''}`;
  };

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
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
      body: active ? undefined : JSON.stringify({ movie_id: id }),
    });

    if (res.ok) setLibraryStatus((prev) => ({ ...prev, [type]: !active }));
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!user.id) {
      setFeedbackMessage('Vui lòng đăng nhập để đánh giá và bình luận.');
      setLoginPromptOpen(true);
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

    const headers = getProfileHeaders({ 'Content-Type': 'application/json' });
    const ratingRes = await fetch(`${API}/movies/${id}/ratings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating: reviewRating }),
    });
    const commentRes = await fetch(`${API}/movies/${id}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: commentText.trim(), is_spoiler: commentSpoiler }),
    });

    if (ratingRes.ok && commentRes.ok) {
      setCommentText('');
      setCommentSpoiler(false);
      setFeedbackMessage('Đã gửi đánh giá và bình luận.');
      fetchFeedback();
      return;
    }

    const errorBody = await (ratingRes.ok ? commentRes : ratingRes).json().catch(() => ({}));
    setFeedbackMessage(errorBody.message || 'Không thể gửi đánh giá và bình luận.');
  };

  const handleToggleLikeComment = async (commentId) => {
    if (!user.id) {
      requireLogin();
      return;
    }

    const res = await fetch(`${API}/comments/${commentId}/like`, {
      method: 'POST',
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
    });

    if (res.ok) {
      const body = await res.json();
      setComments((items) => updateCommentLikeState(items, commentId, Boolean(body.liked), Number(body.like_count) || 0));
    }
  };

  const handleSubmitReply = async (parentId) => {
    if (!user.id) {
      requireLogin();
      return;
    }
    if (!replyText.trim()) return;

    const res = await fetch(`${API}/movies/${id}/comments`, {
      method: 'POST',
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: replyText.trim(), parent_id: parentId }),
    });

    if (res.ok) {
      setReplyText('');
      setReplyTargetId(null);
      fetchFeedback();
      return;
    }

    const body = await res.json().catch(() => ({}));
    setFeedbackMessage(body.message || 'Khong the gui phan hoi.');
  };

  const handleReportComment = async (commentId) => {
    const res = await fetch(`${API}/comments/${commentId}/report`, {
      method: 'POST',
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        reason: commentReportReason,
        description: commentReportText.trim(),
      }),
    });

    if (res.ok) {
      setCommentReportReason(commentReportReasons[0]);
      setCommentReportText('');
      setReportingCommentId(null);
      setFeedbackMessage('Da gui bao cao binh luan cho admin.');
      return;
    }

    const body = await res.json().catch(() => ({}));
    setFeedbackMessage(body.message || 'Khong the bao cao binh luan.');
  };

  const toggleSpoilerReveal = (commentId) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const handleSubmitReport = async (event) => {
    event.preventDefault();
    const selected = episodes.find((ep) => Number(ep.episode_number) === Number(selectedEpisode));
    const res = await fetch(`${API}/movies/${id}/reports`, {
      method: 'POST',
      headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
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

  const commentsTotal = countNestedComments(comments);

  const renderCommentBody = (comment) => {
    const spoilerHidden = comment.is_spoiler && !revealedSpoilers.has(comment.id);

    if (spoilerHidden) {
      return (
        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black text-yellow-200">
            <VisibilityOffIcon fontSize="small" />
            Bình luận có spoiler
          </div>
          <button
            type="button"
            onClick={() => toggleSpoilerReveal(comment.id)}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-white/10"
          >
            Hiện nội dung
          </button>
        </div>
      );
    }

    return <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">{comment.content}</p>;
  };

  const renderCommentCard = (comment, depth = 0) => (
    <div key={comment.id} className="space-y-3" style={{ marginLeft: depth ? 18 : 0 }}>
      <article className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-600 text-lg font-black text-white">
          {comment.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-black/20 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h5 className="truncate text-sm font-black text-white">{comment.username}</h5>
              {comment.is_spoiler && (
                <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-200">
                  Spoiler
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-white/35">{new Date(comment.created_at).toLocaleString('vi-VN')}</span>
          </div>

          {renderCommentBody(comment)}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => handleToggleLikeComment(comment.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
                comment.my_liked ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
              }`}
            >
              {comment.my_liked ? <ThumbUpAltIcon fontSize="inherit" /> : <ThumbUpAltOutlinedIcon fontSize="inherit" />}
              {comment.like_count || 0}
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyTargetId(replyTargetId === comment.id ? null : comment.id);
                setReplyText('');
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-black text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ReplyIcon fontSize="inherit" />
              Trả lời
            </button>
            {comment.is_spoiler && (
              <button
                type="button"
                onClick={() => toggleSpoilerReveal(comment.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-black text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                <VisibilityIcon fontSize="inherit" />
                {revealedSpoilers.has(comment.id) ? 'Ẩn spoiler' : 'Hiện spoiler'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setReportingCommentId(reportingCommentId === comment.id ? null : comment.id);
                setCommentReportText('');
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-black text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-200"
            >
              <ReportProblemOutlinedIcon fontSize="inherit" />
              Báo cáo
            </button>
          </div>

          {replyTargetId === comment.id && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={user.id ? 'Viết phản hồi của bạn...' : 'Đăng nhập để trả lời'}
                disabled={!user.id}
                maxLength={1000}
                className="min-h-[84px] w-full resize-y rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTargetId(null);
                    setReplyText('');
                  }}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition-colors hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitReply(comment.id)}
                  disabled={!user.id || !replyText.trim()}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-black text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                >
                  Gửi trả lời
                </button>
              </div>
            </div>
          )}

          {reportingCommentId === comment.id && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3">
              <select
                value={commentReportReason}
                onChange={(event) => setCommentReportReason(event.target.value)}
                className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm font-bold text-white outline-none focus:border-red-300"
              >
                {commentReportReasons.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              <textarea
                value={commentReportText}
                onChange={(event) => setCommentReportText(event.target.value)}
                placeholder="Mô tả thêm nếu cần..."
                maxLength={500}
                className="min-h-[80px] w-full resize-y rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-red-300"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportingCommentId(null)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition-colors hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleReportComment(comment.id)}
                  className="rounded-full bg-red-500 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-red-400"
                >
                  Gửi báo cáo
                </button>
              </div>
            </div>
          )}
        </div>
      </article>

      {comment.replies?.length > 0 && (
        <div className="ml-8 space-y-3 border-l border-white/10 pl-4">
          {comment.replies.map((reply) => renderCommentCard(reply, depth + 1))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-xl font-black text-white">
        Đang tải dữ liệu phim...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-xl font-black text-white">
        {error || 'Không tìm thấy phim'}
      </div>
    );
  }

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-background text-white pb-20">
        <div className="absolute inset-x-0 top-0 h-[85vh] min-h-[600px] max-h-[1000px]">
          <img
            src={bgImage}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-30 mix-blend-luminosity"
            onError={(event) => {
              event.currentTarget.src = data.poster_url || FALLBACK_POSTER;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-24 md:px-8 md:pt-32">
          <section className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-14">
            <div className="mx-auto w-full max-w-[240px] lg:mx-0 lg:max-w-full">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <img
                  src={data.poster_url || FALLBACK_POSTER}
                  alt={data.title}
                  referrerPolicy="no-referrer"
                  className="aspect-[2/3] w-full object-cover transition-transform duration-500 hover:scale-105"
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_POSTER;
                  }}
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-primary">
                  {statusLabel}
                </span>
                {data.quality && (
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-white">
                    {data.quality}
                  </span>
                )}
                {data.imdb_rating && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#f5c518]/40 bg-[#f5c518]/10 px-3 py-1 text-xs font-black text-[#f5c518]">
                    <StarIcon fontSize="inherit" />
                    IMDb {Number(data.imdb_rating).toFixed(1)}
                  </span>
                )}
              </div>

              <h1 className="max-w-5xl text-4xl font-black leading-tight tracking-tight text-white drop-shadow-[0_5px_22px_rgba(0,0,0,0.65)] md:text-6xl">
                {data.title}
              </h1>
              {data.original_title && data.original_title !== data.title && (
                <h2 className="mt-3 text-lg font-bold text-white/60 md:text-2xl">{data.original_title}</h2>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoPill icon={<OndemandVideoIcon />} label="Số tập" value={`${episodes.length || 1} tập`} />
                <InfoPill icon={<InfoOutlinedIcon />} label="Trạng thái" value={statusLabel} />
                <InfoPill icon={<PublicIcon />} label="Quốc gia" value={data.countries?.join(', ') || 'Đang cập nhật'} />
                <InfoPill icon={<CategoryIcon />} label="Thể loại" value={data.genres?.slice(0, 3).join(', ') || 'Đang cập nhật'} />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {data.genres?.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => handleGenreClick(genre)}
                    className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-primary hover:bg-primary/20"
                  >
                    {genre}
                  </button>
                ))}
              </div>

              <div className="mt-8 rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl md:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
                  <div className="flex flex-1 flex-col gap-2">
                    <p className="text-sm font-bold text-white/50">Tiến độ xem</p>
                    <p className="text-lg font-black text-white">{continueText}</p>
                    {continueProgress && (
                      <div className="mt-1 h-1.5 max-w-xl overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.max(
                              5,
                              Math.min(
                                100,
                                (Number(continueProgress.progress_seconds || 0) / Number(continueProgress.duration_seconds || 1)) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(getWatchUrl(continueEpisode, continueSeconds))}
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-black text-white shadow-[0_0_20px_rgba(229,9,20,0.4)] transition-all hover:scale-105 hover:bg-primary-hover hover:shadow-[0_0_30px_rgba(229,9,20,0.6)]"
                    >
                      <PlayArrowIcon className="text-2xl" />
                      {continueProgress ? 'Tiếp tục xem' : 'Xem ngay'}
                    </button>
                    <button
                      type="button"
                      onClick={() => trailerUrl && setTrailerOpen(true)}
                      disabled={!trailerUrl}
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white/10 px-6 py-3 text-base font-black text-white backdrop-blur-md transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <OndemandVideoIcon />
                      Trailer
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLibraryItem('favorite')}
                      className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border transition-colors ${
                        libraryStatus.favorite ? 'border-primary bg-primary/20 text-primary' : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                      }`}
                      title={libraryStatus.favorite ? 'Đã thích' : 'Yêu thích'}
                    >
                      {libraryStatus.favorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLibraryItem('watchlist')}
                      className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border transition-colors ${
                        libraryStatus.watchlist ? 'border-primary bg-primary/20 text-primary' : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                      }`}
                      title={libraryStatus.watchlist ? 'Đã thêm vào danh sách' : 'Thêm vào danh sách'}
                    >
                      {libraryStatus.watchlist ? <CheckIcon /> : <AddIcon />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comments')}
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
                      title="Bình luận"
                    >
                      <ChatBubbleOutlineIcon />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                {data.release_year && <InfoPill icon={<AccessTimeIcon />} label="Năm" value={data.release_year} />}
                {data.duration && <InfoPill icon={<AccessTimeIcon />} label="Thời lượng" value={data.duration} />}
                {formatNumber(data.views) && <InfoPill icon={<VisibilityIcon />} label="Lượt xem" value={formatNumber(data.views)} />}
                {directorNames.length > 0 && <InfoPill icon={<PersonIcon />} label="Đạo diễn" value={directorNames.slice(0, 2).join(', ')} />}
              </div>
            </div>
          </section>

          <section className="mt-14">
            <nav className="flex gap-8 overflow-x-auto border-b border-white/10 pb-0">
              {tabs.map((tab) => (
                <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
              ))}
            </nav>

            <div className="min-h-[360px] pt-8">
              {activeTab === 'overview' && (
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
                    <h3 className="text-2xl font-black text-white">Tổng quan</h3>
                    <p className={`mt-4 text-base leading-8 text-white/72 ${expanded ? '' : 'line-clamp-6'}`}>
                      {data.description || 'Phim đang được cập nhật mô tả.'}
                    </p>
                    {data.description && data.description.length > 320 && (
                      <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        className="mt-4 text-sm font-black text-primary transition-colors hover:text-primary-hover"
                      >
                        {expanded ? 'Thu gọn' : 'Đọc thêm'}
                      </button>
                    )}

                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      <InfoPill icon={<PublicIcon />} label="Quốc gia" value={data.countries?.join(', ') || 'Đang cập nhật'} />
                      <InfoPill icon={<CategoryIcon />} label="Thể loại" value={data.genres?.join(', ') || 'Đang cập nhật'} />
                      <InfoPill icon={<GroupsIcon />} label="Diễn viên" value={actors.slice(0, 3).map(getPersonName).join(', ') || 'Đang cập nhật'} />
                      <InfoPill icon={<PersonIcon />} label="Đạo diễn" value={directorNames.join(', ') || 'Đang cập nhật'} />
                    </div>
                  </div>

                  <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <h3 className="text-xl font-black text-white">Xem nhanh</h3>
                    <div className="mt-5 space-y-3">
                      <button
                        type="button"
                        onClick={() => navigate(getWatchUrl(continueEpisode, continueSeconds))}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-black text-white transition-colors hover:bg-primary-hover"
                      >
                        <PlayArrowIcon />
                        {continueProgress ? 'Tiếp tục từ đoạn đã dừng' : 'Bắt đầu xem'}
                      </button>
                      <button
                        type="button"
                        onClick={() => trailerUrl && setTrailerOpen(true)}
                        disabled={!trailerUrl}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 font-black text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <OndemandVideoIcon />
                        Xem trailer
                      </button>
                    </div>
                    <div className="mt-6 rounded-2xl bg-black/25 p-4">
                      <p className="text-sm font-bold text-white/50">Đánh giá người dùng</p>
                      <div className="mt-2 flex items-end gap-1 text-primary">
                        <span className="text-4xl font-black">{ratingInfo.average_rating || 0}</span>
                        <span className="pb-1 text-sm font-black text-white/50">/10</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-white/45">{ratingInfo.rating_count || 0} lượt đánh giá</p>
                    </div>
                  </aside>
                </div>
              )}

              {activeTab === 'episodes' && (
                <div>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-black text-white">Tập phim</h3>
                      <p className="mt-1 text-sm font-bold text-white/50">{episodes.length || 0} tập đang có sẵn</p>
                    </div>
                    {continueProgress && (
                      <button
                        type="button"
                        onClick={() => navigate(getWatchUrl(continueEpisode, continueSeconds))}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-black text-black transition-colors hover:bg-white/85"
                      >
                        <PlayArrowIcon />
                        Tiếp tục tập {continueEpisode}
                      </button>
                    )}
                  </div>

                  {episodes.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {episodes.map((episode) => {
                        const active = Number(selectedEpisode) === Number(episode.episode_number);
                        const isResumeEpisode = Number(continueEpisode) === Number(episode.episode_number) && continueProgress;
                        return (
                          <button
                            key={episode.id || episode.episode_number}
                            type="button"
                            onClick={() => navigate(getWatchUrl(episode.episode_number, isResumeEpisode ? continueSeconds : 0))}
                            onMouseEnter={() => setSelectedEpisode(episode.episode_number)}
                            className={`group/episode flex min-h-[92px] items-center gap-4 rounded-xl border p-4 text-left transition-all hover:scale-[1.02] ${
                              active ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(229,9,20,0.2)]' : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white transition-colors ${active ? 'bg-primary' : 'bg-black/30 group-hover/episode:bg-primary/80'}`}>
                              <PlayArrowIcon className="transition-transform group-hover/episode:scale-110" />
                            </span>
                            <span className="min-w-0">
                              <span className={`block text-sm font-black ${active ? 'text-primary' : 'text-white/60 group-hover/episode:text-primary/80'}`}>Tập {episode.episode_number}</span>
                              <span className="mt-1 block truncate text-base font-black text-white">{getEpisodeLabel(episode)}</span>
                              {isResumeEpisode && <span className="mt-1 block text-xs font-bold text-white/50">Đang xem: {formatWatchTime(continueSeconds)}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-12 text-center text-white/55">
                      Đang cập nhật tập phim.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cast' && (
                <div className="space-y-10">
                  <PeopleCarousel title="Đạo diễn" people={directors} role="Đạo diễn" emptyText="Chưa có thông tin đạo diễn." pathBase="/dao-dien" />
                  <PeopleCarousel title="Diễn viên" people={actors} role="Diễn viên" emptyText="Chưa có thông tin diễn viên." pathBase="/dien-vien" />
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                        <h3 className="text-2xl font-black text-white">Đánh giá & Bình luận ({commentsTotal})</h3>
                        <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
                          {commentSortOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setCommentSort(option.value)}
                              className={`rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
                                commentSort === option.value ? 'bg-primary text-white' : 'text-white/50 hover:text-white'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <form onSubmit={handleSubmitReview} className="mb-10">
                        <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 md:flex-row md:items-center">
                          <div className="shrink-0 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3">
                            <span className="text-3xl font-black text-yellow-300">{ratingInfo.average_rating || 0}</span>
                            <span className="ml-1 text-xs font-black text-white/50">/10</span>
                            <p className="mt-1 text-xs font-bold text-white/45">{ratingInfo.rating_count || 0} lượt từ người dùng</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="text-sm font-black text-white">Chọn điểm của bạn</span>
                              <span className="text-sm font-black text-primary">{reviewRating ? `${reviewRating}/10` : 'Chưa chọn'}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                                <button
                                  type="button"
                                  key={score}
                                  onClick={() => setReviewRating(score)}
                                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                                    Number(reviewRating) >= score
                                      ? 'border-yellow-300/60 bg-yellow-300/15 text-yellow-300'
                                      : 'border-white/10 bg-white/5 text-white/35 hover:border-yellow-300/35 hover:text-yellow-200'
                                  }`}
                                  aria-label={`Chọn ${score} điểm`}
                                >
                                  <StarIcon sx={{ fontSize: 18 }} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <textarea
                          value={commentText}
                          onChange={(event) => setCommentText(event.target.value)}
                          placeholder={user.id ? 'Chia sẻ cảm nhận của bạn về phim này...' : 'Vui lòng đăng nhập để bình luận'}
                          disabled={!user.id}
                          className="min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                          maxLength={1000}
                        />
                        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white/65 transition-colors hover:bg-white/[0.08]">
                          <input
                            type="checkbox"
                            checked={commentSpoiler}
                            onChange={(event) => setCommentSpoiler(event.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          Ẩn nội dung spoiler
                        </label>
                        <div className="mt-4 flex items-center justify-between gap-4">
                          <span className="text-xs font-bold text-white/40">{commentText.length}/1000</span>
                          <button
                            type="submit"
                            disabled={!user.id || !reviewRating || !commentText.trim()}
                            className="rounded-full bg-primary px-6 py-3 font-black text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                          >
                            Gửi đánh giá
                          </button>
                        </div>
                        {feedbackMessage && (
                          <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/15 p-3 text-sm font-bold text-white">
                            {feedbackMessage}
                          </div>
                        )}
                      </form>

                      <div className="space-y-5">
                        {comments.length > 0 ? comments.map((comment) => renderCommentCard(comment)) : (
                          <div className="rounded-3xl border border-white/10 bg-black/20 py-12 text-center">
                            <ChatBubbleOutlineIcon className="mb-4 text-6xl text-white/10" />
                            <p className="font-bold text-white/55">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <aside>
                    <form onSubmit={handleSubmitReport} className="sticky top-24 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                      <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <ReportProblemOutlinedIcon />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white">Báo cáo sự cố</h3>
                          <p className="text-sm text-white/45">Giúp admin kiểm tra nhanh hơn.</p>
                        </div>
                      </div>

                      <label className="mb-2 block text-sm font-bold text-white/65">Vấn đề gặp phải</label>
                      <select
                        value={reportReason}
                        onChange={(event) => setReportReason(event.target.value)}
                        className="mb-4 w-full rounded-2xl border border-white/10 bg-black/35 p-3 text-white outline-none transition-colors focus:border-primary"
                      >
                        {reportReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                      </select>

                      <label className="mb-2 block text-sm font-bold text-white/65">Mô tả chi tiết</label>
                      <textarea
                        value={reportText}
                        onChange={(event) => setReportText(event.target.value)}
                        placeholder="Mô tả cụ thể lỗi bạn đang gặp..."
                        className="min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                      />

                      <button type="submit" className="mt-4 w-full rounded-2xl bg-white/10 py-3 font-black text-white transition-colors hover:bg-white/20">
                        Gửi báo cáo
                      </button>
                    </form>
                  </aside>
                </div>
              )}

              {activeTab === 'suggested' && (
                <div>
                  <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-black text-white">Đề xuất tương tự</h3>
                      <p className="mt-1 text-sm font-bold text-white/50">Giải thích theo thể loại, quốc gia, diễn viên hoặc đạo diễn trùng khớp.</p>
                    </div>
                  </div>

                  {recommendationLoading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <MovieCardSkeleton key={`recommendation-skeleton-${index}`} />
                      ))}
                    </div>
                  ) : recommendationError ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-8 text-white/55">
                      {recommendationError}
                    </div>
                  ) : recommendedMovies.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {recommendedMovies.map((movie) => {
                        const reasons = buildRecommendationReasons(movie);
                        return (
                          <div key={movie.id} className="min-w-0">
                            <MovieCard
                              movie={movie}
                              onClick={() => navigate(`/movies/${movie.id}`)}
                              onPlay={() => navigate(`/watch/${movie.id}`)}
                              showScore={Number(movie.score) > 0}
                            />
                            {reasons.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {reasons.map((reason) => (
                                  <span key={reason} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold leading-none text-white/65">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-8 text-white/55">
                      Thử chọn một phim khác để xem thêm gợi ý phù hợp.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <TrailerModal open={trailerOpen} movie={data} trailerUrl={trailerUrl} onClose={() => setTrailerOpen(false)} />

      <LoginDialog
        open={loginPromptOpen}
        onClose={() => setLoginPromptOpen(false)}
        onRegister={() => { setLoginPromptOpen(false); setRegisterPromptOpen(true); }}
        onForgot={() => { setLoginPromptOpen(false); setForgotPromptOpen(true); }}
      />
      <RegisterDialog
        open={registerPromptOpen}
        onClose={() => setRegisterPromptOpen(false)}
        onLogin={() => { setRegisterPromptOpen(false); setLoginPromptOpen(true); }}
      />
      <ForgotPasswordDialog
        open={forgotPromptOpen}
        onClose={() => setForgotPromptOpen(false)}
        onLogin={() => { setForgotPromptOpen(false); setLoginPromptOpen(true); }}
      />
    </>
  );
};

export default DetailMovies;
