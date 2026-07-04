import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/layout/Header';
import ProfileGate from './components/profile/ProfileGate';
import MiniPlayerProvider from './contexts/MiniPlayerProvider';
import ToastProvider from './contexts/ToastProvider';
import ErrorBoundary from './components/common/ErrorBoundary';

const Footer = lazy(() => import('./components/layout/Footer'));
const MiniPlayer = lazy(() => import('./components/movie/MiniPlayer'));
const NotFound = lazy(() => import('./pages/public/NotFound'));
const Home = lazy(() => import('./pages/public/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Admin = lazy(() => import('./pages/admin/AdminPage'));
const Movies = lazy(() => import('./pages/movie/Movies'));
const DetailMovies = lazy(() => import('./pages/movie/DetailMovies'));
const WatchMovie = lazy(() => import('./pages/movie/WatchMovie'));
const Search = lazy(() => import('./pages/movie/Search'));
const ForYou = lazy(() => import('./pages/movie/ForYou'));
const Profile = lazy(() => import('./pages/user/Profile'));
const UserSettings = lazy(() => import('./pages/user/UserSettings'));
const UserLibrary = lazy(() => import('./pages/user/UserLibrary'));
const MovieChatbot = lazy(() => import('./components/ai/MovieChatbot'));

function RouteLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center bg-background text-white">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
    </div>
  );
}

function useAmbientMount(enabled, delay = 15000) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }

    const mount = () => setReady(true);
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    const timeoutId = window.setTimeout(mount, delay);

    events.forEach((eventName) => {
      window.addEventListener(eventName, mount, { once: true, passive: true });
    });

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => {
        window.removeEventListener(eventName, mount);
      });
    };
  }, [enabled, delay]);

  return ready;
}

function App() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isWatchPage = location.pathname.startsWith('/watch/');
  const showAmbientTools = !isAdminPage && !isWatchPage;
  const ambientToolsReady = useAmbientMount(showAmbientTools);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <MiniPlayerProvider>
          <div className="flex flex-col min-h-screen w-full bg-transparent text-white selection:bg-primary/30 selection:text-white relative">
            {/* Ambient Glowing Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1] bg-[#050505]">
              <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vh] bg-purple-900/30 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }}></div>
              <div className="absolute top-[10%] right-[-10%] w-[50vw] h-[80vh] bg-pink-900/20 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '12s' }}></div>
              <div className="absolute bottom-[-20%] left-[20%] w-[60vw] h-[60vh] bg-blue-900/20 blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '10s' }}></div>
            </div>

            {showAmbientTools && <Header />}

            <ProfileGate disabled={isAdminPage}>
              <main className="flex-1 w-full flex flex-col relative z-10">
                <Suspense fallback={<RouteLoader />}>
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
                    <Route path="/user/settings" element={<UserSettings />} />
                    <Route path="/user/favorites" element={<UserLibrary />} />
                    <Route path="/user/list" element={<UserLibrary />} />
                    <Route path="/user/history" element={<UserLibrary />} />
                    <Route path="/user/continue" element={<UserLibrary />} />
                    <Route path="/user/notifications" element={<UserLibrary />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </main>
            </ProfileGate>

            {showAmbientTools && (
              <Suspense fallback={null}>
                <Footer />
              </Suspense>
            )}
            {showAmbientTools && ambientToolsReady && (
              <Suspense fallback={null}>
                <MovieChatbot />
              </Suspense>
            )}

            {showAmbientTools && ambientToolsReady && (
              <Suspense fallback={null}>
                <MiniPlayer />
              </Suspense>
            )}
          </div>
        </MiniPlayerProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
