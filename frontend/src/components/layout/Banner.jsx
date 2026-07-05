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

function normalizeTitleText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getCompactTitle(value) {
  const title = normalizeTitleText(value);
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
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
  const bannerTitle = normalizeTitleText(banner?.movieTitle || banner?.name || 'IT Move');
  const compactBannerTitle = getCompactTitle(bannerTitle);

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
      className="relative flex h-[680px] min-h-[640px] w-full items-start justify-start overflow-hidden bg-background cursor-grab select-none active:cursor-grabbing md:h-[720px] lg:h-[740px] xl:h-[760px]"
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
          <div className="absolute inset-0 w-full h-full bg-background">
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
          {/* Cinematic Gradients for blending */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent w-[90%] md:w-[60%]" />
          <div className="absolute bottom-0 left-0 right-0 h-[60vh] bg-gradient-to-t from-background via-background/20 to-transparent" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none mix-blend-overlay"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col justify-start px-[16px] pb-[120px] pt-[132px] md:px-[32px] md:pt-[138px] lg:px-[48px] lg:pt-[148px] xl:px-[72px]">
          <div
            key={`banner-content-${selected}`}
            className="flex w-[calc(100vw-32px)] max-w-[360px] flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both lg:w-[58%] lg:max-w-[860px] xl:w-[52%]"
          >
            {/* Title / Title Image */}
            <div className="flex h-[96px] items-start md:h-[128px] lg:h-[176px] xl:h-[192px]">
              {banner.titleUrl ? (
                <img
                  src={banner.titleUrl}
                  alt={bannerTitle}
                  className="max-h-full w-[85%] max-w-[320px] object-contain object-left-top drop-shadow-2xl md:w-full lg:max-w-[480px]"
                  draggable="false"
                />
              ) : (
                <h1
                  className="line-clamp-3 max-w-[860px] break-words text-[28px] font-heading font-black leading-[1.06] tracking-normal text-white drop-shadow-lg sm:text-4xl lg:text-[50px] lg:leading-[1.06] xl:text-[56px] 2xl:text-[60px]"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  <span className="lg:hidden">{compactBannerTitle}</span>
                  <span className="hidden lg:inline">{bannerTitle}</span>
                </h1>
              )}
            </div>

            {/* Badges */}
            <div className="mt-4 flex h-[36px] flex-wrap items-center gap-3 overflow-hidden text-xs font-bold tracking-wider md:text-sm">
              {banner.imdbRating && (
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[#f5c518] bg-black/60 backdrop-blur-md border border-[#f5c518]/30">
                  <span className="font-black">IMDb</span>
                  <span className="text-white">{Number(banner.imdbRating).toFixed(1)}</span>
                </div>
              )}
              {banner.quality && (
                <div className="px-2 py-1 rounded-md bg-white/10 text-white backdrop-blur-md border border-white/10 uppercase">
                  {banner.quality}
                </div>
              )}
              {banner.ageLimit && (
                <div className="px-2 py-1 rounded-md border border-white/20 text-white bg-red-600/80 backdrop-blur-md shadow-glow">
                  {banner.ageLimit}
                </div>
              )}
              {banner.releaseYear && (
                <div className="px-2 py-1 text-text-secondary font-semibold">
                  {banner.releaseYear}
                </div>
              )}
              {banner.duration && (
                <div className="px-2 py-1 text-text-secondary font-semibold flex items-center gap-1 border-l border-white/20">
                  {banner.duration}
                </div>
              )}
            </div>

            {/* Tags/Genres */}
            <div className="mt-3 flex h-[24px] flex-wrap items-center gap-2 overflow-hidden">
              {banner.genres && banner.genres.length > 0 && (
                <>
                {banner.genres.map((tag, i) => (
                  <React.Fragment key={tag}>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/movies?genre=${encodeURIComponent(tag)}`); }}
                      className="text-sm font-semibold text-text-secondary hover:text-white transition-colors"
                    >
                      {tag}
                    </button>
                    {i < banner.genres.length - 1 && <span className="w-1 h-1 rounded-full bg-white/30"></span>}
                  </React.Fragment>
                ))}
                </>
              )}
            </div>

            {/* Description */}
            <p className="text-text-secondary mt-5 max-w-2xl line-clamp-2 h-[56px] text-base font-medium leading-relaxed drop-shadow-md md:line-clamp-3 md:h-[88px] md:text-lg lg:text-[19px]">
              {decodeEntities(banner.description || banner.desc || "Không có mô tả cho phim này.")}
            </p>

            {/* Actions */}
            <div className="mt-5 flex h-[56px] flex-wrap items-center gap-3 overflow-hidden md:gap-4">
              <button
                onClick={() => navigate(`/watch/${banner.movieId || banner.movie_id || banner.id}`)}
                className="group flex items-center justify-center gap-2.5 rounded-xl bg-white px-6 py-3 text-base font-black text-black shadow-lg transition-all duration-300 hover:scale-105 hover:bg-white/90 active:scale-95 md:px-8 md:py-3.5 md:text-lg"
              >
                <InlineIcon name="play" size={24} className="group-hover:scale-110 transition-transform" />
                <span>Xem ngay</span>
              </button>
              
              <button
                onClick={() => navigate(`/movies/${banner.movieId || banner.movie_id || banner.id}`)}
                aria-label={`Xem chi tiết ${bannerTitle}`}
                className="flex items-center justify-center gap-2.5 rounded-xl border border-border bg-surface/50 px-5 py-3 text-base font-bold text-white backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-white/30 hover:bg-surface/80 active:scale-95 md:px-8 md:py-3.5 md:text-lg"
              >
                <InlineIcon name="info" size={24} />
                <span className="hidden sm:inline">Chi tiết</span>
              </button>

              <button
                type="button"
                aria-label={`Thêm ${bannerTitle} vào danh sách yêu thích`}
                className="group flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface/50 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-white/30 hover:bg-surface/80 active:scale-95 md:h-14 md:w-14"
              >
                <InlineIcon name="heart" size={24} className="group-hover:scale-110 transition-transform group-hover:text-primary" />
              </button>
            </div>
          </div>
      </div>

      {/* Thumbnail Navigation */}
      <div 
        className="absolute bottom-[64px] right-[16px] z-20 flex items-center rounded-xl group/thumbs md:bottom-[72px] md:right-[32px] lg:right-[48px] xl:right-[72px]"
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
          className="hidden md:flex absolute left-0 z-30 w-12 h-full items-center justify-center bg-gradient-to-r from-background to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity rounded-l-xl"
        >
          <InlineIcon name="chevronLeft" size={24} />
        </button>

        <div 
          ref={thumbContainerRef}
          className="flex gap-4 overflow-x-auto max-w-[85vw] md:max-w-[45vw] lg:max-w-[35vw] py-4 px-2 hide-scrollbar scroll-smooth"
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
              className={`relative flex-shrink-0 w-32 h-18 md:w-40 md:h-24 rounded-lg overflow-hidden transition-all duration-500 ease-cinematic ${idx === selected ? 'ring-2 ring-white scale-105 shadow-2xl z-10' : 'ring-1 ring-border opacity-50 hover:opacity-100 hover:scale-100'}`}
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
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => scrollThumbs(e, 'right')}
          aria-label="Cuộn thumbnail hero sang phải"
          className="hidden md:flex absolute right-0 z-30 w-12 h-full items-center justify-center bg-gradient-to-l from-background to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity rounded-r-xl"
        >
          <InlineIcon name="chevronRight" size={24} />
        </button>
      </div>
      
      {/* Mute Button Floating Right */}
      {banner.trailerUrl && (
        <div className="absolute bottom-[180px] md:bottom-[250px] right-[16px] md:right-[32px] lg:right-[48px] xl:right-[72px] z-20 hidden md:block">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
            aria-label={isMuted ? 'Bật âm thanh trailer' : 'Tắt âm thanh trailer'}
            className="w-12 h-12 bg-surface/50 hover:bg-surface/80 border border-border hover:border-white/30 text-white backdrop-blur-md rounded-full transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center shadow-lg"
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
