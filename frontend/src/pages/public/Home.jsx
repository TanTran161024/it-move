import { Box } from '@mui/material';
import MovieSlider from '../../components/movie/MovieSlider';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Banner from '../../components/layout/Banner';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Home() {
  const [newMovies, setNewMovies] = useState([]);
  const [topSeries, setTopSeries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [moviesByCategory, setMoviesByCategory] = useState({});

  useEffect(() => {
    // Lấy tất cả phim
    axios.get(`${API}/api/movies`).then(res => {
      const movies = res.data.slice(0, 16).map(movie => ({
        ...movie,
        poster: movie.poster_url,
        originalTitle: movie.original_title || movie.title,
      }));
      setNewMovies(movies);
      setTopSeries(res.data.slice(0, 10));
    });

    // Lấy danh sách danh mục
    axios.get(`${API}/api/categories`).then(res => {
      setCategories(res.data);
      
      // Với mỗi danh mục, lấy phim thuộc danh mục đó
      res.data.forEach(category => {
        axios.get(`${API}/api/categories/${category.id}/movies`).then(moviesRes => {
          const movies = moviesRes.data.map(movie => ({
            ...movie,
            poster: movie.poster_url,
            originalTitle: movie.original_title || movie.title,
          }));
          setMoviesByCategory(prev => ({
            ...prev,
            [category.id]: movies
          }));
        }).catch(err => {
          console.error(`Lỗi khi lấy phim cho danh mục ${category.name}:`, err);
        });
      });
    }).catch(err => {
      console.error('Lỗi khi lấy danh mục:', err);
    });
  }, []);

  return (
    <Box sx={{ width: '100%', maxWidth: 2000, mx: 'auto', px: { xs: 6, md: 9 } }}>
      <Banner />
      <Box sx={{ width: '100%', mt: 7, mb: 6 }}>
        <Box sx={{ width: '100%', maxWidth: 2000, mx: 'auto' }}>
          {/* Hiển thị "Tất cả phim" */}
          <MovieSlider movies={newMovies} title="Tất cả phim" />
          
          {/* Hiển thị từng danh mục */}
          {categories.map(category => (
            <MovieSlider 
              key={category.id}
              movies={moviesByCategory[category.id] || []} 
              title={category.name}
              categoryId={category.id}
              categoryName={category.name}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
} 