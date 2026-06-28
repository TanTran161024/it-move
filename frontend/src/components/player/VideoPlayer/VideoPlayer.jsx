import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from "react";
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
    <div className="absolute right-4 bottom-16 min-w-[260px] bg-black/90 backdrop-blur-md rounded-xl shadow-2xl p-2 z-[3000] border border-white/10 text-white animate-in slide-in-from-bottom-2 fade-in">
      <div className="flex items-center gap-2 font-bold text-lg p-3 mb-1 border-b border-white/10">
        <button className="p-1 hover:bg-white/10 rounded-full transition-colors" onClick={onBack}><MdChevronLeft size={24} /></button>
        <span>Tốc độ</span>
      </div>
      <div className="flex flex-col gap-1">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
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

function QualityMenu({ open, onBack }) {
  if (!open) return null;
  return (
    <div className="absolute right-4 bottom-16 min-w-[260px] bg-black/90 backdrop-blur-md rounded-xl shadow-2xl p-2 z-[3000] border border-white/10 text-white animate-in slide-in-from-bottom-2 fade-in">
      <div className="flex items-center gap-2 font-bold text-lg p-3 mb-1 border-b border-white/10">
        <button className="p-1 hover:bg-white/10 rounded-full transition-colors" onClick={onBack}><MdChevronLeft size={24} /></button>
        <span>Chất lượng</span>
      </div>
      <div className="flex flex-col gap-1">
        <button className="flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium bg-primary/20 text-primary transition-colors">
          <span>Auto</span>
          <MdCheck size={20} />
        </button>
      </div>
    </div>
  );
}

function SettingsMenu({ open, onSpeedClick, onQualityClick }) {
  if (!open) return null;
  return (
    <div className="absolute right-4 bottom-16 min-w-[260px] bg-black/90 backdrop-blur-md rounded-xl shadow-2xl p-2 z-[3000] border border-white/10 text-white animate-in slide-in-from-bottom-2 fade-in">
      <div className="font-bold text-lg p-3 mb-1 border-b border-white/10">Cài đặt</div>
      <div className="flex flex-col gap-1">
        <button className="flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors group" onClick={onQualityClick}>
          <span>Chất lượng</span>
          <div className="flex items-center gap-1 text-white/50 group-hover:text-white">
            <span>Auto</span>
            <MdChevronRight size={20} />
          </div>
        </button>
        <button className="flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors group" onClick={onSpeedClick}>
          <span>Tốc độ</span>
          <div className="flex items-center gap-1 text-white/50 group-hover:text-white">
            <span>1x</span>
            <MdChevronRight size={20} />
          </div>
        </button>
      </div>
    </div>
  );
}

const VideoPlayer = forwardRef(({ src, poster, className = "" }, ref) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
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

  // Auto-hide controls
  useEffect(() => {
    const resetHideTimeout = () => {
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
      if (playing) {
        hideControlsTimeout.current = setTimeout(() => {
          if (!settingsOpen && !speedMenuOpen && !qualityMenuOpen) {
            setShowControls(false);
          }
        }, 3000);
      } else {
        setShowControls(true);
      }
    };
    resetHideTimeout();
    return () => clearTimeout(hideControlsTimeout.current);
  }, [playing, fullscreen, settingsOpen, speedMenuOpen, qualityMenuOpen]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    if (playing) {
      hideControlsTimeout.current = setTimeout(() => {
        if (!settingsOpen && !speedMenuOpen && !qualityMenuOpen) {
          setShowControls(false);
        }
      }, 3000);
    }
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
    const container = containerRef.current;
    if (!container) return;
    
    if (!fullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
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

  const handleSelectSpeed = (speed) => {
    setPlaybackRate(speed);
    if (videoRef.current && !iframeSource) {
      videoRef.current.playbackRate = speed;
    }
    setSpeedMenuOpen(false);
    setSettingsOpen(false);
  };

  const closeMenus = () => {
    setSettingsOpen(false);
    setSpeedMenuOpen(false);
    setQualityMenuOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black flex flex-col justify-center items-center overflow-hidden group ${fullscreen ? 'fixed inset-0 z-[9999]' : ''} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {isMissingSource(src) ? (
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
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      )}

      {/* Custom Controls Overlay */}
      {!iframeSource && (
        <div 
          className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent ${showControls ? 'opacity-100' : 'opacity-0'}`}
        >
          {/* Clickable area for menu closing */}
          <div className="absolute inset-0 z-0 pointer-events-auto" onClick={closeMenus} />

          <div className="relative z-10 w-full px-4 md:px-6 pb-4 pointer-events-auto flex flex-col gap-2">
            
            {/* Progress Bar */}
            <div className="flex items-center gap-3 w-full group/progress">
              <span className="text-white/90 text-xs font-medium w-10 text-center">{formatTime(currentTime)}</span>
              <div className="relative flex-1 h-1.5 md:h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden transition-all group-hover/progress:h-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={duration ? (currentTime / duration) * 100 : 0}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-primary rounded-full z-10 pointer-events-none"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-white/90 text-xs font-medium w-10 text-center">{formatTime(duration)}</span>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between w-full pt-2">
              {/* Left Controls */}
              <div className="flex items-center gap-3 md:gap-5">
                <button 
                  className="text-white hover:text-primary transition-colors focus:outline-none"
                  onClick={handlePlayPause}
                >
                  {playing ? <FaPause size={20} /> : <FaPlay size={20} />}
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={() => handleSkip(-10)}>
                  <MdReplay10 size={24} />
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={() => handleSkip(10)}>
                  <MdForward10 size={24} />
                </button>
                
                <div className="flex items-center gap-2 group/volume relative">
                  <button className="text-white hover:text-primary transition-colors focus:outline-none" onClick={handleMute}>
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
                    />
                  </div>
                </div>
              </div>

              {/* Right Controls */}
              <div className="flex items-center gap-4 md:gap-5">
                <button className="text-white hover:text-primary transition-colors focus:outline-none hidden sm:block" onClick={handlePiP} title="Picture in Picture">
                  <FaRegWindowRestore size={18} />
                </button>
                <button
                  className={`text-white hover:text-primary transition-colors focus:outline-none ${(settingsOpen || speedMenuOpen || qualityMenuOpen) ? 'text-primary' : ''}`}
                  title="Cài đặt"
                  onClick={() => {
                    setSettingsOpen((v) => !v);
                    setSpeedMenuOpen(false);
                    setQualityMenuOpen(false);
                  }}
                >
                  <FaCog size={20} />
                </button>
                <button className="text-white hover:text-primary transition-colors focus:outline-none" onClick={handleFullscreen}>
                  {fullscreen ? <FaCompress size={20} /> : <FaExpand size={20} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Menus Overlays */}
      {!iframeSource && (
        <>
          <SettingsMenu
            open={settingsOpen && !speedMenuOpen && !qualityMenuOpen}
            onSpeedClick={() => { setSpeedMenuOpen(true); setSettingsOpen(false); }}
            onQualityClick={() => { setQualityMenuOpen(true); setSettingsOpen(false); }}
          />
          <SpeedMenu open={speedMenuOpen} onBack={() => { setSpeedMenuOpen(false); setSettingsOpen(true); }} currentSpeed={playbackRate} onSelect={handleSelectSpeed} />
          <QualityMenu open={qualityMenuOpen} onBack={() => { setQualityMenuOpen(false); setSettingsOpen(true); }} />
        </>
      )}
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer; 
