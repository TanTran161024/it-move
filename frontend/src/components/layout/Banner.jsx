import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InlineIcon from '../common/InlineIcon';
import { API_BASE_URL as API } from '../../config/api';

const BANNER_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23060606'/%3E%3Cstop offset='1' stop-color='%23161616'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1280' height='720' fill='url(%23g)'/%3E%3Cpath d='M520 250v220l190-110z' fill='%23E50914' fill-opacity='.55'/%3E%3C/svg%3E";

function snakeToCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/([-_][a-z])/g, g => g[1].toUpperCase()),
        snakeToCamel(v)
      ])
    );
  }
  return obj;
}

function decodeEntities(str) {
  if (!str) return '';
  return str.replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
}

function parseBannerFields(banner) {
  return {
    ...banner,
    badges: Array.isArray(banner.badges) ? banner.badges : (banner.badges ? JSON.parse(banner.badges) : []),
    tags: Array.isArray(banner.tags) ? banner.tags : (banner.tags ? JSON.parse(banner.tags) : []),
    thumbnails: Array.isArray(banner.thumbnails) ? banner.thumbnails : (banner.thumbnails ? JSON.parse(banner.thumbnails) : []),
  };
}

function resizeTmdbImage(url, size) {
  if (typeof url !== 'string' || !url.trim() || /static\.nutscdn\.com/i.test(url)) {
    return BANNER_FALLBACK_IMAGE;
  }
  return url.replace('/t/p/original/', `/t/p/${size}/`);
}

const MAX_BANNERS = 6;

export default function Banner() {
  const [banners, setBanners] = useState([]);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const [dragStartX, setDragStartX] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const thumbContainerRef = React.useRef(null);

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const scrollThumbs = (e, direction) => {
    e.stopPropagation();
    if (thumbContainerRef.current) {
      const scrollAmount = window.innerWidth > 768 ? 300 : 150;
      thumbContainerRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    fetch(`${API}/api/banners`)
      .then(res => res.json())
      .then(data => setBanners(data.map(snakeToCamel).map(parseBannerFields)))
      .catch(() => setBanners([]));
  }, []);

  const displayBanners = banners.slice(0, MAX_BANNERS);
  const banner = displayBanners[selected];
  const bannerTitle = banner?.movieTitle || banner?.name || 'IT Move';

  useEffect(() => {
    if (displayBanners.length === 0 || isPaused) return;
    const interval = setInterval(() => {
      setSelected((prev) => (prev + 1) % displayBanners.length);
    }, 10000); // Auto change every 10s like Netflix
    return () => clearInterval(interval);
  }, [displayBanners.length, isPaused, selected]);

  if (!banner) {
    return (
      <div className="relative w-full h-[85vh] md:h-[95vh] lg:h-[100vh] min-h-[600px] flex items-center justify-center overflow-hidden bg-background text-text-secondary">
        <div className="animate-pulse w-full h-full bg-surface/50" />
      </div>
    );
  }

  const handleBannerChange = (newIndex) => {
    setSelected(newIndex);
    setVideoLoaded(false); // Reset video load state when banner changes
  };

  const handleDragStart = (clientX) => {
    setDragStartX(clientX);
    setDragging(true);
  };

  const handleDragMove = (clientX) => {
    if (!dragging || dragStartX === null) return;
    const deltaX = clientX - dragStartX;
    if (Math.abs(deltaX) > 60) {
      if (deltaX > 0 && selected > 0) {
        handleBannerChange(selected - 1);
      } else if (deltaX < 0 && selected < displayBanners.length - 1) {
        handleBannerChange(selected + 1);
      } else if (deltaX < 0 && selected === displayBanners.length - 1) {
         handleBannerChange(0); // loop back
      } else if (deltaX > 0 && selected === 0) {
         handleBannerChange(displayBanners.length - 1);
      }
      setDragging(false);
      setDragStartX(null);
    }
  };

  const handleDragEnd = () => {
    setDragging(false);
    setDragStartX(null);
  };

  return (
    <div 
      className="relative w-full h-[85vh] md:h-[95vh] lg:h-[100vh] min-h-[600px] flex items-center justify-start overflow-hidden bg-background cursor-grab active:cursor-grabbing select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseDown={(e) => handleDragStart(e.clientX)}
      onMouseMove={(e) => handleDragMove(e.clientX)}
      onMouseUp={handleDragEnd}
      onMouseLeave={() => { setIsPaused(false); handleDragEnd(); }}
      onTouchStart={(e) => {
        setIsPaused(true);
        if (e.touches && e.touches.length === 1) handleDragStart(e.touches[0].clientX);
      }}
      onTouchMove={(e) => {
        if (e.touches && e.touches.length === 1) handleDragMove(e.touches[0].clientX);
      }}
      onTouchEnd={() => { setIsPaused(false); handleDragEnd(); }}
    >
      <div
          key={`banner-bg-${selected}`}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Background image or video */}
          <div className="absolute inset-0 w-full h-full bg-[#080808]">
            <img
              src={resizeTmdbImage(banner.bgUrl, 'w1280')}
              srcSet={[
                resizeTmdbImage(banner.bgUrl, 'w780') ? `${resizeTmdbImage(banner.bgUrl, 'w780')} 780w` : null,
                resizeTmdbImage(banner.bgUrl, 'w1280') ? `${resizeTmdbImage(banner.bgUrl, 'w1280')} 1280w` : null,
              ].filter(Boolean).join(', ')}
              sizes="100vw"
              alt={`Ảnh nền ${bannerTitle}`}
              fetchPriority="high"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${banner.trailerUrl && videoLoaded ? 'opacity-0' : 'opacity-100'}`}
              draggable="false"
            />
            {banner.trailerUrl && (
              <video
                src={banner.trailerUrl}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onCanPlay={() => setTimeout(() => setVideoLoaded(true), 1500)} // Delay for transition
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
          </div>
          {/* Gradients for blending */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent w-[95%] md:w-[75%]" />
          <div className="absolute bottom-0 left-0 right-0 h-[60vh] bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-[16px] md:px-[32px] lg:px-[48px] xl:px-[72px] h-full flex flex-col justify-end pt-[100px] pb-[90px] md:pb-[140px]">
          <div
            key={`banner-content-${selected}`}
            className="w-full md:w-[70%] lg:w-[60%] xl:w-[55%] flex flex-col gap-4 md:gap-5"
          >
            {/* Title / Title Image */}
            {banner.titleUrl ? (
              <img
                src={banner.titleUrl}
                alt={bannerTitle}
                className="w-[80%] md:w-full max-w-[400px] lg:max-w-[500px] drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
                draggable="false"
              />
            ) : (
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-heading font-black leading-tight tracking-tight line-clamp-2 pb-1 md:pb-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-purple-400 to-pink-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                  {bannerTitle}
                </span>
              </h1>
            )}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm font-bold tracking-wide mt-1 md:mt-2">
              {banner.imdbRating && (
                <div className="flex items-center gap-1 border border-[#f5c518]/80 rounded px-2.5 py-1 text-[#f5c518] bg-black/50 backdrop-blur-md shadow-[0_0_10px_rgba(245,197,24,0.3)]">
                  <span>IMDb</span>
                  <span className="text-white drop-shadow-md">{Number(banner.imdbRating).toFixed(1)}</span>
                </div>
              )}
              {banner.quality && (
                <div className="px-2.5 py-1 rounded bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)]">
                  {banner.quality}
                </div>
              )}
              {banner.ageLimit && (
                <div className="px-2.5 py-1 rounded border border-red-500/50 text-red-200 bg-red-950/40 backdrop-blur-md shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                  {banner.ageLimit}
                </div>
              )}
              {banner.releaseYear && (
                <div className="px-2.5 py-1 rounded border border-white/20 text-white/90 bg-white/5 backdrop-blur-md">
                  {banner.releaseYear}
                </div>
              )}
              {banner.duration && (
                <div className="px-2.5 py-1 rounded border border-white/20 text-white/90 bg-white/5 backdrop-blur-md">
                  {banner.duration}
                </div>
              )}
            </div>

            {/* Tags/Genres */}
            {banner.genres && banner.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-1 md:mt-2">
                {banner.genres.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); navigate(`/movies?genre=${encodeURIComponent(tag)}`); }}
                    className="text-xs md:text-sm px-3.5 py-1.5 bg-black/40 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-900/40 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_15px_rgba(6,182,212,0.5)] rounded-full transition-all duration-300 backdrop-blur-sm"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Description */}
            <p className="text-white/85 text-sm md:text-base lg:text-lg max-w-xl line-clamp-2 md:line-clamp-3 leading-relaxed drop-shadow-lg font-medium mt-1 md:mt-2">
              {decodeEntities(banner.description || banner.desc || "Không có mô tả cho phim này.")}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-4 mt-4 md:mt-6">
              <button
                onClick={() => navigate(`/watch/${banner.movieId || banner.movie_id || banner.id}`)}
                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(236,72,153,0.5)] hover:shadow-[0_0_30px_rgba(236,72,153,0.7)] group border border-pink-400/30"
              >
                <InlineIcon name="play" size={28} className="drop-shadow-md group-hover:scale-110 transition-transform" />
                <span className="drop-shadow-md">Phát</span>
              </button>
              
              <button
                onClick={() => navigate(`/movies/${banner.movieId || banner.movie_id || banner.id}`)}
                aria-label={`Xem chi tiết ${bannerTitle}`}
                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/50 text-white backdrop-blur-md rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                <InlineIcon name="info" size={28} />
                <span className="hidden sm:inline">Chi tiết</span>
              </button>

              <button
                type="button"
                aria-label={`Thêm ${bannerTitle} vào danh sách yêu thích`}
                className="w-14 h-14 bg-white/5 hover:bg-red-500/20 border border-white/20 hover:border-red-500/50 text-white hover:text-red-400 backdrop-blur-md rounded-full transition-all duration-300 hover:scale-110 flex items-center justify-center shadow-lg hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] group"
              >
                <InlineIcon name="heart" size={26} className="group-hover:scale-110 transition-transform" />
              </button>
              
              {/* Mute Button */}
              {banner.trailerUrl && (
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                  aria-label={isMuted ? 'Bật âm thanh trailer' : 'Tắt âm thanh trailer'}
                  className="w-12 h-12 ml-auto bg-transparent border border-white/40 hover:bg-white/10 hover:border-white text-white backdrop-blur-md rounded-full transition-all duration-300 hover:scale-110 flex items-center justify-center"
                >
                  {isMuted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
              )}
            </div>
          </div>
      </div>

      {/* Thumbnail Navigation */}
      <div 
        className="absolute bottom-[80px] md:bottom-[130px] right-[16px] md:right-[32px] lg:right-[48px] xl:right-[72px] z-20 flex items-center group/thumbs rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => scrollThumbs(e, 'left')}
          aria-label="Cuộn thumbnail hero sang trái"
          className="hidden md:flex absolute left-0 z-30 w-10 h-[80%] items-center justify-center bg-gradient-to-r from-black/90 to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity rounded-l-lg"
        >
          <InlineIcon name="chevronLeft" size={18} />
        </button>

        <div 
          ref={thumbContainerRef}
          className="flex gap-3 overflow-x-auto max-w-[80vw] md:max-w-[45vw] lg:max-w-[35vw] py-4 px-2 hide-scrollbar scroll-smooth"
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          {displayBanners.map((b, idx) => (
            <button
              type="button"
              key={b.id || idx}
              onClick={(e) => { e.stopPropagation(); handleBannerChange(idx); }}
              aria-label={`Chọn banner ${b.movieTitle || b.name || `số ${idx + 1}`}`}
              className={`relative flex-shrink-0 w-24 h-14 md:w-32 md:h-20 rounded-md overflow-hidden transition-all duration-300 border-2 ${idx === selected ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
            >
              <img
                src={resizeTmdbImage(b.thumbnails && b.thumbnails[idx] ? b.thumbnails[idx] : b.bgUrl, 'w300')}
                alt={b.movieTitle || b.name || `Banner ${idx + 1}`}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="w-full h-full object-cover"
                draggable="false"
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => scrollThumbs(e, 'right')}
          aria-label="Cuộn thumbnail hero sang phải"
          className="hidden md:flex absolute right-0 z-30 w-10 h-[80%] items-center justify-center bg-gradient-to-l from-black/90 to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity rounded-r-lg"
        >
          <InlineIcon name="chevronRight" size={18} />
        </button>
      </div>
    </div>
  );
}
