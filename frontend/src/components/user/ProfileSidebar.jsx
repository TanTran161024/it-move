import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import BarChartIcon from '@mui/icons-material/BarChart';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearActiveProfile, getActiveProfile, profileInitial } from '../../utils/profile';

const menu = [
  { label: 'Yêu thích', icon: <FavoriteBorderIcon sx={{ fontSize: 20 }} />, path: '/user/favorites' },
  { label: 'Danh sách', icon: <AddIcon sx={{ fontSize: 20 }} />, path: '/user/list' },
  { label: 'Lịch sử xem', icon: <HistoryIcon sx={{ fontSize: 20 }} />, path: '/user/history' },
  { label: 'Xem tiếp', icon: <PlayCircleOutlineIcon sx={{ fontSize: 20 }} />, path: '/user/continue' },
  { label: 'Thông báo', icon: <NotificationsNoneIcon sx={{ fontSize: 20 }} />, path: '/user/notifications' },
  { label: 'Tài khoản', icon: <AccountCircleIcon sx={{ fontSize: 20 }} />, path: '/user/profile' },
];

export default function ProfileSidebar({ user = {}, profile = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeProfile = getActiveProfile();
  const displayName = activeProfile.name || profile.username || user.username || 'Người dùng';
  const email = profile.email || user.email || '';
  const avatar = activeProfile.avatar_url || profile.avatar || profile.avatar_url || user.avatar || user.avatar_url || '';
  const avatarColor = activeProfile.avatar_color || '#E50914';

  const handleLogout = () => {
    localStorage.removeItem('user');
    clearActiveProfile();
    navigate('/');
  };

  const sidebarMenu = user.is_admin
    ? [...menu, { label: 'Admin', icon: <BarChartIcon sx={{ fontSize: 20 }} />, path: '/admin' }]
    : menu;

  return (
    <aside className="w-full flex-shrink-0 lg:w-72">
      <div className="sticky top-24 rounded-2xl border border-white/5 bg-surface/50 p-6 shadow-2xl backdrop-blur-md">
        <div className="mb-6 text-lg font-bold text-white">Quản lý tài khoản</div>
        <div className="mb-8 flex flex-col items-center">
          {avatar ? (
            <img src={avatar} alt="" className="mb-4 h-24 w-24 rounded-full border-4 border-white/10 object-cover shadow-xl" referrerPolicy="no-referrer" />
          ) : (
            <div
              className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/10 text-3xl font-bold text-white shadow-xl"
              style={{ backgroundColor: avatarColor }}
            >
              {profileInitial(displayName)}
            </div>
          )}
          <div className="line-clamp-1 text-center text-xl font-bold text-white">{displayName}</div>
          {activeProfile.is_kids ? <div className="mt-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">Profile trẻ em</div> : null}
          <div className="mt-2 line-clamp-1 text-center text-sm text-text-secondary">{email}</div>
        </div>

        <nav className="flex flex-col gap-2">
          {sidebarMenu.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                type="button"
                key={item.path}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 font-medium transition-colors ${
                  isActive
                    ? 'border-white/10 bg-white/10 text-white shadow-lg'
                    : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => navigate(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-white/5 pt-6">
          <button
            type="button"
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            onClick={clearActiveProfile}
          >
            <AccountCircleIcon sx={{ fontSize: 20 }} />
            <span>Đổi profile</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-red-400 transition-colors hover:bg-red-500/10"
            onClick={handleLogout}
          >
            <LogoutIcon sx={{ fontSize: 20 }} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
