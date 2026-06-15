import { useEffect, useState } from 'react';
import { Box, Container, Typography, Grid, Card, CardMedia, CardContent, CardActions, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Toolbar, Autocomplete, Tabs, Tab, Switch } from '@mui/material';
import axios from 'axios';
import MovieTable from '../components/admin/MovieTable';
import MovieForm from '../components/admin/MovieForm';
import EpisodeManager from '../components/admin/EpisodeManager';
import Sidebar from '../components/admin/Sidebar';
import CategoryManager from '../components/admin/CategoryManager';
import AdminFeedbackManager from '../components/admin/AdminFeedbackManager';
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

export default function Admin() {
  const [movies, setMovies] = useState([]);
  const [open, setOpen] = useState(false);
  const [editMovie, setEditMovie] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', poster_url: '', release_date: '', genre: '' });
  const [error, setError] = useState('');
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
      const res = await axios.get('http://localhost:5000/api/users');
      setUsers(res.data);
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  useEffect(() => { if (selectedMenu === 'users') fetchUsers(); }, [selectedMenu]);
  const handleToggleAdmin = async (user) => {
    try {
      await axios.put(`http://localhost:5000/api/users/${user.id}/admin`, { is_admin: !user.is_admin });
      fetchUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleToggleUserStatus = async (user) => {
    try {
      await axios.put(`http://localhost:5000/api/users/${user.id}/status`, { is_active: !user.is_active });
      fetchUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleDeleteUser = async (id) => {
    if (!window.confirm('Xóa tài khoản này?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/users/${id}`);
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
        await axios.put(`http://localhost:5000/api/users/${userEditId}/admin`, { is_admin: userForm.is_admin });
      }
      // Cập nhật các trường khác
      await axios.put(`http://localhost:5000/api/users/${userEditId}`, {
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
      axios.get('http://localhost:5000/api/genres'),
      axios.get('http://localhost:5000/api/countries'),
      axios.get('http://localhost:5000/api/actors'),
      axios.get('http://localhost:5000/api/directors'),
    ]);
    setGenres(g.data);
    setCountries(c.data);
    setActors(a.data);
    setDirectors(d.data);
  };

  const fetchMovies = () => {
    axios.get('http://localhost:5000/api/movies').then(res => setMovies(res.data));
  };

  // Lấy danh sách banner
  const fetchBanners = async () => {
    const res = await axios.get('http://localhost:5000/api/banners');
    setBanners(res.data);
  };

  // Lấy danh sách phim cho select movie
  const [allMovies, setAllMovies] = useState([]);
  const fetchAllMovies = async () => {
    const res = await axios.get('http://localhost:5000/api/movies');
    setAllMovies(res.data);
  };

  // Lấy danh sách tập phim cho 1 movie
  const fetchEpisodes = async (movieId) => {
    const res = await axios.get(`http://localhost:5000/api/movies/${movieId}/episodes`);
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
    await axios.post(`http://localhost:5000/api/movies/${episodeMovie.id}/episodes`, form);
    await fetchEpisodes(episodeMovie.id);
  };
  const handleEditEpisode = async (id, form) => {
    await axios.put(`http://localhost:5000/api/episodes/${id}`, form);
    await fetchEpisodes(episodeMovie.id);
  };
  const handleDeleteEpisode = async (id) => {
    if (!window.confirm('Xóa tập này?')) return;
    await axios.delete(`http://localhost:5000/api/episodes/${id}`);
    await fetchEpisodes(episodeMovie.id);
  };

  // Fetch data cho từng tab
  const fetchCategories = async () => {
    const [g, c, p, a, d] = await Promise.all([
      axios.get('http://localhost:5000/api/genres'),
      axios.get('http://localhost:5000/api/countries'),
      axios.get('http://localhost:5000/api/producers'),
      axios.get('http://localhost:5000/api/actors'),
      axios.get('http://localhost:5000/api/directors'),
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
        await axios.put(`http://localhost:5000/api/${url}/${catEditId}`, data);
      } else {
        await axios.post(`http://localhost:5000/api/${url}`, data);
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
    await axios.delete(`http://localhost:5000/api/${url}/${id}`);
    fetchCategories();
  };

  useEffect(() => {
    fetchMovies();
    fetchBanners();
    fetchAllMovies();
  }, []);

  // State cho dashboard
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  useEffect(() => {
    if (selectedMenu === 'dashboard') {
      axios.get('http://localhost:5000/api/admin/stats')
        .then(res => setStats(res.data))
        .catch(err => setStatsError(err.response?.data?.message || 'Lỗi'));
    }
  }, [selectedMenu]);

  if (!user.is_admin) return <Alert severity="error">Bạn không có quyền truy cập trang này!</Alert>;

  const handleOpen = async (movie) => {
    await fetchRelations();
    setEditMovie(movie);
    setForm(movie || { title: '', description: '', poster_url: '', release_date: '', genre: '' });
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
    setForm({ title: '', description: '', poster_url: '', release_date: '', genre: '' });
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
  });

  const handleSubmit = async () => {
    try {
      let movieId = editMovie?.id;
      const movieData = safeMovieData(form);
      if (editMovie) {
        await axios.put(`http://localhost:5000/api/movies/${editMovie.id}`, { ...movieData, is_admin: true });
      } else {
        const res = await axios.post('http://localhost:5000/api/movies', { ...movieData, is_admin: true });
        movieId = res.data.id || null;
        if (!movieId) {
          await fetchMovies();
          const last = movies[movies.length - 1];
          movieId = last?.id;
        }
      }
      // Gắn các liên kết
      if (movieId) {
        await axios.post(`http://localhost:5000/api/movies/${movieId}/genres`, { genre_ids: selectedGenres.map(g => g.id) });
        await axios.post(`http://localhost:5000/api/movies/${movieId}/countries`, { country_ids: selectedCountries.map(c => c.id) });
        await axios.post(`http://localhost:5000/api/movies/${movieId}/actors`, { actor_ids: selectedActors.map(a => a.id) });
        await axios.post(`http://localhost:5000/api/movies/${movieId}/directors`, { director_ids: selectedDirectors.map(d => d.id) });
      }
      fetchMovies(); handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa phim này?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/movies/${id}?is_admin=true`);
      fetchMovies();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi');
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
        await axios.put(`http://localhost:5000/api/banners/${editBanner.id}`, data);
      } else {
        await axios.post('http://localhost:5000/api/banners', data);
      }
      fetchBanners(); handleBannerClose();
    } catch (err) {
      setBannerError(err.response?.data?.message || 'Lỗi');
    }
  };
  const handleBannerDelete = async (id) => {
    if (!window.confirm('Xóa banner này?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/banners/${id}`);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { key: 'dashboard', icon: <BarChartIcon /> },
    { key: 'movies', icon: <MovieIcon /> },
    { key: 'banners', icon: <ImageIcon /> },
    { key: 'categories', icon: <CategoryIcon /> },
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
            <Button variant="contained" onClick={() => handleOpen(null)} sx={{ mb: 2 }}>Thêm phim</Button>
            <MovieTable
              movies={movies}
              onEdit={handleOpen}
              onDelete={handleDelete}
              onManageEpisodes={handleManageEpisodes}
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
          <Box sx={{ width: '100%', maxWidth: '1400px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>Quản lý banner</Typography>
            <Button variant="contained" onClick={() => handleBannerOpen(null)} sx={{ mb: 2, bgcolor: '#1976d2' }}>Thêm banner</Button>
            <Box>
              {banners.map(banner => (
                <Box
                  key={banner.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: '#23242a',
                    color: '#fff',
                    borderRadius: 3,
                    mb: 3,
                    p: 2.5,
                    boxShadow: 3,
                    transition: 'transform 0.18s, box-shadow 0.18s',
                    '&:hover': {
                      transform: 'translateY(-4px) scale(1.025)',
                      boxShadow: 8,
                      background: '#23243a',
                    },
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                  }}
                >
                  <img
                    src={banner.bg_url}
                    alt="bg"
                    style={{
                      width: 180,
                      height: 90,
                      objectFit: 'cover',
                      borderRadius: 12,
                      marginRight: 24,
                      boxShadow: '0 2px 16px #0007',
                      border: '2px solid #222',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600, fontSize: 20, mb: 0.5, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{banner.movie_title}</Typography>
                    <Typography variant="body2" sx={{ color: '#aaa', fontSize: 14, wordBreak: 'break-all', mb: 0.5 }}>{banner.bg_url}</Typography>
                  </Box>
                  <Tooltip title="Sửa" arrow>
                    <IconButton color="primary" sx={{ mx: 0.5, bgcolor: '#222', '&:hover': { bgcolor: '#1976d2', color: '#fff' } }} onClick={() => handleBannerOpen(banner)}>
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Xóa" arrow>
                    <IconButton color="error" sx={{ mx: 0.5, bgcolor: '#222', '&:hover': { bgcolor: '#d32f2f', color: '#fff' } }} onClick={() => handleBannerDelete(banner.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
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
          <Box sx={{ width: '100%', maxWidth: '1400px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>Quản lý chung</Typography>
            <Tabs
              value={selectedTab}
              onChange={handleCatTabChange}
              sx={{ mb: 3, bgcolor: '#23242a', borderRadius: 2 }}
              textColor="inherit"
              TabIndicatorProps={{ style: { background: '#2196f3' } }}
            >
              <Tab label="THỂ LOẠI" sx={{ color: '#fff', fontWeight: 600 }} />
              <Tab label="QUỐC GIA" sx={{ color: '#fff', fontWeight: 600 }} />
              <Tab label="NHÀ SẢN XUẤT" sx={{ color: '#fff', fontWeight: 600 }} />
              <Tab label="DIỄN VIÊN" sx={{ color: '#fff', fontWeight: 600 }} />
              <Tab label="ĐẠO DIỄN" sx={{ color: '#fff', fontWeight: 600 }} />
            </Tabs>
            {/* Form thêm mới */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center', bgcolor: '#23242a', p: 2, borderRadius: 3, boxShadow: 2 }}>
              <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180 }} size="small" label={selectedTab === 0 ? 'Tên thể loại' : selectedTab === 1 ? 'Tên quốc gia' : selectedTab === 2 ? 'Tên nhà sản xuất' : selectedTab === 3 ? 'Tên diễn viên' : 'Tên đạo diễn'} name="name" value={catEditId ? '' : catForm.name} onChange={e => !catEditId && handleCatChange(e)} />
              {selectedTab === 2 && (
                <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, ...selectOverrideSx, minWidth: 120 }} size="small" select name="country_id" value={catEditId ? '' : catForm.country_id} onChange={e => !catEditId && handleCatChange(e)} SelectProps={{ native: true }}>
                  <option value="">--Chọn quốc gia--</option>
                  {countriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </TextField>
              )}
              {(selectedTab === 3 || selectedTab === 4) && (
                <>
                  <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180 }} size="small" label="Ảnh đại diện (URL)" name="profile_pic_url" value={catEditId ? '' : catForm.profile_pic_url} onChange={e => !catEditId && handleCatChange(e)} />
                  <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180 }} size="small" label="Mô tả" name="bio" value={catEditId ? '' : catForm.bio} onChange={e => !catEditId && handleCatChange(e)} />
                </>
              )}
              <Button variant="contained" onClick={handleCatSubmit} disabled={!!catEditId} sx={{ fontWeight: 600, minWidth: 110 }}>{catEditId ? 'Đang sửa...' : 'Thêm mới'}</Button>
              {!catEditId && catError && <Alert severity="error" sx={{ ml: 2 }}>{catError}</Alert>}
            </Box>
            {/* Danh sách */}
            <Box>
              {(selectedTab === 0 ? genresList : selectedTab === 1 ? countriesList : selectedTab === 2 ? producersList : selectedTab === 3 ? actorsList : directorsList).map(item => {
                const isEditing = catEditId === item.id;
                return (
                  <Box key={item.id} sx={{
                    display: 'flex', alignItems: 'center', bgcolor: isEditing ? '#283593' : '#23242a', color: '#fff', borderRadius: 3, mb: 2, p: 2, boxShadow: isEditing ? 6 : 2,
                    border: isEditing ? '2px solid #FFD600' : '2px solid transparent',
                    transition: 'all 0.18s',
                    '&:hover': { boxShadow: 8, background: isEditing ? '#283593' : '#23243a' },
                    flexWrap: 'wrap',
                    position: 'relative',
                  }}>
                    {/* Inline form sửa */}
                    {isEditing ? (
                      <>
                        <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 160 }} size="small" label={selectedTab === 0 ? 'Tên thể loại' : selectedTab === 1 ? 'Tên quốc gia' : selectedTab === 2 ? 'Tên nhà sản xuất' : selectedTab === 3 ? 'Tên diễn viên' : 'Tên đạo diễn'} name="name" value={catForm.name} onChange={handleCatChange} />
                        {selectedTab === 2 && (
                          <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, ...selectOverrideSx, minWidth: 120 }} size="small" select name="country_id" value={catForm.country_id} onChange={handleCatChange} SelectProps={{ native: true }}>
                            <option value="">--Chọn quốc gia--</option>
                            {countriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </TextField>
                        )}
                        {(selectedTab === 3 || selectedTab === 4) && (
                          <>
                            <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180 }} size="small" label="Ảnh đại diện (URL)" name="profile_pic_url" value={catForm.profile_pic_url} onChange={handleCatChange} />
                            <TextField {...whiteTextFieldProps} sx={{ ...whiteTextFieldSx, minWidth: 180 }} size="small" label="Mô tả" name="bio" value={catForm.bio} onChange={handleCatChange} />
                          </>
                        )}
                        <Button variant="contained" color="success" size="small" onClick={handleCatSubmit} sx={{ mr: 1, minWidth: 40 }}><span role="img" aria-label="save">💾</span></Button>
                        <Button size="small" color="warning" onClick={handleCatCancel} sx={{ minWidth: 40 }}><span role="img" aria-label="cancel">❌</span></Button>
                        {catError && <Alert severity="error" sx={{ ml: 2 }}>{catError}</Alert>}
                      </>
                    ) : (
                      <>
                        <Typography sx={{ flex: 1, fontWeight: 500, fontSize: 17 }}>{item.name}</Typography>
                        {selectedTab === 2 && <Typography sx={{ minWidth: 120, color: '#aaa' }}>{countriesList.find(c => c.id === item.country_id)?.name || ''}</Typography>}
                        {selectedTab === 3 && <img src={item.profile_pic_url || '/avatar-actor.svg'} alt="pic" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12, border: '2px solid #FFD600', background: '#222' }} />}
                        {selectedTab === 4 && <img src={item.profile_pic_url || '/avatar-actor.svg'} alt="pic" onError={(e) => { e.currentTarget.src = '/avatar-actor.svg'; }} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12, border: '2px solid #FFD600', background: '#222' }} />}
                        <Tooltip title="Sửa" arrow>
                          <IconButton color="primary" sx={{ mx: 0.5, bgcolor: '#222', '&:hover': { bgcolor: '#1976d2', color: '#fff' } }} onClick={() => handleCatEdit(item)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Xóa" arrow>
                          <IconButton color="error" sx={{ mx: 0.5, bgcolor: '#222', '&:hover': { bgcolor: '#d32f2f', color: '#fff' } }} onClick={() => handleCatDelete(item.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
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
        {selectedMenu === 'users' && (
          <Box sx={{ color: '#fff', mt: 4, maxWidth: '1400px', mx: 'auto' }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>Quản lý người dùng</Typography>
            {userError && <Alert severity="error" sx={{ mb: 2 }}>{userError}</Alert>}
            <Box sx={{ bgcolor: '#23242a', borderRadius: 3, p: 3, boxShadow: 4 }}>
              <Box sx={{ display: 'flex', fontWeight: 700, mb: 2, bgcolor: '#181a20', borderRadius: 2, p: 1.2, fontSize: 17 }}>
                <Box sx={{ flex: 2 }}>Username</Box>
                <Box sx={{ flex: 3 }}>Email</Box>
                <Box sx={{ flex: 1 }}>Gender</Box>
                <Box sx={{ flex: 1 }}>Role</Box>
                <Box sx={{ flex: 1 }}>Verified</Box>
                <Box sx={{ flex: 1 }}>Status</Box>
                <Box sx={{ flex: 1 }}>Actions</Box>
              </Box>
              {users.map(user => (
                <Box key={user.id} sx={{ display: 'flex', alignItems: 'center', mb: 1.5, p: 1.2, borderRadius: 2, transition: 'background 0.15s', '&:hover': { background: '#23243a' }, boxShadow: 1 }}>
                  <Box sx={{ flex: 2 }}>
                    {userEditId === user.id ? (
                      <TextField size="small" value={userForm.username} name="username" onChange={handleUserFormChange} sx={{ bgcolor: '#23242a', input: { color: '#fff' }, '& .MuiInputBase-input': { color: '#fff' }, '& .MuiInputLabel-root': { color: '#fff' }, '& fieldset': { borderColor: '#444' }, mr: 1, minWidth: 120 }} />
                    ) : (
                      <Typography sx={{ fontWeight: 500 }}>{user.username}</Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 3 }}>
                    {userEditId === user.id ? (
                      <TextField size="small" value={userForm.email} name="email" onChange={handleUserFormChange} sx={{ bgcolor: '#23242a', input: { color: '#fff' }, '& .MuiInputBase-input': { color: '#fff' }, '& .MuiInputLabel-root': { color: '#fff' }, '& fieldset': { borderColor: '#444' }, mr: 1, minWidth: 180 }} />
                    ) : (
                      <Typography sx={{ fontWeight: 500 }}>{user.email}</Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    {userEditId === user.id ? (
                      <TextField size="small" select name="gender" value={userForm.gender} onChange={handleUserFormChange} SelectProps={{ native: true }} sx={{ color: '#fff', '& select': { color: '#fff', background: '#23242a' }, '& option': { color: '#111', background: '#fff' }, minWidth: 90 }}>
                        <option value="">--</option>
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </TextField>
                    ) : (
                      <Typography sx={{ fontWeight: 500 }}>{user.gender || ''}</Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    {userEditId === user.id ? (
                      <TextField size="small" select name="is_admin" value={userForm.is_admin ? '1' : '0'} onChange={handleUserFormChange} SelectProps={{ native: true }} sx={{ color: '#fff', '& select': { color: '#fff', background: '#23242a' }, '& option': { color: '#111', background: '#fff' }, minWidth: 90 }}>
                        <option value="0" disabled={user.id === userEditId && user.id === currentUserId && user.is_admin}>{'User'}</option>
                        <option value="1">{'Admin'}</option>
                      </TextField>
                    ) : (
                      <Typography sx={{ fontWeight: 500 }}>{user.is_admin ? 'Admin' : 'User'}</Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 500, color: user.email_verified ? '#66bb6a' : '#ffa726' }}>
                      {user.email_verified ? 'Yes' : 'No'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 500, color: user.is_active ? '#66bb6a' : '#ef5350' }}>
                      {user.is_active ? 'Hoạt động' : 'Đã khóa'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
                    {userEditId === user.id ? (
                      <>
                        <Tooltip title="Lưu" arrow>
                          <IconButton color="success" size="small" onClick={handleUserEditSubmit} sx={{ bgcolor: '#222', '&:hover': { bgcolor: '#388e3c', color: '#fff' } }}>
                            <SaveIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Hủy" arrow>
                          <IconButton color="warning" size="small" onClick={handleUserEditCancel} sx={{ bgcolor: '#222', '&:hover': { bgcolor: '#ffa726', color: '#fff' } }}>
                            <CloseIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <Tooltip title="Sửa" arrow>
                          <IconButton color="primary" size="small" onClick={() => handleUserEdit(user)} sx={{ bgcolor: '#222', '&:hover': { bgcolor: '#1976d2', color: '#fff' } }}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Xóa" arrow>
                          <IconButton color="error" size="small" onClick={() => handleDeleteUser(user.id)} sx={{ bgcolor: '#222', '&:hover': { bgcolor: '#d32f2f', color: '#fff' } }}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={user.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'} arrow>
                          <Button size="small" variant="outlined" color={user.is_active ? 'warning' : 'success'} onClick={() => handleToggleUserStatus(user)} sx={{ minWidth: 58 }}>
                            {user.is_active ? 'Khóa' : 'Mở'}
                          </Button>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {selectedMenu === 'feedback' && (
          <AdminFeedbackManager />
        )}
        {selectedMenu === 'dashboard' && (
          <Box sx={{ width: '100%', maxWidth: '1100px', mx: 'auto', px: { xs: 1, md: 3 }, mt: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ color: '#fff', fontWeight: 700, textAlign: 'center', mb: 4, letterSpacing: 1 }}>Thống kê & Báo cáo</Typography>
            {statsError && <Alert severity="error">{statsError}</Alert>}
            {stats && (
              <>
                <Box sx={{ display: 'flex', gap: 3, mb: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 180, flex: 1, boxShadow: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 220 }}>
                    <svg width="36" height="36" fill="#FFD600" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M7 17.97V6.03c0-.55.45-1 1-1s1 .45 1 1v11.94c0 .55-.45 1-1 1s-1-.45-1-1zM11 17.97V6.03c0-.55.45-1 1-1s1 .45 1 1v11.94c0 .55-.45 1-1 1s-1-.45-1-1zM15 17.97V6.03c0-.55.45-1 1-1s1 .45 1 1v11.94c0 .55-.45 1-1 1s-1-.45-1-1z"/></svg>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>Tổng số phim</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total_movies}</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 180, flex: 1, boxShadow: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 220 }}>
                    <svg width="36" height="36" fill="#42a5f5" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M7 17.97V6.03c0-.55.45-1 1-1s1 .45 1 1v11.94c0 .55-.45 1-1 1s-1-.45-1-1z"/></svg>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>Thể loại</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total_genres}</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 180, flex: 1, boxShadow: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 220 }}>
                    <svg width="36" height="36" fill="#66bb6a" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l4.28 2.54a1 1 0 0 0 1-1.73l-5-3V7a1 1 0 1 0-2 0v6a1 1 0 0 0 .47.85l6 3.6a1 1 0 0 0 1-1.73l-5-3V7z"/></svg>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>Quốc gia</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total_countries}</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 180, flex: 1, boxShadow: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 220 }}>
                    <svg width="36" height="36" fill="#ff7043" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>Người dùng</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total_users}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 3, mb: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 220, flex: 1, boxShadow: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 300 }}>
                    <Typography variant="subtitle2">Phim đang chiếu</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.ongoing_movies}</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 3, minWidth: 220, flex: 1, boxShadow: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 300 }}>
                    <Typography variant="subtitle2">Phim đã hoàn thành</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.completed_movies}</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, color: '#FFD600', textAlign: 'center', mb: 2 }}>Top phim mới thêm gần đây</Typography>
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {stats.recent_movies.map(movie => (
                      <Box key={movie.id} sx={{ bgcolor: '#23242a', color: '#fff', borderRadius: 3, p: 2, minWidth: 180, maxWidth: 200, textAlign: 'center', boxShadow: 3, transition: 'transform 0.15s, box-shadow 0.15s', '&:hover': { transform: 'translateY(-4px) scale(1.03)', boxShadow: 8, background: '#23243a' } }}>
                        <img src={movie.poster_url} alt={movie.title} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} />
                        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, color: '#fff', fontSize: 17 }}>{movie.title}</Typography>
                        <Typography variant="caption" color="#aaa">{new Date(movie.created_at).toLocaleDateString()}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
} 
