import React, { useEffect, useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
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
import './Header.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const NAV_ITEMS = [
  { label: 'Thể loại', menu: 'genres' },
  { label: 'Phim lẻ', query: { is_series: 0 } },
  { label: 'Phim bộ', query: { is_series: 1 } },
  { label: 'Quốc gia', menu: 'countries' },
  { label: 'Diễn viên', query: { tab: 'actor' } },
];

function buildMoviesUrl(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => params.set(key, value));
  return `/movies?${params.toString()}`;
}

export default function Header() {
  const [openLogin, setOpenLogin] = useState(false);
  const [openRegister, setOpenRegister] = useState(false);
  const [openForgot, setOpenForgot] = useState(false);
  const [searchValue, setSearchValue] = useState(() => localStorage.getItem('searchInputValue') || '');
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
    if (!location.pathname.startsWith('/search')) {
      localStorage.setItem('searchInputValue', searchValue);
    }
  }, [searchValue, location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/search')) {
      setSearchValue('');
      localStorage.removeItem('searchInputValue');
    }
  }, [location.pathname]);

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
      goTo(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUserAnchor(null);
    navigate('/');
  };

  return (
    <AppBar position="fixed" color="default" className="header-appbar">
      <Toolbar disableGutters className="header-toolbar">
        <Box className="header-brand-area">
          <IconButton
            className="header-mobile-toggle"
            onClick={(event) => setMobileAnchor(event.currentTarget)}
            aria-label="Mở menu"
          >
            <MenuIcon />
          </IconButton>

          <Box component={RouterLink} to="/" className="header-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <PlayCircleIcon className="header-brand-icon" />
            <Typography className="header-logo">IT Move</Typography>
          </Box>

          <Box className="header-search">
            <SearchIcon className="header-search-icon" />
            <InputBase
              placeholder="Tìm phim, diễn viên..."
              className="header-search-input"
              inputProps={{ className: 'header-search-input-real' }}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </Box>
        </Box>

        <Box className="header-nav">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.label}
              className="header-menu-btn"
              endIcon={item.menu ? <ExpandMoreIcon /> : null}
              onClick={(event) => handleNavClick(event, item)}
            >
              {item.label}
            </Button>
          ))}
        </Box>

        <Box className="header-actions">
          {user?.username ? (
            <>
              <IconButton
                className="header-notification-btn"
                onClick={(event) => setNotificationAnchor(event.currentTarget)}
                aria-label="Thông báo"
              >
                <NotificationsNoneIcon />
              </IconButton>
              <Button className="header-user-chip" onClick={(event) => setUserAnchor(event.currentTarget)}>
                <Avatar src={user.avatar || undefined} className="header-avatar">
                  {!user.avatar && user.username[0]?.toUpperCase()}
                </Avatar>
                <Box className="header-user-text">
                  <span className="header-user-name">{user.username}</span>
                  <span className="header-user-role">{user.is_admin ? 'Admin' : 'Thành viên'}</span>
                </Box>
                <ExpandMoreIcon className="header-user-arrow" />
              </Button>
            </>
          ) : (
            <Button
              variant="contained"
              onClick={() => setOpenLogin(true)}
              startIcon={<PersonIcon />}
              className="header-member-btn"
            >
              Đăng nhập
            </Button>
          )}
        </Box>
      </Toolbar>

      <Menu
        anchorEl={genreAnchor}
        open={Boolean(genreAnchor)}
        onClose={() => setGenreAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ className: 'header-dropdown header-dropdown-wide' }}
      >
        <Box className="header-dropdown-title">Chọn thể loại</Box>
        <Box className="header-dropdown-grid">
          {genres.map((genre) => (
            <button
              type="button"
              key={genre.id}
              className="header-dropdown-item"
              onClick={() => goTo(`/movies?genre=${encodeURIComponent(genre.name)}`)}
            >
              {genre.name}
            </button>
          ))}
        </Box>
      </Menu>

      <Menu
        anchorEl={countryAnchor}
        open={Boolean(countryAnchor)}
        onClose={() => setCountryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ className: 'header-dropdown header-dropdown-country' }}
      >
        <Box className="header-dropdown-title">Chọn quốc gia</Box>
        <Box className="header-dropdown-list">
          {countries.map((country) => (
            <button
              type="button"
              key={country.id}
              className="header-dropdown-item"
              onClick={() => goTo(`/movies?country=${encodeURIComponent(country.name)}`)}
            >
              {country.name}
            </button>
          ))}
        </Box>
      </Menu>

      <Menu
        anchorEl={mobileAnchor}
        open={Boolean(mobileAnchor)}
        onClose={() => setMobileAnchor(null)}
        PaperProps={{ className: 'header-dropdown header-mobile-menu' }}
      >
        <Box className="header-mobile-menu-head">
          <span>Menu</span>
          <IconButton onClick={() => setMobileAnchor(null)} size="small" aria-label="Đóng menu">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider className="header-menu-divider" />
        <MenuItem onClick={() => goTo('/movies?is_series=0')}>Phim lẻ</MenuItem>
        <MenuItem onClick={() => goTo('/movies?is_series=1')}>Phim bộ</MenuItem>
        <MenuItem onClick={() => goTo('/movies?tab=actor')}>Diễn viên</MenuItem>
        <Divider className="header-menu-divider" />
        <Box className="header-mobile-section">Thể loại</Box>
        {genres.slice(0, 10).map((genre) => (
          <MenuItem key={genre.id} onClick={() => goTo(`/movies?genre=${encodeURIComponent(genre.name)}`)}>
            {genre.name}
          </MenuItem>
        ))}
        <Divider className="header-menu-divider" />
        <Box className="header-mobile-section">Quốc gia</Box>
        {countries.slice(0, 8).map((country) => (
          <MenuItem key={country.id} onClick={() => goTo(`/movies?country=${encodeURIComponent(country.name)}`)}>
            {country.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'header-dropdown header-user-menu' }}
      >
        <Box className="header-user-menu-head">
          <Typography className="header-menu-user-hi">Xin chào</Typography>
          <Typography className="header-menu-user-name">{user.username}</Typography>
        </Box>
        <Divider className="header-menu-divider" />
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/favorites'); }}>
          <FavoriteBorderIcon /> Yêu thích
        </MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/list'); }}>
          <AddIcon /> Danh sách
        </MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/history'); }}>
          <HistoryIcon /> Lịch sử xem
        </MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/continue'); }}>
          <HistoryIcon /> Xem tiếp
        </MenuItem>
        <MenuItem onClick={() => { setUserAnchor(null); navigate('/user/profile'); }}>
          <AccountCircleIcon /> Tài khoản
        </MenuItem>
        {Boolean(user.is_admin) && (
          <MenuItem onClick={() => { setUserAnchor(null); navigate('/admin'); }}>
            <BarChartIcon /> Admin Dashboard
          </MenuItem>
        )}
        <Divider className="header-menu-divider" />
        <MenuItem onClick={handleLogout} className="header-logout-item">
          <LogoutIcon /> Thoát
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ className: 'header-dropdown header-notification-menu' }}
      >
        <Box className="header-notification-title">Thông báo</Box>
        <Divider className="header-menu-divider" />
        <Box className="header-notification-empty">Chưa có thông báo mới</Box>
      </Menu>

      <LoginDialog
        open={openLogin}
        onClose={() => setOpenLogin(false)}
        onRegister={() => {
          setOpenLogin(false);
          setOpenRegister(true);
        }}
        onForgot={() => {
          setOpenLogin(false);
          setOpenForgot(true);
        }}
      />
      <RegisterDialog
        open={openRegister}
        onClose={() => setOpenRegister(false)}
        onLogin={() => {
          setOpenRegister(false);
          setOpenLogin(true);
        }}
      />
      <ForgotPasswordDialog
        open={openForgot}
        onClose={() => setOpenForgot(false)}
        onLogin={() => {
          setOpenForgot(false);
          setOpenLogin(true);
        }}
      />
    </AppBar>
  );
}
