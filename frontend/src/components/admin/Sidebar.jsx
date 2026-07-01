import { List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, IconButton, Divider } from '@mui/material';
import MovieIcon from '@mui/icons-material/Movie';
import CategoryIcon from '@mui/icons-material/Category';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import ImageIcon from '@mui/icons-material/Image';
import RateReviewIcon from '@mui/icons-material/RateReview';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeIcon from '@mui/icons-material/Home';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import { clearActiveProfile } from '../../utils/profile';
import '../../pages/admin/AdminStyles.css';

const menuItems = [
  { key: 'dashboard', label: 'Thống kê', icon: <BarChartIcon /> },
  { key: 'movies', label: 'Quản lý phim', icon: <MovieIcon /> },
  { key: 'banners', label: 'Quản lý banner', icon: <ImageIcon /> },
  { key: 'general', label: 'Quản lý chung', icon: <CategoryIcon /> },
  { key: 'categories', label: 'Quản lý danh mục', icon: <CategoryIcon /> },
  { key: 'subtitles', label: 'Phụ đề theo tập', icon: <SubtitlesIcon /> },
  { key: 'users', label: 'Quản lý người dùng', icon: <PeopleIcon /> },
  { key: 'feedback', label: 'Quản lý phản hồi', icon: <RateReviewIcon /> },
];

export default function Sidebar({ selected, onSelect, open = true, onClose }) {
  if (!open) return null;
  return (
    <aside className={`admin-sidebar ${open ? '' : 'closed'}`}>
      <div>
        {/* Header */}
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-brand">
            <div className="admin-sidebar-brand-icon">
              <PlayCircleIcon sx={{ fontSize: 18, color: '#fff' }} />
            </div>
            <span>IT Move Admin</span>
          </div>
          {onClose && (
            <IconButton
              onClick={onClose}
              sx={{ color: 'var(--admin-text-muted)', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          )}
        </div>

        {/* Menu Label */}
        <div className="admin-sidebar-label">Menu chính</div>

        {/* Main Menu */}
        <List sx={{ px: 0 }}>
          {menuItems.map(item => (
            <ListItem key={item.key} disablePadding>
              <ListItemButton
                selected={selected === item.key}
                onClick={() => { onSelect(item.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </div>

      {/* Bottom actions */}
      <div>
        <Divider className="admin-sidebar-divider" />
        <List sx={{ pb: 2 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => { window.location.href = '/'; }}>
              <ListItemIcon><HomeIcon /></ListItemIcon>
              <ListItemText primary="Trang chủ" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { localStorage.removeItem('user'); clearActiveProfile(); window.location.assign('/'); }}
              sx={{ '&:hover': { bgcolor: 'rgba(239,68,68,0.08) !important' } }}
            >
              <ListItemIcon sx={{ color: '#f87171 !important' }}><LogoutIcon /></ListItemIcon>
              <ListItemText primary="Đăng xuất" sx={{ '& .MuiListItemText-primary': { color: '#f87171 !important' } }} />
            </ListItemButton>
          </ListItem>
        </List>
      </div>
    </aside>
  );
}
