import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AddIcon from '@mui/icons-material/Add';
import BarChartIcon from '@mui/icons-material/BarChart';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PersonIcon from '@mui/icons-material/Person';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import SearchIcon from '@mui/icons-material/Search';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import ForgotPasswordDialog from '../auth/ForgotPasswordDialog';
import LoginDialog from '../auth/LoginDialog';
import RegisterDialog from '../auth/RegisterDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL as API } from '../../config/api';

const NAV_ITEMS = [
  { label: 'Thể loại', menu: 'genres' },
  { label: 'Phim lẻ', query: { is_series: 0 } },
  { label: 'Phim bộ', query: { is_series: 1 } },
  { label: 'Quốc gia', menu: 'countries' },
  { label: 'Diễn viên', query: { tab: 'actor' } },
];

const SEARCH_FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='144' viewBox='0 0 96 144'%3E%3Crect width='96' height='144' fill='%23111111'/%3E%3Cpath d='M38 54v36l30-18z' fill='%23E50914'/%3E%3C/svg%3E";

function buildMoviesUrl(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => params.set(key, value));
  return `/movies?${params.toString()}`;
}

const MotionDiv = motion.div;

export default function Header() {
  const [openLogin, setOpenLogin] = useState(false);
  const [openRegister, setOpenRegister] = useState(false);
  const [openForgot, setOpenForgot] = useState(false);
  const [searchValue, setSearchValue] = useState(() => localStorage.getItem('searchInputValue') || '');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  
  const [genreAnchor, setGenreAnchor] = useState(null);
  const [countryAnchor, setCountryAnchor] = useState(null);
  const [mobileAnchor, setMobileAnchor] = useState(null);
  const [userAnchor, setUserAnchor] = useState(null);
  const [notificationAnchor, setNotificationAnchor] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!location.pathname.startsWith('/search')) {
      localStorage.setItem('searchInputValue', searchValue);
    }
  }, [searchValue, location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/search')) {
      setSearchValue('');
      setSearchSuggestions([]);
      localStorage.removeItem('searchInputValue');
    }
  }, [location.pathname]);

  useEffect(() => {
    const query = searchValue.trim();
    if (!isSearchOpen || query.length < 2) {
      setSearchSuggestions([]);
      setSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`${API}/api/movies/smart-search?q=${encodeURIComponent(query)}&limit=6`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
        .then((payload) => {
          setSearchSuggestions(Array.isArray(payload.movies) ? payload.movies : []);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setSearchSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearchOpen, searchValue]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/genres`).then((res) => res.json()),
      fetch(`${API}/api/countries`).then((res) => res.json()),
    ])
      .then(([genreData, countryData]) => {
        setGenres(Array.isArray(genreData) ? genreData : []);
        setCountries(Array.isArray(countryData) ? countryData : []);
      })
      .catch((error) => console.error('Không thể tải dữ liệu menu:', error));
  }, []);

  const closeMenus = () => {
    setGenreAnchor(null);
    setCountryAnchor(null);
    setMobileAnchor(null);
  };

  const goTo = (url) => {
    closeMenus();
    navigate(url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchSuggestions([]);
  };

  const goToSearchResults = () => {
    const query = searchValue.trim();
    if (!query) return;
    closeSearch();
    goTo(`/search?q=${encodeURIComponent(query)}`);
  };

  const goToMovie = (movieId) => {
    closeSearch();
    setSearchValue('');
    goTo(`/movies/${movieId}`);
  };

  const handleNavClick = (event, item) => {
    if (item.menu === 'genres') {
      setCountryAnchor(null);
      setGenreAnchor(event.currentTarget);
      return;
    }

    if (item.menu === 'countries') {
      setGenreAnchor(null);
      setCountryAnchor(event.currentTarget);
      return;
    }

    goTo(buildMoviesUrl(item.query));
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter' && searchValue.trim()) {
      goToSearchResults();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUserAnchor(null);
    navigate('/');
  };

  const modernPaperProps = {
    elevation: 0,
    sx: {
      bgcolor: 'rgba(15, 15, 15, 0.85)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      color: 'white',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 3,
      boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
      mt: 1.5,
      '& .MuiMenuItem-root': {
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRadius: 1.5,
        mx: 1,
        my: 0.5,
        px: 2,
        py: 1.2,
        fontSize: '0.9rem',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.85)',
        '&:hover': {
          bgcolor: 'rgba(255,255,255,0.1)',
          color: 'white',
          transform: 'translateX(6px)'
        }
      }
    }
  };

  return (
    <header className={`fixed top-0 w-full z-50 transition-all duration-500 ease-in-out ${isScrolled ? 'bg-background/95 backdrop-blur-md shadow-lg shadow-black/20 py-2' : 'bg-gradient-to-b from-black/80 to-transparent py-4'}`}>
      <div className="container mx-auto px-4 md:px-8 flex items-center justify-between">
        {/* Left Side: Brand & Nav */}
        <div className="flex items-center gap-8">
          <IconButton
            className="md:!hidden !text-white"
            onClick={(event) => setMobileAnchor(event.currentTarget)}
          >
            <MenuIcon />
          </IconButton>

          <RouterLink to="/" className="flex items-center gap-2 group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <PlayCircleIcon className="text-primary text-4xl group-hover:scale-110 transition-transform" />
            <span className="font-heading font-bold text-2xl tracking-wide hidden sm:block text-white">IT Move</span>
          </RouterLink>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                className="text-text-secondary hover:text-white hover:font-medium transition-colors flex items-center gap-1 text-sm font-medium"
                onClick={(event) => handleNavClick(event, item)}
              >
                {item.label}
                {item.menu && <ExpandMoreIcon fontSize="small" className="opacity-70" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Right Side: Search & User */}
        <div className="flex items-center gap-4">
          {/* Animated Search Bar */}
          <div className="flex items-center justify-end relative">
            <AnimatePresence>
              {isSearchOpen && (
                <MotionDiv
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute right-10 top-1/2 -translate-y-1/2"
                >
                  <input
                    type="text"
                    placeholder="Tìm phim..."
                    className="w-full bg-surface/80 border border-border rounded-full py-1.5 px-4 text-sm text-white placeholder-text-secondary focus:outline-none focus:border-primary/50"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    autoFocus
                  />
                  {searchValue.trim().length >= 2 && (
                    <div className="absolute right-0 top-11 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#141414]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
                      {searchLoading ? (
                        <div className="p-3 space-y-3">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="flex gap-3 animate-pulse">
                              <div className="w-12 h-16 rounded bg-white/10" />
                              <div className="flex-1 py-1">
                                <div className="h-3 rounded bg-white/10 w-3/4 mb-2" />
                                <div className="h-3 rounded bg-white/10 w-1/2" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : searchSuggestions.length > 0 ? (
                        <>
                          <div className="max-h-[420px] overflow-y-auto py-2">
                            {searchSuggestions.map((movie) => (
                              <button
                                key={movie.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  goToMovie(movie.id);
                                }}
                                className="w-full flex gap-3 px-3 py-2 text-left hover:bg-white/10 transition-colors"
                              >
                                <img
                                  src={movie.poster_url || SEARCH_FALLBACK_POSTER}
                                  alt={movie.title}
                                  className="w-12 h-16 rounded-md object-cover bg-black flex-shrink-0"
                                  onError={(event) => { event.currentTarget.src = SEARCH_FALLBACK_POSTER; }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-white line-clamp-1">{movie.title}</div>
                                  <div className="text-xs text-white/55 line-clamp-1 mt-0.5">{movie.original_title || movie.release_year || 'Phim'}</div>
                                  <div className="flex items-center gap-2 mt-2 text-[11px] text-white/65">
                                    {movie.release_year && <span>{movie.release_year}</span>}
                                    {movie.imdb_rating && <span className="text-[#f5c518] font-bold">IMDb {Number(movie.imdb_rating).toFixed(1)}</span>}
                                    {movie.quality && <span>{movie.quality}</span>}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              goToSearchResults();
                            }}
                            className="w-full border-t border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                          >
                            Xem tất cả kết quả
                          </button>
                        </>
                      ) : (
                        <div className="px-4 py-5 text-sm text-white/60">
                          Thử tên phim, thể loại hoặc quốc gia khác.
                        </div>
                      )}
                    </div>
                  )}
                </MotionDiv>
              )}
            </AnimatePresence>
            <IconButton
              onClick={() => {
                setIsSearchOpen((value) => {
                  const next = !value;
                  if (!next) setSearchSuggestions([]);
                  return next;
                });
              }}
              className="!text-white hover:!bg-white/10"
            >
              <SearchIcon />
            </IconButton>
          </div>

          {user?.username ? (
            <div className="flex items-center gap-2">
              <IconButton
                className="!text-white hover:!bg-white/10"
                onClick={(event) => setNotificationAnchor(event.currentTarget)}
              >
                <NotificationsNoneIcon />
              </IconButton>
              
              <button
                onClick={(event) => setUserAnchor(event.currentTarget)}
                className="flex items-center gap-2 hover:bg-white/5 p-1 rounded-md transition-colors"
              >
                <Avatar src={user.avatar || undefined} sx={{ width: 32, height: 32 }} className="border border-border">
                  {!user.avatar && user.username[0]?.toUpperCase()}
                </Avatar>
                <ExpandMoreIcon className="text-white/70" fontSize="small" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setOpenLogin(true)}
              className="bg-primary hover:bg-red-600 text-white font-medium text-sm px-4 py-1.5 rounded flex items-center gap-2 transition-colors"
            >
              <PersonIcon fontSize="small" />
              <span className="hidden sm:inline">Đăng nhập</span>
            </button>
          )}
        </div>
      </div>

      {/* Menus using MUI (Keeping business logic intact) */}
      <Menu
        anchorEl={genreAnchor}
        open={Boolean(genreAnchor)}
        onClose={() => setGenreAnchor(null)}
        disableScrollLock={true}
        PaperProps={{ sx: { ...modernPaperProps.sx, minWidth: 400, p: 2 } }}
      >
        <Typography variant="subtitle2" sx={{ color: '#B3B3B3', mb: 2 }}>Chọn thể loại</Typography>
        <div className="grid grid-cols-3 gap-2">
          {genres.map((genre) => (
            <button
              key={genre.id}
              className="text-left text-sm text-gray-300 hover:text-white hover:bg-white/10 py-1.5 px-3 rounded transition-colors"
              onClick={() => goTo(`/movies?genre=${encodeURIComponent(genre.name)}`)}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </Menu>

      <Menu
        anchorEl={countryAnchor}
        open={Boolean(countryAnchor)}
        onClose={() => setCountryAnchor(null)}
        disableScrollLock={true}
        PaperProps={{ sx: { ...modernPaperProps.sx, minWidth: 200, p: 2 } }}
      >
        <Typography variant="subtitle2" sx={{ color: '#B3B3B3', mb: 2 }}>Chọn quốc gia</Typography>
        <div className="flex flex-col gap-1">
          {countries.map((country) => (
            <button
              key={country.id}
              className="text-left text-sm text-gray-300 hover:text-white hover:bg-white/10 py-1.5 px-3 rounded transition-colors"
              onClick={() => goTo(`/movies?country=${encodeURIComponent(country.name)}`)}
            >
              {country.name}
            </button>
          ))}
        </div>
      </Menu>

      <Menu
        anchorEl={mobileAnchor}
        open={Boolean(mobileAnchor)}
        onClose={() => setMobileAnchor(null)}
        disableScrollLock={true}
        PaperProps={{ sx: { ...modernPaperProps.sx, width: 280 } }}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <span className="font-bold text-lg">Menu</span>
          <IconButton onClick={() => setMobileAnchor(null)} size="small" className="!text-white hover:!bg-white/10"><CloseIcon /></IconButton>
        </div>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1 }} />
        <MenuItem onClick={() => goTo('/movies?is_series=0')}>Phim lẻ</MenuItem>
        <MenuItem onClick={() => goTo('/movies?is_series=1')}>Phim bộ</MenuItem>
        <MenuItem onClick={() => goTo('/movies?tab=actor')}>Diễn viên</MenuItem>
      </Menu>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
        disableScrollLock={true}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { ...modernPaperProps.sx, width: 250 } }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <Avatar src={user.avatar || undefined} sx={{ width: 40, height: 40, border: '2px solid rgba(255,255,255,0.1)' }}>
            {!user.avatar && user.username?.[0]?.toUpperCase()}
          </Avatar>
          <div>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Xin chào,</Typography>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white', lineHeight: 1.2 }}>{user.username}</Typography>
          </div>
        </div>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/favorites'); }} sx={{ gap: 1.5 }}><FavoriteBorderIcon fontSize="small" /> Yêu thích</MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/list'); }} sx={{ gap: 1.5 }}><AddIcon fontSize="small" /> Danh sách</MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/history'); }} sx={{ gap: 1.5 }}><HistoryIcon fontSize="small" /> Lịch sử xem</MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/continue'); }} sx={{ gap: 1.5 }}><PlayCircleIcon fontSize="small" /> Xem tiếp</MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/profile'); }} sx={{ gap: 1.5 }}><AccountCircleIcon fontSize="small" /> Tài khoản</MenuItem>
        {Boolean(user.is_admin) && (
          <MenuItem onClick={() => { setUserAnchor(null); navigate('/admin'); }} sx={{ gap: 1.5, color: '#3498db' }}><BarChartIcon fontSize="small" /> Admin Dashboard</MenuItem>
        )}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
        <MenuItem onClick={handleLogout} sx={{ gap: 1.5, color: '#ff4757', '&:hover': { bgcolor: 'rgba(255, 71, 87, 0.1) !important', color: '#ff6b81' } }}><LogoutIcon fontSize="small" /> Đăng xuất</MenuItem>
      </Menu>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        disableScrollLock={true}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { ...modernPaperProps.sx, width: 320, p: 2 } }}
      >
        <Typography variant="subtitle1" fontWeight="bold" mb={1}>Thông báo</Typography>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2 }} />
        <Typography variant="body2" sx={{ color: '#B3B3B3', textAlign: 'center', py: 4 }}>Chưa có thông báo mới</Typography>
      </Menu>

      <LoginDialog
        open={openLogin}
        onClose={() => setOpenLogin(false)}
        onRegister={() => { setOpenLogin(false); setOpenRegister(true); }}
        onForgot={() => { setOpenLogin(false); setOpenForgot(true); }}
      />
      <RegisterDialog
        open={openRegister}
        onClose={() => setOpenRegister(false)}
        onLogin={() => { setOpenRegister(false); setOpenLogin(true); }}
      />
      <ForgotPasswordDialog
        open={openForgot}
        onClose={() => setOpenForgot(false)}
        onLogin={() => { setOpenForgot(false); setOpenLogin(true); }}
      />
    </header>
  );
}
