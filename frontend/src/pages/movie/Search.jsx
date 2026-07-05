import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FilterBox from '../../components/filter/FilterBox';
import SearchIcon from '@mui/icons-material/Search';
import MovieCard, { MovieCardSkeleton } from '../../components/movie/MovieCard';
import { API_URL as API } from '../../config/api';

const PAGE_SIZE = 16;
const SEARCH_EXAMPLES = [
  'phim zombie Hàn Quốc',
  'phim tình cảm học đường Nhật',
  'phim hài gia đình nhẹ nhàng',
];
const SEARCH_EMPTY_SUGGESTIONS = [
  'anime Nhật học đường',
  'phim trinh thám bí ẩn',
  'hài nhẹ nhàng',
];
const ALL_OPTION = 'Tất cả';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSmartFilterLabels(filters) {
  if (!filters) return [];
  return [
    ...(filters.countries || []),
    ...(filters.genres || []),
    filters.year,
    filters.mood,
    ...(filters.keywords || []),
  ].filter(Boolean);
}

function selectedValues(value) {
  if (Array.isArray(value)) return value.filter((item) => item && item !== ALL_OPTION);
  return value && value !== ALL_OPTION ? [value] : [];
}

function includesAny(values, selected) {
  if (!selected.length) return true;
  const normalizedValues = (Array.isArray(values) ? values : [values]).map(normalizeText).filter(Boolean);
  return selected.some((item) => normalizedValues.some((value) => value === normalizeText(item)));
}

function getMovieYear(movie) {
  return Number(movie.release_year || String(movie.release_date || '').slice(0, 4)) || null;
}

function getMovieTime(movie) {
  const value = movie.updated_at || movie.created_at || movie.release_date || movie.release_year;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function matchesMovieFilters(movie, filters) {
  const selectedCountries = selectedValues(filters.country);
  const selectedGenres = selectedValues(filters.genre);
  const selectedRatings = selectedValues(filters.rating);
  const selectedYears = selectedValues(filters.year);

  if (!includesAny(movie.countries || movie.country, selectedCountries)) return false;
  if (!includesAny(movie.genres || movie.genre, selectedGenres)) return false;

  if (selectedRatings.length && !selectedRatings.includes(movie.age_limit)) return false;

  if (selectedYears.length) {
    const movieYear = getMovieYear(movie);
    if (!selectedYears.map(Number).includes(movieYear)) return false;
  }

  if (filters.type === 'Phim lẻ' && Number(movie.is_series) === 1) return false;
  if (filters.type === 'Phim bộ' && Number(movie.is_series) !== 1) return false;

  return true;
}

function sortMovies(movies, sort) {
  return [...movies].sort((left, right) => {
    if (sort === 'Điểm IMDb') {
      return (Number(right.imdb_rating) || 0) - (Number(left.imdb_rating) || 0);
    }
    if (sort === 'Lượt xem') {
      return (Number(right.views) || 0) - (Number(left.views) || 0);
    }
    if (sort === 'Mới cập nhật') {
      return getMovieTime(right) - getMovieTime(left);
    }
    return (getMovieYear(right) || 0) - (getMovieYear(left) || 0) || getMovieTime(right) - getMovieTime(left);
  });
}

export default function Search() {
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [country, setCountry] = useState(['Tất cả']);
  const [type, setType] = useState('Tất cả');
  const [rating, setRating] = useState(['Tất cả']);
  const [genre, setGenre] = useState(['Tất cả']);
  const [year, setYear] = useState(['Tất cả']);
  const [inputYear, setInputYear] = useState('');
  const [sort, setSort] = useState('Mới nhất');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [smartMeta, setSmartMeta] = useState(null);

  const query = useQuery();
  const navigate = useNavigate();
  const searchTerm = query.get('q')?.trim() || '';
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  useEffect(() => {
    setLocalSearchTerm(searchTerm);
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [country, type, rating, genre, year, inputYear, sort]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const nextQuery = localSearchTerm.trim();
    if (nextQuery) {
      navigate(`/search?q=${encodeURIComponent(nextQuery)}`);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    async function fetchMovies() {
      setLoading(true);
      setError('');
      setSmartMeta(null);

      try {
        if (searchTerm) {
          const smartRes = await fetch(`${API}/movies/smart-search?q=${encodeURIComponent(searchTerm)}`, {
            signal: controller.signal,
          });
          if (!smartRes.ok) throw new Error('smart-search failed');
          const payload = await smartRes.json();
          setMovies(Array.isArray(payload.movies) ? payload.movies : []);
          setSmartMeta(payload);
          return;
        }

        const res = await fetch(`${API}/movies`, { signal: controller.signal });
        if (!res.ok) throw new Error('Không thể tải danh sách phim.');
        const data = await res.json();
        setMovies(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name === 'AbortError') return;

        if (searchTerm) {
          try {
            const fallbackRes = await fetch(`${API}/movies`, { signal: controller.signal });
            const fallbackMovies = await fallbackRes.json();
            const normalizedQuery = normalizeText(searchTerm);
            setMovies((Array.isArray(fallbackMovies) ? fallbackMovies : []).filter((movie) => (
              normalizeText(movie.title).includes(normalizedQuery)
              || normalizeText(movie.original_title).includes(normalizedQuery)
            )));
            setError('Tìm kiếm thông minh đang bận, đã dùng tìm kiếm cơ bản.');
          } catch {
            setError('Không thể tìm kiếm lúc này.');
            setMovies([]);
          }
          return;
        }

        setError(err.message || 'Không thể tải danh sách phim.');
        setMovies([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchMovies();
    return () => controller.abort();
  }, [searchTerm]);

  const filterYear = inputYear && /^\d{4}$/.test(inputYear) ? [inputYear] : year;
  const filteredMovies = sortMovies(
    movies.filter((movie) => matchesMovieFilters(movie, {
      country,
      type,
      rating,
      genre,
      year: filterYear,
    })),
    sort
  );
  const pagedMovies = filteredMovies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filteredMovies.length / PAGE_SIZE);
  const smartFilterLabels = getSmartFilterLabels(smartMeta?.filters);

  const goExample = (example) => {
    setLocalSearchTerm(example);
    navigate(`/search?q=${encodeURIComponent(example)}`);
  };

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto mb-6">
            <input
              type="text"
              value={localSearchTerm}
              onChange={(event) => setLocalSearchTerm(event.target.value)}
              placeholder="Nhập tên phim, diễn viên hoặc đạo diễn..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-primary focus:bg-white/10 transition-all shadow-xl backdrop-blur-md placeholder:text-white/30"
            />
            <button type="submit" className="absolute left-5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
              <SearchIcon fontSize="large" />
            </button>
          </form>

          <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-2 mb-10">
            {SEARCH_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => goExample(example)}
                className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-text-secondary hover:text-white hover:bg-white/10 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>

          {searchTerm && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-2">
              <h1 className="text-2xl md:text-3xl font-black">
                Kết quả cho <span className="text-primary">"{searchTerm}"</span>
              </h1>
              {smartFilterLabels.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="text-sm text-text-secondary py-1">Đang tìm:</span>
                  {smartFilterLabels.map((label) => (
                    <span key={label} className="px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-sm">
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {smartMeta?.relaxed && (
                <div className="mt-4 rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
                  Không có kết quả khớp tuyệt đối, đang hiển thị các phim gần với tiêu chí của bạn.
                </div>
              )}
              {error && (
                <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="px-5 py-2 rounded-full bg-primary text-white shadow-md font-bold text-sm">
              Phim ({filteredMovies.length})
            </div>

            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border ${showFilter ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-text-secondary hover:text-white hover:bg-white/10'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
              Bộ lọc
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="mb-8 p-6 bg-surface border border-white/10 rounded-2xl animate-in slide-in-from-top-4 fade-in duration-300">
            <FilterBox
              country={country} setCountry={setCountry}
              type={type} setType={setType}
              rating={rating} setRating={setRating}
              genre={genre} setGenre={setGenre}
              year={year} setYear={setYear}
              inputYear={inputYear} setInputYear={setInputYear}
              sort={sort} setSort={setSort}
              onClose={() => setShowFilter(false)}
              onFilter={() => {
                setPage(1);
                setShowFilter(false);
              }}
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <MovieCardSkeleton key={index} />
            ))}
          </div>
        ) : pagedMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in duration-500">
            {pagedMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                showScore={Boolean(searchTerm)}
                onClick={() => navigate(`/movies/${movie.id}`)}
                onPlay={() => navigate(`/watch/${movie.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white/[0.02] rounded-3xl border border-white/5 animate-in fade-in zoom-in-95">
            <SearchIcon className="text-6xl text-white/20 mb-4" />
            <h2 className="text-2xl font-black text-white">Chưa có kết quả khớp</h2>
            <p className="mx-auto mt-3 max-w-xl text-text-secondary text-base">
              Thử bỏ bớt bộ lọc, đổi thể loại hoặc dùng từ khóa ngắn hơn.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SEARCH_EMPTY_SUGGESTIONS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => goExample(term)}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-text-secondary hover:text-white hover:bg-white/10 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                &lt;
              </button>

              {Array.from({ length: totalPages }).map((_, index) => {
                const pageNum = index + 1;
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
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
