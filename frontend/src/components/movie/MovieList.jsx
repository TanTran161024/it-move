import { useNavigate } from 'react-router-dom';
import MovieCard from './MovieCard';

export default function MovieList({ movies = [] }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
      {movies.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          onClick={() => navigate(`/movies/${movie.id}`)}
          onPlay={() => navigate(`/watch/${movie.id}`)}
        />
      ))}
    </div>
  );
}
