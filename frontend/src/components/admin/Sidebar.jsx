import { Divider, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import HomeIcon from '@mui/icons-material/Home';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import { clearActiveProfile } from '../../utils/profile';
import { adminMenuGroups } from './adminMenu';
import '../../pages/admin/AdminStyles.css';

export default function Sidebar({ selected, onSelect, open = true, onClose, theme = 'dark', onThemeToggle }) {
  if (!open) return null;

  const isLight = theme === 'light';

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-scroll">
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-brand">
            <div className="admin-sidebar-brand-icon">
              <PlayCircleIcon sx={{ fontSize: 19, color: '#fff' }} />
            </div>
            <span>IT Move Admin</span>
          </div>
          {onClose && (
            <IconButton
              onClick={onClose}
              sx={{ color: 'var(--admin-text-muted)', '&:hover': { bgcolor: 'var(--admin-card-hover)' } }}
              size="small"
              aria-label="Thu gọn menu"
            >
              <CloseIcon />
            </IconButton>
          )}
        </div>

        {adminMenuGroups.map((group) => (
          <div key={group.title} className="admin-sidebar-group">
            <div className="admin-sidebar-label">{group.title}</div>
            <List sx={{ px: 0, py: 0 }}>
              {group.items.map((item) => {
                const Icon = item.Icon;
                return (
                  <ListItem key={item.key} disablePadding>
                    <ListItemButton
                      selected={selected === item.key}
                      onClick={() => onSelect(item.key)}
                    >
                      <ListItemIcon><Icon /></ListItemIcon>
                      <ListItemText primary={item.label} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </div>
        ))}
      </div>

      <div className="admin-sidebar-footer">
        <Divider className="admin-sidebar-divider" />
        <List sx={{ pb: 2, pt: 0 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={onThemeToggle}>
              <ListItemIcon>{isLight ? <DarkModeIcon /> : <LightModeIcon />}</ListItemIcon>
              <ListItemText primary={isLight ? 'Giao diện tối' : 'Giao diện sáng'} />
            </ListItemButton>
          </ListItem>
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
              <ListItemIcon sx={{ color: '#ef4444 !important' }}><LogoutIcon /></ListItemIcon>
              <ListItemText primary="Đăng xuất" sx={{ '& .MuiListItemText-primary': { color: '#ef4444 !important' } }} />
            </ListItemButton>
          </ListItem>
        </List>
      </div>
    </aside>
  );
}
