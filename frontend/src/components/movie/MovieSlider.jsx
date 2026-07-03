import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InlineIcon from '../common/InlineIcon';
import { FALLBACK_POSTER, safePosterUrl } from '../../utils/imageFallbacks';
import { MovieRatingBadge } from './MovieCard';

const MAX_VISIBLE = 8;
const POSTER_WIDTH = 200 + 24; // 200px width + 24px gap

function resizeTmdbImage(url, size) {
  const safeUrl = safePosterUrl(url);
  return safeUrl.replace('/t/p/original/', `/t/p/${size}/`);
}

export default function MovieSlider({ movies, title, categoryId, categoryName }) {
  const [startIndex, setStartIndex] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const hoverTimeout = useRef();
  const sliderRef = useRef();
  const posterRefs = useRef([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const dragStartIndex = useRef(0);
  const [seeMoreHover, setSeeMoreHover] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);
  const navigate = useNavigate();

  const MAX_POSTERS = 8;
  const displayMovies = movies.slice(-MAX_POSTERS);

  const handlePrev = () => setStartIndex(i => Math.max(0, i - 1));
  const handleNext = () => setStartIndex(i => Math.min(displayMovies.length - visibleCount, i + 1));

  const handleSeeMore = () => {
    if (categoryId && categoryName) {
      navigate('/movies', { 
        state: { categoryId: categoryId, categoryName: categoryName, filterType: 'category' } 
      });
    } else {
      navigate('/movies');
    }
  };

  const handleMouseEnter = (idx) => {
    hoverTimeout.current = setTimeout(() => {
      setHovered(idx);
      setPopupOpen(true);
      if (posterRefs.current[idx] && sliderRef.current) {
        const posterRect = posterRefs.current[idx].getBoundingClientRect();
        const sliderRect = sliderRef.current.getBoundingClientRect();
        const popupWidth = 350;
        let left = posterRect.left - sliderRect.left + posterRect.width / 2 - popupWidth / 2;
        left = Math.max(0, Math.min(left, sliderRect.width - popupWidth));
        const top = posterRect.top - sliderRect.top - 100; // Float above
        setPopupPos({ left, top });
      }
    }, 600); // Wait 600ms before popup
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setTimeout(() => {
      if (!popupOpen) {
        setHovered(null);
        setPopupPos(null);
      }
    }, 100);
  };

  const handlePopupEnter = () => setPopupOpen(true);
  const handlePopupLeave = () => {
    setPopupOpen(false);
    setHovered(null);
    setPopupPos(null);
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartX(e.type === 'touchstart' ? e.touches[0].clientX : e.clientX);
    dragStartIndex.current = startIndex;
    setDragDelta(0);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let dx = clientX - dragStartX;
    const maxLeft = 0;
    const maxRight = -((displayMovies.length - visibleCount) * POSTER_WIDTH);
    const currentOffset = -startIndex * POSTER_WIDTH + dx;
    if (currentOffset > maxLeft) { dx = startIndex * POSTER_WIDTH; } 
    else if (currentOffset < maxRight) { dx = -((displayMovies.length - visibleCount - startIndex) * POSTER_WIDTH); }
    setDragDelta(dx);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    let newIndex = Math.min(
      Math.max(dragStartIndex.current + Math.round(-dragDelta / POSTER_WIDTH), 0),
      displayMovies.length - visibleCount
    );
    setStartIndex(newIndex);
    setIsDragging(false);
    setDragDelta(0);
  };

  useEffect(() => {
    function updateVisibleCount() {
      const sliderWidth = window.innerWidth * 0.92; // Adjust for margins
      const count = Math.min(MAX_VISIBLE, Math.floor(sliderWidth / POSTER_WIDTH));
      setVisibleCount(count < 1 ? 1 : count);
    }
    updateVisibleCount();
    window.addEventListener('resize', updateVisibleCount);
    return () => window.removeEventListener('resize', updateVisibleCount);
  }, []);

  useEffect(() => {
    if (startIndex > Math.max(0, displayMovies.length - visibleCount)) {
      setStartIndex(Math.max(0, displayMovies.length - visibleCount));
    }
  }, [visibleCount, displayMovies.length, startIndex]);

  const canScroll = displayMovies.length > visibleCount;

  return (
    <div
      className="relative mt-4 min-h-[390px] md:min-h-[430px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-2 md:px-0">
        <h2 className="text-xl md:text-2xl font-bold text-white font-heading tracking-wide">
          {title}
        </h2>
        
        <button
          onMouseEnter={() => setSeeMoreHover(true)}
          onMouseLeave={() => setSeeMoreHover(false)}
          onClick={handleSeeMore}
          className={`flex items-center justify-center transition-all duration-300 ease-out rounded-full font-semibold text-sm ${
            seeMoreHover ? 'text-white bg-primary px-4 py-1.5' : 'text-text-secondary px-0 py-1.5 hover:text-white'
          }`}
        >
          {seeMoreHover ? (
            <>
              Xem tất cả <InlineIcon name="chevronRight" size={16} className="ml-1" />
            </>
          ) : (
            <span className="flex items-center text-sm font-medium">Xem tất cả <InlineIcon name="chevronRight" size={14} className="ml-1" /></span>
          )}
        </button>
      </div>

      {/* Slider Container */}
      <div className="relative flex items-center group/slider">
        {/* Prev Arrow */}
        {canScroll && (
          <button 
            type="button"
            onClick={handlePrev} 
            disabled={startIndex === 0}
            aria-label="Cuộn trang phim trước"
            className="absolute -left-4 md:-left-8 z-20 w-10 md:w-14 h-full bg-black/40 hover:bg-black/80 text-white opacity-0 group-hover/slider:opacity-100 transition-opacity flex items-center justify-center rounded-r-md backdrop-blur-sm disabled:opacity-0"
          >
            <InlineIcon name="chevronLeft" size={36} className="drop-shadow-lg" />
          </button>
        )}

        {/* Track */}
        <div
          ref={sliderRef}
          className="overflow-hidden w-full relative touch-pan-y"
          style={{ width: `${visibleCount * POSTER_WIDTH}px`, maxWidth: '100vw', cursor: isDragging && canScroll ? 'grabbing' : canScroll ? 'grab' : 'default' }}
          onMouseDown={canScroll ? handleDragStart : undefined}
          onMouseMove={canScroll ? handleDragMove : undefined}
          onMouseUp={canScroll ? handleDragEnd : undefined}
          onMouseLeave={canScroll ? handleDragEnd : undefined}
          onTouchStart={canScroll ? handleDragStart : undefined}
          onTouchMove={canScroll ? handleDragMove : undefined}
          onTouchEnd={canScroll ? handleDragEnd : undefined}
        >
          <div
            className="flex gap-6"
            style={{
              transition: isDragging ? 'transform 0.15s ease-out' : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
              transform: `translateX(-${canScroll ? (startIndex * POSTER_WIDTH - dragDelta) : 0}px)`,
              willChange: 'transform',
            }}
          >
            {displayMovies.map((movie, idx) => {
              const shouldLoadPoster = idx >= startIndex - 1 && idx <= startIndex + visibleCount + 1;

              return (
              <div
                key={movie.id || idx}
                className="relative flex-shrink-0 group/card w-[200px]"
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                ref={el => posterRefs.current[idx] = el}
              >
                <div className="relative overflow-hidden rounded-2xl aspect-[2/3] shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-[1.12] group-hover/card:shadow-[0_20px_40px_rgba(0,0,0,0.6)] group-hover/card:-translate-y-2 bg-surface ring-1 ring-white/5 group-hover/card:ring-white/20 cursor-pointer" onClick={() => navigate(`/watch/${movie.id}`)}>
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 z-10 pointer-events-none mix-blend-overlay" />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-white/10 via-white/[0.03] to-black px-3 py-4 pointer-events-none">
                    <div className="line-clamp-2 text-sm font-bold text-white/70">{movie.title || 'Đang tải poster'}</div>
                    {movie.originalTitle && (
                      <div className="mt-1 line-clamp-1 text-[11px] text-white/35">{movie.originalTitle}</div>
                    )}
                  </div>
                  <img
                    src={shouldLoadPoster ? resizeTmdbImage(movie.poster_url || movie.poster || FALLBACK_POSTER, 'w342') : FALLBACK_POSTER}
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    onError={(e) => { e.currentTarget.src = FALLBACK_POSTER; }}
                  />
                  <MovieRatingBadge rating={movie.imdb_rating} />
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                    <div className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center backdrop-blur-sm text-primary group-hover/card:scale-110 transition-transform shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-center px-1">
                  <h3 className="text-white font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors cursor-pointer" onClick={() => navigate(`/movies/${movie.id}`)}>
                    {movie.title}
                  </h3>
                  <p className="text-text-secondary text-xs mt-0.5 line-clamp-1">
                    {movie.originalTitle || movie.release_year}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Next Arrow */}
        {canScroll && startIndex < displayMovies.length - visibleCount && (
          <button 
            type="button"
            onClick={handleNext} 
            aria-label="Cuộn trang phim kế tiếp"
            className="absolute -right-4 md:-right-8 z-20 w-10 md:w-14 h-full bg-black/40 hover:bg-black/80 text-white opacity-0 group-hover/slider:opacity-100 transition-opacity flex items-center justify-center rounded-l-md backdrop-blur-sm"
          >
            <InlineIcon name="chevronRight" size={36} className="drop-shadow-lg" />
          </button>
        )}

        {/* Hover Popup */}
        {hovered !== null && popupPos && displayMovies[hovered] && (
          <div
            className="absolute z-[100] w-[350px] bg-surface rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10 ring-1 ring-white/5 transition-opacity duration-200"
            style={{ top: popupPos.top, left: popupPos.left }}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
          >
            {/* Backdrop Image or Video */}
            <div className="w-full aspect-video relative bg-black cursor-pointer group/popup-img overflow-hidden" onClick={() => navigate(`/watch/${displayMovies[hovered].id}`)}>
              <img
                src={resizeTmdbImage(displayMovies[hovered].backdrop || displayMovies[hovered].backdrop_url || displayMovies[hovered].poster_url || displayMovies[hovered].poster || FALLBACK_POSTER, 'w780')}
                alt={displayMovies[hovered].title}
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.src = FALLBACK_POSTER; }}
                className={`w-full h-full object-cover transition-transform duration-700 group-hover/popup-img:scale-105 ${displayMovies[hovered].trailer_url ? 'opacity-0' : 'opacity-100'}`}
              />
              {displayMovies[hovered].trailer_url && (
                <video
                  src={displayMovies[hovered].trailer_url}
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover animate-fade-in"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              
              {/* Mute toggle */}
              {displayMovies[hovered].trailer_url && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                  className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-black/50 border border-white/20 text-white flex items-center justify-center hover:bg-black/80"
                >
                  {isMuted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
              )}
            </div>

            {/* Content */}
            <div className="px-5 pb-5 pt-2 relative z-10">
              <h3 className="text-lg font-bold text-white leading-tight mb-1">{displayMovies[hovered].title}</h3>
              {/* Actions */}
              <div className="flex gap-2.5 mb-4 mt-2">
                <button 
                  onClick={() => navigate(`/watch/${displayMovies[hovered].id}`)}
                  className="w-10 h-10 bg-white hover:bg-white/80 text-black rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-md"
                >
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <button className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                </button>
                <button className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
                <div className="flex-1" />
                <button onClick={() => navigate(`/movies/${displayMovies[hovered].id}`)} className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>

              <div className="flex items-center gap-2 mb-3 text-xs font-semibold">
                {displayMovies[hovered].imdb_rating && (
                  <span className="text-green-400 font-bold">{Number(displayMovies[hovered].imdb_rating).toFixed(1)} Điểm</span>
                )}
                {displayMovies[hovered].release_year && (
                  <span className="text-white/70">{displayMovies[hovered].release_year}</span>
                )}
                {displayMovies[hovered].age_limit && (
                  <span className="px-1.5 border border-white/30 text-white/70 rounded">{displayMovies[hovered].age_limit}</span>
                )}
                {displayMovies[hovered].duration && (
                  <span className="text-white/70">{displayMovies[hovered].duration}</span>
                )}
                {displayMovies[hovered].quality && (
                  <span className="border border-white/30 px-1 rounded text-white/90 uppercase text-[10px] tracking-wider">{displayMovies[hovered].quality}</span>
                )}
              </div>

              {/* Genres */}
              {displayMovies[hovered].genres && displayMovies[hovered].genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {displayMovies[hovered].genres.slice(0, 3).map((tag, idx) => (
                    <React.Fragment key={tag.name || tag}>
                      <span className="text-[13px] text-white/90 font-medium hover:text-white cursor-pointer" onClick={() => navigate(`/movies?genre=${encodeURIComponent(tag.name || tag)}`)}>{tag.name || tag}</span>
                      {idx < Math.min(displayMovies[hovered].genres.length, 3) - 1 && <span className="text-white/30 text-[10px] mx-0.5">•</span>}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
