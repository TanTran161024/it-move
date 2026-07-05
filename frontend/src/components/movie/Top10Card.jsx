import React, { useEffect, useState } from 'react';
import { FALLBACK_POSTER, safePosterUrl } from '../../utils/imageFallbacks';

function resizeTmdbImage(url, size) {
  const safeUrl = safePosterUrl(url);
  return safeUrl.replace('/t/p/original/', `/t/p/${size}/`);
}

const Top10Card = React.memo(function Top10Card({ movie, rank, onClick, shouldLoad = true }) {
  const posterUrl = shouldLoad ? resizeTmdbImage(movie?.poster_url || movie?.poster || FALLBACK_POSTER, 'w342') : FALLBACK_POSTER;
  const [posterSrc, setPosterSrc] = useState(posterUrl);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPosterSrc(posterUrl);
    setLoaded(false);
  }, [posterUrl]);

  return (
    <div
      className="relative flex h-[260px] w-[240px] md:h-[320px] md:w-[320px] flex-shrink-0 cursor-pointer items-end group/card py-4"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(event);
        }
      }}
    >
      {/* Huge Rank Number */}
      <div 
        className="pointer-events-none absolute left-0 bottom-0 md:bottom-2 z-0 flex w-[60%] md:w-[55%] justify-end select-none font-heading text-[150px] md:text-[240px] font-black leading-[0.8] tracking-tighter text-[#121212] drop-shadow-2xl"
        style={{
          WebkitTextStroke: '4px rgba(255, 255, 255, 0.8)',
          textShadow: '4px 4px 0px rgba(0,0,0,0.4)',
          paddingRight: '10px' // Prevent clipping of the stroke on the right side
        }}
      >
        {rank}
      </div>

      {/* Movie Poster */}
      <div className="absolute right-0 md:right-4 bottom-4 md:bottom-6 z-10 w-[55%] md:w-[52%] aspect-[2/3] overflow-hidden rounded-xl bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-1 ring-white/10 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:-translate-y-2 group-hover/card:scale-[1.02] group-hover/card:shadow-[0_20px_40px_rgba(229,9,20,0.3)] group-hover/card:ring-primary/60">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 z-10 pointer-events-none mix-blend-overlay" />
        
        <div className="absolute inset-0 z-0 flex flex-col justify-end bg-gradient-to-br from-white/10 via-white/[0.03] to-black px-3 py-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/30">Top {rank}</div>
          <div className="mt-1 line-clamp-2 text-sm font-bold text-white/75">{movie?.title || 'Đang tải...'}</div>
        </div>

        <img
          src={posterSrc}
          alt={movie?.title || 'Top 10 Movie'}
          className={`absolute inset-0 z-[1] h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading={rank <= 5 ? 'eager' : 'lazy'}
          fetchPriority={rank <= 5 ? 'high' : 'low'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (posterSrc !== FALLBACK_POSTER) {
              setPosterSrc(FALLBACK_POSTER);
            } else {
              setLoaded(true);
            }
          }}
        />

        {movie?.quality && (
          <div className="absolute top-2 right-2 z-20 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 border border-white/20 backdrop-blur-md">
            {movie.quality}
          </div>
        )}
      </div>
    </div>
  );
});

export default Top10Card;
