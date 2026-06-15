import { Dialog, Box, Typography, TextField, Button, IconButton, Alert, Snackbar, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MovieIcon from '@mui/icons-material/Movie';
import { useState } from 'react';
import axios from 'axios';
import GoogleLoginButton from './GoogleLoginButton';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function LoginDialog({ open, onClose, onRegister, onForgot }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const showError = (text) => {
    setError(text);
    setSnackbarOpen(true);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${API}/api/auth/login`, { username: identifier, password });
      localStorage.setItem('user', JSON.stringify(res.data));
      onClose();
      window.location.reload();
    } catch (err) {
      if (err.response?.data?.requiresVerification) {
        setVerifyEmail(err.response.data.email || identifier);
        showError('Tài khoản chưa xác nhận email. Vui lòng nhập mã OTP.');
        return;
      }
      showError(err.response?.data?.message || 'Đăng nhập thất bại');
    }
  };

  const handleVerify = async () => {
    setError('');
    setMessage('');
    try {
      await axios.post(`${API}/api/auth/verify-email`, { email: verifyEmail, otp });
      setMessage('Xác nhận email thành công. Bạn có thể đăng nhập.');
      setOtp('');
    } catch (err) {
      showError(err.response?.data?.message || 'Xác nhận email thất bại');
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    try {
      await axios.post(`${API}/api/auth/resend-verification`, { email: verifyEmail || identifier });
      setMessage('Mã OTP mới đã được gửi. Nếu chưa cấu hình SMTP, xem terminal server.');
    } catch (err) {
      showError(err.response?.data?.message || 'Không gửi lại được OTP');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" PaperProps={{ sx: { borderRadius: 4, p: 0, overflow: 'hidden', bgcolor: '#232a3b' } }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 440 }}>
          <Box sx={{ flex: 1, bgcolor: '#232a3b', display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}>
            <MovieIcon sx={{ fontSize: 80, color: '#FFD600' }} />
          </Box>
          <Box sx={{ flex: 1.2, p: 4, bgcolor: '#232a3b', position: 'relative' }}>
            <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8, color: '#fff' }}>
              <CloseIcon />
            </IconButton>
            <Typography variant="h5" fontWeight={700} mb={2} color="#fff">Đăng nhập</Typography>
            <Typography variant="body2" mb={2} color="#aaa">
              Chưa có tài khoản? <Button variant="text" sx={{ color: '#FFD600', p: 0, minWidth: 0 }} onClick={onRegister}>Đăng ký ngay</Button>
            </Typography>
            <form onSubmit={handleLogin}>
              <TextField label="Email hoặc tên đăng nhập" fullWidth margin="normal" variant="filled" sx={{ bgcolor: '#20263a', borderRadius: 1, input: { color: '#fff' } }} value={identifier} onChange={e => setIdentifier(e.target.value)} />
              <TextField label="Mật khẩu" type="password" fullWidth margin="normal" variant="filled" sx={{ bgcolor: '#20263a', borderRadius: 1, input: { color: '#fff' } }} value={password} onChange={e => setPassword(e.target.value)} />
              <Button type="submit" variant="contained" fullWidth sx={{ mt: 2, bgcolor: '#FFD600', color: '#232a3b', fontWeight: 700 }}>Đăng nhập</Button>
            </form>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button variant="text" sx={{ color: '#FFD600' }} onClick={onForgot}>Quên mật khẩu?</Button>
            </Box>

            <Divider sx={{ my: 2, borderColor: '#444' }} />
            <GoogleLoginButton onSuccess={() => { onClose(); window.location.reload(); }} onError={showError} />

            {verifyEmail && (
              <Box sx={{ mt: 2 }}>
                <TextField label="Mã OTP xác nhận email" fullWidth margin="normal" variant="filled" sx={{ bgcolor: '#20263a', borderRadius: 1, input: { color: '#fff' } }} value={otp} onChange={e => setOtp(e.target.value)} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button onClick={handleVerify} variant="contained" sx={{ bgcolor: '#FFD600', color: '#232a3b', fontWeight: 700 }}>Xác nhận</Button>
                  <Button onClick={handleResend} variant="outlined" sx={{ color: '#FFD600', borderColor: '#FFD600' }}>Gửi lại OTP</Button>
                </Box>
              </Box>
            )}
            {message && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
          </Box>
        </Box>
      </Dialog>
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="error" onClose={() => setSnackbarOpen(false)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
