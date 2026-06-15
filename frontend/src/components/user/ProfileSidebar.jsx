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

  const sidebarMenu = Boolean(user.is_admin)
    ? [...menu, { label: 'Admin', icon: <BarChartIcon sx={{ fontSize: 20 }} />, path: '/admin' }]
    : menu;

  return (
    <aside className="profile-sidebar">
      <div className="profile-sidebar-title">Quản lý tài khoản</div>
      {avatar ? (
        <img src={avatar} alt="avatar" className="profile-sidebar-avatar" />
      ) : (
        <div className="profile-sidebar-avatar-fallback">
          {displayName ? displayName[0].toUpperCase() : '?'}
        </div>
      )}
      <div className="profile-sidebar-name">{displayName}</div>
      <div className="profile-sidebar-email">{email}</div>

      <nav className="profile-sidebar-menu">
        {sidebarMenu.map((item) => (
          <button
            type="button"
            key={item.path}
            className={`profile-sidebar-menu-item${location.pathname === item.path ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="profile-sidebar-logout" onClick={handleLogout}>
        <LogoutIcon sx={{ fontSize: 20 }} />
        <span>Thoát</span>
      </button>
    </aside>
  );
}
