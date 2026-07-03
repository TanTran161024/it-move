import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InlineIcon from '../common/InlineIcon';
import Top10Card from './Top10Card';

const MAX_VISIBLE = 5;

export default function Top10Slider({ movies, title }) {
  const [startIndex, setStartIndex] = useState(0);
  const sliderRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const dragStartIndex = useRef(0);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);
  const [posterWidth, setPosterWidth] = useState(360); // 320 + 40 gap
  const navigate = useNavigate();

  // Top 10 only
  const displayMovies = movies.slice(0, 10);

  const handlePrev = () => setStartIndex(i => Math.max(0, i - 1));
  const handleNext = () => setStartIndex(i => Math.min(displayMovies.length - visibleCount, i + 1));

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
    const maxRight = -((displayMovies.length - visibleCount) * posterWidth);
    const currentOffset = -startIndex * posterWidth + dx;
    if (currentOffset > maxLeft) { dx = startIndex * posterWidth; } 
    else if (currentOffset < maxRight) { dx = -((displayMovies.length - visibleCount - startIndex) * posterWidth); }
    setDragDelta(dx);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    let newIndex = Math.min(
      Math.max(dragStartIndex.current + Math.round(-dragDelta / posterWidth), 0),
      displayMovies.length - visibleCount
    );
    setStartIndex(newIndex);
    setIsDragging(false);
    setDragDelta(0);
  };

  useEffect(() => {
    function updateVisibleCount() {
      const isMobile = window.innerWidth < 768; // md breakpoint
      const currentPosterWidth = isMobile ? (240 + 24) : (320 + 40);
      setPosterWidth(currentPosterWidth);
      
      const sliderWidth = window.innerWidth * 0.92;
      const count = Math.min(MAX_VISIBLE, Math.floor(sliderWidth / currentPosterWidth));
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

  if (!displayMovies.length) return null;

  return (
    <div
      className="relative mt-8 mb-4 min-h-[360px] md:min-h-[430px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8 px-2 md:px-0">
        <h2 className="text-xl md:text-2xl font-bold font-heading tracking-wide flex items-center gap-2">
          <span className="w-1.5 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)]"></span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300 drop-shadow-[0_0_15px_rgba(236,72,153,0.3)]">{title}</span>
        </h2>
      </div>

      {/* Slider Container */}
      <div className="relative flex items-center group/slider">
        {/* Prev Arrow */}
        {canScroll && startIndex > 0 && (
          <button 
            type="button"
            onClick={handlePrev} 
            aria-label="Cuộn Top 10 về trước"
            className="absolute left-0 md:-left-4 z-20 w-12 md:w-16 h-[80%] bg-gradient-to-r from-black/90 to-transparent hover:from-black text-white opacity-0 group-hover/slider:opacity-100 transition-all flex items-center justify-center hover:text-purple-400 group/btn"
          >
            <InlineIcon name="chevronLeft" size={40} className="drop-shadow-lg group-hover/btn:drop-shadow-[0_0_15px_rgba(168,85,247,0.8)] group-hover/btn:scale-110 transition-transform" />
          </button>
        )}

        {/* Track */}
        <div
          ref={sliderRef}
          className="overflow-hidden w-full relative touch-pan-y py-4 pl-4 md:pl-8"
          style={{ width: `${visibleCount * posterWidth}px`, maxWidth: '100vw', cursor: isDragging && canScroll ? 'grabbing' : canScroll ? 'grab' : 'default' }}
          onMouseDown={canScroll ? handleDragStart : undefined}
          onMouseMove={canScroll ? handleDragMove : undefined}
          onMouseUp={canScroll ? handleDragEnd : undefined}
          onMouseLeave={canScroll ? handleDragEnd : undefined}
          onTouchStart={canScroll ? handleDragStart : undefined}
          onTouchMove={canScroll ? handleDragMove : undefined}
          onTouchEnd={canScroll ? handleDragEnd : undefined}
        >
          <div
            className="flex gap-6 md:gap-10"
            style={{
              transition: isDragging ? 'transform 0.15s ease-out' : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
              transform: `translateX(-${canScroll ? (startIndex * posterWidth - dragDelta) : 0}px)`,
              willChange: 'transform',
            }}
          >
            {displayMovies.map((movie, idx) => (
              <div key={movie.id || idx} className="flex-shrink-0">
                <Top10Card 
                  movie={movie} 
                  rank={idx + 1} 
                  shouldLoad={idx >= startIndex - 1 && idx <= startIndex + visibleCount + 1}
                  onClick={() => navigate(`/watch/${movie.id}`)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Next Arrow */}
        {startIndex < displayMovies.length - visibleCount && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Cuộn Top 10 kế tiếp"
            className="absolute right-0 md:-right-4 z-20 w-12 md:w-16 h-[80%] bg-gradient-to-l from-black/90 to-transparent hover:from-black text-white opacity-0 group-hover/slider:opacity-100 transition-all flex items-center justify-center hover:text-purple-400 group/btn"
          >
            <InlineIcon name="chevronRight" size={40} className="drop-shadow-lg group-hover/btn:drop-shadow-[0_0_15px_rgba(168,85,247,0.8)] group-hover/btn:scale-110 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}
