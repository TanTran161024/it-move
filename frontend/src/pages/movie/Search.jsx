import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FilterBox from '../../components/filter/FilterBox';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import { API_URL as API } from '../../config/api';

const PAGE_SIZE = 16;

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111111'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23E50914'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

export default function Search() {
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [country, setCountry] = useState(["Tất cả"]);
  const [type, setType] = useState("Tất cả");
  const [rating, setRating] = useState(["Tất cả"]);
  const [genre, setGenre] = useState(["Tất cả"]);
  const [year, setYear] = useState(["Tất cả"]);
  const [inputYear, setInputYear] = useState("");
  const [sort, setSort] = useState("Mới nhất");
  const [tab, setTab] = useState('movie');
  const [loading, setLoading] = useState(true);
  const [allActors, setAllActors] = useState([]);

  const query = useQuery();
  const navigate = useNavigate();
  const searchTerm = query.get('q')?.trim() || "";
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (localSearchTerm.trim()) {
      navigate(`/search?q=${encodeURIComponent(localSearchTerm.trim())}`);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/movies`)
      .then(res => res.json())
      .then(data => {
        setMovies(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (tab === 'actor' && allActors.length === 0) {
      setLoading(true);
      fetch(`${API}/actors`)
        .then(res => res.json())
        .then(data => {
          setAllActors(data);
          setLoading(false);
        });
    }
  }, [tab, allActors.length]);

  const filteredMovies = searchTerm
    ? movies.filter(m =>
        m.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.original_title?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : movies;

  const filteredActors = searchTerm
    ? allActors.filter(a => a.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : allActors;

  const pagedMovies = filteredMovies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedActors = filteredActors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil((tab === 'movie' ? filteredMovies.length : filteredActors.length) / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-16 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Search Header */}
        <div className="mb-8">
          <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto mb-10">
            <input
              type="text"
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              placeholder="Tìm kiếm phim, diễn viên..."
              className="w-full bg-white/10 border border-white/20 rounded-full py-4 pl-14 pr-6 text-white text-lg focus:outline-none focus:border-primary focus:bg-white/15 transition-all shadow-lg backdrop-blur-md"
            />
            <button type="submit" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
              <SearchIcon fontSize="large" />
            </button>
          </form>

          {searchTerm && (
            <h1 className="text-2xl md:text-3xl font-bold mb-6">
              Kết quả tìm kiếm cho <span className="text-primary">"{searchTerm}"</span>
            </h1>
          )}

          {/* Tabs & Filter Toggle */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
              <button
                onClick={() => { setTab('movie'); setPage(1); }}
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${tab === 'movie' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:text-white'}`}
              >
                Phim ({filteredMovies.length})
              </button>
              <button
                onClick={() => { setTab('actor'); setPage(1); }}
                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${tab === 'actor' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:text-white'}`}
              >
                Diễn viên ({filteredActors.length})
              </button>
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

        {/* Filter Box */}
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

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse flex flex-col gap-2">
                <div className="bg-white/10 rounded-xl aspect-[2/3] w-full" />
                <div className="bg-white/10 h-4 rounded w-3/4 mx-auto mt-2" />
              </div>
            ))}
          </div>
        ) : tab === 'movie' ? (
          pagedMovies.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 animate-in fade-in duration-500">
              {pagedMovies.map(movie => (
                <div key={movie.id} className="relative flex flex-col group/card cursor-pointer" onClick={() => navigate(`/movies/${movie.id}`)}>
                  <div className="relative overflow-hidden rounded-xl aspect-[2/3] shadow-lg transition-transform duration-300 group-hover/card:scale-105 group-hover/card:shadow-2xl bg-surface">
                    <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover pointer-events-none" onError={(e) => { e.currentTarget.src = FALLBACK_POSTER; }} />
                    {movie.imdb_rating && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 flex items-center gap-1 shadow-md">
                        <span className="text-[#f5c518] text-xs font-bold">★</span>
                        <span className="text-white text-xs font-bold">{Number(movie.imdb_rating).toFixed(1)}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/watch/${movie.id}`); }} className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center backdrop-blur-sm text-primary group-hover/card:scale-110 transition-transform">
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
              <p className="text-text-secondary text-lg">Không tìm thấy phim nào phù hợp.</p>
            </div>
          )
        ) : (
          pagedActors.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 animate-in fade-in duration-500">
              {pagedActors.map(actor => (
                <div key={actor.id} className="flex flex-col items-center group/actor cursor-pointer">
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden mb-3 border-4 border-transparent group-hover/actor:border-primary transition-all duration-300 shadow-xl relative">
                    <img src={actor.profile_pic_url || '/avatar-actor.svg'} alt={actor.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} />
                    <div className="absolute inset-0 bg-black/20 group-hover/actor:bg-transparent transition-colors" />
                  </div>
                  <h3 className="text-white font-bold text-center group-hover/actor:text-primary transition-colors">{actor.name}</h3>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-surface/50 rounded-2xl border border-white/5">
              <SearchIcon className="text-6xl text-white/10 mb-4" />
              <p className="text-text-secondary text-lg">Không tìm thấy diễn viên nào phù hợp.</p>
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
                className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-white/10 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                &lt;
              </button>
              
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                // Simple pagination logic for demonstration
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
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
