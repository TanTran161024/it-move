import { Alert, Button, Dialog, IconButton, InputAdornment, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';
import './AuthStyles.css';

export default function ForgotPasswordDialog({ open, onClose, onLogin }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState('email');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetMessages = () => {
    setMessage('');
    setError('');
  };

  const handleForgot = async (event) => {
    event?.preventDefault();
    if (!email.trim()) {
      setError('Vui lòng nhập email đã đăng ký.');
      return;
    }
    resetMessages();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/auth/forgot-password`, { email });
      setMessage(res.data?.message || 'Mã OTP đặt lại mật khẩu đã được gửi đến email của bạn.');
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi mã OTP. Vui lòng kiểm tra email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    resetMessages();

    if (!otp.trim()) {
      setError('Vui lòng nhập mã OTP.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/auth/reset-password`, { email, otp, password });
      setMessage(res.data?.message || 'Đặt lại mật khẩu thành công!');
      setOtp('');
      setPassword('');
      setConfirmPassword('');
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetMessages();
    onClose();
  };

  const stepIndex = step === 'email' ? 0 : step === 'reset' ? 1 : 2;
  const stepLabels = ['Nhập email', 'Đặt mật khẩu mới', 'Hoàn tất'];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth={false} PaperProps={{ className: 'auth-dialog-paper' }}>
      <div className="auth-dialog-shell compact">
        <section className="auth-dialog-visual">
          <div className="auth-brand">
            <span className="auth-brand-mark">▶</span>
            <span>IT Move</span>
          </div>
          <h2 className="auth-visual-title">Lấy lại quyền truy cập tài khoản</h2>
          <p className="auth-visual-text">Nhận mã OTP qua email và đặt mật khẩu mới chỉ trong vài bước.</p>
        </section>

        <main className="auth-dialog-panel">
          <IconButton onClick={handleClose} className="auth-close" aria-label="Đóng">
            <CloseIcon />
          </IconButton>
          <div className="auth-eyebrow">Bảo mật</div>
          <h2 className="auth-title">Quên mật khẩu</h2>
          <p className="auth-switch">
            Đã nhớ mật khẩu?{' '}
            <button type="button" className="auth-link" onClick={onLogin}>Đăng nhập</button>
          </p>

          {/* Step Indicator */}
          <div className="auth-steps">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`auth-step-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
              />
            ))}
            <span className="auth-step-label">{stepLabels[stepIndex]}</span>
          </div>

          {error && <Alert severity="error" className="auth-alert" style={{ marginBottom: 16 }}>{error}</Alert>}
          {message && <Alert severity="success" className="auth-alert" style={{ marginBottom: 16 }}>{message}</Alert>}

          {step === 'email' && (
            <form className="auth-form auth-fade-in" onSubmit={handleForgot}>
              <TextField
                className="auth-field"
                label="Email đăng ký"
                type="email"
                fullWidth
                variant="filled"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={submitting}
              />
              <Button
                type="submit"
                disabled={submitting}
                className="auth-primary-btn"
                variant="contained"
                fullWidth
              >
                {submitting && <span className="auth-loading-spinner" />}
                {submitting ? 'Đang gửi...' : 'Gửi mã OTP'}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form className="auth-form auth-fade-in" onSubmit={handleResetPassword}>
              <TextField
                className="auth-field"
                label="Email"
                fullWidth
                variant="filled"
                value={email}
                disabled
              />
              <TextField
                className="auth-field auth-otp-input"
                label="Mã OTP"
                fullWidth
                variant="filled"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                disabled={submitting}
                inputProps={{ maxLength: 6 }}
              />
              <TextField
                className="auth-field"
                label="Mật khẩu mới"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                variant="filled"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
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
                label="Nhập lại mật khẩu mới"
                type={showConfirm ? 'text' : 'password'}
                fullWidth
                variant="filled"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
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
              <div className="auth-actions-row">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="auth-primary-btn"
                  variant="contained"
                  fullWidth
                >
                  {submitting && <span className="auth-loading-spinner" />}
                  {submitting ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  className="auth-secondary-btn"
                  variant="outlined"
                  onClick={handleForgot}
                >
                  Gửi lại OTP
                </Button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="auth-form auth-fade-in">
              <Alert severity="success" className="auth-alert">
                Mật khẩu đã được đặt lại thành công. Bạn có thể đăng nhập với mật khẩu mới.
              </Alert>
              <Button
                className="auth-primary-btn"
                variant="contained"
                fullWidth
                onClick={onLogin}
              >
                Đăng nhập ngay
              </Button>
            </div>
          )}
        </main>
      </div>
    </Dialog>
  );
}
