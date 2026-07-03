import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL as API } from '../../config/api';
import { clearActiveProfile, getActiveProfile, PROFILE_CHANGE_EVENT, profileInitial } from '../../utils/profile';

const ForgotPasswordDialog = lazy(() => import('../auth/ForgotPasswordDialog'));
const LoginDialog = lazy(() => import('../auth/LoginDialog'));
const RegisterDialog = lazy(() => import('../auth/RegisterDialog'));

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

const ICON_PATHS = {
  account: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8', 'M10 20a2 2 0 0 0 4 0'],
  chart: ['M5 19V9', 'M12 19V5', 'M19 19v-7'],
  chevronDown: ['M6 9l6 6 6-6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  heart: ['M20.8 8.6a5.4 5.4 0 0 0-9.8-3A5.4 5.4 0 0 0 1.2 8.6c0 6.2 10.8 12 10.8 12s10.8-5.8 10.8-12Z'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 2'],
  logout: ['M10 17l5-5-5-5', 'M15 12H3', 'M21 5v14'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  play: ['M10 8l7 4-7 4V8Z'],
  playCircle: ['M10 8l7 4-7 4V8Z', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M21 21l-4.35-4.35'],
  sparkles: ['M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3Z', 'M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
};

function Icon({ name, className = '', size = 22 }) {
  const paths = ICON_PATHS[name] || ICON_PATHS.search;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths.map((path) => (
        <path key={path} d={path} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function HeaderIconButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function UserAvatar({ user, activeProfile, size = 32 }) {
  const avatarText = activeProfile?.id
    ? profileInitial(activeProfile.name)
    : (!user?.avatar && user?.username?.[0]?.toUpperCase());
  const style = {
    width: size,
    height: size,
    backgroundColor: activeProfile?.avatar_color || '#E50914',
  };

  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 text-sm font-extrabold text-white"
      style={style}
    >
      {!activeProfile?.id && user?.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : avatarText}
    </span>
  );
}

function MenuPanel({ open, onClose, align = 'right', width = 'w-[280px]', children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9997]" onClick={onClose} role="presentation">
      <div
        className={`absolute top-[72px] ${align === 'left' ? 'left-4 md:left-8' : 'right-4 md:right-8'} ${width} max-w-[calc(100vw-32px)] rounded-3xl border border-white/10 bg-[#0f0f0f]/90 p-2 text-white shadow-[0_20px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function MenuAction({ icon, children, onClick, danger = false, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
        danger
          ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
          : accent
            ? 'text-blue-300 hover:bg-blue-500/10 hover:text-blue-200'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon name={icon} size={19} className="shrink-0" />
      <span>{children}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-2 h-px bg-white/10" />;
}

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

  const closeMenus = () => {
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

  const handleNavClick = (_event, item) => {
    if (item.path) {
      goTo(item.path);
      return;
    }

    if (item.menu === 'genres') {
      goTo('/movies');
      return;
    }

    if (item.menu === 'countries') {
      goTo('/movies');
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

  return (
    <header className={`fixed top-0 w-full z-50 transition-all duration-500 ease-in-out border-b ${isScrolled ? 'bg-[#0a0a0a]/40 backdrop-blur-2xl border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] py-2' : 'bg-gradient-to-b from-black/90 to-transparent border-transparent py-4'}`}>
      <div className="w-full px-[16px] md:px-[32px] lg:px-[48px] xl:px-[72px] flex items-center justify-between">
        {/* Left Side: Brand & Nav */}
        <div className="flex items-center gap-8">
          <HeaderIconButton
            className="md:hidden"
            onClick={() => setMobileAnchor(true)}
            aria-label="Mở menu"
          >
            <Icon name="menu" />
          </HeaderIconButton>

          <RouterLink
            to="/"
            aria-label="IT Move - Trang chủ"
            className="flex items-center gap-2 group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <Icon name="playCircle" size={36} className="text-primary transition-transform group-hover:scale-110" />
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
                {item.menu && <Icon name="chevronDown" size={17} className="opacity-70" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Right Side: Search & User */}
        <div className="flex items-center gap-4">
          <HeaderIconButton
            onClick={openSearch}
            data-search-open-button="true"
            aria-label="Mở tìm kiếm"
          >
            <Icon name="search" />
          </HeaderIconButton>

          {user?.username ? (
            <div className="flex items-center gap-2">
              <HeaderIconButton
                onClick={() => setNotificationAnchor(true)}
                aria-label="Mở thông báo"
              >
                <Icon name="bell" />
              </HeaderIconButton>
              
              <button
                onClick={() => setUserAnchor(true)}
                className="flex items-center gap-2 hover:bg-white/5 p-1 rounded-md transition-colors"
                aria-label="Mở menu tài khoản"
              >
                <UserAvatar user={user} activeProfile={activeProfile} />
                <Icon name="chevronDown" size={17} className="text-white/70" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setOpenLogin(true)}
              aria-label="Đăng nhập"
              className="bg-primary hover:bg-red-600 text-white font-medium text-sm px-4 py-1.5 rounded flex items-center gap-2 transition-colors"
            >
              <Icon name="user" size={18} />
              <span className="hidden sm:inline">Đăng nhập</span>
            </button>
          )}
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        isSearchOpen ? (
          <div
            ref={searchOverlayRef}
            data-search-overlay="true"
            className="fixed inset-0 z-[9998] h-[100dvh] overscroll-contain bg-[#050505]/95 backdrop-blur-2xl text-white overflow-y-auto"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Đóng tìm kiếm"
              onClick={closeSearch}
            />

            <div className="relative z-10 w-full flex min-h-screen flex-col px-[16px] md:px-[32px] lg:px-[48px] xl:px-[72px] pb-14 pt-20 md:pt-24">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.28em] text-primary/90">Tìm kiếm</div>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">Bạn muốn xem gì?</h2>
                </div>
                <HeaderIconButton
                  onClick={closeSearch}
                  className="h-11 w-11 bg-white/10 hover:bg-white/20"
                  aria-label="Đóng tìm kiếm"
                >
                  <Icon name="close" />
                </HeaderIconButton>
              </div>

              <form
                className="relative mt-8"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToSearchResults();
                }}
              >
                <Icon name="search" size={36} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
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
                          <Icon name="search" size={16} className="text-white/35" />
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
                            <Icon name="search" size={16} className="text-white/35" />
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
                      <Icon name="search" size={48} className="mx-auto text-white/15" />
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
          </div>
        ) : null,
        document.body
      )}

      <MenuPanel open={Boolean(mobileAnchor)} onClose={() => setMobileAnchor(null)} align="left">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">Menu</span>
          <HeaderIconButton onClick={() => setMobileAnchor(null)} className="h-9 w-9" aria-label="Đóng menu">
            <Icon name="close" size={20} />
          </HeaderIconButton>
        </div>
        <MenuDivider />
        <MenuAction icon="sparkles" onClick={() => goTo('/for-you')}>Dành cho bạn</MenuAction>
        <MenuAction icon="play" onClick={() => goTo('/movies?is_series=0')}>Phim lẻ</MenuAction>
        <MenuAction icon="playCircle" onClick={() => goTo('/movies?is_series=1')}>Phim bộ</MenuAction>
        <MenuAction icon="user" onClick={() => goTo('/movies?tab=actor')}>Diễn viên</MenuAction>
      </MenuPanel>

      <MenuPanel open={Boolean(userAnchor)} onClose={() => setUserAnchor(null)} width="w-[260px]">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <UserAvatar user={user} activeProfile={activeProfile} size={40} />
          <div className="min-w-0">
            <div className="text-xs text-white/50">Xin chào,</div>
            <div className="truncate text-base font-bold leading-tight text-white">{activeProfile?.name || user.username}</div>
            {activeProfile?.name && <div className="truncate text-xs text-white/45">{user.username}</div>}
          </div>
        </div>
        <MenuDivider />
        <MenuAction icon="sparkles" onClick={() => { setUserAnchor(null); navigate('/for-you'); }}>Dành cho bạn</MenuAction>
        <MenuAction icon="account" onClick={() => { setUserAnchor(null); clearActiveProfile(); }}>Đổi profile</MenuAction>
        <MenuAction icon="heart" onClick={() => { setUserAnchor(null); navigate('/user/favorites'); }}>Yêu thích</MenuAction>
        <MenuAction icon="plus" onClick={() => { setUserAnchor(null); navigate('/user/list'); }}>Danh sách</MenuAction>
        <MenuAction icon="history" onClick={() => { setUserAnchor(null); navigate('/user/history'); }}>Lịch sử xem</MenuAction>
        <MenuAction icon="playCircle" onClick={() => { setUserAnchor(null); navigate('/user/continue'); }}>Xem tiếp</MenuAction>
        <MenuAction icon="account" onClick={() => { setUserAnchor(null); navigate('/user/profile'); }}>Tài khoản</MenuAction>
        {Boolean(user.is_admin) && (
          <MenuAction icon="chart" accent onClick={() => { setUserAnchor(null); navigate('/admin'); }}>Admin Dashboard</MenuAction>
        )}
        <MenuDivider />
        <MenuAction icon="logout" danger onClick={handleLogout}>Đăng xuất</MenuAction>
      </MenuPanel>

      <MenuPanel open={Boolean(notificationAnchor)} onClose={() => setNotificationAnchor(null)} width="w-[320px]">
        <div className="px-4 py-3">
          <div className="text-base font-bold">Thông báo</div>
          <MenuDivider />
          <div className="py-8 text-center text-sm text-white/50">Chưa có thông báo mới</div>
        </div>
      </MenuPanel>

      {(openLogin || openRegister || openForgot) && (
        <Suspense fallback={null}>
          {openLogin && (
            <LoginDialog
              open={openLogin}
              onClose={() => setOpenLogin(false)}
              onRegister={() => { setOpenLogin(false); setOpenRegister(true); }}
              onForgot={() => { setOpenLogin(false); setOpenForgot(true); }}
            />
          )}
          {openRegister && (
            <RegisterDialog
              open={openRegister}
              onClose={() => setOpenRegister(false)}
              onLogin={() => { setOpenRegister(false); setOpenLogin(true); }}
            />
          )}
          {openForgot && (
            <ForgotPasswordDialog
              open={openForgot}
              onClose={() => setOpenForgot(false)}
              onLogin={() => { setOpenForgot(false); setOpenLogin(true); }}
            />
          )}
        </Suspense>
      )}
    </header>
  );
}
