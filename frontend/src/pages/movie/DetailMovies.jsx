import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import StarIcon from '@mui/icons-material/Star';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ForgotPasswordDialog from '../../components/auth/ForgotPasswordDialog';
import LoginDialog from '../../components/auth/LoginDialog';
import RegisterDialog from '../../components/auth/RegisterDialog';
import MovieCard, { FALLBACK_POSTER, MovieCardSkeleton } from '../../components/movie/MovieCard';
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

const normalizePeople = (people) => {
  if (!Array.isArray(people)) return [];
  return people
    .map((person) => (typeof person === 'string' ? { name: person } : person))
    .filter((person) => getPersonName(person));
};

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

function PersonAvatar({ person, role }) {
  const name = getPersonName(person);
  const image = person?.profile_pic_url;

  return (
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
}

function PeopleCarousel({ title, people, role, emptyText }) {
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
            <PersonAvatar key={person.id || getPersonName(person)} person={person} role={role} />
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

    fetch(`${API}/movie/${id}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải dữ liệu phim.');
        return res.json();
      })
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
      fetch(`${API}/movies/${id}/comments`).then((res) => res.json()),
    ])
      .then(([ratings, commentsData]) => {
        setRatingInfo(ratings);
        setReviewRating(Number(ratings.my_rating) || 0);
        setComments(Array.isArray(commentsData) ? commentsData : []);
      })
      .catch(() => {});
  }, [id, user.id]);

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
        <div className="absolute inset-x-0 top-0 h-[760px]">
          <img
            src={bgImage}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-55"
            onError={(event) => {
              event.currentTarget.src = data.poster_url || FALLBACK_POSTER;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-background/70 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/20" />
          <div className="absolute inset-0 backdrop-blur-[1px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-24 md:px-8 md:pt-32">
          <section className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
            <div className="mx-auto w-full max-w-[280px] lg:mx-0">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
                <img
                  src={data.poster_url || FALLBACK_POSTER}
                  alt={data.title}
                  referrerPolicy="no-referrer"
                  className="aspect-[2/3] w-full object-cover"
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
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-black text-black transition-colors hover:bg-white/85"
                    >
                      <PlayArrowIcon />
                      {continueProgress ? 'Tiếp tục xem' : 'Xem ngay'}
                    </button>
                    <button
                      type="button"
                      onClick={() => trailerUrl && setTrailerOpen(true)}
                      disabled={!trailerUrl}
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-base font-black text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
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
                            className={`group/episode flex min-h-[92px] items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                              active ? 'border-primary/60 bg-primary/15' : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/30 text-white">
                              <PlayArrowIcon className="transition-transform group-hover/episode:scale-110" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-black text-primary">Tập {episode.episode_number}</span>
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
                  <PeopleCarousel title="Đạo diễn" people={directors} role="Đạo diễn" emptyText="Chưa có thông tin đạo diễn." />
                  <PeopleCarousel title="Diễn viên" people={actors} role="Diễn viên" emptyText="Chưa có thông tin diễn viên." />
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
                      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-5">
                        <h3 className="text-2xl font-black text-white">Đánh giá & Bình luận ({comments.length})</h3>
                      </div>

                      <form onSubmit={handleSubmitReview} className="mb-10">
                        <div className="mb-4 flex items-center gap-4">
                          <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                            <span className="text-3xl font-black text-primary">{ratingInfo.average_rating || 0}</span>
                            <span className="ml-1 text-xs font-black text-white/50">/10</span>
                          </div>
                          <div className="flex flex-1 items-center gap-1 overflow-x-auto pb-1">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                              <button
                                type="button"
                                key={score}
                                onClick={() => setReviewRating(score)}
                                className={`h-10 w-10 shrink-0 rounded-xl text-sm font-black transition-colors ${
                                  Number(reviewRating) === score ? 'bg-primary text-white' : 'bg-white/5 text-white/45 hover:bg-white/15 hover:text-white'
                                }`}
                              >
                                {score}
                              </button>
                            ))}
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
                        {comments.length > 0 ? comments.map((comment) => (
                          <article key={comment.id} className="flex gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-600 text-lg font-black text-white">
                              {comment.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-black/20 p-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <h5 className="text-sm font-black text-white">{comment.username}</h5>
                                <span className="text-xs font-bold text-white/35">{new Date(comment.created_at).toLocaleString('vi-VN')}</span>
                              </div>
                              <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">{comment.content}</p>
                            </div>
                          </article>
                        )) : (
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
