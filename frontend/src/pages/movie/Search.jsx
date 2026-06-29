import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FilterBox from '../../components/filter/FilterBox';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import { API_URL as API } from '../../config/api';

const PAGE_SIZE = 16;
const SEARCH_EXAMPLES = [
  'phim zombie Hàn Quốc',
  'phim tình cảm học đường Nhật',
  'phim hài gia đình nhẹ nhàng',
];

const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111111'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23E50914'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

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

  const filteredMovies = movies;
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
          <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto mb-4">
            <input
              type="text"
              value={localSearchTerm}
              onChange={(event) => setLocalSearchTerm(event.target.value)}
              placeholder="Tìm phim bằng tên hoặc mô tả tự nhiên..."
              className="w-full bg-white/10 border border-white/20 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-primary focus:bg-white/15 transition-all shadow-lg backdrop-blur-md"
            />
            <button type="submit" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
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
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold">
                Kết quả tìm kiếm cho <span className="text-primary">"{searchTerm}"</span>
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
              onFilter={() => {}}
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="animate-pulse flex flex-col gap-2">
                <div className="bg-white/10 rounded-xl aspect-[2/3] w-full" />
                <div className="bg-white/10 h-4 rounded w-3/4 mx-auto mt-2" />
              </div>
            ))}
          </div>
        ) : pagedMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 animate-in fade-in duration-500">
            {pagedMovies.map((movie) => (
              <div key={movie.id} className="relative flex flex-col group/card cursor-pointer" onClick={() => navigate(`/movies/${movie.id}`)}>
                <div className="relative overflow-hidden rounded-xl aspect-[2/3] shadow-lg transition-transform duration-300 group-hover/card:scale-105 group-hover/card:shadow-2xl bg-surface">
                  <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover pointer-events-none" onError={(event) => { event.currentTarget.src = FALLBACK_POSTER; }} />
                  {movie.imdb_rating && (
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 flex items-center gap-1 shadow-md">
                      <span className="text-[#f5c518] text-xs font-bold">★</span>
                      <span className="text-white text-xs font-bold">{Number(movie.imdb_rating).toFixed(1)}</span>
                    </div>
                  )}
                  {movie.score > 0 && searchTerm && (
                    <div className="absolute top-2 left-2 bg-primary/80 backdrop-blur-md px-2 py-1 rounded text-[11px] font-bold">
                      {movie.score}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button onClick={(event) => { event.stopPropagation(); navigate(`/watch/${movie.id}`); }} className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center backdrop-blur-sm text-primary group-hover/card:scale-110 transition-transform">
                      <PlayArrowIcon />
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-center px-1">
                  <h3 className="text-white font-medium text-sm line-clamp-1 group-hover/card:text-primary transition-colors">{movie.title}</h3>
                  <p className="text-text-secondary text-xs mt-0.5 line-clamp-1">{movie.original_title || movie.release_year}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-surface/50 rounded-2xl border border-white/5">
            <SearchIcon className="text-6xl text-white/10 mb-4" />
            <p className="text-text-secondary text-lg">Thử tìm theo thể loại, quốc gia hoặc tên phim khác.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-white/10 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                &lt;
              </button>

              {Array.from({ length: totalPages }).map((_, index) => {
                const pageNum = index + 1;
                if (totalPages > 5 && pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - page) > 1) {
                  if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="text-white/50 px-2">...</span>;
                  return null;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${page === pageNum ? 'bg-primary text-white shadow-lg' : 'bg-surface border border-white/10 text-white hover:bg-white/10'}`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-white/10 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
