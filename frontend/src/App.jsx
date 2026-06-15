import { Routes, Route, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme, Box } from '@mui/material';
import Home from './pages/public/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Admin from './pages/admin/AdminPage';
import Header from './components/layout/Header';
import ScrollToTop from './components/layout/ScrollToTop';
import Footer from './components/layout/Footer';
import Movies from './pages/movie/Movies';
import DetailMovies from './pages/movie/DetailMovies';
import WatchMovie from './pages/movie/WatchMovie';
import Search from './pages/movie/Search';
import Profile from './pages/user/Profile';
import UserLibrary from './pages/user/UserLibrary';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#f50057' },
  },
});

function App() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ 
        minHeight: '100vh',
        bgcolor: '#181A20',
        width: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        background: 'linear-gradient(to bottom, #181A20 0%, #23242a 100%)' }}>
        {!isAdminPage && <Header />}
        {!isAdminPage && <Box sx={{ height: { xs: 56, md: 64 } }} />}
        <Box component="main" sx={{ flex: 1, width: '100%' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/movies/:id" element={<DetailMovies />} />
            <Route path="/watch/:id" element={<WatchMovie />} />
            <Route path="/search" element={<Search />} />
            <Route path="/user/profile" element={<Profile />} />
            <Route path="/user/favorites" element={<UserLibrary />} />
            <Route path="/user/list" element={<UserLibrary />} />
            <Route path="/user/history" element={<UserLibrary />} />
            <Route path="/user/continue" element={<UserLibrary />} />
            <Route path="/user/notifications" element={<UserLibrary />} />
          </Routes>
        </Box>
        {!isAdminPage && <Footer />}
      </Box>
      <ScrollToTop />
    </ThemeProvider>
  );
}

export default App;
