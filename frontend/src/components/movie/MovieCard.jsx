import { memo, useEffect, useState } from 'react';
import ImageLoader from '../common/ImageLoader';
import InlineIcon from '../common/InlineIcon';
import { FALLBACK_POSTER, safePosterUrl } from '../../utils/imageFallbacks';

function getPosterUrl(movie) {
  return safePosterUrl(movie?.poster_url || movie?.poster || movie?.posterPath || movie?.poster_path);
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
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="relative overflow-hidden bg-[#1A1A1A] rounded-2xl aspect-[2/3] w-full">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="bg-[#1A1A1A] h-4 rounded w-3/4 mx-auto relative overflow-hidden">
         <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="bg-[#1A1A1A] h-3 rounded w-1/2 mx-auto relative overflow-hidden">
         <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
    </div>
  );
}

const MovieCard = memo(function MovieCard({
  movie,
  onClick,
  onPlay,
  className = '',
  showPlay = true,
  showScore = false,
  titleClassName = '',
  subtitleClassName = '',
}) {
  const posterUrl = getPosterUrl(movie);
  const [posterSrc, setPosterSrc] = useState(posterUrl);
  const rating = getRating(movie);
  const subtitle = getSubtitle(movie);
  const score = Number(movie?.score);

  useEffect(() => {
    setPosterSrc(posterUrl);
  }, [posterUrl]);

  return (
    <div
      className={`relative flex flex-col group/card cursor-pointer min-w-0 z-0 hover:z-20 ${className}`}
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
      <div className="relative overflow-hidden rounded-2xl aspect-[2/3] shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-[1.08] group-hover/card:shadow-[0_15px_40px_rgba(168,85,247,0.4)] group-hover/card:-translate-y-3 bg-[#141414] ring-1 ring-white/5 group-hover/card:ring-2 group-hover/card:ring-purple-500/60">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 z-10 pointer-events-none mix-blend-overlay" />
        <ImageLoader
          src={posterSrc}
          alt={movie?.title || 'Movie poster'}
          className="absolute inset-0 w-full h-full"
        />

        {showScore && score > 0 && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-purple-600 to-pink-600 backdrop-blur-md px-2 py-1 rounded-md text-[11px] font-bold text-white shadow-[0_0_10px_rgba(236,72,153,0.5)] z-20">
            {Math.round(score)}
          </div>
        )}

        {!showScore && movie?.badge && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-2 py-0.5 rounded-md shadow-[0_0_10px_rgba(236,72,153,0.5)] z-20">
            {movie.badge}
          </div>
        )}

        <MovieRatingBadge rating={rating} className="z-20" />

        {movie?.quality && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/65 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 border border-white/10 z-20">
            {movie.quality}
          </div>
        )}

        {showPlay && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px] z-10">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlay?.(event);
              }}
              className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(236,72,153,0.6)] group-hover/card:scale-110 transition-transform duration-300"
              aria-label="Xem phim"
            >
              <InlineIcon name="play" size={28} className="ml-1 drop-shadow-md" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 text-center px-1 transition-transform duration-300 group-hover/card:-translate-y-1">
        <h3 className={`text-white font-bold text-sm line-clamp-1 group-hover/card:text-transparent group-hover/card:bg-clip-text group-hover/card:bg-gradient-to-r group-hover/card:from-purple-300 group-hover/card:to-pink-300 transition-all ${titleClassName}`}>
          {movie?.title || 'Chưa có tên phim'}
        </h3>
        {subtitle && (
          <p className={`text-text-secondary text-xs mt-0.5 line-clamp-1 transition-colors group-hover/card:text-white/80 ${subtitleClassName}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
});

export default MovieCard;
