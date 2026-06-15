import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Fab, Zoom } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  // Tự động scroll lên đầu trang khi route thay đổi
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Zoom in={visible}>
      <Fab
        size="medium"
        onClick={handleClick}
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          zIndex: 1200,
          bgcolor: '#fff',
          color: '#23242a',
          boxShadow: 4,
          '&:hover': { bgcolor: '#f5f5f5' }
        }}
      >
        <KeyboardArrowUpIcon />
      </Fab>
    </Zoom>
  );
} 