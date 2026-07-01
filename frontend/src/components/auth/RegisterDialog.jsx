import { Alert, Button, Dialog, IconButton, InputAdornment, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';
import './AuthStyles.css';

export default function RegisterDialog({ open, onClose, onLogin }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    if (!username.trim()) {
      setError('Vui lòng nhập tên hiển thị.');
      return false;
    }
    if (!email.trim()) {
      setError('Vui lòng nhập email.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email không hợp lệ.');
      return false;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return false;
    }
    if (password !== confirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return false;
    }
    return true;
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/register`, { username, password, email });
      setNeedsVerification(Boolean(res.data.requiresVerification));
      setEmail(res.data.email || email);
      setSuccess('Đăng ký thành công! Vui lòng nhập mã OTP để xác nhận email.');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp.trim()) {
      setError('Vui lòng nhập mã OTP.');
      return;
    }
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await axios.post(`${API}/api/auth/verify-email`, { email, otp });
      setSuccess('Xác nhận email thành công! Bạn có thể đăng nhập ngay.');
      setNeedsVerification(false);
      setOtp('');
    } catch (err) {
      setError(err.response?.data?.message || 'Xác nhận email thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      await axios.post(`${API}/api/auth/resend-verification`, { email });
      setSuccess('Mã OTP mới đã được gửi đến email của bạn.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi lại được mã OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth={false} PaperProps={{ className: 'auth-dialog-paper' }}>
      <div className="auth-dialog-shell">
        <section className="auth-dialog-visual">
          <div className="auth-brand">
            <span className="auth-brand-mark">▶</span>
            <span>IT Move</span>
          </div>
          <h2 className="auth-visual-title">Tạo tài khoản và khám phá kho phim khổng lồ</h2>
          <p className="auth-visual-text">Danh sách yêu thích, lịch sử xem và đề xuất cá nhân sẽ đồng hành cùng bạn.</p>
        </section>

        <main className="auth-dialog-panel">
          <IconButton onClick={onClose} className="auth-close" aria-label="Đóng">
            <CloseIcon />
          </IconButton>
          <div className="auth-eyebrow">Tài khoản mới</div>
          <h2 className="auth-title">Đăng ký</h2>
          <p className="auth-switch">
            Đã có tài khoản?{' '}
            <button type="button" className="auth-link" onClick={onLogin}>Đăng nhập</button>
          </p>

          {error && <Alert severity="error" className="auth-alert" style={{ marginBottom: 16 }}>{error}</Alert>}
          {success && <Alert severity="success" className="auth-alert" style={{ marginBottom: 16 }}>{success}</Alert>}

          {!needsVerification ? (
            <form className="auth-form" onSubmit={handleRegister}>
              <TextField
                className="auth-field"
                label="Tên hiển thị"
                fullWidth
                variant="filled"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={isLoading}
              />
              <TextField
                className="auth-field"
                label="Email"
                type="email"
                fullWidth
                variant="filled"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
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
                autoComplete="new-password"
                disabled={isLoading}
                helperText="Tối thiểu 6 ký tự"
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
                  formHelperText: {
                    sx: { color: 'rgba(255,255,255,0.35)', ml: 0.5 },
                  },
                }}
              />
              <TextField
                className="auth-field"
                label="Nhập lại mật khẩu"
                type={showConfirm ? 'text' : 'password'}
                fullWidth
                variant="filled"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                disabled={isLoading}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirm((prev) => !prev)}
                          edge="end"
                          aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          tabIndex={-1}
                        >
                          {showConfirm ? <VisibilityOff /> : <Visibility />}
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
                {isLoading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
              </Button>
            </form>
          ) : (
            <div className="auth-otp auth-fade-in" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
              <p className="auth-otp-title">Xác nhận Email</p>
              <p className="auth-otp-desc">
                Chúng tôi đã gửi mã OTP đến <span className="auth-otp-email">{email}</span>. Vui lòng kiểm tra hộp thư.
              </p>
              <TextField
                className="auth-field auth-otp-input"
                label="Mã OTP (6 chữ số)"
                fullWidth
                variant="filled"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                onKeyDown={handleOtpKeyDown}
                disabled={isLoading}
                inputProps={{ maxLength: 6 }}
              />
              <div className="auth-actions-row" style={{ marginTop: 16 }}>
                <Button
                  onClick={handleVerify}
                  className="auth-primary-btn"
                  variant="contained"
                  disabled={isLoading}
                >
                  {isLoading && <span className="auth-loading-spinner" />}
                  Xác nhận email
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
  );
}
