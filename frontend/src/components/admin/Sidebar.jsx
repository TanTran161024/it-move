import React from 'react';
import { List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, IconButton } from '@mui/material';
import MovieIcon from '@mui/icons-material/Movie';
import CategoryIcon from '@mui/icons-material/Category';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import ImageIcon from '@mui/icons-material/Image';
import RateReviewIcon from '@mui/icons-material/RateReview';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeIcon from '@mui/icons-material/Home';
import CloseIcon from '@mui/icons-material/Close';

const menuItems = [
  { key: 'dashboard', label: 'Thống kê', icon: <BarChartIcon /> },
  { key: 'movies', label: 'Quản lý phim', icon: <MovieIcon /> },
  { key: 'banners', label: 'Quản lý banner', icon: <ImageIcon /> },
  { key: 'general', label: 'Quản lý chung', icon: <CategoryIcon /> }, // Đổi tên và key
  { key: 'categories', label: 'Quản lý danh mục', icon: <CategoryIcon /> }, // Thêm mục mới
  { key: 'users', label: 'Quản lý user', icon: <PeopleIcon /> },
  { key: 'feedback', label: 'Quản lý phản hồi', icon: <RateReviewIcon /> },
];

export default function Sidebar({ selected, onSelect, open = true, onClose }) {
  if (!open) return null;
  return (
    <aside style={{
      width: 320,
      background: '#20222b',
      minHeight: '100vh',
      color: '#fff',
      boxShadow: '2px 0 8px #0002',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      justifyContent: 'space-between',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 1200,
      transform: open ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform 0.35s cubic-bezier(.4,1.6,.6,1)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 0 0' }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 20, textAlign: 'center', py: 2, letterSpacing: 1, flex: 1 }}>Admin Dashboard</Typography>
          {onClose && (
            <IconButton onClick={onClose} sx={{ ml: 1, bgcolor: 'transparent', color: '#fff', '&:hover': { bgcolor: '#333' }, p: 1, borderRadius: '50%' }} size="large">
              <CloseIcon sx={{ fontSize: 30 }} />
            </IconButton>
          )}
        </div>
        <List>
          {menuItems.map(item => (
            <ListItem key={item.key} disablePadding>
              <ListItemButton selected={selected === item.key} onClick={() => { onSelect(item.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <ListItemIcon sx={{ color: '#fff' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </div>
      <List sx={{ mt: 2 }}>
        {/* Home button */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => { window.location.href = '/'; }} sx={{ fontWeight: 600, '&:hover': { bgcolor: '#23243a' } }}>
            <ListItemIcon sx={{ color: '#fff', minWidth: 36, mr: 1.6 }}><HomeIcon /></ListItemIcon>
            <ListItemText primary="Home" sx={{ color: '#fff' }} />
          </ListItemButton>
        </ListItem>
        {/* Logout button */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => { localStorage.removeItem('user'); window.location.href = 'http://localhost:5173/'; }} sx={{ fontWeight: 600, '&:hover': { bgcolor: '#23243a' } }}>
            <ListItemIcon sx={{ color: '#fff', minWidth: 36, mr: 1.6 }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Đăng xuất" sx={{ color: '#fff' }} />
          </ListItemButton>
        </ListItem>
      </List>
    </aside>
  );
} 
