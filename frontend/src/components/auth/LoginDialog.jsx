import { Alert, Button, Dialog, Divider, IconButton, Snackbar, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import axios from 'axios';
import GoogleLoginButton from './GoogleLoginButton';
import './Auth.css';

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

  const handleLogin = async (event) => {
    event.preventDefault();
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
      setMessage('Mã OTP mới đã được gửi.');
    } catch (err) {
      showError(err.response?.data?.message || 'Không gửi lại được OTP');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth={false} PaperProps={{ className: 'auth-dialog-paper' }}>
        <div className="auth-dialog-shell compact">
          <section className="auth-dialog-visual">
            <div className="auth-brand">
              <span className="auth-brand-mark">▶</span>
              <span>IT Move</span>
            </div>
            <h2 className="auth-visual-title">Quay lại rạp phim riêng của bạn</h2>
            <p className="auth-visual-text">Tiếp tục xem phim đang dở và quản lý thư viện cá nhân.</p>
          </section>

          <main className="auth-dialog-panel">
            <IconButton onClick={onClose} className="auth-close" aria-label="Đóng">
              <CloseIcon />
            </IconButton>
            <div className="auth-eyebrow">Thành viên</div>
            <h2 className="auth-title">Đăng nhập</h2>
            <p className="auth-switch">
              Chưa có tài khoản? <button type="button" className="auth-link" onClick={onRegister}>Đăng ký ngay</button>
            </p>

            <form className="auth-form" onSubmit={handleLogin}>
              <TextField className="auth-field" label="Email hoặc tên đăng nhập" fullWidth variant="filled" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
              <TextField className="auth-field" label="Mật khẩu" type="password" fullWidth variant="filled" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button type="submit" className="auth-primary-btn" variant="contained" fullWidth>Đăng nhập</Button>
            </form>

            <p className="auth-switch" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              <button type="button" className="auth-link" onClick={onForgot}>Quên mật khẩu?</button>
            </p>

            <Divider className="auth-divider" />
            <GoogleLoginButton onSuccess={() => { onClose(); window.location.reload(); }} onError={showError} />

            {verifyEmail && (
              <div className="auth-otp">
                <TextField className="auth-field" label="Mã OTP xác nhận email" fullWidth variant="filled" value={otp} onChange={(event) => setOtp(event.target.value)} />
                <div className="auth-actions-row">
                  <Button onClick={handleVerify} className="auth-primary-btn" variant="contained">Xác nhận</Button>
                  <Button onClick={handleResend} className="auth-secondary-btn" variant="outlined">Gửi lại OTP</Button>
                </div>
              </div>
            )}

            {message && <Alert severity="success" className="auth-alert">{message}</Alert>}
          </main>
        </div>
      </Dialog>
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="error" onClose={() => setSnackbarOpen(false)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
