import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import CheckIcon from '@mui/icons-material/Check';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import DevicesIcon from '@mui/icons-material/Devices';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import TuneIcon from '@mui/icons-material/Tune';
import { Link, useNavigate } from 'react-router-dom';
import MovieTasteFeedback from '../../components/movie/MovieTasteFeedback';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import { API_URL as API } from '../../config/api';
import {
  clearActiveProfile,
  getActiveProfile,
  getProfileHeaders,
  getProfilePlayerSettings,
  getStoredUser,
  mergeProfilePlayerSettings,
  PROFILE_CHANGE_EVENT,
  profileInitial,
  setActiveProfile,
} from '../../utils/profile';

const SUBTITLE_STYLES = [
  { id: 'default', label: 'Mặc định', description: 'Trắng rõ, hợp hầu hết nội dung' },
  { id: 'large', label: 'Chữ lớn', description: 'Dễ đọc hơn trên TV hoặc tablet' },
  { id: 'yellow', label: 'Vàng', description: 'Nổi bật khi nền phim sáng' },
  { id: 'boxed', label: 'Nền đen', description: 'Tương phản cao nhất' },
];

const SUBTITLE_TRACKS = [
  { id: 'auto', label: 'Tự động' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'off', label: 'Tắt' },
];

function formatSubtitleStyle(value) {
  return SUBTITLE_STYLES.find((item) => item.id === value)?.label || 'Mặc định';
}

function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808] ${
        checked ? 'bg-primary' : 'bg-white/15'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/25'}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SettingRow({ title, description, children, stacked = false }) {
  return (
    <div className={`flex flex-col gap-4 border-b border-white/[0.07] px-4 py-5 last:border-b-0 sm:px-6 ${
      stacked ? '' : 'sm:flex-row sm:items-center sm:justify-between'
    }`}>
      <div className="min-w-0">
        <h3 className="text-base font-black text-white">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">{description}</p> : null}
      </div>
      <div className="flex flex-shrink-0 items-center justify-start sm:justify-end">{children}</div>
    </div>
  );
}

function SectionCard({ icon, title, description, children, accent = 'rgba(229,9,20,0.65)' }) {
  const IconComponent = icon;

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-xl">
      <div className="relative border-b border-white/10 px-4 py-5 sm:px-6">
        <div className="absolute -right-12 -top-14 h-32 w-32 rounded-full blur-3xl" style={{ background: accent, opacity: 0.15 }} />
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/35 text-white">
            <IconComponent sx={{ fontSize: 23 }} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-white">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/50">{description}</p>
          </div>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function SegmentedControl({ value, options, onChange, columns = 'grid-cols-3' }) {
  return (
    <div className={`grid w-full gap-2 rounded-2xl border border-white/10 bg-black/25 p-1.5 ${columns}`}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              active ? 'bg-white text-black shadow-lg' : 'text-white/60 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SubtitlePreview({ style }) {
  const previewClass = {
    default: 'text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]',
    large: 'text-xl font-black text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]',
    yellow: 'font-black text-[#ffd84d] [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]',
    boxed: 'rounded-lg bg-black/75 px-3 py-1 font-bold text-white',
  }[style] || 'text-white';

  return (
    <div className="relative min-h-36 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(45,212,143,0.22),transparent_35%),linear-gradient(135deg,#0f172a,#050505)] p-5">
      <div className="absolute inset-x-8 bottom-8 h-1 rounded-full bg-white/15" />
      <div className="absolute left-1/2 top-10 h-16 w-28 -translate-x-1/2 rounded-t-full border border-white/15 bg-white/[0.07] blur-[0.2px]" />
      <div className="absolute inset-x-0 bottom-5 flex justify-center">
        <span className={previewClass}>Một tối xem phim thật vừa gu.</span>
      </div>
    </div>
  );
}

function ProfileHero({ activeProfile, user, playerSettings }) {
  const name = activeProfile.name || user.username || 'Profile';
  const avatar = activeProfile.avatar_url || user.avatar_url || user.avatar || '';
  const avatarColor = activeProfile.avatar_color || '#E50914';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl md:p-7">
      <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -bottom-20 right-0 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 md:gap-5">
          {avatar ? (
            <img src={avatar} alt="" className="h-20 w-20 rounded-[1.5rem] border border-white/15 object-cover shadow-2xl md:h-24 md:w-24" referrerPolicy="no-referrer" />
          ) : (
            <div
              className="grid h-20 w-20 place-items-center rounded-[1.5rem] border border-white/15 text-3xl font-black text-white shadow-2xl md:h-24 md:w-24 md:text-4xl"
              style={{ backgroundColor: avatarColor }}
            >
              {profileInitial(name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-white/55">
              <SettingsIcon sx={{ fontSize: 15 }} />
              Cài đặt profile
            </div>
            <h1 className="line-clamp-2 text-3xl font-black leading-tight text-white md:text-5xl">{name}</h1>
            <p className="mt-2 text-sm text-white/55 md:text-base">
              Mỗi profile có gu xem, phụ đề và trải nghiệm phát riêng.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-left sm:min-w-[360px]">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] font-bold text-white/45">Tự phát</div>
            <div className="mt-1 text-sm font-black text-white">{playerSettings.autoplayNext ? 'Bật' : 'Tắt'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] font-bold text-white/45">Rạp phim</div>
            <div className="mt-1 text-sm font-black text-white">{playerSettings.cinemaDefault ? 'Bật' : 'Tắt'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] font-bold text-white/45">Phụ đề</div>
            <div className="mt-1 truncate text-sm font-black text-white">{formatSubtitleStyle(playerSettings.subtitleStyle)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const EMPTY_TASTE = {
  signals_count: 0,
  positive: { genres: [], countries: [] },
  negative: { genres: [], countries: [] },
  duration: { preference: null, average_minutes: null, buckets: { short: 0, medium: 0, long: 0, series: 0 } },
  summary: [],
};

const FEEDBACK_GROUPS = [
  { id: 'like', title: 'Đã thích', tone: 'emerald' },
  { id: 'dislike', title: 'Không thích', tone: 'red' },
  { id: 'watched', title: 'Đã xem', tone: 'sky' },
  { id: 'hide', title: 'Không gợi ý nữa', tone: 'amber' },
];

function tasteToneClass(tone) {
  const classes = {
    emerald: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    red: 'border-red-300/25 bg-red-400/10 text-red-100',
    sky: 'border-sky-300/25 bg-sky-400/10 text-sky-100',
    amber: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
    neutral: 'border-white/10 bg-white/[0.07] text-white/70',
  };
  return classes[tone] || classes.neutral;
}

function TasteChipGroup({ title, items, tone = 'neutral', emptyText = 'Chưa đủ dữ liệu' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items?.length ? items.slice(0, 6).map((item) => (
          <span key={item.name} className={`rounded-full border px-3 py-1 text-xs font-black ${tasteToneClass(tone)}`}>
            {item.name}
          </span>
        )) : (
          <span className="text-sm font-bold text-white/40">{emptyText}</span>
        )}
      </div>
    </div>
  );
}

function FeedbackMovieRow({ movie, type, onChanged }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[52px_minmax(0,1fr)]">
      <Link to={`/movies/${movie.movie_id}`} className="block h-[78px] w-[52px] overflow-hidden rounded-xl bg-white/10">
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full place-items-center px-1 text-center text-[10px] font-black text-white/35">No poster</span>
        )}
      </Link>
      <div className="min-w-0">
        <Link to={`/movies/${movie.movie_id}`} className="line-clamp-1 text-sm font-black text-white hover:text-primary">
          {movie.title}
        </Link>
        <div className="mt-1 line-clamp-1 text-xs font-bold text-white/45">
          {[movie.release_year, movie.duration, movie.genres?.[0]].filter(Boolean).join(' · ') || 'Đã lưu gu'}
        </div>
        <MovieTasteFeedback
          movieId={movie.movie_id}
          initialStatus={{ [type]: true }}
          source="settings"
          variant="settings"
          className="mt-3"
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

function TasteSettingsPanel({ hasUser, hasProfile, onStatus }) {
  const [taste, setTaste] = useState(EMPTY_TASTE);
  const [feedback, setFeedback] = useState({ like: [], dislike: [], watched: [], hide: [] });
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadTasteData = useCallback((signal) => {
    if (!hasUser || !hasProfile) {
      setTaste(EMPTY_TASTE);
      setFeedback({ like: [], dislike: [], watched: [], hide: [] });
      return Promise.resolve();
    }

    setLoading(true);
    return Promise.all([
      fetch(`${API}/ai/profile-taste`, { headers: getProfileHeaders(), signal }).then((res) => (res.ok ? res.json() : EMPTY_TASTE)),
      fetch(`${API}/ai/movie-feedback/list?limit=120`, { headers: getProfileHeaders(), signal }).then((res) => (res.ok ? res.json() : { feedback: {} })),
    ])
      .then(([tasteBody, feedbackBody]) => {
        setTaste({ ...EMPTY_TASTE, ...tasteBody });
        setFeedback({
          like: feedbackBody.feedback?.like || [],
          dislike: feedbackBody.feedback?.dislike || [],
          watched: feedbackBody.feedback?.watched || [],
          hide: feedbackBody.feedback?.hide || [],
        });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onStatus?.('Không thể tải gu xem phim.', 'warning');
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [hasProfile, hasUser, onStatus]);

  useEffect(() => {
    const controller = new AbortController();
    loadTasteData(controller.signal);
    return () => controller.abort();
  }, [loadTasteData]);

  const totalFeedback = FEEDBACK_GROUPS.reduce((total, group) => total + (feedback[group.id]?.length || 0), 0);

  const resetTasteFeedback = async () => {
    if (!window.confirm('Xóa toàn bộ phản hồi chatbot của profile này? Lịch sử xem, rating và danh sách phim vẫn được giữ nguyên.')) return;
    setResetting(true);
    try {
      const response = await fetch(`${API}/ai/movie-feedback`, {
        method: 'DELETE',
        headers: getProfileHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể reset gu.');
      onStatus?.(`Đã xóa ${body.deleted || 0} phản hồi chatbot.`);
      await loadTasteData();
    } catch (err) {
      onStatus?.(err.message || 'Không thể reset gu.', 'warning');
    } finally {
      setResetting(false);
    }
  };

  if (!hasUser || !hasProfile) {
    return (
      <div className="p-4 text-sm font-bold text-white/50 sm:p-6">
        Đăng nhập và chọn profile để xem gu phim đã học.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Tín hiệu đã học</div>
          <div className="mt-2 text-3xl font-black text-white">{taste.signals_count || 0}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Phản hồi chatbot</div>
          <div className="mt-2 text-3xl font-black text-white">{totalFeedback}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Thời lượng hay chọn</div>
          <div className="mt-2 text-lg font-black text-white">
            {taste.duration?.average_minutes ? `${taste.duration.average_minutes} phút` : 'Chưa rõ'}
          </div>
        </div>
      </div>

      {taste.summary?.length ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-red-100/65">Bot đang hiểu bạn là</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {taste.summary.map((item) => (
              <span key={item} className="rounded-full border border-primary/30 bg-black/25 px-3 py-1 text-xs font-black text-red-50">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <TasteChipGroup title="Thể loại yêu thích" items={taste.positive?.genres} tone="emerald" />
        <TasteChipGroup title="Quốc gia yêu thích" items={taste.positive?.countries} tone="sky" />
        <TasteChipGroup title="Thể loại ít muốn xem" items={taste.negative?.genres} tone="red" />
        <TasteChipGroup title="Quốc gia ít muốn xem" items={taste.negative?.countries} tone="amber" />
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-black text-white">Phim đã phản hồi</div>
          <p className="mt-1 text-sm text-white/45">Bạn có thể bấm lại trên từng phim để bỏ hoặc đổi phản hồi.</p>
        </div>
        <button
          type="button"
          onClick={resetTasteFeedback}
          disabled={resetting || loading || totalFeedback === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RestartAltIcon sx={{ fontSize: 19 }} />
          Reset phản hồi AI
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm font-bold text-white/45">
          Đang tải gu xem phim...
        </div>
      ) : totalFeedback === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm font-bold text-white/45">
          Chưa có phản hồi chatbot. Hãy bấm Thích, Không thích, Đã xem hoặc Không gợi ý nữa trên phim bất kỳ.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {FEEDBACK_GROUPS.map((group) => (
            <div key={group.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${tasteToneClass(group.tone)}`}>{group.title}</span>
                <span className="text-xs font-bold text-white/40">{feedback[group.id]?.length || 0} phim</span>
              </div>
              <div className="space-y-3">
                {(feedback[group.id] || []).slice(0, 6).map((movie) => (
                  <FeedbackMovieRow
                    key={`${group.id}-${movie.movie_id}`}
                    movie={movie}
                    type={group.id}
                    onChanged={({ message }) => {
                      onStatus?.(message || 'Đã cập nhật gu phim.');
                      loadTasteData();
                    }}
                  />
                ))}
                {feedback[group.id]?.length > 6 ? (
                  <div className="text-center text-xs font-bold text-white/35">Còn {feedback[group.id].length - 6} phim khác</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [activeProfile, setActiveProfileState] = useState(() => getActiveProfile());
  const [playerSettings, setPlayerSettings] = useState(() => getProfilePlayerSettings(getActiveProfile()));
  const [savingKey, setSavingKey] = useState('');
  const [status, setStatus] = useState(null);

  const profileName = activeProfile.name || user.username || 'Profile';
  const hasProfile = Boolean(activeProfile.id);
  const hasUser = Boolean(user.id);

  const showStatus = useCallback((message, type = 'success') => {
    setStatus({ message, type });
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => setStatus(null), 3600);
  }, []);

  useEffect(() => () => window.clearTimeout(showStatus.timer), [showStatus]);

  useEffect(() => {
    const handleProfileChange = () => {
      const nextUser = getStoredUser();
      const nextProfile = getActiveProfile();
      setUser(nextUser);
      setActiveProfileState(nextProfile);
      setPlayerSettings(getProfilePlayerSettings(nextProfile));
    };

    window.addEventListener(PROFILE_CHANGE_EVENT, handleProfileChange);
    window.addEventListener('storage', handleProfileChange);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, handleProfileChange);
      window.removeEventListener('storage', handleProfileChange);
    };
  }, []);

  const syncProfileSettings = useCallback(async (nextSettings, key = 'settings') => {
    const merged = mergeProfilePlayerSettings(activeProfile, nextSettings);
    setPlayerSettings(getProfilePlayerSettings(merged));
    setActiveProfileState(merged);
    setActiveProfile(merged);

    if (!hasUser || !activeProfile.id) {
      showStatus('Đã lưu trên thiết bị này.');
      return;
    }

    setSavingKey(key);
    try {
      const response = await fetch(`${API}/profiles/${activeProfile.id}/settings`, {
        method: 'PUT',
        headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(nextSettings),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể lưu cài đặt.');

      if (body.profile) {
        setActiveProfile(body.profile);
        setActiveProfileState(body.profile);
        setPlayerSettings(getProfilePlayerSettings(body.profile));
      }
      showStatus('Đã lưu cài đặt.');
    } catch {
      showStatus('Đã lưu tạm trên thiết bị. Máy chủ chưa phản hồi.', 'warning');
    } finally {
      setSavingKey('');
    }
  }, [activeProfile, hasUser, showStatus]);

  const syncProfileMeta = useCallback(async (updates, key = 'profile') => {
    const nextProfile = { ...activeProfile, ...updates };
    const merged = mergeProfilePlayerSettings(nextProfile, playerSettings);
    setActiveProfile(merged);
    setActiveProfileState(merged);

    if (!hasUser || !activeProfile.id) {
      showStatus('Đã lưu trên thiết bị này.');
      return;
    }

    setSavingKey(key);
    try {
      const response = await fetch(`${API}/profiles/${activeProfile.id}`, {
        method: 'PUT',
        headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: nextProfile.name || profileName,
          avatar_color: nextProfile.avatar_color || '#E50914',
          avatar_url: nextProfile.avatar_url || '',
          is_kids: Boolean(nextProfile.is_kids),
          ...playerSettings,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể lưu profile.');

      if (body.profile) {
        setActiveProfile(body.profile);
        setActiveProfileState(body.profile);
        setPlayerSettings(getProfilePlayerSettings(body.profile));
      }
      showStatus('Đã lưu profile.');
    } catch {
      showStatus('Đã lưu tạm trên thiết bị. Máy chủ chưa phản hồi.', 'warning');
    } finally {
      setSavingKey('');
    }
  }, [activeProfile, hasUser, playerSettings, profileName, showStatus]);

  const updatePlayerSetting = (key, value) => {
    syncProfileSettings({ ...playerSettings, [key]: value }, key);
  };

  const resetPlayback = () => {
    syncProfileSettings({
      autoplayNext: true,
      cinemaDefault: false,
      subtitleStyle: 'default',
      subtitleTrack: 'auto',
    }, 'reset');
  };

  const statusClass = useMemo(() => {
    if (!status) return 'pointer-events-none translate-y-2 opacity-0';
    return 'translate-y-0 opacity-100';
  }, [status]);

  return (
    <div className="min-h-screen bg-black pb-12 pt-24 text-white">
      <div className="container mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-8 lg:flex-row">
        <ProfileSidebar user={user} />

        <main className="min-w-0 flex-1 space-y-6">
          <ProfileHero activeProfile={activeProfile} user={user} playerSettings={playerSettings} />

          {!hasProfile ? (
            <div className="rounded-3xl border border-yellow-500/25 bg-yellow-500/10 p-5 text-yellow-100">
              Bạn cần chọn profile trước khi chỉnh cài đặt.
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <SectionCard
                icon={PlayCircleIcon}
                title="Trình phát"
                description="Các lựa chọn này áp dụng khi profile này xem phim hoặc phim bộ."
                accent="rgba(45,212,143,0.65)"
              >
                <SettingRow title="Tự phát tập tiếp theo" description="Khi hết tập hiện tại, player tự chuyển sang tập kế tiếp nếu có.">
                  <ToggleSwitch
                    label="Tự phát tập tiếp theo"
                    checked={Boolean(playerSettings.autoplayNext)}
                    disabled={savingKey === 'autoplayNext'}
                    onChange={(value) => updatePlayerSetting('autoplayNext', value)}
                  />
                </SettingRow>
                <SettingRow title="Mặc định tắt đèn" description="Tự bật cinema mode khi mở trang xem phim để tập trung hơn vào khung hình.">
                  <ToggleSwitch
                    label="Mặc định tắt đèn"
                    checked={Boolean(playerSettings.cinemaDefault)}
                    disabled={savingKey === 'cinemaDefault'}
                    onChange={(value) => updatePlayerSetting('cinemaDefault', value)}
                  />
                </SettingRow>
                <SettingRow title="Nguồn phát" description="Chọn theo tập phim đang mở. Không tạo lựa chọn chất lượng nếu tập chưa có nhiều nguồn thật.">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-white/75">
                    <DevicesIcon sx={{ fontSize: 18 }} />
                    Theo dữ liệu tập
                  </span>
                </SettingRow>
              </SectionCard>

              <SectionCard
                icon={SubtitlesIcon}
                title="Âm thanh & Phụ đề"
                description="Ưu tiên phụ đề của profile. Nếu tập không có track tương ứng, player giữ nguyên dữ liệu thật của tập."
                accent="rgba(59,130,246,0.65)"
              >
                <SettingRow title="Kiểu phụ đề" description="Điều chỉnh độ nổi bật của phụ đề trên HTML5 player." stacked>
                  <div className="w-full min-w-[240px] sm:w-[420px]">
                    <SegmentedControl
                      value={playerSettings.subtitleStyle}
                      options={SUBTITLE_STYLES.map(({ id, label }) => ({ id, label }))}
                      columns="grid-cols-2 sm:grid-cols-4"
                      onChange={(value) => updatePlayerSetting('subtitleStyle', value)}
                    />
                  </div>
                </SettingRow>
                <div className="px-4 pb-5 sm:px-6">
                  <SubtitlePreview style={playerSettings.subtitleStyle} />
                </div>
                <SettingRow title="Track ưu tiên" description="Chỉ áp dụng khi tập phim thật sự có phụ đề tương ứng." stacked>
                  <div className="w-full min-w-[220px] sm:w-[340px]">
                    <SegmentedControl
                      value={playerSettings.subtitleTrack}
                      options={SUBTITLE_TRACKS}
                      onChange={(value) => updatePlayerSetting('subtitleTrack', value)}
                    />
                  </div>
                </SettingRow>
              </SectionCard>

              <SectionCard
                icon={MovieFilterIcon}
                title="Gu xem phim"
                description="Bot học từ phản hồi, rating, danh sách phim và lịch sử xem của profile này."
                accent="rgba(45,212,191,0.65)"
              >
                <TasteSettingsPanel hasUser={hasUser} hasProfile={hasProfile} onStatus={showStatus} />
              </SectionCard>
            </div>

            <aside className="space-y-6">
              <SectionCard
                icon={AccountCircleIcon}
                title="Profile"
                description="Thông tin profile đang dùng trên thiết bị này."
                accent="rgba(168,85,247,0.65)"
              >
                <div className="space-y-3 p-4 sm:p-6">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Tên profile</div>
                    <div className="mt-1 line-clamp-1 text-xl font-black text-white">{profileName}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span>
                        <span className="block font-black text-white">Profile trẻ em</span>
                        <span className="mt-1 block text-xs text-white/45">Ưu tiên trải nghiệm nhẹ nhàng hơn.</span>
                      </span>
                      <ToggleSwitch
                        label="Profile trẻ em"
                        checked={Boolean(activeProfile.is_kids)}
                        disabled={savingKey === 'kids'}
                        onChange={(value) => syncProfileMeta({ is_kids: value }, 'kids')}
                      />
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1 text-xs font-bold text-white/60">
                      <ChildCareIcon sx={{ fontSize: 15 }} />
                      {activeProfile.is_kids ? 'Đang bật' : 'Đang tắt'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/user/profile')}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-black text-black transition-colors hover:bg-white/85"
                  >
                    <TuneIcon sx={{ fontSize: 20 }} />
                    Quản lý tài khoản
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                icon={MovieFilterIcon}
                title="Trải nghiệm"
                description="Tổng quan nhanh các lựa chọn đang bật."
                accent="rgba(250,204,21,0.55)"
              >
                <div className="space-y-3 p-4 sm:p-6">
                  {[
                    ['Tự phát', playerSettings.autoplayNext ? 'Bật' : 'Tắt', PlayCircleIcon],
                    ['Cinema mode', playerSettings.cinemaDefault ? 'Bật mặc định' : 'Bật thủ công', DarkModeIcon],
                    ['Phụ đề', formatSubtitleStyle(playerSettings.subtitleStyle), SubtitlesIcon],
                  ].map(([label, value, IconComponent]) => (
                    <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.08] text-white">
                        {createElement(IconComponent, { sx: { fontSize: 19 } })}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-white/45">{label}</span>
                        <span className="block truncate text-sm font-black text-white">{value}</span>
                      </span>
                      <CheckIcon className="ml-auto flex-shrink-0 text-emerald-300" sx={{ fontSize: 20 }} />
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                icon={RestartAltIcon}
                title="Dữ liệu cục bộ"
                description="Các thao tác chỉ ảnh hưởng thiết bị hiện tại."
                accent="rgba(239,68,68,0.55)"
              >
                <div className="space-y-3 p-4 sm:p-6">
                  <button
                    type="button"
                    onClick={resetPlayback}
                    disabled={savingKey === 'reset'}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 font-black text-white transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <RestartAltIcon sx={{ fontSize: 20 }} />
                    Đưa player về mặc định
                  </button>
                  <button
                    type="button"
                    onClick={clearActiveProfile}
                    className="flex w-full items-center justify-center rounded-2xl border border-primary/35 bg-primary/10 px-4 py-3 font-black text-red-100 transition-colors hover:bg-primary/15"
                  >
                    Đổi profile đang xem
                  </button>
                </div>
              </SectionCard>
            </aside>
          </div>
        </main>
      </div>

      <div
        className={`fixed bottom-6 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur-xl transition-all ${
          status?.type === 'warning'
            ? 'border-yellow-400/30 bg-yellow-500/15 text-yellow-100'
            : 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100'
        } ${statusClass}`}
      >
        {status?.message || 'Đã lưu.'}
      </div>
    </div>
  );
}
