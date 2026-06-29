import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from "react";
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaRegWindowRestore,
  FaCog,
  FaExpand,
  FaCompress,
} from "react-icons/fa";
import { MdReplay10, MdForward10, MdChevronRight, MdChevronLeft, MdCheck } from "react-icons/md";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(time) {
  if (!Number.isFinite(time)) return "00:00";
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isMissingSource(src) {
  return !src || src.includes("example.com") || src.includes("localhost/videos/");
}

function isIframeSource(src) {
  if (typeof src !== "string") return false;
  return src.includes("player.phimapi.com/player") || src.includes(".m3u8");
}

function getPlayableSource(src) {
  if (typeof src !== "string") return "";
  if (src.includes("player.phimapi.com/player")) return src;
  if (src.includes(".m3u8")) {
    return `https://player.phimapi.com/player/?url=${encodeURIComponent(src)}`;
  }
  return src;
}

function SpeedMenu({ open, onBack, currentSpeed, onSelect }) {
  if (!open) return null;
  return (
    <div className="absolute right-4 bottom-16 min-w-[240px] bg-black/90 backdrop-blur-md rounded-xl shadow-2xl p-2 z-[3000] border border-white/10 text-white">
      <div className="flex items-center gap-2 font-bold text-lg p-3 mb-1 border-b border-white/10">
        <button className="p-1 hover:bg-white/10 rounded-full transition-colors" onClick={onBack} type="button">
          <MdChevronLeft size={24} />
        </button>
        <span>Tốc độ</span>
      </div>
      <div className="flex flex-col gap-1">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={`flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium transition-colors ${currentSpeed === speed ? "bg-primary/20 text-primary" : "hover:bg-white/10"}`}
            onClick={() => onSelect(speed)}
          >
            <span>{speed}x</span>
            {currentSpeed === speed && <MdCheck size={20} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsMenu({ open, onSpeedClick, playbackRate }) {
  if (!open) return null;
  return (
    <div className="absolute right-4 bottom-16 min-w-[240px] bg-black/90 backdrop-blur-md rounded-xl shadow-2xl p-2 z-[3000] border border-white/10 text-white">
      <div className="font-bold text-lg p-3 mb-1 border-b border-white/10">Cài đặt</div>
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors group"
        onClick={onSpeedClick}
      >
        <span>Tốc độ</span>
        <div className="flex items-center gap-1 text-white/50 group-hover:text-white">
          <span>{playbackRate}x</span>
          <MdChevronRight size={20} />
        </div>
      </button>
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
}, ref) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideControlsTimeout = useRef(null);

  const iframeSource = isIframeSource(src);
  const missingSource = isMissingSource(src);
  const playableSource = getPlayableSource(src);

  useImperativeHandle(ref, () => videoRef.current);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(Boolean(src && !missingSource));
  const [error, setError] = useState("");

  const closeMenus = () => {
    setSettingsOpen(false);
    setSpeedMenuOpen(false);
  };

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
    if (iframeSource) return;
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
  }, [emitSnapshot, iframeSource]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) setCurrentTime(video.currentTime);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    video.playbackRate = playbackRate;
    setLoading(false);

    if (resumeAt > 5 && Number.isFinite(video.duration) && resumeAt < video.duration * 0.9) {
      video.currentTime = resumeAt;
      setCurrentTime(resumeAt);
    }
  };

  const handleSeek = (event) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !duration) return;
    const seekTime = (Number(event.target.value) / 100) * duration;
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const setVideoVolume = useCallback((nextVolume) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    const normalized = Math.max(0, Math.min(1, nextVolume));
    video.volume = normalized;
    video.muted = normalized === 0;
    setVolume(normalized);
    setMuted(normalized === 0);
  }, [iframeSource]);

  const handleVolume = (event) => {
    setVideoVolume(Number(event.target.value));
  };

  const handleMute = useCallback(() => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.muted && volume === 0) {
      setVideoVolume(0.5);
      return;
    }
    video.muted = !video.muted;
    setMuted(video.muted);
  }, [iframeSource, setVideoVolume, volume]);

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleSkip = useCallback((seconds) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !duration) return;
    const nextTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration, iframeSource]);

  const handlePiP = async () => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || video.disablePictureInPicture) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // Browser can reject PiP depending on focus/device policy.
    }
  };

  const handleSelectSpeed = (speed) => {
    setPlaybackRate(speed);
    if (videoRef.current && !iframeSource) videoRef.current.playbackRate = speed;
    closeMenus();
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    if (playing) {
      hideControlsTimeout.current = setTimeout(() => {
        if (!settingsOpen && !speedMenuOpen) setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
      setShowControls(true);
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSettingsOpen(false);
    setSpeedMenuOpen(false);
    setError("");
    setLoading(Boolean(src && !missingSource));
  }, [src, missingSource]);

  useEffect(() => {
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    if (playing) {
      hideControlsTimeout.current = setTimeout(() => {
        if (!settingsOpen && !speedMenuOpen) setShowControls(false);
      }, 3000);
    } else {
      setShowControls(true);
    }
    return () => clearTimeout(hideControlsTimeout.current);
  }, [playing, settingsOpen, speedMenuOpen]);

  useEffect(() => {
    if (iframeSource) return undefined;

    const handleKeyDown = (event) => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;

      const shortcutKeys = [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "f", "F", "m", "M"];
      if (!shortcutKeys.includes(event.key)) return;
      event.preventDefault();

      if (event.key === " ") handlePlayPause();
      if (event.key === "ArrowLeft") handleSkip(-10);
      if (event.key === "ArrowRight") handleSkip(10);
      if (event.key === "ArrowUp") setVideoVolume(volume + 0.1);
      if (event.key === "ArrowDown") setVideoVolume(volume - 0.1);
      if (event.key === "f" || event.key === "F") handleFullscreen();
      if (event.key === "m" || event.key === "M") handleMute();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [iframeSource, volume, duration, playing, fullscreen, muted, handleFullscreen, handleMute, handlePlayPause, handleSkip, setVideoVolume]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black flex flex-col justify-center items-center overflow-hidden group ${fullscreen ? "fixed inset-0 z-[9999]" : ""} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {missingSource ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-black/80 to-[#111] text-center z-10">
          <div className="text-primary text-2xl md:text-3xl font-black mb-4">Phim chưa có nguồn phát</div>
          <p className="text-white/70 max-w-lg">Tập này chưa có link phim hợp lệ hoặc đang dùng link mẫu cũ.</p>
        </div>
      ) : iframeSource ? (
        <iframe
          className="w-full h-full object-cover"
          src={playableSource}
          title="Movie player"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
        />
      ) : (
        <video
          className="w-full h-full object-contain cursor-pointer"
          ref={videoRef}
          poster={poster}
          src={src}
          onClick={handlePlayPause}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError("Không thể phát video này.");
          }}
          onPause={() => {
            setPlaying(false);
            emitSnapshot();
          }}
          onPlay={() => setPlaying(true)}
          onEnded={() => {
            setPlaying(false);
            const snapshot = emitSnapshot();
            onEnded?.(snapshot);
          }}
        />
      )}

      {loading && !missingSource && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white z-20 pointer-events-none">
          <div className="h-10 w-10 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-center p-6 z-30">
          <div className="text-primary text-xl md:text-2xl font-black mb-3">{error}</div>
          <p className="text-white/70">Hãy thử chọn tập khác hoặc gửi báo lỗi để admin kiểm tra.</p>
        </div>
      )}

      {!iframeSource && !missingSource && !error && (
        <div
          className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent ${showControls ? "opacity-100" : "opacity-0"}`}
        >
          <div className="absolute inset-0 z-0 pointer-events-auto" onClick={closeMenus} />

          <div className="relative z-10 w-full px-4 md:px-6 pb-4 pointer-events-auto flex flex-col gap-2">
            <div className="flex items-center gap-3 w-full group/progress">
              <span className="text-white/90 text-xs font-medium w-12 text-center">{formatTime(currentTime)}</span>
              <div className="relative flex-1 h-1.5 md:h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden transition-all group-hover/progress:h-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={duration ? (currentTime / duration) * 100 : 0}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  aria-label="Tiến trình phát"
                />
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary rounded-full z-10 pointer-events-none"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-white/90 text-xs font-medium w-12 text-center">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center justify-between w-full pt-2">
              <div className="flex items-center gap-3 md:gap-5">
                <button className="text-white hover:text-primary transition-colors focus:outline-none" onClick={handlePlayPause} type="button" aria-label={playing ? "Tạm dừng" : "Phát"}>
                  {playing ? <FaPause size={20} /> : <FaPlay size={20} />}
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={() => handleSkip(-10)} type="button" aria-label="Tua lùi 10 giây">
                  <MdReplay10 size={24} />
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={() => handleSkip(10)} type="button" aria-label="Tua tới 10 giây">
                  <MdForward10 size={24} />
                </button>

                <div className="flex items-center gap-2 group/volume relative">
                  <button className="text-white hover:text-primary transition-colors focus:outline-none" onClick={handleMute} type="button" aria-label={muted || volume === 0 ? "Bật âm" : "Tắt âm"}>
                    {muted || volume === 0 ? <FaVolumeMute size={20} /> : <FaVolumeUp size={20} />}
                  </button>
                  <div className="w-0 overflow-hidden group-hover/volume:w-20 sm:w-20 transition-all duration-300 ease-in-out flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={muted ? 0 : volume}
                      onChange={handleVolume}
                      className="w-full h-1.5 md:h-2 bg-white/20 rounded-full appearance-none outline-none accent-primary cursor-pointer"
                      aria-label="Âm lượng"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 md:gap-5">
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={handlePiP} title="Picture in Picture" type="button">
                  <FaRegWindowRestore size={18} />
                </button>
                <button
                  className={`text-white hover:text-primary transition-colors focus:outline-none ${(settingsOpen || speedMenuOpen) ? "text-primary" : ""}`}
                  title="Cài đặt"
                  onClick={() => {
                    setSettingsOpen((value) => !value);
                    setSpeedMenuOpen(false);
                  }}
                  type="button"
                >
                  <FaCog size={20} />
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none" onClick={handleFullscreen} type="button" aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}>
                  {fullscreen ? <FaCompress size={20} /> : <FaExpand size={20} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!iframeSource && !missingSource && !error && (
        <>
          <SettingsMenu
            open={settingsOpen && !speedMenuOpen}
            onSpeedClick={() => {
              setSpeedMenuOpen(true);
              setSettingsOpen(false);
            }}
            playbackRate={playbackRate}
          />
          <SpeedMenu
            open={speedMenuOpen}
            onBack={() => {
              setSpeedMenuOpen(false);
              setSettingsOpen(true);
            }}
            currentSpeed={playbackRate}
            onSelect={handleSelectSpeed}
          />
        </>
      )}
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
