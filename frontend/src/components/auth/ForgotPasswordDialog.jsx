import { Dialog, Box, Typography, TextField, Button, IconButton, Alert } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MovieIcon from '@mui/icons-material/Movie';
import { useState } from 'react';
import axios from 'axios';

export default function ForgotPasswordDialog({ open, onClose, onLogin }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleForgot = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      await axios.post('http://localhost:5000/api/auth/forgot-password', { email });
      setMessage('Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi!');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" PaperProps={{ sx: { borderRadius: 4, p: 0, overflow: 'hidden', bgcolor: '#232a3b' } }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 340 }}>
        <Box sx={{ flex: 1, bgcolor: '#232a3b', display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}>
          <MovieIcon sx={{ fontSize: 80, color: '#FFD600' }} />
        </Box>
        <Box sx={{ flex: 1.2, p: 4, bgcolor: '#232a3b', position: 'relative' }}>
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8, color: '#fff' }}>
            <CloseIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700} mb={2} color="#fff">Quên mật khẩu</Typography>
          <Typography variant="body2" mb={2} color="#aaa">
            Nếu bạn đã có tài khoản, <Button variant="text" sx={{ color: '#FFD600', p: 0, minWidth: 0 }} onClick={onLogin}>đăng nhập</Button>
          </Typography>
          <form onSubmit={handleForgot}>
            <TextField label="Email đăng ký" fullWidth margin="normal" variant="filled" sx={{ bgcolor: '#20263a', borderRadius: 1, input: { color: '#fff' } }} value={email} onChange={e => setEmail(e.target.value)} />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ mt: 1 }}>{message}</Alert>}
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2, bgcolor: '#FFD600', color: '#232a3b', fontWeight: 700 }}>Gửi yêu cầu</Button>
          </form>
        </Box>
      </Box>
    </Dialog>
  );
}
