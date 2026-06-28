import { useNavigate } from 'react-router-dom';

const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111111'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23E50914'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

export default function MovieList({ movies }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
      {movies.map(movie => (
        <div
          key={movie.id}
          className="relative flex flex-col group/card cursor-pointer"
          onClick={() => navigate(`/movies/${movie.id}`)}
        >
          <div className="relative overflow-hidden rounded-xl aspect-[2/3] shadow-lg transition-transform duration-300 group-hover/card:scale-105 group-hover/card:shadow-2xl bg-surface">
            <img
              src={movie.poster_url || movie.poster}
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover pointer-events-none"
              onError={(e) => { e.currentTarget.src = FALLBACK_POSTER; }}
            />
            {/* Rating Badge */}
            {movie.imdb_rating && (
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 flex items-center gap-1 shadow-md">
                <span className="text-[#f5c518] text-xs font-bold">★</span>
                <span className="text-white text-xs font-bold">{Number(movie.imdb_rating).toFixed(1)}</span>
              </div>
            )}
            {/* Play Button Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <button 
                onClick={(e) => { e.stopPropagation(); navigate(`/watch/${movie.id}`); }}
                className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center backdrop-blur-sm text-primary group-hover/card:scale-110 transition-transform"
              >
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
            </div>
          </div>

          <div className="mt-3 text-center px-1">
            <h3 className="text-white font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">
              {movie.title}
            </h3>
            <p className="text-text-secondary text-xs mt-0.5 line-clamp-1">
              {movie.original_title || movie.originalTitle || movie.release_year || movie.release_date}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
} 