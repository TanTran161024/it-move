import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FaBug,
  FaCompress,
  FaExpand,
  FaPause,
  FaPlay,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import {
  MdAudiotrack,
  MdCheck,
  MdForward10,
  MdHighQuality,
  MdReplay10,
  MdSpeed,
  MdSubtitles,
} from "react-icons/md";

const ACCENT = "#2dd48f";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_PLAYER_SETTINGS = {
  autoplayNext: true,
  cinemaDefault: false,
  subtitleStyle: "default",
  subtitleTrack: "auto",
};
const SUBTITLE_STYLES = [
  { id: "default", label: "Mặc định", detail: "Trắng rõ" },
  { id: "large", label: "Chữ lớn", detail: "Dễ đọc hơn" },
  { id: "yellow", label: "Vàng", detail: "Nổi trên nền sáng" },
  { id: "boxed", label: "Nền đen", detail: "Tương phản cao" },
];

function formatTime(time) {
  if (!Number.isFinite(time) || time < 0) return "00:00";
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function isMissingSource(src) {
  return !src || src.includes("example.com") || src.includes("localhost/videos/");
}

function getHlsSource(src) {
  if (typeof src !== "string") return "";
  const value = src.trim();

  if (value.toLowerCase().includes(".m3u8") && !value.includes("player.phimapi.com/player")) {
    return value;
  }

  if (!value.includes("player.phimapi.com/player")) return "";

  try {
    const parsed = new URL(value);
    const nestedUrl = parsed.searchParams.get("url");
    if (nestedUrl?.toLowerCase().includes(".m3u8")) return nestedUrl;
  } catch {
    const match = value.match(/[?&]url=([^&]+)/);
    const nestedUrl = match ? decodeURIComponent(match[1]) : "";
    if (nestedUrl.toLowerCase().includes(".m3u8")) return nestedUrl;
  }

  return "";
}

function isIframeSource(src) {
  if (typeof src !== "string") return false;
  if (getHlsSource(src)) return false;
  const value = src.toLowerCase();
  return (
    value.includes("player.phimapi.com/player")
    || value.includes("/embed")
    || value.includes("youtube.com/embed")
  );
}

function getPlayableSource(src) {
  if (typeof src !== "string") return "";
  const hlsSource = getHlsSource(src);
  if (hlsSource) return hlsSource;
  return src;
}

function normalizeSubtitleTracks(subtitles) {
  if (!Array.isArray(subtitles)) return [];

  return subtitles
    .map((subtitle, index) => {
      const src = String(subtitle?.src || subtitle?.url || "").trim();
      if (!src) return null;

      return {
        id: String(subtitle?.id || subtitle?.srclang || subtitle?.language || `subtitle-${index + 1}`),
        src,
        label: subtitle?.label || subtitle?.name || (subtitle?.srclang === "en" ? "English" : "Tiếng Việt"),
        srclang: subtitle?.srclang || subtitle?.language || "vi",
      };
    })
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function NextEpisodeIcon({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M9 8.5L27 20L9 31.5V8.5Z" stroke="currentColor" strokeWidth="3.3" strokeLinejoin="round" />
      <path d="M31.5 8V32" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" />
    </svg>
  );
}

function EpisodeStackIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path d="M18 9H35C36.7 9 38 10.3 38 12V25" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15H31C32.7 15 34 16.3 34 18V31" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6" y="21" width="24" height="15" rx="3" stroke="currentColor" strokeWidth="3.3" />
    </svg>
  );
}

function ControlButton({
  icon,
  label,
  ariaLabel,
  title,
  onClick,
  disabled = false,
  active = false,
  width = "icon",
  action,
}) {
  const widthClass = {
    icon: "w-14",
    medium: "w-14",
    wide: "w-14",
    extraWide: "w-14",
  }[width] || "w-14";

  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      title={title || label || ariaLabel}
      disabled={disabled}
      data-player-action={action || undefined}
      onClick={disabled ? undefined : onClick}
      className={`${widthClass} group/player-control relative flex h-14 shrink-0 items-center justify-center gap-2 overflow-visible px-1 text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#2dd48f]/70 ${active ? "text-[#2dd48f]" : "hover:text-white"} ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <span className="flex items-center justify-center transition-transform duration-150 group-hover/player-control:scale-105 group-active/player-control:scale-95">
          {icon}
        </span>
      </span>
    </button>
  );
}

function ProgressBar({ currentTime, duration, onSeek, disabled }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const percent = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;

  const seekFromPointer = useCallback((clientX) => {
    if (disabled || !duration || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const nextPercent = clamp((clientX - rect.left) / rect.width, 0, 1);
    onSeek(nextPercent * duration);
  }, [disabled, duration, onSeek]);

  const handlePointerDown = (event) => {
    if (disabled) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFromPointer(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (!draggingRef.current) return;
    seekFromPointer(event.clientX);
  };

  const stopDragging = (event) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="flex h-9 w-full items-center gap-5">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Tiến trình phát"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration || 0)}
        aria-valuenow={Math.floor(currentTime || 0)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className={`group/progress relative h-8 flex-1 select-none py-3 ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 origin-center rounded-full bg-white/35 transition-transform duration-150 group-hover/progress:scale-y-125">
          <div
            className="absolute bottom-0 left-0 top-0 rounded-full bg-[#2dd48f]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2dd48f] shadow-[0_0_18px_rgba(45,212,143,0.65)] transition-shadow duration-150 group-hover/progress:shadow-[0_0_24px_rgba(45,212,143,0.9)]"
          style={{ left: `${percent}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-sm font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] md:text-base">
        {formatTime(duration)}
      </span>
    </div>
  );
}

function PlayerMenu({ open, title, children, menuId }) {
  if (!open) return null;

  return (
    <div
      data-player-menu={menuId || undefined}
      className="absolute bottom-[92px] right-4 z-[80] w-[min(92vw,340px)] rounded-2xl border border-white/10 bg-black/85 p-2 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="border-b border-white/10 px-3 py-2 text-base font-black">{title}</div>
      <div className="py-2">{children}</div>
    </div>
  );
}

function MenuOption({ label, detail, active, icon, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors duration-150 ${disabled ? "cursor-not-allowed text-white/40" : "hover:bg-white/10"} ${active ? "text-[#2dd48f]" : "text-white/85"}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-bold">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-white/45">{detail}</span>}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {active ? <MdCheck size={22} /> : icon}
      </span>
    </button>
  );
}

function ToggleRow({ label, detail, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors duration-150 hover:bg-white/10"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white/90">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-white/45">{detail}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-[#2dd48f]" : "bg-white/20"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

function SpeedMenu({ open, playbackRate, onSelect }) {
  return (
    <PlayerMenu open={open} title="Tốc độ phát" menuId="speed">
      {SPEEDS.map((speed) => (
        <MenuOption
          key={speed}
          label={`${speed}x`}
          active={playbackRate === speed}
          onClick={() => onSelect(speed)}
        />
      ))}
    </PlayerMenu>
  );
}

function QualityMenu({ open }) {
  return (
    <PlayerMenu open={open} title="Chất lượng" menuId="quality">
      <MenuOption
        label="Auto"
        detail="Dùng nguồn phát hiện có"
        active
        icon={<MdHighQuality size={22} />}
      />
      <div className="px-3 py-2 text-xs leading-relaxed text-white/50">
        Tập này chưa có nhiều link chất lượng riêng, nên trình phát giữ chế độ Auto.
      </div>
    </PlayerMenu>
  );
}

function AudioSubtitleMenu({
  open,
  subtitleTracks,
  selectedSubtitleId,
  playerSettings,
  onPlayerSettingChange,
  onSelectSubtitleTrack,
  onSelectSubtitleStyle,
}) {
  const currentStyle = playerSettings.subtitleStyle || "default";
  const hasSubtitleTracks = subtitleTracks.length > 0;

  return (
    <PlayerMenu open={open} title="Âm thanh & Phụ đề" menuId="audio">
      <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white/85">
          <MdAudiotrack size={20} />
          Âm thanh gốc
        </div>
        {!hasSubtitleTracks && (
        <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
          <MdSubtitles size={20} />
          Chưa có phụ đề rời cho tập này.
        </div>
        )}
      </div>

      {hasSubtitleTracks && (
        <>
          <div className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-[0.18em] text-white/35">
            Phụ đề
          </div>
          <MenuOption
            label="Tắt phụ đề"
            active={selectedSubtitleId === "off"}
            onClick={() => onSelectSubtitleTrack("off")}
          />
          {subtitleTracks.map((subtitle) => (
            <MenuOption
              key={subtitle.id}
              label={subtitle.label}
              detail={subtitle.srclang?.toUpperCase()}
              active={selectedSubtitleId === subtitle.id}
              icon={<MdSubtitles size={22} />}
              onClick={() => onSelectSubtitleTrack(subtitle.id)}
            />
          ))}
        </>
      )}

      <div className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-[0.18em] text-white/35">
        Kiểu hiển thị phụ đề
      </div>
      {SUBTITLE_STYLES.map((style) => (
        <MenuOption
          key={style.id}
          label={style.label}
          detail={style.detail}
          active={currentStyle === style.id}
          onClick={() => onSelectSubtitleStyle(style.id)}
        />
      ))}

      <div className="my-2 border-t border-white/10" />
      <ToggleRow
        label="Tự phát tập tiếp"
        detail="Khi tập hiện tại kết thúc"
        checked={Boolean(playerSettings.autoplayNext)}
        onChange={(value) => onPlayerSettingChange?.("autoplayNext", value)}
      />
      <ToggleRow
        label="Mặc định tắt đèn"
        detail="Tự bật cinema mode khi vào xem"
        checked={Boolean(playerSettings.cinemaDefault)}
        onChange={(value) => onPlayerSettingChange?.("cinemaDefault", value)}
      />
    </PlayerMenu>
  );
}

function VolumeControl({ volume, muted, onToggleMute, onVolumeChange }) {
  const [open, setOpen] = useState(false);
  const visibleVolume = muted ? 0 : volume;

  return (
    <div
      className="relative h-14 w-14 shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <ControlButton
        icon={muted || volume === 0 ? <FaVolumeMute size={30} /> : <FaVolumeUp size={30} />}
        ariaLabel={muted || volume === 0 ? "Bật âm" : "Tắt âm"}
        title={muted || volume === 0 ? "Bật âm" : "Tắt âm"}
        action="mute"
        onClick={onToggleMute}
      />
      <div className={`absolute bottom-[62px] left-1/2 z-[90] w-36 -translate-x-1/2 rounded-xl border border-white/10 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-xl transition-opacity duration-150 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={visibleVolume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          aria-label="Âm lượng"
          className="h-2 w-full cursor-pointer accent-[#2dd48f]"
          style={{ accentColor: ACCENT }}
        />
      </div>
    </div>
  );
}

const VideoPlayer = forwardRef(({
  src,
  poster,
  className = "",
  resumeAt = 0,
  onEnded,
  onSnapshot,
  hasNextEpisode = false,
  onNextEpisode,
  onOpenEpisodeList,
  playerSettings = DEFAULT_PLAYER_SETTINGS,
  onPlayerSettingChange,
  onReport,
  subtitles = [],
}, ref) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeout = useRef(null);
  const hlsRef = useRef(null);
  const pendingPlaybackRestoreRef = useRef(null);

  const iframeSource = isIframeSource(src);
  const missingSource = isMissingSource(src);
  const hlsSource = getHlsSource(src);
  const playableSource = getPlayableSource(src);
  const mergedSettings = { ...DEFAULT_PLAYER_SETTINGS, ...playerSettings };
  const subtitleTracks = useMemo(() => normalizeSubtitleTracks(subtitles), [subtitles]);
  const subtitleTrackKey = useMemo(
    () => subtitleTracks.map((subtitle) => `${subtitle.id}:${subtitle.src}`).join("|"),
    [subtitleTracks]
  );

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(Boolean(src && !missingSource));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState("off");

  useImperativeHandle(ref, () => videoRef.current);

  const closeMenus = useCallback(() => setMenu(null), []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    if (playing && !menu) {
      controlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3200);
    }
  }, [menu, playing]);

  const getSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || iframeSource) return null;

    const snapshot = {
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };

    return {
      ...snapshot,
      completed: snapshot.duration > 0 && snapshot.currentTime / snapshot.duration >= 0.9,
    };
  }, [iframeSource]);

  const emitSnapshot = useCallback(() => {
    const snapshot = getSnapshot();
    if (snapshot) onSnapshot?.(snapshot);
    return snapshot;
  }, [getSnapshot, onSnapshot]);

  const handlePlayPause = useCallback(async () => {
    if (iframeSource || missingSource || error) return;
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch {
        setError("Không thể phát video này.");
      }
    } else {
      video.pause();
      emitSnapshot();
    }
  }, [emitSnapshot, error, iframeSource, missingSource]);

  const handleSeek = useCallback((nextTime) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) return;
    const safeTime = clamp(nextTime, 0, duration || 0);
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, [duration, iframeSource]);

  const handleSkip = useCallback((seconds) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !duration) return;
    const nextTime = clamp(video.currentTime + seconds, 0, duration);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration, iframeSource]);

  const setVideoVolume = useCallback((nextVolume) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    const normalized = clamp(nextVolume, 0, 1);
    video.volume = normalized;
    video.muted = normalized === 0;
    setVolume(normalized);
    setMuted(normalized === 0);
  }, [iframeSource]);

  const handleMute = useCallback(() => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;

    if (video.muted && volume === 0) {
      setVideoVolume(0.6);
      return;
    }

    video.muted = !video.muted;
    setMuted(video.muted);
  }, [iframeSource, setVideoVolume, volume]);

  const capturePlaybackState = useCallback(() => {
    const video = videoRef.current;
    if (!video || iframeSource) return null;

    return {
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : currentTime,
      playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : playbackRate,
      volume: Number.isFinite(video.volume) ? video.volume : volume,
      muted: video.muted,
      wasPlaying: !video.paused,
    };
  }, [currentTime, iframeSource, playbackRate, volume]);

  const restorePendingPlayback = useCallback(() => {
    const video = videoRef.current;
    const pending = pendingPlaybackRestoreRef.current;
    if (!video || !pending || iframeSource) return false;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

    const restoredTime = clamp(pending.currentTime, 0, Math.max(video.duration - 0.5, 0));
    video.currentTime = restoredTime;
    video.playbackRate = pending.playbackRate;
    video.volume = clamp(pending.volume, 0, 1);
    video.muted = Boolean(pending.muted);

    setCurrentTime(restoredTime);
    setPlaybackRate(pending.playbackRate);
    setVolume(clamp(pending.volume, 0, 1));
    setMuted(Boolean(pending.muted));
    pendingPlaybackRestoreRef.current = null;

    if (pending.wasPlaying) {
      video.play().catch(() => {});
    }

    return true;
  }, [iframeSource]);

  const handleFullscreen = useCallback(() => {
    const playbackState = capturePlaybackState();
    if (playbackState) pendingPlaybackRestoreRef.current = playbackState;

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen((value) => !value);
    setShowControls(true);
    setMenu(null);
  }, [capturePlaybackState]);

  const handleNextEpisode = useCallback(() => {
    if (!hasNextEpisode) return;
    closeMenus();
    onNextEpisode?.(emitSnapshot());
  }, [closeMenus, emitSnapshot, hasNextEpisode, onNextEpisode]);

  const handleEpisodeList = useCallback(() => {
    closeMenus();
    onOpenEpisodeList?.();
  }, [closeMenus, onOpenEpisodeList]);

  const handleReport = useCallback(() => {
    closeMenus();
    if (fullscreen) {
      setFullscreen(false);
      setShowControls(true);
    }
    onReport?.();
  }, [closeMenus, fullscreen, onReport]);

  const handleSelectSpeed = useCallback((speed) => {
    setPlaybackRate(speed);
    if (videoRef.current && !iframeSource) videoRef.current.playbackRate = speed;
    setMenu(null);
  }, [iframeSource]);

  const handleSelectSubtitleStyle = useCallback((style) => {
    onPlayerSettingChange?.("subtitleStyle", style);
  }, [onPlayerSettingChange]);

  const handleSelectSubtitleTrack = useCallback((trackId) => {
    setSelectedSubtitleId(trackId);
    onPlayerSettingChange?.("subtitleTrack", trackId);
  }, [onPlayerSettingChange]);

  const syncSubtitleTracks = useCallback(() => {
    const video = videoRef.current;
    if (!video || iframeSource) return;

    const textTracks = Array.from(video.textTracks || []);
    textTracks.forEach((track, trackIndex) => {
      const isSelected = subtitleTracks[trackIndex]?.id === selectedSubtitleId;
      track.mode = isSelected ? "showing" : "disabled";
    });
  }, [iframeSource, selectedSubtitleId, subtitleTracks]);

  const toggleMenu = useCallback((nextMenu) => {
    setShowControls(true);
    setMenu((current) => (current === nextMenu ? null : nextMenu));
  }, []);

  useEffect(() => {
    setPlaying(false);
    setBuffering(Boolean(src && !missingSource));
    setCurrentTime(0);
    setDuration(0);
    setError("");
    setMenu(null);
    setShowControls(true);
    pendingPlaybackRestoreRef.current = null;
  }, [missingSource, src]);

  useEffect(() => {
    const preferredTrack = mergedSettings.subtitleTrack;
    const firstTrackId = subtitleTracks[0]?.id || "off";

    if (!subtitleTracks.length || preferredTrack === "off") {
      setSelectedSubtitleId("off");
      return;
    }

    if (preferredTrack && preferredTrack !== "auto" && subtitleTracks.some((subtitle) => subtitle.id === preferredTrack)) {
      setSelectedSubtitleId(preferredTrack);
      return;
    }

    setSelectedSubtitleId(firstTrackId);
  }, [mergedSettings.subtitleTrack, subtitleTrackKey, subtitleTracks]);

  useEffect(() => {
    syncSubtitleTracks();
  }, [selectedSubtitleId, subtitleTrackKey, syncSubtitleTracks]);

  useEffect(() => {
    if (iframeSource || missingSource || !hlsSource) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    setBuffering(true);
    setError("");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute("src");
    video.load();

    let disposed = false;
    let hlsInstance = null;
    let nativeAttached = false;

    import("hls.js")
      .then(({ default: Hls }) => {
        if (disposed) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsInstance = hls;
          hlsRef.current = hls;

          hls.loadSource(hlsSource);
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            hls.startLoad();
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setBuffering(false);
            if (video.duration && Number.isFinite(video.duration)) setDuration(video.duration);
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (!data?.fatal) return;

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }

            setBuffering(false);
            setError("Không thể phát video này.");
          });
          return;
        }

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          nativeAttached = true;
          video.src = hlsSource;
          video.load();
          return;
        }

        if (!disposed) {
          setBuffering(false);
          setError("Trình duyệt không hỗ trợ nguồn phát này.");
        }
      })
      .catch(() => {
        if (!disposed) {
          setBuffering(false);
          setError("Không thể tải trình phát HLS.");
        }
      });

    return () => {
      disposed = true;
      hlsInstance?.destroy();
      if (hlsRef.current === hlsInstance) hlsRef.current = null;
      if (nativeAttached) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [fullscreen, hlsSource, iframeSource, missingSource]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setFullscreen(false);
      setShowControls(true);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [fullscreen]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== "Escape" || !fullscreen) return;
      event.preventDefault();
      setFullscreen(false);
      setShowControls(true);
      setMenu(null);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [fullscreen]);

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [revealControls]);

  useEffect(() => {
    if (iframeSource) return undefined;

    function handleKeyDown(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;

      const keys = [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "f", "F", "m", "M"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();

      if (event.key === " ") handlePlayPause();
      if (event.key === "ArrowLeft") handleSkip(-10);
      if (event.key === "ArrowRight") handleSkip(10);
      if (event.key === "ArrowUp") setVideoVolume(volume + 0.1);
      if (event.key === "ArrowDown") setVideoVolume(volume - 0.1);
      if (event.key === "f" || event.key === "F") handleFullscreen();
      if (event.key === "m" || event.key === "M") handleMute();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFullscreen, handleMute, handlePlayPause, handleSkip, iframeSource, setVideoVolume, volume]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    video.playbackRate = playbackRate;
    video.volume = volume;
    video.muted = muted;
    setBuffering(false);

    const restored = restorePendingPlayback();
    if (!restored && resumeAt > 5 && Number.isFinite(video.duration) && resumeAt < video.duration * 0.9) {
      video.currentTime = resumeAt;
      setCurrentTime(resumeAt);
    }
    syncSubtitleTracks();
  };

  const subtitleClass = `player-subtitle-${mergedSettings.subtitleStyle || "default"}`;
  const controlsVisible = showControls || Boolean(menu);
  const controlsVisibleClass = controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none";
  const mediaFrameClass = fullscreen
    ? "absolute left-0 top-0 h-[calc(100%-160px)] w-full transition-[height] duration-200"
    : "absolute left-0 top-0 h-full w-full transition-[height] duration-200";
  const htmlControlsDisabled = iframeSource || missingSource || Boolean(error);

  const playerContent = (
    <div
      ref={containerRef}
      data-player-fullscreen={fullscreen ? "true" : "false"}
      className={`${fullscreen ? "fixed inset-0 z-[9999] h-[100dvh] w-screen" : `relative h-full w-full ${className}`} flex items-center justify-center overflow-hidden bg-black text-white`}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (playing && !menu) setShowControls(false);
      }}
      onTouchStart={revealControls}
    >
      {missingSource ? (
        <div data-player-media="true" className={`${mediaFrameClass} z-20 flex flex-col items-center justify-center bg-gradient-to-b from-black to-[#101010] px-6 text-center`}>
          <div className="mb-3 text-2xl font-black text-[#2dd48f] md:text-3xl">Phim chưa có nguồn phát</div>
          <p className="max-w-xl text-sm text-white/65 md:text-base">Tập này chưa có link phim hợp lệ hoặc đang dùng link mẫu cũ.</p>
        </div>
      ) : iframeSource ? (
        <iframe
          data-player-media="true"
          className={`${mediaFrameClass} border-0 bg-black`}
          src={playableSource}
          title="Movie player"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setBuffering(false)}
        />
      ) : (
        <video
          data-player-media="true"
          ref={videoRef}
          className={`${mediaFrameClass} cursor-pointer object-contain ${subtitleClass}`}
          poster={poster}
          src={hlsSource ? undefined : playableSource}
          playsInline
          onClick={handlePlayPause}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => {
            setBuffering(false);
            restorePendingPlayback();
            syncSubtitleTracks();
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setPlaying(true);
            setBuffering(false);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            emitSnapshot();
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            const snapshot = emitSnapshot();
            onEnded?.(snapshot);
          }}
          onError={() => {
            setBuffering(false);
            setError("Không thể phát video này.");
          }}
        >
          {subtitleTracks.map((subtitle) => (
            <track
              key={`${subtitle.id}:${subtitle.src}`}
              kind="subtitles"
              src={subtitle.src}
              srcLang={subtitle.srclang}
              label={subtitle.label}
              default={selectedSubtitleId === subtitle.id}
            />
          ))}
        </video>
      )}

      <style>{`
        .player-subtitle-default::cue {
          color: #fff;
          background: transparent;
          font-size: 1rem;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 2px #000;
        }
        .player-subtitle-large::cue {
          color: #fff;
          background: transparent;
          font-size: 1.28rem;
          font-weight: 700;
          text-shadow: 0 3px 6px rgba(0, 0, 0, 1), 0 0 2px #000;
        }
        .player-subtitle-yellow::cue {
          color: #ffd84d;
          background: transparent;
          font-size: 1.08rem;
          font-weight: 700;
          text-shadow: 0 2px 5px rgba(0, 0, 0, 1), 0 0 2px #000;
        }
        .player-subtitle-boxed::cue {
          color: #fff;
          background: rgba(0, 0, 0, 0.78);
          font-size: 1.08rem;
          text-shadow: none;
        }
      `}</style>

      {buffering && !missingSource && !error && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/25">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-[#2dd48f]" />
        </div>
      )}

      {error && (
        <div data-player-error="true" className={`${mediaFrameClass} z-40 flex flex-col items-center justify-center bg-black/90 px-6 text-center`}>
          <div className="mb-3 text-2xl font-black text-[#2dd48f]">{error}</div>
          <p className="max-w-md text-sm text-white/65">Hãy thử chọn tập khác hoặc gửi báo lỗi để admin kiểm tra.</p>
        </div>
      )}

      {!iframeSource && !missingSource && !error && !playing && (
        <button
          type="button"
          aria-label="Phát"
          data-player-action="center-play"
          onClick={handlePlayPause}
          className="absolute left-1/2 top-1/2 z-40 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white shadow-2xl backdrop-blur-md transition-colors duration-150 hover:bg-white/30"
        >
          <span className="ml-1 transition-transform duration-150 hover:scale-105">
            <FaPlay size={34} />
          </span>
        </button>
      )}

      <div data-player-controls="true" className={`absolute inset-x-0 bottom-0 z-50 px-4 pb-3 pt-3 transition-opacity duration-200 md:px-7 ${controlsVisibleClass}`}>
        {iframeSource ? (
          <div className="pointer-events-auto">
            <ProgressBar
              currentTime={0}
              duration={0}
              disabled
              onSeek={() => {}}
            />

            <div className="flex h-16 items-center gap-2 overflow-hidden md:gap-3">
              <ControlButton
                icon={<FaPlay size={31} />}
                ariaLabel="Phát"
                action="play"
                title="Nguồn nhúng tự quản lý nút phát"
                disabled
              />
              <ControlButton
                icon={<MdReplay10 size={36} />}
                ariaLabel="Tua lùi 10 giây"
                action="rewind"
                title="Nguồn nhúng không hỗ trợ tua từ bên ngoài"
                disabled
              />
              <ControlButton
                icon={<MdForward10 size={36} />}
                ariaLabel="Tua tới 10 giây"
                action="forward"
                title="Nguồn nhúng không hỗ trợ tua từ bên ngoài"
                disabled
              />
              <ControlButton
                icon={<FaVolumeUp size={30} />}
                ariaLabel="Âm lượng"
                action="mute"
                title="Nguồn nhúng tự quản lý âm lượng"
                disabled
              />

              <div className="min-w-3 flex-1" />

              <ControlButton
                icon={<FaBug size={25} />}
                label="Báo lỗi"
                width="medium"
                action="report"
                disabled={!onReport}
                onClick={handleReport}
              />
              <ControlButton
                icon={<MdSpeed size={30} />}
                label="Tốc độ phát"
                width="medium"
                action="speed"
                title="Nguồn nhúng tự quản lý tốc độ"
                disabled
              />
              <ControlButton
                icon={<MdHighQuality size={31} />}
                label="Chất lượng"
                width="medium"
                action="quality"
                active={menu === "quality"}
                onClick={() => toggleMenu("quality")}
              />
              <ControlButton
                icon={<NextEpisodeIcon size={36} />}
                label="Tập tiếp theo"
                width="wide"
                action="next"
                disabled={!hasNextEpisode}
                onClick={handleNextEpisode}
              />
              <ControlButton
                icon={<EpisodeStackIcon size={38} />}
                label="Danh sách tập"
                width="wide"
                action="episodes"
                disabled={!onOpenEpisodeList}
                onClick={handleEpisodeList}
              />
              <ControlButton
                icon={<MdSubtitles size={33} />}
                label="Âm thanh & Phụ đề"
                width="extraWide"
                action="audio"
                title="Nguồn nhúng tự quản lý âm thanh và phụ đề"
                disabled
              />
              <ControlButton
                icon={fullscreen ? <FaCompress size={27} /> : <FaExpand size={27} />}
                ariaLabel={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
                action="fullscreen"
                onClick={handleFullscreen}
              />
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto">
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              disabled={htmlControlsDisabled}
              onSeek={handleSeek}
            />

            <div className="flex h-16 items-center gap-2 overflow-hidden md:gap-3">
              <ControlButton
                icon={playing ? <FaPause size={31} /> : <FaPlay size={31} />}
                ariaLabel={playing ? "Tạm dừng" : "Phát"}
                action="play"
                onClick={handlePlayPause}
              />
              <ControlButton
                icon={<MdReplay10 size={36} />}
                ariaLabel="Tua lùi 10 giây"
                action="rewind"
                onClick={() => handleSkip(-10)}
              />
              <ControlButton
                icon={<MdForward10 size={36} />}
                ariaLabel="Tua tới 10 giây"
                action="forward"
                onClick={() => handleSkip(10)}
              />
              <VolumeControl
                volume={volume}
                muted={muted}
                onToggleMute={handleMute}
                onVolumeChange={setVideoVolume}
              />

              <div className="min-w-3 flex-1" />

              <ControlButton
                icon={<FaBug size={25} />}
                label="Báo lỗi"
                width="medium"
                action="report"
                disabled={!onReport}
                onClick={handleReport}
              />
              <ControlButton
                icon={<MdSpeed size={30} />}
                label="Tốc độ phát"
                width="medium"
                action="speed"
                active={menu === "speed"}
                onClick={() => toggleMenu("speed")}
              />
              <ControlButton
                icon={<MdHighQuality size={31} />}
                label="Chất lượng"
                width="medium"
                action="quality"
                active={menu === "quality"}
                onClick={() => toggleMenu("quality")}
              />
              <ControlButton
                icon={<NextEpisodeIcon size={36} />}
                label="Tập tiếp theo"
                width="wide"
                action="next"
                disabled={!hasNextEpisode}
                onClick={handleNextEpisode}
              />
              <ControlButton
                icon={<EpisodeStackIcon size={38} />}
                label="Danh sách tập"
                width="wide"
                action="episodes"
                disabled={!onOpenEpisodeList}
                onClick={handleEpisodeList}
              />
              <ControlButton
                icon={<MdSubtitles size={33} />}
                label="Âm thanh & Phụ đề"
                width="extraWide"
                action="audio"
                active={menu === "audio" || selectedSubtitleId !== "off"}
                onClick={() => toggleMenu("audio")}
              />
              <ControlButton
                icon={fullscreen ? <FaCompress size={27} /> : <FaExpand size={27} />}
                ariaLabel={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
                action="fullscreen"
                onClick={handleFullscreen}
              />
            </div>
          </div>
        )}
      </div>

      <SpeedMenu
        open={menu === "speed" && !iframeSource}
        playbackRate={playbackRate}
        onSelect={handleSelectSpeed}
      />
      <QualityMenu open={menu === "quality"} />
      <AudioSubtitleMenu
        open={menu === "audio" && !iframeSource}
        subtitleTracks={subtitleTracks}
        selectedSubtitleId={selectedSubtitleId}
        playerSettings={mergedSettings}
        onPlayerSettingChange={onPlayerSettingChange}
        onSelectSubtitleTrack={handleSelectSubtitleTrack}
        onSelectSubtitleStyle={handleSelectSubtitleStyle}
      />
    </div>
  );

  return fullscreen && typeof document !== "undefined"
    ? createPortal(playerContent, document.body)
    : playerContent;
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
