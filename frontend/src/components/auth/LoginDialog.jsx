import { Alert, Button, Dialog, Divider, IconButton, InputAdornment, Snackbar, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';
import axios from 'axios';
import GoogleLoginButton from './GoogleLoginButton';
import { API_BASE_URL as API } from '../../config/api';
import { clearActiveProfile } from '../../utils/profile';
import './AuthStyles.css';

export default function LoginDialog({ open, onClose, onRegister, onForgot }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const showError = (text) => {
    setError(text);
    setSnackbarOpen(true);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      showError('Vui lòng nhập đầy đủ email/tên đăng nhập và mật khẩu.');
      return;
    }
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/login`, { username: identifier, password });
      localStorage.setItem('user', JSON.stringify(res.data));
      clearActiveProfile();
      onClose();
      window.location.reload();
    } catch (err) {
      if (err.response?.data?.requiresVerification) {
        setVerifyEmail(err.response.data.email || identifier);
        showError('Tài khoản chưa xác nhận email. Vui lòng nhập mã OTP.');
        return;
      }
      showError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp.trim()) {
      showError('Vui lòng nhập mã OTP.');
      return;
    }
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      await axios.post(`${API}/api/auth/verify-email`, { email: verifyEmail, otp });
      setMessage('Xác nhận email thành công. Bạn có thể đăng nhập.');
      setOtp('');
      setVerifyEmail('');
    } catch (err) {
      showError(err.response?.data?.message || 'Xác nhận email thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      await axios.post(`${API}/api/auth/resend-verification`, { email: verifyEmail || identifier });
      setMessage('Mã OTP mới đã được gửi đến email của bạn.');
    } catch (err) {
      showError(err.response?.data?.message || 'Không gửi lại được mã OTP.');
    } finally {
      setIsLoading(false);
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
              Chưa có tài khoản?{' '}
              <button type="button" className="auth-link" onClick={onRegister}>Đăng ký ngay</button>
            </p>

            {error && !snackbarOpen && <Alert severity="error" className="auth-alert" style={{ marginBottom: 16 }}>{error}</Alert>}
            {message && <Alert severity="success" className="auth-alert" style={{ marginBottom: 16 }}>{message}</Alert>}

            <form className="auth-form" onSubmit={handleLogin}>
              <TextField
                className="auth-field"
                label="Email hoặc tên đăng nhập"
                fullWidth
                variant="filled"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                disabled={isLoading}
              />
              <TextField
                className="auth-field"
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                variant="filled"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isLoading}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((prev) => !prev)}
                          edge="end"
                          aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          tabIndex={-1}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button
                type="submit"
                className="auth-primary-btn"
                variant="contained"
                fullWidth
                disabled={isLoading}
              >
                {isLoading && <span className="auth-loading-spinner" />}
                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </form>

            <p className="auth-switch" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              <button type="button" className="auth-link" onClick={onForgot}>Quên mật khẩu?</button>
            </p>

            <Divider className="auth-divider" />
            <GoogleLoginButton onSuccess={() => { onClose(); window.location.reload(); }} onError={showError} />

            {verifyEmail && (
              <div className="auth-otp auth-fade-in">
                <p className="auth-otp-title">Xác nhận Email</p>
                <p className="auth-otp-desc">
                  Mã OTP đã được gửi đến <span className="auth-otp-email">{verifyEmail}</span>
                </p>
                <TextField
                  className="auth-field auth-otp-input"
                  label="Mã OTP"
                  fullWidth
                  variant="filled"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  disabled={isLoading}
                  inputProps={{ maxLength: 6 }}
                />
                <div className="auth-actions-row">
                  <Button
                    onClick={handleVerify}
                    className="auth-primary-btn"
                    variant="contained"
                    disabled={isLoading}
                  >
                    {isLoading && <span className="auth-loading-spinner" />}
                    Xác nhận
                  </Button>
                  <Button
                    onClick={handleResend}
                    className="auth-secondary-btn"
                    variant="outlined"
                    disabled={isLoading}
                  >
                    Gửi lại OTP
                  </Button>
                </div>
              </div>
            )}
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
