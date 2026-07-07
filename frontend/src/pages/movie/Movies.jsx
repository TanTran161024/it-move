import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FilterBox from '../../components/filter/FilterBox';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import { API_BASE_URL as API } from '../../config/api';

const PAGE_SIZE = 16;

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
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const location = useLocation();
  const navigate = useNavigate();

  const categoryInfo = location.state;

  function getIsSeries() {
    const params = new URLSearchParams(location.search);
    return params.get('is_series');
  }
  const isSeriesParam = getIsSeries();
  const isSeries = isSeriesParam === '1' ? true : isSeriesParam === '0' ? false : null;

  function getGenre() {
    const params = new URLSearchParams(location.search);
    return params.get('genre');
  }
  const genreParam = getGenre();

  function getCountry() {
    const params = new URLSearchParams(location.search);
    return params.get('country');
  }
  const countryParam = getCountry();

  function getTab() {
    const params = new URLSearchParams(location.search);
    return params.get('tab');
  }
  const tabParam = getTab();
  const isActorTab = tabParam === 'actor';

  const fetchAllMovies = useCallback(() => {
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
        setLoading(false);
      });
  }, [countryParam, genreParam, isSeries]);

  useEffect(() => {
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

    setLoading(true);

    if (isActorTab) {
      fetch(`${API}/api/actors`)
        .then(res => res.json())
        .then(data => { setActors(data); setLoading(false); });
    } else {
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
            setLoading(false);
          })
          .catch(err => {
            console.error('Lỗi khi lấy phim theo danh mục:', err);
            fetchAllMovies();
          });
      } else {
        fetchAllMovies();
      }
    }
  }, [isSeries, genreParam, countryParam, isActorTab, categoryInfo, fetchAllMovies]);

  const handleFilter = (filters) => {
    if (categoryInfo && categoryInfo.filterType === 'category' && categoryInfo.categoryId) {
      setLoading(true);
      fetch(`${API}/api/categories/${categoryInfo.categoryId}/movies`)
        .then(res => res.json())
        .then(categoryMovies => {
          let filtered = [...categoryMovies];
          if (filters.type && filters.type !== 'Tất cả') {
            const isSeries = filters.type === 'Phim bộ';
            filtered = filtered.filter(m => !!m.is_series === isSeries);
          }
          if (filters.genre && Array.isArray(filters.genre) && filters.genre.length > 0) {
            filtered = filtered.filter(m => {
              const movieGenres = Array.isArray(m.genres) ? m.genres : (m.genres ? JSON.parse(m.genres) : []);
              return filters.genre.some(selectedGenre => 
                movieGenres.some(g => {
                  const genreName = typeof g === 'object' ? g.name : g;
                  return genreName.toLowerCase() === selectedGenre.toLowerCase();
                })
              );
            });
          }
          if (filters.country && Array.isArray(filters.country) && filters.country.length > 0) {
            filtered = filtered.filter(m => {
              const movieCountries = Array.isArray(m.countries) ? m.countries : (m.countries ? JSON.parse(m.countries) : []);
              return filters.country.some(selectedCountry => 
                movieCountries.some(c => (c.name || c).toLowerCase() === selectedCountry.toLowerCase())
              );
            });
          }
          setMovies(filtered);
          setPage(1);
          setLoading(false);
        })
        .catch(err => {
          console.error('Lỗi khi lọc phim theo danh mục:', err);
          handleFilterAllMovies(filters);
        });
    } else {
      handleFilterAllMovies(filters);
    }
  };

  const handleFilterAllMovies = (filters) => {
    setLoading(true);
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
        setLoading(false);
      });
  };

  const pagedMovies = movies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedActors = actors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil((isActorTab ? actors.length : movies.length) / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header & Filter */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <h1 className="text-2xl md:text-3xl font-black text-white">{pageTitle}</h1>
          {!isActorTab && (
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border ${showFilter ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-text-secondary hover:text-white hover:bg-white/10'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
              Bộ lọc
            </button>
          )}
        </div>

        {/* Filter Box */}
        {!isActorTab && showFilter && (
          <div className="mb-8 p-6 bg-surface border border-white/10 rounded-2xl animate-in slide-in-from-top-4 fade-in duration-300">
            <FilterBox
              country={country} setCountry={setCountry}
              type={type} setType={setType}
              version={version} setVersion={setVersion}
              rating={rating} setRating={setRating}
              genre={genre} setGenre={setGenre}
              year={year} setYear={setYear}
              inputYear={inputYear} setInputYear={setInputYear}
              sort={sort} setSort={setSort}
              onClose={() => setShowFilter(false)}
              onFilter={handleFilter}
            />
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <MovieCardSkeleton key={i} />
            ))}
          </div>
        ) : isActorTab ? (
          pagedActors.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 animate-in fade-in duration-500">
              {pagedActors.map((actor, idx) => (
                <button
                  key={`actor-${actor.id || idx}`}
                  type="button"
                  onClick={() => actor.id && navigate(`/dien-vien/${actor.id}`)}
                  className="flex flex-col items-center group/actor cursor-pointer text-left"
                >
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden mb-3 border-4 border-transparent group-hover/actor:border-primary transition-all duration-300 shadow-xl relative">
                    <img src={actor.profile_pic_url || '/avatar-actor.svg'} alt={actor.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} />
                    <div className="absolute inset-0 bg-black/20 group-hover/actor:bg-transparent transition-colors" />
                  </div>
                  <h3 className="text-white font-bold text-center group-hover/actor:text-primary transition-colors">{actor.name}</h3>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-white/[0.02] rounded-3xl border border-white/5">
              <p className="text-text-secondary text-lg">Không có diễn viên nào để hiển thị.</p>
            </div>
          )
        ) : (
          pagedMovies.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in duration-500">
              {pagedMovies.map((movie, idx) => (
                <MovieCard
                  key={movie.id ? `movie-${movie.id}` : `idx-${idx}`}
                  movie={movie}
                  onClick={() => navigate(`/movies/${movie.id}`)}
                  onPlay={() => navigate(`/watch/${movie.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-white/[0.02] rounded-3xl border border-white/5">
              <h2 className="text-2xl font-black text-white mb-2">Không tìm thấy phim</h2>
              <p className="text-text-secondary text-base">Thử thay đổi bộ lọc để xem nhiều kết quả hơn.</p>
            </div>
          )
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                &lt;
              </button>
              
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                if (totalPages > 5 && pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - page) > 1) {
                  if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="text-white/30 px-1">...</span>;
                  return null;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      page === pageNum 
                        ? 'bg-primary text-white shadow-lg shadow-primary/25 scale-105' 
                        : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                &gt;
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
