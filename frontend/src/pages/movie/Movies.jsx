import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, CardMedia, CardContent, Chip, Pagination, Stack, Button, TextField, Divider } 
from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import './Movies.css';
import { Link, useLocation } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import InputAdornment from '@mui/material/InputAdornment';
import FilterBox from '../../components/filter/FilterBox';

const PAGE_SIZE = 16;
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [country, setCountry] = useState(["Tất cả"]);
  const [type, setType] = useState("Tất cả");
  const [rating, setRating] = useState(["Tất cả"]);
  const [genre, setGenre] = useState(["Tất cả"]);
  const [version, setVersion] = useState("Tất cả");
  const [year, setYear] = useState(["Tất cả"]);
  const [inputYear, setInputYear] = useState("");
  const [sort, setSort] = useState("Mới nhất");
  const [pageTitle, setPageTitle] = useState("Danh Sách Phim");
  const location = useLocation();

  // Kiểm tra xem có thông tin danh mục từ navigation không
  const categoryInfo = location.state;

  // Đảm bảo mọi lần setGenre đều là mảng
  const safeSetGenre = (val) => {
    if (Array.isArray(val)) setGenre(val);
    else if (typeof val === 'string') setGenre([val]);
    else setGenre(['Tất cả']);
  };

  // Lấy query param is_series
  function getIsSeries() {
    const params = new URLSearchParams(location.search);
    return params.get('is_series');
  }
  const isSeriesParam = getIsSeries();
  const isSeries = isSeriesParam === '1' ? true : isSeriesParam === '0' ? false : null;

  // Lấy query param genre
  function getGenre() {
    const params = new URLSearchParams(location.search);
    return params.get('genre');
  }
  const genreParam = getGenre();

  // Lấy query param country
  function getCountry() {
    const params = new URLSearchParams(location.search);
    return params.get('country');
  }
  const countryParam = getCountry();

  // Lấy query param tab
  function getTab() {
    const params = new URLSearchParams(location.search);
    return params.get('tab');
  }
  const tabParam = getTab();
  const isActorTab = tabParam === 'actor';

  const [actors, setActors] = useState([]);
  
  useEffect(() => {
    // Cập nhật tiêu đề trang
    if (isActorTab) {
      setPageTitle("Diễn Viên");
    } else if (categoryInfo && categoryInfo.filterType === 'category') {
      setPageTitle(categoryInfo.categoryName);
    } else if (genreParam) {
      setPageTitle(`Phim ${genreParam}`);
    } else if (countryParam) {
      setPageTitle(`Phim ${countryParam}`);
    } else if (isSeries === true) {
      setPageTitle("Phim Bộ");
    } else if (isSeries === false) {
      setPageTitle("Phim Lẻ");
    } else {
      setPageTitle("Danh Sách Phim");
    }

    if (isActorTab) {
      fetch(`${API}/api/actors`)
        .then(res => res.json())
        .then(data => setActors(data));
    } else {
      // Nếu có thông tin danh mục, lấy phim theo danh mục
      if (categoryInfo && categoryInfo.filterType === 'category' && categoryInfo.categoryId) {
        fetch(`${API}/api/categories/${categoryInfo.categoryId}/movies`)
          .then(res => res.json())
          .then(data => {
            let filtered = data;
            if (isSeries !== null) {
              filtered = filtered.filter(m => !!m.is_series === isSeries);
            }
            if (genreParam) {
              filtered = filtered.filter(m =>
                (Array.isArray(m.genres) ? m.genres : (m.genres ? JSON.parse(m.genres) : [])).some(g =>
                  (g.name || g).toLowerCase() === genreParam.toLowerCase()
                )
              );
            }
            if (countryParam) {
              filtered = filtered.filter(m =>
                (Array.isArray(m.countries) ? m.countries : (m.countries ? JSON.parse(m.countries) : [])).some(c =>
                  (c.name || c).toLowerCase() === countryParam.toLowerCase()
                )
              );
            }
            setMovies(filtered);
          })
          .catch(err => {
            console.error('Lỗi khi lấy phim theo danh mục:', err);
            // Fallback: lấy tất cả phim
            fetchAllMovies();
          });
      } else {
        // Lấy tất cả phim như cũ
        fetchAllMovies();
      }
    }
  }, [isSeries, genreParam, countryParam, isActorTab, categoryInfo]);

  const fetchAllMovies = () => {
    fetch(`${API}/api/movies`)
      .then(res => res.json())
      .then(data => {
        let filtered = data;
        if (isSeries !== null) {
          filtered = filtered.filter(m => !!m.is_series === isSeries);
        }
        if (genreParam) {
          filtered = filtered.filter(m =>
            (Array.isArray(m.genres) ? m.genres : (m.genres ? JSON.parse(m.genres) : [])).some(g =>
              (g.name || g).toLowerCase() === genreParam.toLowerCase()
            )
          );
        }
        if (countryParam) {
          filtered = filtered.filter(m =>
            (Array.isArray(m.countries) ? m.countries : (m.countries ? JSON.parse(m.countries) : [])).some(c =>
              (c.name || c).toLowerCase() === countryParam.toLowerCase()
            )
          );
        }
        setMovies(filtered);
      });
  };

  // Hàm filter phim
  const handleFilter = (filters) => {
    console.log('Filter applied:', filters);
    console.log('Category info:', categoryInfo);
    
    // Nếu có thông tin danh mục, lọc trong phạm vi danh mục đó
    if (categoryInfo && categoryInfo.filterType === 'category' && categoryInfo.categoryId) {
      console.log('Filtering within category:', categoryInfo.categoryId);
      
      // Lấy phim theo danh mục trước
      fetch(`${API}/api/categories/${categoryInfo.categoryId}/movies`)
        .then(res => res.json())
        .then(categoryMovies => {
          console.log('Category movies:', categoryMovies);
          
          // Sau đó áp dụng filter trên danh sách phim của danh mục
          let filtered = [...categoryMovies];
          
          // Áp dụng filter loại phim
          if (filters.type && filters.type !== 'Tất cả') {
            const isSeries = filters.type === 'PHIM BỘ';
            filtered = filtered.filter(m => !!m.is_series === isSeries);
            console.log('After type filter:', filtered.length);
          }
          
          // Áp dụng filter thể loại
          if (filters.genre && Array.isArray(filters.genre) && filters.genre.length > 0) {
            console.log('Genre filter:', filters.genre);
            filtered = filtered.filter(m => {
              const movieGenres = Array.isArray(m.genres) ? m.genres : (m.genres ? JSON.parse(m.genres) : []);
              console.log('Movie genres for', m.title, ':', movieGenres);
              
              const hasMatchingGenre = filters.genre.some(selectedGenre => 
                movieGenres.some(g => {
                  const genreName = typeof g === 'object' ? g.name : g;
                  const match = genreName.toLowerCase() === selectedGenre.toLowerCase();
                  console.log(`Comparing: "${genreName}" with "${selectedGenre}" = ${match}`);
                  return match;
                })
              );
              
              console.log('Movie', m.title, 'has matching genre:', hasMatchingGenre);
              return hasMatchingGenre;
            });
            console.log('After genre filter:', filtered.length);
          }
          
          // Áp dụng filter quốc gia
          if (filters.country && Array.isArray(filters.country) && filters.country.length > 0) {
            filtered = filtered.filter(m => {
              const movieCountries = Array.isArray(m.countries) ? m.countries : (m.countries ? JSON.parse(m.countries) : []);
              return filters.country.some(selectedCountry => 
                movieCountries.some(c => (c.name || c).toLowerCase() === selectedCountry.toLowerCase())
              );
            });
            console.log('After country filter:', filtered.length);
          }
          
          console.log('Final filtered movies:', filtered);
          setMovies(filtered);
          setPage(1);
        })
        .catch(err => {
          console.error('Lỗi khi lọc phim theo danh mục:', err);
          // Fallback: lọc từ tất cả phim
          handleFilterAllMovies(filters);
        });
    } else {
      console.log('Filtering all movies');
      // Nếu không có danh mục, lọc từ tất cả phim như cũ
      handleFilterAllMovies(filters);
    }
  };

  // Hàm filter từ tất cả phim (fallback)
  const handleFilterAllMovies = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'genre') {
        if (Array.isArray(value) && value.length > 0 && !(value.length === 1 && value[0] === 'Tất cả')) {
          value.forEach(g => params.append('genre', g));
        }
      } else {
        if (value && value !== 'Tất cả') params.append(key, value);
      }
    });
    fetch(`${API}/api/movies/filter?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMovies(data);
        } else {
          setMovies([]);
        }
        setPage(1);
      });
  };

  const pagedMovies = movies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="movies-container">
      {/* Bộ lọc header và box sát trái */}
      <div className="movies-filter-wrapper">
        <Typography variant="h4" className="movies-page-title" sx={{ mb: 2, fontWeight: 'bold', color: 'white' }}>
          {pageTitle}
        </Typography>
        {!isActorTab && (
          <>
            <Box className="movies-filter-header" onClick={() => setShowFilter(v => !v)}>
              <FilterListIcon 
                className="movies-filter-icon"
                sx={{ color: showFilter ? '#FFD600' : '#fff', transition: 'color 0.2s' }}
              />
              <Typography variant="h6" className="movies-filter-title">
                Bộ lọc
              </Typography>
            </Box>
            {showFilter && (
              <FilterBox
                country={country}
                setCountry={setCountry}
                type={type}
                setType={setType}
                version={version}
                setVersion={setVersion}
                rating={rating}
                setRating={setRating}
                genre={genre}
                setGenre={setGenre}
                year={year}
                setYear={setYear}
                inputYear={inputYear}
                setInputYear={setInputYear}
                sort={sort}
                setSort={setSort}
                onClose={() => setShowFilter(false)}
                onFilter={handleFilter}
              />
            )}
          </>
        )}
      </div>
      {/* Danh sách phim */}
      {isActorTab ? (
        actors.length > 0 ? (
          <Grid container spacing={3} className="movies-list">
            {actors.map((actor, idx) => (
              <Grid
                item
                xs={6}
                sm={4}
                md={3}
                lg={2}
                xl={1}
                key={`actor-${actor.id || idx}`}
                display="flex"
                flexDirection="column"
                alignItems="center"
              >
                <div className="movies-card-imgbox">
                  <img
                    src={actor.profile_pic_url || '/avatar-actor.svg'}
                    alt={actor.name}
                    className="movies-card-img"
                    style={{ objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }}
                  />
                </div>
                <div className="movies-card-content">
                  <div className="movies-card-title" style={{ textAlign: 'center' }}>{actor.name}</div>
                </div>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography className="movies-empty">
            Không có diễn viên nào để hiển thị.
          </Typography>
        )
      ) : (
        pagedMovies.length > 0 ? (
          <Grid container spacing={3} className="movies-list">
            {pagedMovies.map((movie, idx) => (
              <Grid
                item
                xs={6}
                sm={4}
                md={3}
                lg={2}
                xl={1}
                key={movie.id ? `movie-${movie.id}` : `idx-${idx}`}
                display="flex"
                flexDirection="column"
                alignItems="center"
              >
                <Link to={`/movies/${movie.id}`} style={{ textDecoration: 'none' }}>
                  <div className="movies-card-imgbox">
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="movies-card-img"
                    />
                    {movie.badge && (
                      <span className={`movies-badge movies-badge-${movie.badge}`}>{movie.badge}</span>
                    )}
                  </div>
                </Link>
                <div className="movies-card-content">
                  <div className="movies-card-title">{movie.title}</div>
                  {movie.original_title && movie.original_title !== movie.title && (
                    <div className="movies-card-original">{movie.original_title}</div>
                  )}
                </div>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography className="movies-empty">
            Không có phim nào để hiển thị.
          </Typography>
        )
      )}
      <Stack alignItems="center" className="movies-pagination">
        <Pagination
          count={Math.ceil(movies.length / PAGE_SIZE)}
          page={page}
          onChange={(_, value) => setPage(value)}
          color="primary"
          shape="rounded"
        />
      </Stack>
    </div>
  );
} 
