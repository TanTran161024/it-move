import { useEffect, useState } from 'react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

export const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111111'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23E50914'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

function getPosterUrl(movie) {
  return movie?.poster_url || movie?.poster || movie?.posterPath || movie?.poster_path || FALLBACK_POSTER;
}

function getSubtitle(movie) {
  return movie?.original_title || movie?.originalTitle || movie?.release_year || movie?.release_date || movie?.quality || '';
}

function getRating(movie) {
  const rating = Number(movie?.imdb_rating ?? movie?.voteAverage ?? movie?.vote_average);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

function formatRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return '';
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

export function MovieRatingBadge({ rating, className = '' }) {
  const normalizedRating = Number(rating);
  if (!Number.isFinite(normalizedRating) || normalizedRating <= 0) return null;

  return (
    <div className={`absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded border border-white/10 flex items-center gap-1 shadow-md ${className}`}>
      <span className="text-[#f5c518] text-xs font-bold">★</span>
      <span className="text-white text-xs font-bold">{formatRating(normalizedRating)}</span>
    </div>
  );
}

export function MovieCardSkeleton({ className = '' }) {
  return (
    <div className={`animate-pulse flex flex-col gap-2 ${className}`}>
      <div className="bg-white/10 rounded-xl aspect-[2/3] w-full" />
      <div className="bg-white/10 h-4 rounded w-3/4 mx-auto mt-2" />
      <div className="bg-white/10 h-3 rounded w-1/2 mx-auto" />
    </div>
  );
}

export default function MovieCard({
  movie,
  onClick,
  onPlay,
  className = '',
  showPlay = true,
  showScore = false,
  titleClassName = '',
  subtitleClassName = '',
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const posterUrl = getPosterUrl(movie);
  const [posterSrc, setPosterSrc] = useState(posterUrl);
  const rating = getRating(movie);
  const subtitle = getSubtitle(movie);
  const score = Number(movie?.score);

  useEffect(() => {
    setPosterSrc(posterUrl);
    setImageLoaded(false);
  }, [posterUrl]);

  return (
    <div
      className={`relative flex flex-col group/card cursor-pointer min-w-0 ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      }}
    >
      <div className="relative overflow-hidden rounded-xl aspect-[2/3] shadow-lg transition-transform duration-300 group-hover/card:scale-105 group-hover/card:shadow-2xl bg-surface">
        {!imageLoaded && (
          <div className="absolute inset-0 z-0 flex items-center justify-center bg-white/10">
            <div className="h-7 w-7 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
          </div>
        )}
        <img
          src={posterSrc}
          alt={movie?.title || 'Movie poster'}
          referrerPolicy="no-referrer"
          loading="lazy"
          className={`w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            if (posterSrc !== FALLBACK_POSTER) {
              setPosterSrc(FALLBACK_POSTER);
              setImageLoaded(false);
            } else {
              setImageLoaded(true);
            }
          }}
        />

        {showScore && score > 0 && (
          <div className="absolute top-2 left-2 bg-primary/85 backdrop-blur-md px-2 py-1 rounded text-[11px] font-bold text-white shadow-md">
            {Math.round(score)}
          </div>
        )}

        {!showScore && movie?.badge && (
          <div className="absolute top-2 left-2 bg-primary text-white text-xs font-bold px-2 py-0.5 rounded shadow-md">
            {movie.badge}
          </div>
        )}

        <MovieRatingBadge rating={rating} />

        {movie?.quality && (
          <div className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 border border-white/10">
            {movie.quality}
          </div>
        )}

        {showPlay && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlay?.(event);
              }}
              className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center backdrop-blur-sm text-primary group-hover/card:scale-110 transition-transform"
              aria-label="Xem phim"
            >
              <PlayArrowIcon />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 text-center px-1">
        <h3 className={`text-white font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors ${titleClassName}`}>
          {movie?.title || 'Chưa có tên phim'}
        </h3>
        {subtitle && (
          <p className={`text-text-secondary text-xs mt-0.5 line-clamp-1 ${subtitleClassName}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
