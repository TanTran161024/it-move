import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Home from './pages/public/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Admin from './pages/admin/AdminPage';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Movies from './pages/movie/Movies';
import DetailMovies from './pages/movie/DetailMovies';
import WatchMovie from './pages/movie/WatchMovie';
import Search from './pages/movie/Search';
import ForYou from './pages/movie/ForYou';
import Profile from './pages/user/Profile';
import UserLibrary from './pages/user/UserLibrary';
import MovieChatbot from './components/ai/MovieChatbot';
import ProfileGate from './components/profile/ProfileGate';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#E50914' },
    secondary: { main: '#2C2C2C' },
    background: { default: '#090909', paper: '#1A1A1A' }
  },
  typography: {
    fontFamily: "'Be Vietnam Pro', sans-serif",
  }
});

function App() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isWatchPage = location.pathname.startsWith('/watch/');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="flex flex-col min-h-screen w-full bg-background text-white selection:bg-primary/30 selection:text-white">
        {!isAdminPage && !isWatchPage && <Header />}
        
        <ProfileGate disabled={isAdminPage}>
          {/* Main Content Area */}
          <main className="flex-1 w-full">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/movies/:id" element={<DetailMovies />} />
              <Route path="/watch/:id" element={<WatchMovie />} />
              <Route path="/search" element={<Search />} />
              <Route path="/for-you" element={<ForYou />} />
              <Route path="/user/profile" element={<Profile />} />
              <Route path="/user/favorites" element={<UserLibrary />} />
              <Route path="/user/list" element={<UserLibrary />} />
              <Route path="/user/history" element={<UserLibrary />} />
              <Route path="/user/continue" element={<UserLibrary />} />
              <Route path="/user/notifications" element={<UserLibrary />} />
            </Routes>
          </main>
        </ProfileGate>
        
        {!isAdminPage && !isWatchPage && <Footer />}
        {!isAdminPage && !isWatchPage && <MovieChatbot />}
      </div>
    </ThemeProvider>
  );
}

export default App;
