import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronRight, FaPlay, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { API_URL } from '../../config/api';
import { getProfileHeaders, getStoredUser, PROFILE_CHANGE_EVENT } from '../../utils/profile';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { FALLBACK_POSTER } from '../../utils/imageFallbacks';
import ImageLoader from '../common/ImageLoader';

const LIMIT = 15;
const MAX_VISIBLE = 5;
const CARD_WIDTH = 280 + 24; // 280px width + 24px gap

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function progressPercent(item) {
  const duration = Number(item.duration_seconds) || 0;
  const progress = Number(item.progress_seconds) || 0;
  if (duration <= 0) return 0;
  return clampPercent((progress / duration) * 100);
}

function formatMinuteText(seconds) {
  const minutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  if (minutes <= 0) return 'Dưới 1 phút';
  return `${minutes} phút`;
}

function buildWatchUrl(item) {
  const params = new URLSearchParams();
  if (item.episode_number) params.set('ep', item.episode_number);
  if (item.progress_seconds) params.set('t', Math.floor(Number(item.progress_seconds)));
  const query = params.toString();
  return `/watch/${item.id}${query ? `?${query}` : ''}`;
}

function isMeaningfulContinue(item) {
  return Number(item.progress_seconds) > 5;
}

const ContinueCard = React.memo(function ContinueCard({ item, onContinue }) {
  const percent = progressPercent(item);
  const savedSeconds = Number(item.progress_seconds) || 0;
  const hasSavedProgress = savedSeconds > 5;
  const hasPreciseProgress = Number(item.duration_seconds) > 0 && hasSavedProgress;
  const remainingSeconds = Math.max(0, (Number(item.duration_seconds) || 0) - (Number(item.progress_seconds) || 0));
  const episodeLabel = item.episode_title || (item.episode_number ? `Tập ${item.episode_number}` : '');
  
  // Use backdrop for horizontal card, fallback to poster if missing
  const imageUrl = item.backdrop_url || item.backdrop || item.poster_url || item.poster || FALLBACK_POSTER;

  return (
    <div className="relative flex flex-col group/card cursor-pointer w-[280px]" onClick={() => onContinue(item)}>
      <div className="relative overflow-hidden rounded-md aspect-video shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover/card:scale-105 group-hover/card:shadow-[0_15px_30px_rgba(0,0,0,0.8)] bg-surface ring-1 ring-white/5">
        
        {/* Image */}
        <ImageLoader
          src={imageUrl}
          alt={item.title}
          className="absolute inset-0 w-full h-full opacity-80 group-hover/card:opacity-100"
        />
        
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Play Icon Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300 scale-75 group-hover/card:scale-100 z-20">
          <div className="w-14 h-14 rounded-full border-2 border-white bg-black/50 flex items-center justify-center backdrop-blur-sm text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] group-hover/card:bg-white group-hover/card:text-black transition-colors">
            <FaPlay className="ml-1 text-xl" />
          </div>
        </div>

        {/* Duration / Time Left Badge */}
        {hasPreciseProgress && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[10px] font-bold text-white shadow-md z-10">
            Còn {formatMinuteText(remainingSeconds)}
          </div>
        )}

        {/* Title Inside Card */}
        <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
          <h3 className="text-white font-bold text-sm leading-tight drop-shadow-md line-clamp-1">{item.title}</h3>
          {episodeLabel && (
            <p className="text-white/80 text-[11px] font-medium mt-0.5 drop-shadow-md line-clamp-1">{episodeLabel}</p>
          )}
        </div>

        {/* Progress Bar (Attached to bottom of image) */}
        {hasPreciseProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
            <div 
              className="h-full bg-primary" 
              style={{ width: `${Math.max(2, percent)}%` }} 
            />
          </div>
        )}
      </div>

      {/* Action Row below card */}
      <div className="flex items-center justify-between mt-2 px-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
        <div className="flex items-center gap-2 text-white/50 hover:text-white transition-colors p-1" onClick={(e) => { e.stopPropagation(); }}>
          <FaInfoCircle className="text-sm" />
          <span className="text-[11px] font-medium">Thông tin</span>
        </div>
        <div className="flex items-center gap-1 text-white/50 hover:text-white transition-colors p-1" onClick={(e) => { e.stopPropagation(); /* Call API to remove from history here */ }}>
          <FaTimes className="text-sm" />
        </div>
      </div>
    </div>
  );
});

function ContinueSkeleton() {
  return (
    <section className="space-y-4 pt-4 md:pt-6 mb-8">
      <div className="relative h-7 w-48 rounded-lg bg-[#1A1A1A] overflow-hidden">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite_linear] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="flex gap-6 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="relative h-[158px] w-[280px] flex-shrink-0 rounded-md bg-[#1A1A1A] overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite_linear] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ContinueWatchingSection() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());
  
  // Slider State
  const [startIndex, setStartIndex] = useState(0);
  const sliderRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const dragStartIndex = useRef(0);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);

  const isLoggedIn = Boolean(user.id);

  const fetchContinue = useCallback(() => {
    if (!isLoggedIn) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`${API_URL}/user/continue?limit=${LIMIT}`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải tiếp tục xem.');
        return res.json();
      })
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isLoggedIn]);

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener(PROFILE_CHANGE_EVENT, syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => fetchContinue(), [fetchContinue]);

  const visibleItems = useMemo(() => items.filter(isMeaningfulContinue).slice(0, 15), [items]);

  // Slider Logic
  const handlePrev = () => setStartIndex(i => Math.max(0, i - 1));
  const handleNext = () => setStartIndex(i => Math.min(visibleItems.length - visibleCount, i + 1));

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
    const maxRight = -((visibleItems.length - visibleCount) * CARD_WIDTH);
    const currentOffset = -startIndex * CARD_WIDTH + dx;
    if (currentOffset > maxLeft) { dx = startIndex * CARD_WIDTH; } 
    else if (currentOffset < maxRight) { dx = -((visibleItems.length - visibleCount - startIndex) * CARD_WIDTH); }
    setDragDelta(dx);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    let newIndex = Math.min(
      Math.max(dragStartIndex.current + Math.round(-dragDelta / CARD_WIDTH), 0),
      visibleItems.length - visibleCount
    );
    setStartIndex(newIndex);
    setIsDragging(false);
    setDragDelta(0);
  };

  useEffect(() => {
    function updateVisibleCount() {
      const sliderWidth = window.innerWidth * 0.92;
      const count = Math.min(MAX_VISIBLE, Math.floor(sliderWidth / CARD_WIDTH));
      setVisibleCount(count < 1 ? 1 : count);
    }
    updateVisibleCount();
    window.addEventListener('resize', updateVisibleCount);
    return () => window.removeEventListener('resize', updateVisibleCount);
  }, []);

  useEffect(() => {
    if (startIndex > Math.max(0, visibleItems.length - visibleCount)) {
      setStartIndex(Math.max(0, visibleItems.length - visibleCount));
    }
  }, [visibleCount, visibleItems.length, startIndex]);

  const canScroll = visibleItems.length > visibleCount;

  if (!isLoggedIn) return null;
  if (loading && visibleItems.length === 0) return <ContinueSkeleton />;
  if (!visibleItems.length) return null;

  return (
    <section
      className="relative pt-4 md:pt-6 mb-4"
    >
      <div className="flex items-center justify-between mb-4 px-2 md:px-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white font-heading tracking-wide">Tiếp tục xem</h2>
        </div>
        <button
          type="button"
          onClick={() => navigate('/user/continue')}
          className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-text-secondary transition-colors duration-200 hover:text-white sm:inline-flex"
        >
          Tất cả hoạt động
          <FaChevronRight size={10} />
        </button>
      </div>

      <div className="relative flex items-center group/slider">
        {/* Prev Arrow */}
        {canScroll && startIndex > 0 && (
          <button 
            onClick={handlePrev} 
            className="absolute -left-4 md:-left-8 z-30 w-10 md:w-14 h-[158px] bg-black/40 hover:bg-black/80 text-white opacity-0 group-hover/slider:opacity-100 transition-opacity flex items-center justify-center rounded-r-md backdrop-blur-sm -mt-6"
          >
            <ArrowBackIosNewIcon className="text-2xl md:text-4xl shadow-lg" />
          </button>
        )}

        {/* Track */}
        <div
          ref={sliderRef}
          className="overflow-hidden w-full relative touch-pan-y"
          style={{ width: `${visibleCount * CARD_WIDTH}px`, maxWidth: '100vw', cursor: isDragging && canScroll ? 'grabbing' : canScroll ? 'grab' : 'default' }}
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
              transform: `translateX(-${canScroll ? (startIndex * CARD_WIDTH - dragDelta) : 0}px)`,
              willChange: 'transform',
            }}
          >
            {visibleItems.map((item) => (
              <ContinueCard 
                key={`${item.history_id}-${item.id}`} 
                item={item} 
                onContinue={(it) => navigate(buildWatchUrl(it))} 
              />
            ))}
          </div>
        </div>

        {/* Next Arrow */}
        {canScroll && startIndex < visibleItems.length - visibleCount && (
          <button 
            onClick={handleNext} 
            className="absolute -right-4 md:-right-8 z-30 w-10 md:w-14 h-[158px] bg-black/40 hover:bg-black/80 text-white opacity-0 group-hover/slider:opacity-100 transition-opacity flex items-center justify-center rounded-l-md backdrop-blur-sm -mt-6"
          >
            <ArrowForwardIosIcon className="text-2xl md:text-4xl shadow-lg" />
          </button>
        )}
      </div>
    </section>
  );
}
