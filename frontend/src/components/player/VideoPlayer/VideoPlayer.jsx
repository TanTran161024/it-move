import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from "react";
import "./VideoPlayer.css";
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaRegWindowRestore,
  FaCog,
  FaExpand,
  FaCompress
} from "react-icons/fa";
import { MdReplay10, MdForward10, MdChevronRight, MdChevronLeft, MdCheck } from "react-icons/md";

const formatTime = (time) => {
  if (isNaN(time)) return "00:00";
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const SPEEDS = [0.25, 0.5, 1, 1.25, 1.5, 2];

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
    <div className="vp-settings-menu">
      <div className="vp-settings-title vp-settings-title-row">
        <button className="vp-settings-back" onClick={onBack}><MdChevronLeft /></button>
        <span>Tốc độ</span>
      </div>
      {SPEEDS.map((speed) => (
        <div
          key={speed}
          className={`vp-settings-item${currentSpeed === speed ? " selected" : ""}`}
          onClick={() => onSelect(speed)}
        >
          <span>{speed}x</span>
          {currentSpeed === speed && <MdCheck className="vp-settings-check" />}
        </div>
      ))}
    </div>
  );
}

function QualityMenu({ open, onBack }) {
  if (!open) return null;
  return (
    <div className="vp-settings-menu">
      <div className="vp-settings-title vp-settings-title-row">
        <button className="vp-settings-back" onClick={onBack}><MdChevronLeft /></button>
        <span>Chất lượng</span>
      </div>
      <div className="vp-settings-item selected">
        <span>Auto</span>
        <MdCheck className="vp-settings-check" />
      </div>
    </div>
  );
}

function SettingsMenu({ open, onClose, anchorRef, onSpeedClick, onQualityClick }) {
  if (!open) return null;
  return (
    <div className="vp-settings-menu">
      <div className="vp-settings-title">Cài đặt</div>
      <div className="vp-settings-item" onClick={onQualityClick}>
        <span>Chất lượng</span>
        <span className="vp-settings-value">Auto</span>
        <MdChevronRight className="vp-settings-arrow" />
      </div>
      <div className="vp-settings-item" onClick={onSpeedClick}>
        <span>Tốc độ</span>
        <span className="vp-settings-value">1x</span>
        <MdChevronRight className="vp-settings-arrow" />
      </div>
    </div>
  );
}

const VideoPlayer = forwardRef(({ src, poster, className = "" }, ref) => {
  const videoRef = useRef(null);
  useImperativeHandle(ref, () => videoRef.current);
  const iframeSource = isIframeSource(src);
  const playableSource = getPlayableSource(src);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef(null);
  const settingsBtnRef = useRef(null);

  // Fullscreen logic
  useEffect(() => {
    function onFullscreenChange() {
      const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      setFullscreen(!!isFull);
      setShowControls(true);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("msfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      document.removeEventListener("msfullscreenchange", onFullscreenChange);
    };
  }, []);

  // Auto-hide controls in fullscreen
  useEffect(() => {
    if (!fullscreen) {
      setShowControls(true);
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
      return;
    }
    // Khi controls hiện, set timeout để ẩn sau 2s
    if (showControls) {
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
    return () => {
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    };
  }, [fullscreen, showControls]);

  // Mouse move show controls in fullscreen
  const handleMouseMove = () => {
    if (!fullscreen) return;
    setShowControls(true);
  };

  const handlePlayPause = () => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      video.playbackRate = playbackRate;
    }
  };

  const handleSeek = (e) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !duration) return;
    const seekTime = (e.target.value / 100) * duration;
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleVolume = (e) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    const vol = parseFloat(e.target.value);
    video.volume = vol;
    setVolume(vol);
    setMuted(vol === 0);
  };

  const handleMute = () => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  const handleFullscreen = () => {
    const container = document.querySelector(".video-player-section");
    if (!fullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
      setFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setFullscreen(false);
    }
  };

  const handleSkip = (seconds) => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (!video || !duration) return;
    const newTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Picture-in-Picture
  const handlePiP = () => {
    if (iframeSource) return;
    const video = videoRef.current;
    if (video && document.pictureInPictureEnabled && !video.disablePictureInPicture) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else {
        video.requestPictureInPicture();
      }
    }
  };

  // Đổi tốc độ phát
  const handleSelectSpeed = (speed) => {
    setPlaybackRate(speed);
    if (videoRef.current && !iframeSource) {
      videoRef.current.playbackRate = speed;
    }
    setSpeedMenuOpen(false);
    setSettingsOpen(false);
  };

  return (
    <div
      className={`video-player-container-modern ${className}`}
      style={{ position: 'relative' }}
      onMouseMove={handleMouseMove}
    >
      <div className="video-player-section">
        {isMissingSource(src) ? (
          <div className="vp-source-empty">
            <div className="vp-source-empty-title">Phim chưa có nguồn phát</div>
            <div className="vp-source-empty-text">
              Tập này chưa có link KKPhim hợp lệ hoặc đang dùng link mẫu cũ.
            </div>
          </div>
        ) : iframeSource ? (
          <iframe
            className="vp-video-player"
            src={playableSource}
            title="Movie player"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : (
          <video
            className="vp-video-player"
            ref={videoRef}
            poster={poster}
            src={src}
            onClick={handlePlayPause}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
          />
        )}
        {/* Progress Bar */}
        {!iframeSource && <div className="vp-progress-bar-modern" style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
          <span className="vp-time vp-time-start">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={duration ? (currentTime / duration) * 100 : 0}
            onChange={handleSeek}
            className="vp-progress-slider-modern"
          />
          <span className="vp-time vp-time-end">{formatTime(duration)}</span>
        </div>}
        {/* Controls */}
        {!iframeSource && <div
          className="vp-controls-modern vp-controls-flex"
          style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.3s' }}
        >
          <div className="vp-controls-left">
            <button className="vp-control-btn-modern vp-play-btn" onClick={handlePlayPause}>
              {playing ? <FaPause /> : <FaPlay />}
            </button>
            <button className="vp-control-btn-modern vp-seek-btn" onClick={() => handleSkip(-10)}>
              <MdReplay10 />
            </button>
            <button className="vp-control-btn-modern vp-seek-btn" onClick={() => handleSkip(10)}>
              <MdForward10 />
            </button>
            <button className="vp-control-btn-modern" onClick={handleMute}>
              {muted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={handleVolume}
              className="vp-volume-slider-modern"
            />
          </div>
          <div className="vp-controls-right">
            <button className="vp-control-btn-modern" onClick={handlePiP} title="Picture in Picture">
              <FaRegWindowRestore />
            </button>
            <button
              className="vp-control-btn-modern"
              title="Cài đặt"
              ref={settingsBtnRef}
              onClick={() => {
                setSettingsOpen((v) => !v);
                setSpeedMenuOpen(false);
                setQualityMenuOpen(false);
              }}
            >
              <FaCog />
            </button>
            <button className="vp-control-btn-modern" onClick={handleFullscreen}>
              {fullscreen ? <FaCompress /> : <FaExpand />}
            </button>
          </div>
        </div>}
        {/* Settings Menus */}
        {!iframeSource && <SettingsMenu
          open={settingsOpen && !speedMenuOpen && !qualityMenuOpen}
          onClose={() => setSettingsOpen(false)}
          anchorRef={settingsBtnRef}
          onSpeedClick={() => {
            setSpeedMenuOpen(true);
            setQualityMenuOpen(false);
          }}
          onQualityClick={() => {
            setQualityMenuOpen(true);
            setSpeedMenuOpen(false);
          }}
        />}
        {!iframeSource && <SpeedMenu
          open={speedMenuOpen}
          onBack={() => setSpeedMenuOpen(false)}
          currentSpeed={playbackRate}
          onSelect={handleSelectSpeed}
        />}
        {!iframeSource && <QualityMenu
          open={qualityMenuOpen}
          onBack={() => setQualityMenuOpen(false)}
        />}
      </div>
    </div>
  );
});

export default VideoPlayer; 
