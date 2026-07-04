import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import BarChartIcon from '@mui/icons-material/BarChart';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearActiveProfile, getActiveProfile, profileInitial } from '../../utils/profile';

const menu = [
  { label: 'Yêu thích', icon: <FavoriteBorderIcon sx={{ fontSize: 20 }} />, path: '/user/favorites' },
  { label: 'Danh sách', icon: <AddIcon sx={{ fontSize: 20 }} />, path: '/user/list' },
  { label: 'Lịch sử xem', icon: <HistoryIcon sx={{ fontSize: 20 }} />, path: '/user/history' },
  { label: 'Xem tiếp', icon: <PlayCircleOutlineIcon sx={{ fontSize: 20 }} />, path: '/user/continue' },
  { label: 'Thông báo', icon: <NotificationsNoneIcon sx={{ fontSize: 20 }} />, path: '/user/notifications' },
  { label: 'Tài khoản', icon: <AccountCircleIcon sx={{ fontSize: 20 }} />, path: '/user/profile' },
  { label: 'Cài đặt', icon: <SettingsIcon sx={{ fontSize: 20 }} />, path: '/user/settings' },
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
      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:sticky lg:top-24 lg:p-6">
        <div className="mb-4 text-lg font-bold text-white lg:mb-6">Quản lý tài khoản</div>
        <div className="mb-5 flex items-center gap-4 lg:mb-8 lg:flex-col lg:gap-0">
          {avatar ? (
            <img src={avatar} alt="" className="h-16 w-16 flex-shrink-0 rounded-2xl border-2 border-white/10 object-cover shadow-xl lg:mb-4 lg:h-24 lg:w-24 lg:rounded-full lg:border-4" referrerPolicy="no-referrer" />
          ) : (
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border-2 border-white/10 text-2xl font-bold text-white shadow-xl lg:mb-4 lg:h-24 lg:w-24 lg:rounded-full lg:border-4 lg:text-3xl"
              style={{ backgroundColor: avatarColor }}
            >
              {profileInitial(displayName)}
            </div>
          )}
          <div className="min-w-0 flex-1 lg:text-center">
            <div className="line-clamp-1 text-xl font-bold text-white">{displayName}</div>
            {activeProfile.is_kids ? <div className="mt-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">Profile trẻ em</div> : null}
            <div className="mt-1 line-clamp-1 text-sm text-text-secondary lg:mt-2">{email}</div>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
          {sidebarMenu.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                type="button"
                key={item.path}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-colors lg:gap-3 lg:px-4 lg:py-3 lg:text-base ${
                  isActive
                    ? 'border-white/10 bg-white/10 text-white shadow-lg'
                    : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => navigate(item.path)}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/5 pt-5 lg:mt-6 lg:block lg:pt-6">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white lg:mb-3 lg:px-4 lg:text-base"
            onClick={clearActiveProfile}
          >
            <AccountCircleIcon sx={{ fontSize: 20 }} />
            <span>Đổi profile</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/10 lg:px-4 lg:text-base"
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
