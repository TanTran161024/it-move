import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useLocation, useNavigate } from 'react-router-dom';

const menu = [
  { label: 'Yêu thích', icon: <FavoriteBorderIcon sx={{ fontSize: 20 }} />, path: '/user/favorites' },
  { label: 'Danh sách', icon: <AddIcon sx={{ fontSize: 20 }} />, path: '/user/list' },
  { label: 'Lịch sử xem', icon: <HistoryIcon sx={{ fontSize: 20 }} />, path: '/user/history' },
  { label: 'Xem tiếp', icon: <HistoryIcon sx={{ fontSize: 20 }} />, path: '/user/continue' },
  { label: 'Thông báo', icon: <NotificationsNoneIcon sx={{ fontSize: 20 }} />, path: '/user/notifications' },
  { label: 'Tài khoản', icon: <AccountCircleIcon sx={{ fontSize: 20 }} />, path: '/user/profile' },
];

export default function ProfileSidebar({ user = {}, profile = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = profile.username || user.username || 'Người dùng';
  const email = profile.email || user.email || '';
  const avatar = profile.avatar || profile.avatar_url || user.avatar || user.avatar_url || '';

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const sidebarMenu = user.is_admin
    ? [...menu, { label: 'Admin', icon: <BarChartIcon sx={{ fontSize: 20 }} />, path: '/admin' }]
    : menu;

  return (
    <aside className="w-full lg:w-72 flex-shrink-0">
      <div className="bg-surface/50 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-2xl sticky top-24">
        <div className="text-lg font-heading font-bold text-white mb-6">Quản lý tài khoản</div>
        <div className="flex flex-col items-center mb-8">
          {avatar ? (
            <img src={avatar} alt="avatar" className="w-24 h-24 rounded-full object-cover border-4 border-white/10 shadow-xl mb-4" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary/80 to-primary/20 flex items-center justify-center text-3xl font-bold border-4 border-white/10 shadow-xl mb-4 text-white">
              {displayName ? displayName[0].toUpperCase() : '?'}
            </div>
          )}
          <div className="text-xl font-bold text-white text-center line-clamp-1">{displayName}</div>
          <div className="text-sm text-text-secondary mt-1 text-center line-clamp-1">{email}</div>
        </div>

        <nav className="flex flex-col gap-2">
          {sidebarMenu.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                type="button"
                key={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium border ${isActive ? 'bg-white/10 text-white shadow-lg border-white/10' : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-white'}`}
                onClick={() => navigate(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-6 pt-6 border-t border-white/5">
          <button type="button" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all font-medium text-red-400 hover:bg-red-500/10 hover:text-red-400 w-full" onClick={handleLogout}>
            <LogoutIcon sx={{ fontSize: 20 }} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
