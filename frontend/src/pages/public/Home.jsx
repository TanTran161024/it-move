import { useEffect, useState } from 'react';
import axios from 'axios';
import Banner from '../../components/layout/Banner';
import MovieSlider from '../../components/movie/MovieSlider';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function normalizeMovie(movie) {
  return {
    ...movie,
    poster: movie.poster_url,
    originalTitle: movie.original_title || movie.title,
  };
}

export default function Home() {
  const [newMovies, setNewMovies] = useState([]);
  const [topViewedMovies, setTopViewedMovies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [moviesByCategory, setMoviesByCategory] = useState({});

  useEffect(() => {
    axios.get(`${API}/api/movies`).then((res) => {
      const movies = Array.isArray(res.data) ? res.data : [];
      setNewMovies(movies.slice(0, 16).map(normalizeMovie));
      setTopViewedMovies(
        [...movies]
          .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
          .slice(0, 16)
          .map(normalizeMovie)
      );
    });

    axios.get(`${API}/api/categories`).then((res) => {
      const categoryList = Array.isArray(res.data) ? res.data : [];
      setCategories(categoryList);

      categoryList.forEach((category) => {
        axios.get(`${API}/api/categories/${category.id}/movies`).then((moviesRes) => {
          const movies = Array.isArray(moviesRes.data) ? moviesRes.data.map(normalizeMovie) : [];
          setMoviesByCategory((current) => ({
            ...current,
            [category.id]: movies,
          }));
        }).catch((err) => {
          console.error(`Lỗi khi lấy phim cho danh mục ${category.name}:`, err);
        });
      });
    }).catch((err) => {
      console.error('Lỗi khi lấy danh mục:', err);
    });
  }, []);

  return (
    <div className="w-full bg-background min-h-screen pb-20">
      {/* Banner is now truly edge-to-edge full width */}
      <Banner />
      
      {/* Movie Sliders Container */}
      <div className="w-full max-w-[2000px] mx-auto px-4 sm:px-8 md:px-12 lg:px-16 relative z-20 space-y-8 md:space-y-12">
        <MovieSlider movies={newMovies} title="Phim mới cập nhật" />
        <MovieSlider movies={topViewedMovies} title="Phim xem nhiều nhất" />

        {categories.map((category) => (
          <MovieSlider
            key={category.id}
            movies={moviesByCategory[category.id] || []}
            title={category.name}
            categoryId={category.id}
            categoryName={category.name}
          />
        ))}
      </div>
    </div>
  );
}
