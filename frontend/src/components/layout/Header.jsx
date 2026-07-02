import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
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
import { clearActiveProfile, getActiveProfile, PROFILE_CHANGE_EVENT, profileInitial } from '../../utils/profile';

const NAV_ITEMS = [
  { label: 'Dành cho bạn', path: '/for-you' },
  { label: 'Thể loại', menu: 'genres' },
  { label: 'Phim lẻ', query: { is_series: 0 } },
  { label: 'Phim bộ', query: { is_series: 1 } },
  { label: 'Quốc gia', menu: 'countries' },
  { label: 'Diễn viên', query: { tab: 'actor' } },
];

const SEARCH_FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='144' viewBox='0 0 96 144'%3E%3Crect width='96' height='144' fill='%23111111'/%3E%3Cpath d='M38 54v36l30-18z' fill='%23E50914'/%3E%3C/svg%3E";

const SEARCH_EXAMPLES = [
  'phim zombie Hàn Quốc',
  'phim tình cảm học đường Nhật',
  'phim hài gia đình nhẹ nhàng',
  'phim hành động Hàn Quốc',
];

const SEARCH_EMPTY_SUGGESTIONS = [
  'anime Nhật học đường',
  'phim trinh thám bí ẩn',
  'hài nhẹ nhàng',
];

const RECENT_SEARCHES_KEY = 'movie_recent_searches';

function buildMoviesUrl(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => params.set(key, value));
  return `/movies?${params.toString()}`;
}

function getSmartFilterLabels(filters) {
  if (!filters) return [];
  return [
    ...(filters.countries || []),
    ...(filters.genres || []),
    filters.year,
    filters.mood,
    ...(filters.keywords || []),
  ].filter(Boolean).slice(0, 8);
}

const MotionDiv = motion.div;

export default function Header() {
  const [openLogin, setOpenLogin] = useState(false);
  const [openRegister, setOpenRegister] = useState(false);
  const [openForgot, setOpenForgot] = useState(false);
  const [searchValue, setSearchValue] = useState(() => localStorage.getItem('searchInputValue') || '');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
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
  const [activeProfile, setActiveProfileState] = useState(() => getActiveProfile());
  const searchInputRef = useRef(null);
  const searchOverlayRef = useRef(null);
  const searchCacheRef = useRef({});
  const searchFilterLabels = useMemo(() => getSmartFilterLabels(searchMeta?.filters), [searchMeta]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const syncProfile = () => setActiveProfileState(getActiveProfile());
    window.addEventListener(PROFILE_CHANGE_EVENT, syncProfile);
    window.addEventListener('storage', syncProfile);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, syncProfile);
      window.removeEventListener('storage', syncProfile);
    };
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
      setSearchMeta(null);
      setActiveSearchIndex(-1);
      localStorage.removeItem('searchInputValue');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const savedRecent = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    setRecentSearches(Array.isArray(savedRecent) ? savedRecent.slice(0, 6) : []);

    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const body = document.body;
    const html = document.documentElement;
    const previousBodyStyle = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const previousHtmlStyle = {
      overflow: html.style.overflow,
      scrollBehavior: html.style.scrollBehavior,
    };
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const focusTimer = window.setTimeout(() => {
      searchOverlayRef.current?.scrollTo({ top: 0, left: 0 });
      searchInputRef.current?.focus();
    }, 80);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
        setSearchSuggestions([]);
        setSearchMeta(null);
        setActiveSearchIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousBodyStyle.overflow;
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.width = previousBodyStyle.width;
      body.style.paddingRight = previousBodyStyle.paddingRight;
      html.style.overflow = previousHtmlStyle.overflow;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollY);
      html.style.scrollBehavior = previousHtmlStyle.scrollBehavior;
    };
  }, [isSearchOpen]);

  useEffect(() => {
    const query = searchValue.trim();
    setActiveSearchIndex(-1);

    if (!isSearchOpen || query.length < 1) {
      setSearchSuggestions([]);
      setSearchMeta(null);
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (searchCacheRef.current[query]) {
        const cachedPayload = searchCacheRef.current[query];
        setSearchSuggestions(cachedPayload.movies);
        setSearchMeta(cachedPayload.meta);
        setSearchLoading(false);
        setSearchError('');
        return;
      }

      setSearchLoading(true);
      setSearchError('');
      fetch(`${API}/api/movies/smart-search?q=${encodeURIComponent(query)}&limit=12`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
        .then((payload) => {
          const movies = Array.isArray(payload.movies) ? payload.movies : [];
          const nextMeta = {
            filters: payload.filters || null,
            relaxed: Boolean(payload.relaxed),
            query: payload.query || query,
          };
          searchCacheRef.current[query] = { movies, meta: nextMeta };
          setSearchSuggestions(movies);
          setSearchMeta(nextMeta);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            setSearchSuggestions([]);
            setSearchMeta(null);
            setSearchError('Không thể tìm kiếm lúc này. Thử lại sau ít phút.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 180);

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
    setSearchMeta(null);
    setActiveSearchIndex(-1);
    setSearchLoading(false);
    setSearchError('');
  };

  const openSearch = () => {
    closeMenus();
    searchCacheRef.current = {};
    setIsSearchOpen(true);
  };

  const addRecentSearch = (term) => {
    const normalized = term.trim();
    if (!normalized) return;
    const updated = [normalized, ...recentSearches.filter((item) => item !== normalized)].slice(0, 6);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const goToSearchResults = () => {
    const query = searchValue.trim();
    if (!query) return;
    addRecentSearch(query);
    closeSearch();
    goTo(`/search?q=${encodeURIComponent(query)}`);
  };

  const goToMovie = (movieId) => {
    addRecentSearch(searchValue);
    closeSearch();
    setSearchValue('');
    goTo(`/movies/${movieId}`);
  };

  const openActiveSearchResult = () => {
    const movie = searchSuggestions[activeSearchIndex];
    if (!movie) return false;
    goToMovie(movie.id);
    return true;
  };

  const applySearchTerm = (term) => {
    setSearchValue(term);
    setIsSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleNavClick = (event, item) => {
    if (item.path) {
      goTo(item.path);
      return;
    }

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
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((current) => (
        searchSuggestions.length ? Math.min(current + 1, searchSuggestions.length - 1) : -1
      ));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex((current) => Math.max(current - 1, -1));
      return;
    }

    if (event.key === 'Enter' && activeSearchIndex >= 0 && openActiveSearchResult()) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && searchValue.trim()) {
      goToSearchResults();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    clearActiveProfile();
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
          <IconButton
            onClick={openSearch}
            className="!text-white hover:!bg-white/10"
            data-search-open-button="true"
            aria-label="Mở tìm kiếm"
          >
            <SearchIcon />
          </IconButton>

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
                <Avatar
                  src={activeProfile?.id ? undefined : (user.avatar || undefined)}
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: activeProfile?.avatar_color || '#E50914',
                    color: 'white',
                    fontWeight: 800,
                  }}
                  className="border border-border"
                >
                  {activeProfile?.id ? profileInitial(activeProfile.name) : (!user.avatar && user.username[0]?.toUpperCase())}
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

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
        {isSearchOpen && (
          <MotionDiv
            ref={searchOverlayRef}
            data-search-overlay="true"
            className="fixed inset-0 z-[9998] h-[100dvh] overscroll-contain bg-[#050505]/95 backdrop-blur-2xl text-white overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Đóng tìm kiếm"
              onClick={closeSearch}
            />

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-14 pt-20 md:px-8 md:pt-24">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.28em] text-primary/90">Tìm kiếm</div>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">Bạn muốn xem gì?</h2>
                </div>
                <IconButton
                  onClick={closeSearch}
                  className="!h-11 !w-11 !bg-white/10 !text-white hover:!bg-white/20"
                  aria-label="Đóng tìm kiếm"
                >
                  <CloseIcon />
                </IconButton>
              </div>

              <form
                className="relative mt-8"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToSearchResults();
                }}
              >
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 md:!text-4xl" />
                <input
                  ref={searchInputRef}
                  data-search-input="true"
                  type="text"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Tên phim, thể loại, quốc gia, tâm trạng..."
                  className="w-full rounded-none border-0 border-b-2 border-white/20 bg-transparent py-4 pl-14 pr-4 text-2xl font-bold text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary md:py-6 md:text-5xl"
                />
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {SEARCH_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => applySearchTerm(example)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>

              {searchValue.trim() && searchFilterLabels.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Đang tìm</span>
                  {searchFilterLabels.map((label) => (
                    <span key={label} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      {label}
                    </span>
                  ))}
                  {searchMeta?.relaxed && (
                    <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-100">
                      Kết quả gần đúng
                    </span>
                  )}
                </div>
              )}

              {searchValue.trim().length < 2 ? (
                <div className="mt-12 grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                    <h3 className="text-lg font-bold text-white">Gợi ý tìm kiếm</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                      Gõ tên phim hoặc mô tả tự nhiên như “phim zombie Hàn Quốc”, “hài gia đình nhẹ nhàng”.
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {SEARCH_EXAMPLES.map((example) => (
                        <button
                          key={`large-${example}`}
                          type="button"
                          onClick={() => applySearchTerm(example)}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                        >
                          <span>{example}</span>
                          <SearchIcon fontSize="small" className="text-white/35" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-lg font-bold text-white">Tìm gần đây</h3>
                    {recentSearches.length > 0 ? (
                      <div className="mt-4 flex flex-col gap-2">
                        {recentSearches.map((term) => (
                          <button
                            key={term}
                            type="button"
                            onClick={() => applySearchTerm(term)}
                            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <SearchIcon fontSize="small" className="text-white/35" />
                            <span className="truncate">{term}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-white/45">Các nội dung bạn tìm sẽ xuất hiện ở đây.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-10">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">Kết quả nhanh</h3>
                      <p className="mt-1 text-sm text-white/45">Chỉ hiển thị phim có trong hệ thống.</p>
                    </div>
                    {searchSuggestions.length > 0 && (
                      <button
                        type="button"
                        onClick={goToSearchResults}
                        className="hidden rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-primary hover:text-white sm:inline-flex"
                      >
                        Xem tất cả
                      </button>
                    )}
                  </div>

                  {searchLoading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {Array.from({ length: 12 }).map((_, index) => (
                        <div key={index} className="animate-pulse">
                          <div className="aspect-[2/3] rounded-lg bg-white/10" />
                          <div className="mt-3 h-4 w-4/5 rounded bg-white/10" />
                          <div className="mt-2 h-3 w-2/3 rounded bg-white/10" />
                        </div>
                      ))}
                    </div>
                  ) : searchError ? (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-6 text-red-100">
                      {searchError}
                    </div>
                  ) : searchSuggestions.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                        {searchSuggestions.map((movie, index) => (
                          <button
                            key={movie.id}
                            type="button"
                            onClick={() => goToMovie(movie.id)}
                            onMouseEnter={() => setActiveSearchIndex(index)}
                            className={`group min-w-0 rounded-xl p-1 text-left transition-colors ${activeSearchIndex === index ? 'bg-white/10' : 'hover:bg-white/5'}`}
                          >
                            <div className={`relative aspect-[2/3] overflow-hidden rounded-lg bg-[#171717] shadow-xl ring-2 ring-transparent transition-transform duration-200 ${activeSearchIndex === index ? 'scale-[1.02] ring-primary' : 'group-hover:scale-[1.01]'}`}>
                              <img
                                src={movie.poster_url || SEARCH_FALLBACK_POSTER}
                                alt={movie.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                referrerPolicy="no-referrer"
                                onError={(event) => { event.currentTarget.src = SEARCH_FALLBACK_POSTER; }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                              {movie.imdb_rating && (
                                <span className="absolute right-2 top-2 rounded bg-black/75 px-2 py-1 text-[11px] font-bold text-[#f5c518]">
                                  IMDb {Number(movie.imdb_rating).toFixed(1)}
                                </span>
                              )}
                            </div>
                            <div className="mt-3 font-bold text-white line-clamp-2 group-hover:text-primary">{movie.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
                              {movie.release_year && <span>{movie.release_year}</span>}
                              {movie.quality && <span>{movie.quality}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={goToSearchResults}
                        className="mt-8 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10 sm:hidden"
                      >
                        Xem tất cả kết quả
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 text-center">
                      <SearchIcon className="!text-5xl text-white/15" />
                      <h4 className="mt-4 text-xl font-black text-white">Chưa có kết quả thật sự khớp</h4>
                      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/55">
                        Thử bỏ bớt quốc gia, đổi thể loại hoặc mô tả mood ngắn hơn.
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {SEARCH_EMPTY_SUGGESTIONS.map((term) => (
                          <button
                            key={term}
                            type="button"
                            onClick={() => applySearchTerm(term)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-white"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={goToSearchResults}
                        className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-black text-black transition-colors hover:bg-primary hover:text-white"
                      >
                        Mở trang tìm kiếm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </MotionDiv>
        )}
        </AnimatePresence>,
        document.body
      )}

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
        <MenuItem onClick={() => goTo('/for-you')}>Dành cho bạn</MenuItem>
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
          <Avatar
            src={activeProfile?.id ? undefined : (user.avatar || undefined)}
            sx={{
              width: 40,
              height: 40,
              border: '2px solid rgba(255,255,255,0.1)',
              bgcolor: activeProfile?.avatar_color || '#E50914',
              color: 'white',
              fontWeight: 800,
            }}
          >
            {activeProfile?.id ? profileInitial(activeProfile.name) : (!user.avatar && user.username?.[0]?.toUpperCase())}
          </Avatar>
          <div>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Xin chào,</Typography>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'white', lineHeight: 1.2 }}>{activeProfile?.name || user.username}</Typography>
            {activeProfile?.name && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{user.username}</Typography>
            )}
          </div>
        </div>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/for-you'); }} sx={{ gap: 1.5 }}><AutoAwesomeIcon fontSize="small" /> Dành cho bạn</MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); clearActiveProfile(); }} sx={{ gap: 1.5 }}><AccountCircleIcon fontSize="small" /> Đổi profile</MenuItem>
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
