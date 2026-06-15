import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Pagination, Stack, Button } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import './Movies.css';
import { Link, useLocation } from 'react-router-dom';
import FilterBox from '../components/filter/FilterBox';

const PAGE_SIZE = 16;

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function Search() {
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
  const [tab, setTab] = useState('movie');
  const [actors, setActors] = useState([]);
  const query = useQuery();
  const searchTerm = query.get('q')?.trim() || "";

  useEffect(() => {
    if (tab === 'actor') {
      fetch('http://localhost:5000/api/actors')
        .then(res => res.json())
        .then(data => setActors(data));
    }
  }, [tab]);

  const safeSetGenre = (val) => {
    if (Array.isArray(val)) setGenre(val);
    else if (typeof val === 'string') setGenre([val]);
    else setGenre(['Tất cả']);
  };

  useEffect(() => {
    fetch('http://localhost:5000/api/movies')
      .then(res => res.json())
      .then(data => {
        setMovies(data);
      });
  }, []);

  // Lọc phim và diễn viên theo searchTerm
  const filteredMovies = searchTerm
    ? movies.filter(m =>
        m.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.original_title?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : movies;

  const [allActors, setAllActors] = useState([]);
  useEffect(() => {
    fetch('http://localhost:5000/api/actors')
      .then(res => res.json())
      .then(data => setAllActors(data));
  }, []);
  const filteredActors = searchTerm
    ? allActors.filter(a => a.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : allActors;

  const pagedMovies = filteredMovies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedActors = filteredActors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Box className="movies-outer-container">
      <Box className="movies-content">
        <Box className="movies-container">
          <div className="movies-filter-wrapper">
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h4" className="movies-page-title" sx={{ fontWeight: 'bold', color: 'white' }}>
                Kết quả tìm kiếm "{searchTerm}"
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Button
                variant={tab === 'movie' ? 'contained' : 'text'}
                onClick={() => setTab('movie')}
                sx={{
                  bgcolor: tab === 'movie' ? '#fff' : '#23242a',
                  color: tab === 'movie' ? '#23242a' : '#bdbdbd',
                  px: 3, py: 1, borderRadius: 999, fontWeight: 500, fontSize: 18,
                  boxShadow: tab === 'movie' ? 1 : 'none',
                  '&:hover': { bgcolor: tab === 'movie' ? '#fff' : '#23242a' },
                  minWidth: 100
                }}
              >
                Phim
              </Button>
              <Button
                variant={tab === 'actor' ? 'contained' : 'text'}
                onClick={() => setTab('actor')}
                sx={{
                  bgcolor: tab === 'actor' ? '#fff' : '#23242a',
                  color: tab === 'actor' ? '#23242a' : '#bdbdbd',
                  px: 3, py: 1, borderRadius: 999, fontWeight: 500, fontSize: 18,
                  boxShadow: tab === 'actor' ? 1 : 'none',
                  '&:hover': { bgcolor: tab === 'actor' ? '#fff' : '#23242a' },
                  minWidth: 100
                }}
              >
                Diễn viên
              </Button>
            </Box>
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
                onFilter={() => {}}
              />
            )}
          </div>
          {tab === 'movie' ? (
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
          ) : (
            <Grid container spacing={3} className="movies-list">
              {pagedActors.map((actor, idx) => (
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
          )}
          <Stack alignItems="center" className="movies-pagination">
            <Pagination
              count={tab === 'movie' ? Math.ceil(filteredMovies.length / PAGE_SIZE) : Math.ceil(filteredActors.length / PAGE_SIZE)}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
              shape="rounded"
            />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
} 
