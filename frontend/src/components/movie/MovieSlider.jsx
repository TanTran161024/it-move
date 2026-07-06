import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import InlineIcon from '../common/InlineIcon';
import { FALLBACK_POSTER, safePosterUrl } from '../../utils/imageFallbacks';
import { MovieRatingBadge } from './MovieCard';
import { API_BASE_URL as API } from '../../config/api';

const MAX_VISIBLE = 10;
const POSTER_WIDTH = 160 + 16; // 160px width + 16px gap

function resizeTmdbImage(url, size) {
  const safeUrl = safePosterUrl(url);
  return safeUrl.replace('/t/p/original/', `/t/p/${size}/`);
}

function getTrailerUrl(movie) {
  return String(movie?.trailer_url || movie?.trailerUrl || movie?.trailer || '').trim();
}

function getYoutubeVideoId(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host === 'youtu.be') return parts[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] || '';
    }
  } catch {
    const watchMatch = value.match(/[?&]v=([^?&/]+)/i);
    const shortMatch = value.match(/youtu\.be\/([^?&/]+)/i);
    const embedMatch = value.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/i);
    return watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || '';
  }

  return '';
}

function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || ''));
}

function isHlsUrl(url) {
  return /\.m3u8(\?.*)?$/i.test(String(url || ''));
}

function extractCleanVideoUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const nestedUrl = parsed.searchParams.get('url') || parsed.searchParams.get('file') || parsed.searchParams.get('src');
    if (nestedUrl) return nestedUrl.trim();
  } catch {
    // Raw URLs and embedded player snippets fall through to pattern extraction.
  }

  const hlsMatch = value.match(/https?:\/\/[^"' <>\n]+\.m3u8(?:\?[^"' <>\n]*)?/i);
  if (hlsMatch) return hlsMatch[0];

  return isDirectVideoUrl(value) || isHlsUrl(value) ? value : '';
}

function getTrailerEmbedUrl(url, muted) {
  const value = String(url || '').trim();
  if (!value) return '';

  const youtubeId = getYoutubeVideoId(value);
  if (youtubeId) {
    const params = new URLSearchParams({
      autoplay: '1',
      controls: '0',
      modestbranding: '1',
      playsinline: '1',
      rel: '0',
      mute: muted ? '1' : '0',
    });
    return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host.endsWith('vimeo.com') && parts[0]) {
      return `https://player.vimeo.com/video/${parts[0]}?autoplay=1&muted=${muted ? 1 : 0}&controls=0`;
    }
  } catch {
    // Non-URL values fall through to direct video detection.
  }

  return isDirectVideoUrl(value) ? value : '';
}

function getEpisodePreviewUrl(movie) {
  const episode = Array.isArray(movie?.episodes) ? movie.episodes[0] : null;
  return String(
    movie?.preview_video_url
      || movie?.previewVideoUrl
      || movie?.video_url
      || movie?.videoUrl
      || episode?.video_url
      || episode?.videoUrl
      || ''
  ).trim();
}

function getPreviewSource(movie, muted, allowEmbeddedFallback = true) {
  const cleanEpisodeUrl = extractCleanVideoUrl(getEpisodePreviewUrl(movie));
  if (cleanEpisodeUrl) {
    return {
      type: 'clean-video',
      url: cleanEpisodeUrl,
    };
  }

  const trailerUrl = getTrailerUrl(movie);
  const cleanTrailerUrl = extractCleanVideoUrl(trailerUrl);
  if (cleanTrailerUrl) {
    return {
      type: 'clean-video',
      url: cleanTrailerUrl,
    };
  }

  if (!allowEmbeddedFallback) return null;

  const trailerEmbedUrl = getTrailerEmbedUrl(trailerUrl, muted);

  if (trailerEmbedUrl) {
    return {
      type: isDirectVideoUrl(trailerEmbedUrl) ? 'video' : 'iframe',
      url: trailerEmbedUrl,
    };
  }

  const episodeUrl = getEpisodePreviewUrl(movie);
  if (!episodeUrl) return null;

  return {
    type: isDirectVideoUrl(episodeUrl) ? 'video' : 'iframe',
    url: episodeUrl,
  };
}

function CleanPreviewVideo({ src, muted, poster }) {
  const videoRef = useRef(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    if (!muted) video.volume = 0.8;
    video.play().catch(() => {});
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let hls;
    let cancelled = false;
    const play = () => {
      if (!cancelled) video.play().catch(() => {});
    };
    const attachDirectSource = () => {
      video.src = src;
      video.addEventListener('loadedmetadata', play);
      video.load();
    };
    const attachHlsSource = (Hls) => {
      if (cancelled) return;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        return;
      }

      attachDirectSource();
    };

    video.pause();
    video.removeAttribute('src');
    video.load();
    video.muted = mutedRef.current;

    if (isHlsUrl(src)) {
      import('hls.js')
        .then(({ default: Hls }) => attachHlsSource(Hls))
        .catch(() => attachDirectSource());
    } else {
      attachDirectSource();
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', play);
      hls?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      autoPlay
      loop
      muted={muted}
      playsInline
      controls={false}
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      crossOrigin="anonymous"
      onContextMenu={(event) => event.preventDefault()}
      className="absolute inset-0 h-full w-full object-cover animate-fade-in"
    />
  );
}

export default function MovieSlider({ movies, title, categoryId, categoryName }) {
  const [startIndex, setStartIndex] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const [pinnedPreview, setPinnedPreview] = useState(false);
  const [previewExtras, setPreviewExtras] = useState({});
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const hoverTimeout = useRef();
  const sliderRef = useRef();
  const popupRef = useRef(null);
  const posterRefs = useRef([]);
  const didDragRef = useRef(false);
  const previewRequestIds = useRef(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const dragStartIndex = useRef(0);
  const [seeMoreHover, setSeeMoreHover] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE);
  const navigate = useNavigate();

  const MAX_POSTERS = 12;
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

  const closePreview = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    setPinnedPreview(false);
    setHovered(null);
    setPopupPos(null);
  }, []);

  const updatePopupPosition = (idx) => {
    if (!posterRefs.current[idx] || !sliderRef.current) return;

    const posterRect = posterRefs.current[idx].getBoundingClientRect();
    const sliderRect = sliderRef.current.getBoundingClientRect();
    const popupWidth = 350;
    let left = posterRect.left - sliderRect.left + posterRect.width / 2 - popupWidth / 2;
    left = Math.max(0, Math.min(left, sliderRect.width - popupWidth));
    const top = posterRect.top - sliderRect.top - 100;
    setPopupPos({ left, top });
  };

  const loadPreviewFallback = (movie) => {
    const movieId = movie?.id;
    if (!movieId || Array.isArray(movie?.episodes) || previewRequestIds.current.has(movieId)) return;

    previewRequestIds.current.add(movieId);
    setPreviewLoadingId(movieId);

    fetch(`${API}/api/movies/${movieId}/episodes`)
      .then((response) => (response.ok ? response.json() : []))
      .then((episodes) => {
        setPreviewExtras((current) => ({
          ...current,
          [movieId]: {
            episodes: Array.isArray(episodes) ? episodes : [],
            loaded: true,
          },
        }));
      })
      .catch(() => {
        setPreviewExtras((current) => ({
          ...current,
          [movieId]: {
            episodes: [],
            loaded: true,
          },
        }));
      })
      .finally(() => {
        setPreviewLoadingId((current) => (current === movieId ? null : current));
      });
  };

  const openPreview = (idx, pinned = false) => {
    clearTimeout(hoverTimeout.current);
    const movie = displayMovies[idx];
    if (!movie) return;

    setHovered(idx);
    setPinnedPreview(pinned);
    updatePopupPosition(idx);
    loadPreviewFallback(movie);
  };

  const handleMouseEnter = (idx) => {
    hoverTimeout.current = setTimeout(() => {
      openPreview(idx, false);
    }, 600);
  };

  const handleMouseLeave = () => {
    if (pinnedPreview) return;
    clearTimeout(hoverTimeout.current);
    window.setTimeout(() => {
      if (!popupRef.current?.matches(':hover')) {
        setHovered(null);
        setPopupPos(null);
      }
    }, 120);
  };

  const handlePopupLeave = () => {
    if (pinnedPreview) return;
    setHovered(null);
    setPopupPos(null);
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartX(e.type === 'touchstart' ? e.touches[0].clientX : e.clientX);
    dragStartIndex.current = startIndex;
    didDragRef.current = false;
    setDragDelta(0);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let dx = clientX - dragStartX;
    if (Math.abs(dx) > 8) didDragRef.current = true;
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
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 0);
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

  useEffect(() => {
    if (!pinnedPreview) return undefined;

    const handlePointerDown = (event) => {
      const popupNode = popupRef.current;
      const posterNode = hovered !== null ? posterRefs.current[hovered] : null;

      if (popupNode?.contains(event.target) || posterNode?.contains(event.target)) return;
      closePreview();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closePreview();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePreview, hovered, pinnedPreview]);

  const canScroll = displayMovies.length > visibleCount;
  const previewBaseMovie = hovered !== null ? displayMovies[hovered] : null;
  const previewExtra = previewBaseMovie?.id ? previewExtras[previewBaseMovie.id] : null;
  const previewMovie = previewBaseMovie ? {
    ...previewBaseMovie,
    ...previewExtra,
    episodes: previewExtra?.episodes || previewBaseMovie.episodes,
  } : null;
  const previewHasInlineEpisode = Boolean(getEpisodePreviewUrl(previewBaseMovie));
  const canUseEmbeddedFallback = Boolean(!previewMovie?.id || previewExtra?.loaded || previewHasInlineEpisode);
  const previewSource = getPreviewSource(previewMovie, isMuted, canUseEmbeddedFallback);
  const previewIsLoading = Boolean(previewMovie?.id && previewLoadingId === previewMovie.id);
  const previewPoster = previewMovie
    ? resizeTmdbImage(previewMovie.backdrop || previewMovie.backdrop_url || previewMovie.bg_url || previewMovie.poster_url || previewMovie.poster || FALLBACK_POSTER, 'w780')
    : FALLBACK_POSTER;

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
          style={{ cursor: isDragging && canScroll ? 'grabbing' : canScroll ? 'grab' : 'default' }}
          onMouseDown={canScroll ? handleDragStart : undefined}
          onMouseMove={canScroll ? handleDragMove : undefined}
          onMouseUp={canScroll ? handleDragEnd : undefined}
          onMouseLeave={canScroll ? handleDragEnd : undefined}
          onTouchStart={canScroll ? handleDragStart : undefined}
          onTouchMove={canScroll ? handleDragMove : undefined}
          onTouchEnd={canScroll ? handleDragEnd : undefined}
        >
          <div
            className="flex gap-4"
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
                className="relative flex-shrink-0 group/card w-[160px]"
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                ref={el => posterRefs.current[idx] = el}
              >
                <div
                  className="relative overflow-hidden rounded-xl aspect-[2/3] shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-[1.05] group-hover/card:shadow-[0_10px_30px_rgba(229,9,20,0.3)] bg-section ring-1 ring-white/5 group-hover/card:ring-primary/60 cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (didDragRef.current) return;
                    openPreview(idx, true);
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 z-10 pointer-events-none mix-blend-overlay" />
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
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20 backdrop-blur-[1px] pointer-events-none">
                    <div className="w-12 h-12 rounded-full border-2 border-white bg-primary flex items-center justify-center text-white group-hover/card:scale-110 transition-all shadow-lg hover:bg-white hover:text-primary hover:border-primary">
                      <svg className="w-6 h-6 ml-1 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="mt-3 px-1">
                  <h3 className="text-white font-bold text-sm line-clamp-1 group-hover/card:text-primary transition-colors cursor-pointer" onClick={() => navigate(`/movies/${movie.id}`)}>
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

        {/* Preview Popup */}
        {hovered !== null && popupPos && previewMovie && (
          <div
            ref={popupRef}
            className="absolute z-[100] w-[350px] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.8)] ring-1 ring-white/5 transition-opacity duration-200"
            style={{ top: popupPos.top, left: popupPos.left }}
            onMouseLeave={handlePopupLeave}
          >
            <div className="group/popup-img relative aspect-video w-full overflow-hidden bg-black">
              <img
                src={previewPoster}
                alt={previewMovie.title}
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.src = FALLBACK_POSTER; }}
                className={`h-full w-full object-cover transition-transform duration-700 group-hover/popup-img:scale-105 ${previewSource ? 'opacity-0' : 'opacity-100'}`}
              />
              {(previewSource?.type === 'clean-video' || previewSource?.type === 'video') && (
                <CleanPreviewVideo
                  key={previewSource.url}
                  src={previewSource.url}
                  muted={isMuted}
                  poster={previewPoster}
                />
              )}
              {previewSource?.type === 'iframe' && (
                <iframe
                  key={previewSource.url}
                  src={previewSource.url}
                  title={`Preview ${previewMovie.title || ''}`}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}
              {!previewSource && previewIsLoading && (
                <div className="absolute inset-0 grid place-items-center bg-black/70">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/5 to-transparent pointer-events-none" />

              {previewSource && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMuted((value) => !value); }}
                  className="absolute bottom-3 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white hover:bg-black/80"
                  aria-label={isMuted ? 'Bat tieng preview' : 'Tat tieng preview'}
                >
                  {isMuted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
              )}
            </div>

            <div className="px-5 pb-5 pt-2 relative z-10">
              <h3 className="text-lg font-bold text-white leading-tight mb-1">{previewMovie.title}</h3>
              <div className="flex gap-2.5 mb-4 mt-2">
                <button 
                  type="button"
                  onClick={() => navigate(`/watch/${previewMovie.id}`)}
                  className="w-10 h-10 bg-white hover:bg-white/80 text-black rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-md"
                  aria-label="Xem phim"
                >
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <button type="button" className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110" aria-label="Them vao danh sach">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                </button>
                <button type="button" onClick={() => navigate(`/watch/${previewMovie.id}`)} className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110" aria-label="Di toi phim">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => navigate(`/movies/${previewMovie.id}`)} className="w-10 h-10 rounded-full border-2 border-white/40 hover:border-white hover:bg-white/10 text-white flex items-center justify-center transition-all hover:scale-110" aria-label="Chi tiet phim">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </button>
              </div>

              <div className="flex items-center gap-2 mb-3 text-xs font-semibold">
                {previewMovie.imdb_rating && (
                  <span className="text-green-400 font-bold">{Number(previewMovie.imdb_rating).toFixed(1)} Điểm</span>
                )}
                {previewMovie.release_year && (
                  <span className="text-white/70">{previewMovie.release_year}</span>
                )}
                {previewMovie.age_limit && (
                  <span className="px-1.5 border border-white/30 text-white/70 rounded">{previewMovie.age_limit}</span>
                )}
                {previewMovie.duration && (
                  <span className="text-white/70">{previewMovie.duration}</span>
                )}
                {previewMovie.quality && (
                  <span className="border border-white/30 px-1 rounded text-white/90 uppercase text-[10px] tracking-wider">{previewMovie.quality}</span>
                )}
              </div>

              {previewMovie.genres && previewMovie.genres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {previewMovie.genres.slice(0, 3).map((tag, idx) => (
                    <React.Fragment key={tag.name || tag}>
                      <span className="text-[13px] text-white/90 font-medium hover:text-white cursor-pointer" onClick={() => navigate(`/movies?genre=${encodeURIComponent(tag.name || tag)}`)}>{tag.name || tag}</span>
                      {idx < Math.min(previewMovie.genres.length, 3) - 1 && <span className="text-white/30 text-[10px] mx-0.5">•</span>}
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
