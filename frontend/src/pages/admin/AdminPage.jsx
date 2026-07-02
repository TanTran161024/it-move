import { useCallback, useEffect, useState } from 'react';
import { Box, Container, Typography, Grid, Card, CardMedia, CardContent, CardActions, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Toolbar, Autocomplete, Tabs, Tab, Switch, CircularProgress } from '@mui/material';
import axios from 'axios';
import MovieTable from '../../components/admin/MovieTable';
import MovieForm from '../../components/admin/MovieForm';
import EpisodeManager from '../../components/admin/EpisodeManager';
import Sidebar from '../../components/admin/Sidebar';
import CategoryManager from '../../components/admin/CategoryManager';
import AdminFeedbackManager from '../../components/admin/AdminFeedbackManager';
import SubtitleTranslator from '../../components/admin/SubtitleTranslator';
import AdminDashboardStats from '../../components/admin/AdminDashboardStats';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import BarChartIcon from '@mui/icons-material/BarChart';
import MovieIcon from '@mui/icons-material/Movie';
import ImageIcon from '@mui/icons-material/Image';
import CategoryIcon from '@mui/icons-material/Category';
import PeopleIcon from '@mui/icons-material/People';
import HomeIcon from '@mui/icons-material/Home';
import LogoutIcon from '@mui/icons-material/Logout';
import RateReviewIcon from '@mui/icons-material/RateReview';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import { API_BASE_URL as API } from '../../config/api';

export default function Admin() {
  const [movies, setMovies] = useState([]);
  const [open, setOpen] = useState(false);
  const [editMovie, setEditMovie] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', poster_url: '', release_date: '', genre: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tmdbLoadingId, setTmdbLoadingId] = useState(null);
  const [tmdbBulkLoading, setTmdbBulkLoading] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState('dashboard');
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  const [actors, setActors] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [selectedActors, setSelectedActors] = useState([]);
  const [selectedDirectors, setSelectedDirectors] = useState([]);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  useEffect(() => {
    if (user.id) axios.defaults.headers.common['x-user-id'] = user.id;
    return () => {
      delete axios.defaults.headers.common['x-user-id'];
    };
  }, [user.id]);
  const [banners, setBanners] = useState([]);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [editBanner, setEditBanner] = useState(null);
  const [bannerForm, setBannerForm] = useState({ movie: null, bg_url: '', title_url: '', thumbnails: '' });
  const [bannerError, setBannerError] = useState('');
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [episodeMovie, setEpisodeMovie] = useState(null);
  const [episodes, setEpisodes] = useState([]);

  // State cho quản lý danh mục
  const [selectedTab, setSelectedTab] = useState(0);
  const [genresList, setGenresList] = useState([]);
  const [countriesList, setCountriesList] = useState([]);
  const [producersList, setProducersList] = useState([]);
  const [actorsList, setActorsList] = useState([]);
  const [directorsList, setDirectorsList] = useState([]);
  const [catForm, setCatForm] = useState({ name: '', country_id: '', profile_pic_url: '', bio: '' });
  const [catEditId, setCatEditId] = useState(null);
  const [catError, setCatError] = useState('');

  // State cho quản lý user
  const [users, setUsers] = useState([]);
  const [userError, setUserError] = useState('');
  const [userEditId, setUserEditId] = useState(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', gender: '', is_admin: false });
  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/api/users`);
      setUsers(res.data);
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  useEffect(() => { if (selectedMenu === 'users') fetchUsers(); }, [selectedMenu]);
  const handleToggleUserStatus = async (user) => {
    try {
      await axios.put(`${API}/api/users/${user.id}/status`, { is_active: !user.is_active });
      fetchUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleDeleteUser = async (id) => {
    if (!window.confirm('Xóa tài khoản này?')) return;
    try {
      await axios.delete(`${API}/api/users/${id}`);
      fetchUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleUserEdit = (user) => {
    setUserEditId(user.id);
    setUserForm({ username: user.username, email: user.email, gender: user.gender || '', is_admin: Boolean(user.is_admin) });
    setUserError('');
  };
  const handleUserFormChange = e => {
    if (e.target.name === 'is_admin') {
      setUserForm({ ...userForm, is_admin: e.target.value === '1' });
    } else {
      setUserForm({ ...userForm, [e.target.name]: e.target.value });
    }
  };
  const handleUserEditCancel = () => { setUserEditId(null); setUserForm({ username: '', email: '', gender: '', is_admin: false }); setUserError(''); };
  const handleUserEditSubmit = async () => {
    try {
      const oldUser = users.find(u => u.id === userEditId);
      // Nếu quyền admin thay đổi, cập nhật quyền trước
      if (typeof userForm.is_admin !== 'undefined' && oldUser && (Boolean(userForm.is_admin) !== Boolean(oldUser.is_admin))) {
        await axios.put(`${API}/api/users/${userEditId}/admin`, { is_admin: userForm.is_admin });
      }
      // Cập nhật các trường khác
      await axios.put(`${API}/api/users/${userEditId}`, {
        username: userForm.username,
        email: userForm.email,
        gender: userForm.gender
      });
      fetchUsers(); handleUserEditCancel();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };

  // Lấy dữ liệu liên kết khi mở form
  const fetchRelations = async () => {
    const [g, c, a, d] = await Promise.all([
      axios.get(`${API}/api/genres`),
      axios.get(`${API}/api/countries`),
      axios.get(`${API}/api/actors`),
      axios.get(`${API}/api/directors`),
    ]);
    setGenres(g.data);
    setCountries(c.data);
    setActors(a.data);
    setDirectors(d.data);
  };

  const fetchMovies = useCallback(() => {
    axios.get(`${API}/api/movies?include_hidden=true`, {
      headers: { 'x-user-id': user.id },
    }).then(res => setMovies(res.data));
  }, [user.id]);

  // Lấy danh sách banner
  const fetchBanners = useCallback(async () => {
    const res = await axios.get(`${API}/api/banners`);
    setBanners(res.data);
  }, []);

  // Lấy danh sách phim cho select movie
  const [allMovies, setAllMovies] = useState([]);
  const fetchAllMovies = useCallback(async () => {
    const res = await axios.get(`${API}/api/movies?include_hidden=true`, {
      headers: { 'x-user-id': user.id },
    });
    setAllMovies(res.data);
  }, [user.id]);

  // Lấy danh sách tập phim cho 1 movie
  const fetchEpisodes = async (movieId) => {
    const res = await axios.get(`${API}/api/movies/${movieId}/episodes`);
    setEpisodes(res.data);
  };
  const handleManageEpisodes = async (movie) => {
    setEpisodeMovie(movie);
    await fetchEpisodes(movie.id);
    setEpisodeDialogOpen(true);
  };
  const handleCloseEpisodes = () => {
    setEpisodeDialogOpen(false);
    setEpisodeMovie(null);
    setEpisodes([]);
  };
  const handleAddEpisode = async (form) => {
    await axios.post(`${API}/api/movies/${episodeMovie.id}/episodes`, form);
    await fetchEpisodes(episodeMovie.id);
  };
  const handleEditEpisode = async (id, form) => {
    await axios.put(`${API}/api/episodes/${id}`, form);
    await fetchEpisodes(episodeMovie.id);
  };
  const handleDeleteEpisode = async (id) => {
    if (!window.confirm('Xóa tập này?')) return;
    await axios.delete(`${API}/api/episodes/${id}`);
    await fetchEpisodes(episodeMovie.id);
  };

  // Fetch data cho từng tab
  const fetchCategories = async () => {
    const [g, c, p, a, d] = await Promise.all([
      axios.get(`${API}/api/genres`),
      axios.get(`${API}/api/countries`),
      axios.get(`${API}/api/producers`),
      axios.get(`${API}/api/actors`),
      axios.get(`${API}/api/directors`),
    ]);
    setGenresList(g.data);
    setCountriesList(c.data);
    setProducersList(p.data);
    setActorsList(a.data);
    setDirectorsList(d.data);
  };
  useEffect(() => { fetchCategories(); }, []);

  // Xử lý CRUD cho từng loại
  const handleCatTabChange = (_, v) => { setSelectedTab(v); setCatForm({ name: '', country_id: '', profile_pic_url: '', bio: '' }); setCatEditId(null); setCatError(''); };
  const handleCatChange = e => setCatForm({ ...catForm, [e.target.name]: e.target.value });
  const handleCatEdit = (item) => { setCatEditId(item.id); setCatForm(item); setCatError(''); };
  const handleCatCancel = () => { setCatEditId(null); setCatForm({ name: '', country_id: '', profile_pic_url: '', bio: '' }); setCatError(''); };
  const handleCatSubmit = async () => {
    try {
      let url = '', data = {};
      if (selectedTab === 0) { // genres
        url = 'genres'; data = { name: catForm.name };
      } else if (selectedTab === 1) { // countries
        url = 'countries'; data = { name: catForm.name };
      } else if (selectedTab === 2) { // producers
        url = 'producers'; data = { name: catForm.name, country_id: catForm.country_id };
      } else if (selectedTab === 3) { // actors
        url = 'actors'; data = { name: catForm.name, profile_pic_url: catForm.profile_pic_url, bio: catForm.bio };
      } else if (selectedTab === 4) { // directors
        url = 'directors'; data = { name: catForm.name, profile_pic_url: catForm.profile_pic_url, bio: catForm.bio };
      }
      if (catEditId) {
        await axios.put(`${API}/api/${url}/${catEditId}`, data);
      } else {
        await axios.post(`${API}/api/${url}`, data);
      }
      fetchCategories(); handleCatCancel();
    } catch (err) {
      setCatError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleCatDelete = async (id) => {
    if (!window.confirm('Xóa mục này?')) return;
    let url = '';
    if (selectedTab === 0) url = 'genres';
    else if (selectedTab === 1) url = 'countries';
    else if (selectedTab === 2) url = 'producers';
    else if (selectedTab === 3) url = 'actors';
    else if (selectedTab === 4) url = 'directors';
    await axios.delete(`${API}/api/${url}/${id}`);
    fetchCategories();
  };

  useEffect(() => {
    fetchMovies();
    fetchBanners();
    fetchAllMovies();
  }, [fetchMovies, fetchBanners, fetchAllMovies]);

  // State cho dashboard
  // Removed old stats state for AdminDashboardStats

  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!user.is_admin) return <Alert severity="error">Bạn không có quyền truy cập trang này!</Alert>;

  const handleOpen = async (movie) => {
    await fetchRelations();
    setEditMovie(movie);
    setForm(movie || { title: '', description: '', poster_url: '', release_date: '', genre: '', is_visible: 1 });
    // Gán selected cho các trường liên kết
    setSelectedGenres(movie?.genresObj || []);
    setSelectedCountries(movie?.countriesObj || []);
    setSelectedActors(movie?.actorsObj || []);
    setSelectedDirectors(movie?.directorsObj || []);
    setOpen(true);
  };
  const handleClose = () => {
    setOpen(false);
    setEditMovie(null);
    setForm({ title: '', description: '', poster_url: '', release_date: '', genre: '', is_visible: 1 });
    setError('');
    setSelectedGenres([]);
    setSelectedCountries([]);
    setSelectedActors([]);
    setSelectedDirectors([]);
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSelectChange = (type, value) => {
    if (type === 'genres') setSelectedGenres(value);
    if (type === 'countries') setSelectedCountries(value);
    if (type === 'actors') setSelectedActors(value);
    if (type === 'directors') setSelectedDirectors(value);
  };

  const safeMovieData = (data) => ({
    title: data.title || null,
    description: data.description || null,
    poster_url: data.poster_url || null,
    age_limit: data.age_limit || null,
    original_title: data.original_title || null,
    release_year: data.release_year || null,
    duration: data.duration || null,
    is_series: data.is_series ?? null,
    trailer_url: data.trailer_url || null,
    imdb_rating: data.imdb_rating ?? null,
    quality: data.quality || null,
    is_visible: data.is_visible === false || data.is_visible === 0 ? 0 : 1,
  });

  const handleSubmit = async () => {
    try {
      let movieId = editMovie?.id;
      const movieData = safeMovieData(form);
      if (editMovie) {
        await axios.put(`${API}/api/movies/${editMovie.id}`, movieData);
      } else {
        const res = await axios.post(`${API}/api/movies`, movieData);
        movieId = res.data.id || null;
        if (!movieId) {
          await fetchMovies();
          const last = movies[movies.length - 1];
          movieId = last?.id;
        }
      }
      // Gắn các liên kết
      if (movieId) {
        await axios.post(`${API}/api/movies/${movieId}/genres`, { genre_ids: selectedGenres.map(g => g.id) });
        await axios.post(`${API}/api/movies/${movieId}/countries`, { country_ids: selectedCountries.map(c => c.id) });
        await axios.post(`${API}/api/movies/${movieId}/actors`, { actor_ids: selectedActors.map(a => a.id) });
        await axios.post(`${API}/api/movies/${movieId}/directors`, { director_ids: selectedDirectors.map(d => d.id) });
      }
      fetchMovies(); handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa phim này?')) return;
    try {
      await axios.delete(`${API}/api/movies/${id}`);
      fetchMovies();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi');
    }
  };

  const handleToggleVisibility = async (movie) => {
    try {
      await axios.patch(
        `${API}/api/movies/${movie.id}/visibility`,
        { is_visible: !movie.is_visible },
        { headers: { 'x-user-id': user.id } }
      );
      fetchMovies();
      fetchAllMovies();
      fetchBanners();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi');
    }
  };

  const describeTmdbUpdates = (updates = {}) => ([
    updates.tmdb?.updated ? 'liên kết TMDb' : null,
    updates.poster?.updated ? 'poster' : null,
    updates.backdrop?.updated ? 'backdrop' : null,
    updates.trailer?.updated ? 'trailer' : null,
    updates.cast?.added ? `${updates.cast.added} diễn viên` : null,
    updates.directors?.added ? `${updates.directors.added} đạo diễn` : null,
  ].filter(Boolean));

  const refreshMovieAdminData = async () => {
    await Promise.all([fetchMovies(), fetchAllMovies(), fetchBanners(), fetchRelations(), fetchCategories()]);
  };

  const handleTmdbEnrich = async (movie) => {
    setError('');
    setNotice('');
    setTmdbLoadingId(movie.id);
    try {
      const res = await axios.post(`${API}/api/movies/${movie.id}/tmdb-enrich`, {
        overwrite: false,
        replace_imported_images: true,
        cast_limit: 8,
        director_limit: 4,
      });
      const updates = res.data?.updates || {};
      const legacyParts = [
        updates.poster?.updated ? 'poster' : null,
        updates.backdrop?.updated ? 'backdrop' : null,
        updates.cast?.added ? `${updates.cast.added} diễn viên` : null,
      ].filter(Boolean);
      const describedParts = describeTmdbUpdates(updates);
      const parts = describedParts.length ? describedParts : legacyParts;
      const tmdbTitle = res.data?.tmdb?.title ? ` (${res.data.tmdb.title})` : '';
      setNotice(parts.length
        ? `Đã bổ sung từ TMDb${tmdbTitle}: ${parts.join(', ')}.`
        : `TMDb đã khớp phim${tmdbTitle}, nhưng dữ liệu cần bổ sung đã có sẵn.`
      );
      await refreshMovieAdminData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể bổ sung dữ liệu TMDb.');
    } finally {
      setTmdbLoadingId(null);
    }
  };

  const handleTmdbBulkEnrich = async () => {
    setError('');
    setNotice('');
    setTmdbBulkLoading(true);
    try {
      const res = await axios.post(`${API}/api/movies/tmdb-enrich-missing`, {
        limit: 10,
        overwrite: false,
        replace_imported_images: true,
        cast_limit: 8,
        director_limit: 4,
      });
      const summary = res.data?.summary || {};
      const sample = (res.data?.results || [])
        .filter((item) => item.ok && item.changes?.length)
        .slice(0, 3)
        .map((item) => `${item.title}: ${item.changes.join(', ')}`)
        .join(' | ');
      setNotice(
        `Đã quét ${summary.scanned || 0} phim, cập nhật ${summary.changed || 0}, bỏ qua/lỗi ${summary.failed || 0}.${sample ? ` ${sample}` : ''}`
      );
      await refreshMovieAdminData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể bổ sung TMDb hàng loạt.');
    } finally {
      setTmdbBulkLoading(false);
    }
  };

  // Banner handlers
  const handleBannerOpen = (banner) => {
    setEditBanner(banner);
    setBannerForm(banner ? {
      movie: allMovies.find(m => m.id === banner.movie_id) || null,
      bg_url: banner.bg_url || '',
      title_url: banner.title_url || '',
      thumbnails: banner.thumbnails ? JSON.parse(banner.thumbnails)[0] || '' : ''
    } : { movie: null, bg_url: '', title_url: '', thumbnails: '' });
    setBannerError('');
    setBannerOpen(true);
  };
  const handleBannerClose = () => {
    setBannerOpen(false);
    setEditBanner(null);
    setBannerForm({ movie: null, bg_url: '', title_url: '', thumbnails: '' });
    setBannerError('');
  };
  const handleBannerChange = e => setBannerForm({ ...bannerForm, [e.target.name]: e.target.value });
  const handleBannerMovieChange = (_, value) => setBannerForm({ ...bannerForm, movie: value });

  const handleBannerSubmit = async () => {
    try {
      const data = {
        name: bannerForm.movie?.title, // Thêm trường name
        movie_id: bannerForm.movie?.id,
        bg_url: bannerForm.bg_url,
        title_url: bannerForm.title_url,
        thumbnails: bannerForm.thumbnails ? [bannerForm.thumbnails] : []
      };
      if (editBanner) {
        await axios.put(`${API}/api/banners/${editBanner.id}`, data);
      } else {
        await axios.post(`${API}/api/banners`, data);
      }
      fetchBanners(); handleBannerClose();
    } catch (err) {
      setBannerError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleBannerDelete = async (id) => {
    if (!window.confirm('Xóa banner này?')) return;
    try {
      await axios.delete(`${API}/api/banners/${id}`);
      fetchBanners();
    } catch (err) {
      setBannerError(err.response?.data?.message || 'Lỗi');
    }
  };

  // Thêm sx cho TextField: input và placeholder đều màu trắng
  const whiteTextFieldSx = { minWidth: 160, mr: 1, bgcolor: '#23242a', '& .MuiInputBase-input': { color: '#fff' }, '& .MuiInputLabel-root': { color: '#bbb' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' }, '&:hover fieldset': { borderColor: '#2196f3' }, '&.Mui-focused fieldset': { borderColor: '#2196f3' } }, '& .MuiInputBase-input::placeholder': { color: '#fff', opacity: 1 } };

  // Sử dụng InputProps và InputLabelProps để ép màu trắng cho input, label, placeholder
  const whiteTextFieldProps = {
    InputProps: {
      style: { color: '#fff' },
    },
    InputLabelProps: {
      style: { color: '#fff' },
    },
  };

  // Thêm override cho select quốc gia: chỉ option là nền trắng, chữ đen
  const selectOverrideSx = { '& option': { color: '#111', background: '#fff' } };

  const currentUserId = user?.id;
  const userStats = {
    total: users.length,
    admins: users.filter((item) => item.is_admin).length,
    active: users.filter((item) => item.is_active).length,
    locked: users.filter((item) => !item.is_active).length,
  };
  const userFieldSx = {
    minWidth: 0,
    width: '100%',
    '& .MuiInputBase-root': {
      background: 'rgba(15, 17, 23, 0.75)',
      borderRadius: '10px',
      color: '#fff',
    },
    '& .MuiInputBase-input': { color: '#fff', fontWeight: 700 },
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.28)' },
    '& option': { color: '#111', background: '#fff' },
  };
  const genderLabel = (value) => ({
    male: 'Nam',
    female: 'Nữ',
    other: 'Khác',
  }[value] || 'Chưa cập nhật');
  const userInitial = (value) => String(value || '?').trim().charAt(0).toUpperCase() || '?';

  const menuItems = [
    { key: 'dashboard', icon: <BarChartIcon /> },
    { key: 'movies', icon: <MovieIcon /> },
    { key: 'banners', icon: <ImageIcon /> },
    { key: 'categories', icon: <CategoryIcon /> },
    { key: 'subtitles', icon: <SubtitlesIcon /> },
    { key: 'users', icon: <PeopleIcon /> },
    { key: 'feedback', icon: <RateReviewIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex', bgcolor: '#181920', minHeight: '100vh' }}>
      {/* Mini sidebar khi đóng */}
      {!sidebarOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, width: 64, height: '100vh', bgcolor: '#20222b', zIndex: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 2, boxShadow: '2px 0 8px #0002' }}>
          {/* Nút mở sidebar */}
          <Tooltip title="Mở menu" placement="right">
            <IconButton onClick={() => setSidebarOpen(true)} sx={{ color: '#fff', mb: 2, bgcolor: 'transparent', '&:hover': { bgcolor: '#23243a' } }}>
              <MenuIcon />
            </IconButton>
          </Tooltip>
          {menuItems.map(item => (
            <Tooltip key={item.key} title={item.key.charAt(0).toUpperCase() + item.key.slice(1)} placement="right">
              <IconButton sx={{ color: selectedMenu === item.key ? '#FFD600' : '#fff', mb: 2, bgcolor: selectedMenu === item.key ? '#23243a' : 'transparent', '&:hover': { bgcolor: '#23243a' } }} onClick={() => setSelectedMenu(item.key)}>
                {item.icon}
              </IconButton>
            </Tooltip>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          {/* Home icon */}
          <Tooltip title="Home" placement="right">
            <IconButton sx={{ color: '#fff', mb: 2, bgcolor: 'transparent', '&:hover': { bgcolor: '#23243a' } }} onClick={() => { window.location.href = '/'; }}>
              <HomeIcon />
            </IconButton>
          </Tooltip>
          {/* Logout icon */}
          <Tooltip title="Đăng xuất" placement="right">
            <IconButton sx={{ color: '#fff', mb: 2, bgcolor: 'transparent', '&:hover': { bgcolor: '#23243a' } }} onClick={() => { localStorage.removeItem('user'); window.location.href = 'http://localhost:5173/'; }}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Sidebar onSelect={setSelectedMenu} selected={selectedMenu} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: sidebarOpen ? '320px' : 0, transition: 'margin-left 0.2s' }}>
        <Toolbar />
        {selectedMenu !== 'dashboard' && (
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700, textAlign: 'center', mb: 4, letterSpacing: 2, textShadow: '0 2px 8px #0006' }}>
            Admin Dashboard
          </Typography>
        )}
        {selectedMenu === 'movies' && (
          <Box sx={{ width: '100%', maxWidth: '1400px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ color: '#fff', fontWeight:700 }}>Quản lý phim</Typography>
            {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            <Button variant="contained" onClick={() => handleOpen(null)} sx={{ mb: 2 }}>Thêm phim</Button>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
              <Button
                variant="outlined"
                onClick={handleTmdbBulkEnrich}
                disabled={tmdbBulkLoading}
                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
                startIcon={tmdbBulkLoading ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {tmdbBulkLoading ? 'Đang bổ sung...' : 'Bổ sung hàng loạt'}
              </Button>
            </Box>
            <MovieTable
              movies={movies}
              onEdit={handleOpen}
              onDelete={handleDelete}
              onManageEpisodes={handleManageEpisodes}
              onToggleVisibility={handleToggleVisibility}
              onTmdbEnrich={handleTmdbEnrich}
              tmdbLoadingId={tmdbLoadingId}
            />
            <MovieForm
              open={open}
              form={form}
              editMovie={editMovie}
              error={error}
              onChange={handleChange}
              onClose={handleClose}
              onSubmit={handleSubmit}
              genres={genres}
              countries={countries}
              actors={actors}
              directors={directors}
              selectedGenres={selectedGenres}
              selectedCountries={selectedCountries}
              selectedActors={selectedActors}
              selectedDirectors={selectedDirectors}
              onSelectChange={handleSelectChange}
            />
            <EpisodeManager
              open={episodeDialogOpen}
              onClose={handleCloseEpisodes}
              movie={episodeMovie}
              episodes={episodes}
              onAdd={handleAddEpisode}
              onEdit={handleEditEpisode}
              onDelete={handleDeleteEpisode}
            />
          </Box>
        )}
        {selectedMenu === 'banners' && (
          <Box className="admin-main-section" sx={{ width: '100%', maxWidth: '1400px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Quản lý banner</h2>
                <p className="admin-section-subtitle">Tùy chỉnh hình ảnh nổi bật trên trang chủ</p>
              </div>
              <Button variant="contained" onClick={() => handleBannerOpen(null)} sx={{ bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>
                Thêm banner
              </Button>
            </div>
            
            <div className="admin-data-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {banners.map(banner => (
                <div key={banner.id} className="admin-movie-card">
                  <div style={{ position: 'relative' }}>
                    <img
                      src={banner.bg_url}
                      alt="bg"
                      style={{ width: '100%', height: 180, objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
                      <Tooltip title="Sửa" arrow>
                        <IconButton size="small" sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'var(--admin-accent)' }, backdropFilter: 'blur(4px)' }} onClick={() => handleBannerOpen(banner)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Xóa" arrow>
                        <IconButton size="small" sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#f87171', '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' }, backdropFilter: 'blur(4px)' }} onClick={() => handleBannerDelete(banner.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="admin-movie-card-body">
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', mb: 0.5, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {banner.movie_title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {banner.bg_url}
                    </Typography>
                  </div>
                </div>
              ))}
            </div>
            <Dialog open={bannerOpen} onClose={handleBannerClose} maxWidth="sm" fullWidth>
              <DialogTitle>{editBanner ? 'Sửa banner' : 'Thêm banner'}</DialogTitle>
              <DialogContent>
                <Autocomplete
                  options={allMovies}
                  getOptionLabel={option => option.title}
                  value={bannerForm.movie}
                  onChange={handleBannerMovieChange}
                  renderInput={params => <TextField {...params} label="Chọn phim" margin="normal" fullWidth />}
                />
                <TextField label="Background URL" name="bg_url" fullWidth margin="normal" value={bannerForm.bg_url} onChange={handleBannerChange} />
                <TextField label="Title URL" name="title_url" fullWidth margin="normal" value={bannerForm.title_url} onChange={handleBannerChange} />
                <TextField label="Thumbnails (URL)" name="thumbnails" fullWidth margin="normal" value={bannerForm.thumbnails} onChange={handleBannerChange} />
                {bannerError && <Alert severity="error">{bannerError}</Alert>}
              </DialogContent>
              <DialogActions>
                <Button onClick={handleBannerClose}>Hủy</Button>
                <Button onClick={handleBannerSubmit} variant="contained">Lưu</Button>
              </DialogActions>
            </Dialog>
          </Box>
        )}
        {selectedMenu === 'general' && (
          <Box className="admin-main-section" sx={{ width: '100%', maxWidth: '1400px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Quản lý chung</h2>
                <p className="admin-section-subtitle">Chỉnh sửa danh mục, quốc gia, nhân sự phim</p>
              </div>
            </div>
            <Tabs
              value={selectedTab}
              onChange={handleCatTabChange}
              sx={{ mb: 4, bgcolor: 'var(--admin-surface)', borderRadius: 3, border: '1px solid var(--admin-border)', minHeight: '56px' }}
              textColor="inherit"
              TabIndicatorProps={{ style: { background: 'var(--admin-accent)', height: '4px', borderRadius: '4px 4px 0 0' } }}
            >
              <Tab label="THỂ LOẠI" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }} />
              <Tab label="QUỐC GIA" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }} />
              <Tab label="NHÀ SẢN XUẤT" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }} />
              <Tab label="DIỄN VIÊN" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }} />
              <Tab label="ĐẠO DIỄN" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }} />
            </Tabs>
            {/* Form thêm mới */}
            <div className="admin-panel" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 200, flex: 1 }} size="small" label={selectedTab === 0 ? 'Tên thể loại' : selectedTab === 1 ? 'Tên quốc gia' : selectedTab === 2 ? 'Tên nhà sản xuất' : selectedTab === 3 ? 'Tên diễn viên' : 'Tên đạo diễn'} name="name" value={catEditId ? '' : catForm.name} onChange={e => !catEditId && handleCatChange(e)} />
              {selectedTab === 2 && (
                <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, ...selectOverrideSx, minWidth: 160 }} size="small" select name="country_id" value={catEditId ? '' : catForm.country_id} onChange={e => !catEditId && handleCatChange(e)} SelectProps={{ native: true }}>
                  <option value="">--Chọn quốc gia--</option>
                  {countriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TextField>
              )}
              {(selectedTab === 3 || selectedTab === 4) && (
                <>
                  <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 200, flex: 1 }} size="small" label="Ảnh đại diện (URL)" name="profile_pic_url" value={catEditId ? '' : catForm.profile_pic_url} onChange={e => !catEditId && handleCatChange(e)} />
                  <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 200, flex: 1 }} size="small" label="Mô tả" name="bio" value={catEditId ? '' : catForm.bio} onChange={e => !catEditId && handleCatChange(e)} />
                </>
              )}
              <Button variant="contained" onClick={handleCatSubmit} disabled={!!catEditId} sx={{ fontWeight: 700, minWidth: 120, height: '40px', bgcolor: 'var(--admin-accent)', '&:hover': { bgcolor: 'var(--admin-accent-hover)' } }}>{catEditId ? 'Đang sửa...' : 'Thêm mới'}</Button>
              {!catEditId && catError && <Alert severity="error" sx={{ ml: 2 }}>{catError}</Alert>}
            </div>
            {/* Danh sách */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 2 }}>
              {(selectedTab === 0 ? genresList : selectedTab === 1 ? countriesList : selectedTab === 2 ? producersList : selectedTab === 3 ? actorsList : directorsList).map(item => {
                const isEditing = catEditId === item.id;
                return (
                  <Box key={item.id} sx={{
                    display: 'flex', alignItems: 'center', bgcolor: isEditing ? 'rgba(99, 102, 241, 0.1)' : 'var(--admin-surface)', color: '#fff', borderRadius: '12px', p: 2, boxShadow: isEditing ? '0 0 0 2px var(--admin-accent)' : '0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid', borderColor: isEditing ? 'var(--admin-accent)' : 'var(--admin-border)',
                    transition: 'all 0.2s ease',
                    '&:hover': { borderColor: isEditing ? 'var(--admin-accent)' : 'rgba(255,255,255,0.2)', transform: isEditing ? 'none' : 'translateY(-2px)' },
                    flexWrap: 'wrap', gap: 1.5
                  }}>
                    {/* Inline form sửa */}
                    {isEditing ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, width: '100%' }}>
                        <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 160, flex: 1 }} size="small" label={selectedTab === 0 ? 'Tên thể loại' : selectedTab === 1 ? 'Tên quốc gia' : selectedTab === 2 ? 'Tên nhà sản xuất' : selectedTab === 3 ? 'Tên diễn viên' : 'Tên đạo diễn'} name="name" value={catForm.name} onChange={handleCatChange} />
                        {selectedTab === 2 && (
                          <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, ...selectOverrideSx, minWidth: 140 }} size="small" select name="country_id" value={catForm.country_id} onChange={handleCatChange} SelectProps={{ native: true }}>
                            <option value="">--Chọn quốc gia--</option>
                            {countriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </TextField>
                        )}
                        {(selectedTab === 3 || selectedTab === 4) && (
                          <>
                            <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180, flex: 1 }} size="small" label="Ảnh (URL)" name="profile_pic_url" value={catForm.profile_pic_url} onChange={handleCatChange} />
                            <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, width: '100%' }} size="small" label="Mô tả" name="bio" value={catForm.bio} onChange={handleCatChange} />
                          </>
                        )}
                        <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'flex-end', mt: 1 }}>
                          <Button variant="contained" size="small" onClick={handleCatSubmit} sx={{ minWidth: 80, bgcolor: 'var(--admin-success)', '&:hover': { bgcolor: '#059669' } }}>Lưu</Button>
                          <Button variant="outlined" size="small" onClick={handleCatCancel} sx={{ minWidth: 80, color: 'var(--admin-text-muted)', borderColor: 'var(--admin-border)' }}>Hủy</Button>
                        </Box>
                        {catError && <Alert severity="error" sx={{ width: '100%' }}>{catError}</Alert>}
                      </Box>
                    ) : (
                      <>
                        {(selectedTab === 3 || selectedTab === 4) && (
                          <img src={item.profile_pic_url || '/avatar-actor.svg'} alt="pic" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} style={{ width: 48, height: 48, borderRadius: '12px', objectFit: 'cover', background: 'var(--admin-card)' }} />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</Typography>
                          {selectedTab === 2 && <Typography sx={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>{countriesList.find(c => c.id === item.country_id)?.name || ''}</Typography>}
                          {(selectedTab === 3 || selectedTab === 4) && item.bio && <Typography sx={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.bio}</Typography>}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Sửa" arrow>
                            <IconButton size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'var(--admin-text-muted)', '&:hover': { bgcolor: 'var(--admin-accent)', color: '#fff' } }} onClick={() => handleCatEdit(item)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa" arrow>
                            <IconButton size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'var(--admin-danger)', '&:hover': { bgcolor: 'var(--admin-danger)', color: '#fff' } }} onClick={() => handleCatDelete(item.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
        {selectedMenu === 'categories' && (
          <CategoryManager />
        )}
        {selectedMenu === 'subtitles' && (
          <SubtitleTranslator />
        )}
        {selectedMenu === 'users' && (
          <Box sx={{ color: '#fff', mt: 4, maxWidth: '1480px', mx: 'auto' }}>
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Quản lý người dùng</h2>
                <p className="admin-section-subtitle">Theo dõi tài khoản, quyền admin và trạng thái hoạt động.</p>
              </div>
              <Button
                startIcon={<PeopleIcon />}
                variant="outlined"
                onClick={fetchUsers}
                sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.16)' }}
              >
                Làm mới
              </Button>
            </div>
            {userError && <Alert severity="error" sx={{ mb: 2 }}>{userError}</Alert>}
            <div className="admin-user-summary">
              <div className="admin-user-summary-card">
                <span>Tổng tài khoản</span>
                <strong>{userStats.total}</strong>
              </div>
              <div className="admin-user-summary-card">
                <span>Admin</span>
                <strong>{userStats.admins}</strong>
              </div>
              <div className="admin-user-summary-card success">
                <span>Hoạt động</span>
                <strong>{userStats.active}</strong>
              </div>
              <div className="admin-user-summary-card warning">
                <span>Đã khóa</span>
                <strong>{userStats.locked}</strong>
              </div>
            </div>

            <div className="admin-user-panel">
              <div className="admin-user-table">
                <div className="admin-user-head">
                  <span>Người dùng</span>
                  <span>Email</span>
                  <span>Giới tính</span>
                  <span>Vai trò</span>
                  <span>Xác thực</span>
                  <span>Trạng thái</span>
                  <span>Thao tác</span>
                </div>

                {users.length === 0 ? (
                  <div className="admin-empty">Chưa có người dùng nào.</div>
                ) : users.map(account => (
                  <div key={account.id} className={`admin-user-row ${userEditId === account.id ? 'editing' : ''}`}>
                    <div className="admin-user-identity">
                      <div className={`admin-user-avatar ${account.is_admin ? 'admin' : ''}`}>{userInitial(account.username)}</div>
                      <div className="admin-user-main">
                        {userEditId === account.id ? (
                          <TextField size="small" value={userForm.username} name="username" onChange={handleUserFormChange} sx={userFieldSx} />
                        ) : (
                          <>
                            <strong>{account.username}</strong>
                            <small>ID #{account.id}</small>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="admin-user-cell">
                      {userEditId === account.id ? (
                        <TextField size="small" value={userForm.email} name="email" onChange={handleUserFormChange} sx={userFieldSx} />
                      ) : (
                        <span className="admin-user-email">{account.email}</span>
                      )}
                    </div>

                    <div className="admin-user-cell">
                      {userEditId === account.id ? (
                        <TextField size="small" select name="gender" value={userForm.gender} onChange={handleUserFormChange} SelectProps={{ native: true }} sx={userFieldSx}>
                          <option value="">--</option>
                          <option value="male">Nam</option>
                          <option value="female">Nữ</option>
                          <option value="other">Khác</option>
                        </TextField>
                      ) : (
                        <span>{genderLabel(account.gender)}</span>
                      )}
                    </div>

                    <div className="admin-user-cell">
                      {userEditId === account.id ? (
                        <TextField size="small" select name="is_admin" value={userForm.is_admin ? '1' : '0'} onChange={handleUserFormChange} SelectProps={{ native: true }} sx={userFieldSx}>
                          <option value="0" disabled={account.id === userEditId && account.id === currentUserId && account.is_admin}>User</option>
                          <option value="1">Admin</option>
                        </TextField>
                      ) : (
                        <span className={`admin-user-pill ${account.is_admin ? 'role-admin' : 'role-user'}`}>{account.is_admin ? 'Admin' : 'User'}</span>
                      )}
                    </div>

                    <div className="admin-user-cell">
                      <span className={`admin-user-pill ${account.email_verified ? 'verified' : 'pending'}`}>
                        {account.email_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                      </span>
                    </div>

                    <div className="admin-user-cell">
                      <span className={`admin-user-pill ${account.is_active ? 'active' : 'locked'}`}>
                        {account.is_active ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </div>

                    <div className="admin-user-actions">
                      {userEditId === account.id ? (
                        <>
                          <Tooltip title="Lưu" arrow>
                            <IconButton className="admin-action-btn success" size="small" onClick={handleUserEditSubmit}>
                              <SaveIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Hủy" arrow>
                            <IconButton className="admin-action-btn warning" size="small" onClick={handleUserEditCancel}>
                              <CloseIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip title="Sửa" arrow>
                            <IconButton className="admin-action-btn info" size="small" onClick={() => handleUserEdit(account)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Xóa" arrow>
                            <IconButton className="admin-action-btn danger" size="small" onClick={() => handleDeleteUser(account.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={account.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'} arrow>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleToggleUserStatus(account)}
                              className={`admin-lock-btn ${account.is_active ? 'lock' : 'unlock'}`}
                            >
                              {account.is_active ? 'Khóa' : 'Mở'}
                            </Button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Box>
        )}
        {selectedMenu === 'feedback' && (
          <AdminFeedbackManager />
        )}
        {selectedMenu === 'dashboard' && <AdminDashboardStats />}
      </Box>
    </Box>
  );
}
