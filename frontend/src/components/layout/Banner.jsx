import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { motion, AnimatePresence } from 'framer-motion';

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

const MAX_BANNERS = 6;

export default function Banner() {
  const [banners, setBanners] = useState([]);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const [dragStartX, setDragStartX] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const thumbContainerRef = React.useRef(null);

  const scrollThumbs = (e, direction) => {
    e.stopPropagation();
    if (thumbContainerRef.current) {
      const scrollAmount = window.innerWidth > 768 ? 300 : 150;
      thumbContainerRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    fetch('http://localhost:5000/api/banners')
      .then(res => res.json())
      .then(data => setBanners(data.map(snakeToCamel).map(parseBannerFields)))
      .catch(err => console.error('Lỗi fetch banner:', err));
  }, []);

  const displayBanners = banners.slice(0, MAX_BANNERS);
  const banner = displayBanners[selected];

  useEffect(() => {
    if (displayBanners.length === 0 || isPaused) return;
    const interval = setInterval(() => {
      setSelected((prev) => (prev + 1) % displayBanners.length);
    }, 10000); // Auto change every 10s like Netflix
    return () => clearInterval(interval);
  }, [displayBanners.length, isPaused, selected]);

  if (!banner) {
    return (
      <div className="h-[60vh] md:h-[80vh] flex items-center justify-center bg-background text-text-secondary">
        <div className="animate-pulse w-full h-full bg-surface/50" />
      </div>
    );
  }

  const handleBannerChange = (newIndex) => {
    setSelected(newIndex);
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
      className="relative w-full h-[80vh] md:h-[90vh] lg:h-[100vh] min-h-[600px] flex items-center justify-start overflow-hidden bg-background cursor-grab active:cursor-grabbing select-none"
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
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Background image */}
          <img
            src={banner.bgUrl}
            alt={banner.name}
            className="absolute inset-0 w-full h-full object-cover"
            draggable="false"
          />
          {/* Gradients for blending */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent w-full md:w-[70%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-0 left-0 right-0 h-[30vh] bg-gradient-to-t from-background to-transparent" />
          <div className="absolute inset-0 bg-black/20" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 w-full container mx-auto px-4 md:px-8 max-w-7xl h-full flex flex-col justify-center pt-20 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full md:w-[65%] lg:w-[55%] flex flex-col gap-4 md:gap-5"
          >
            {/* Title / Title Image */}
            {banner.titleUrl ? (
              <img
                src={banner.titleUrl}
                alt={banner.name}
                className="w-[80%] md:w-full max-w-[400px] lg:max-w-[500px] drop-shadow-2xl"
                draggable="false"
              />
            ) : (
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-heading font-black text-white leading-tight drop-shadow-2xl tracking-tight line-clamp-2 md:line-clamp-3">
                {banner.movieTitle || banner.name}
              </h1>
            )}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              {banner.imdbRating && (
                <div className="flex items-center gap-1 border border-[#f5c518] rounded px-2 py-0.5 text-[#f5c518] bg-black/40 backdrop-blur-sm">
                  <span>IMDb</span>
                  <span className="text-white">{Number(banner.imdbRating).toFixed(1)}</span>
                </div>
              )}
              {banner.quality && (
                <div className="px-2 py-0.5 rounded bg-white text-black drop-shadow-md">
                  {banner.quality}
                </div>
              )}
              {banner.ageLimit && (
                <div className="px-2 py-0.5 rounded border border-white/50 text-white bg-white/10 backdrop-blur-sm">
                  {banner.ageLimit}
                </div>
              )}
              {banner.releaseYear && (
                <div className="px-2 py-0.5 text-white/90 font-medium">
                  {banner.releaseYear}
                </div>
              )}
              {banner.duration && (
                <div className="px-2 py-0.5 text-white/90 font-medium">
                  {banner.duration}
                </div>
              )}
            </div>

            {/* Tags/Genres */}
            {banner.genres && banner.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {banner.genres.map((tag, idx) => (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); navigate(`/movies?genre=${encodeURIComponent(tag)}`); }}
                    className="text-xs md:text-sm px-3 py-1 bg-white/10 hover:bg-primary/80 border border-white/20 hover:border-primary text-white rounded-full transition-all duration-300"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Description */}
            <p className="text-white/80 text-sm md:text-base lg:text-lg max-w-xl line-clamp-3 md:line-clamp-4 leading-relaxed text-shadow-sm font-light">
              {decodeEntities(banner.description || banner.desc || "Không có mô tả cho phim này.")}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={() => navigate(`/watch/${banner.movieId || banner.movie_id || banner.id}`)}
                className="flex items-center justify-center gap-2 px-6 md:px-8 py-2.5 md:py-3 bg-white text-black hover:bg-white/80 rounded-md font-bold text-base md:text-lg transition-colors group"
              >
                <PlayArrowIcon className="text-3xl group-hover:scale-110 transition-transform" />
                <span>Xem ngay</span>
              </button>
              
              <button
                onClick={() => navigate(`/movies/${banner.movieId || banner.movie_id || banner.id}`)}
                className="flex items-center justify-center gap-2 px-6 py-2.5 md:py-3 bg-white/20 hover:bg-white/30 text-white backdrop-blur-md rounded-md font-bold text-base md:text-lg transition-colors"
              >
                <InfoOutlinedIcon className="text-3xl" />
                <span className="hidden sm:inline">Chi tiết</span>
              </button>

              <button className="p-3 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full transition-colors border border-white/10 hover:border-white/30">
                <FavoriteBorderIcon />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Thumbnail Navigation */}
      <div 
        className="absolute bottom-8 md:bottom-12 right-4 md:right-12 z-20 flex items-center group/thumbs rounded-md overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => scrollThumbs(e, 'left')}
          className="hidden md:flex absolute left-0 z-30 w-10 h-full items-center justify-center bg-gradient-to-r from-black/90 to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity"
        >
          <ArrowBackIosNewIcon fontSize="small" />
        </button>

        <div 
          ref={thumbContainerRef}
          className="flex gap-3 overflow-x-auto max-w-[80vw] md:max-w-[45vw] lg:max-w-[35vw] p-2 hide-scrollbar scroll-smooth"
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          {displayBanners.map((b, idx) => (
            <button
              key={b.id || idx}
              onClick={(e) => { e.stopPropagation(); handleBannerChange(idx); }}
              className={`relative flex-shrink-0 w-24 h-14 md:w-32 md:h-20 rounded-md overflow-hidden transition-all duration-300 border-2 ${idx === selected ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-50 hover:opacity-80'}`}
            >
              <img
                src={b.thumbnails && b.thumbnails[idx] ? b.thumbnails[idx] : b.bgUrl}
                alt={b.name}
                className="w-full h-full object-cover"
                draggable="false"
              />
            </button>
          ))}
        </div>

        <button
          onClick={(e) => scrollThumbs(e, 'right')}
          className="hidden md:flex absolute right-0 z-30 w-10 h-full items-center justify-center bg-gradient-to-l from-black/90 to-transparent text-white opacity-0 group-hover/thumbs:opacity-100 transition-opacity"
        >
          <ArrowForwardIosIcon fontSize="small" />
        </button>
      </div>
    </div>
  );
}
