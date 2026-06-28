import { Alert, Button, Dialog, IconButton, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ForgotPasswordDialog({ open, onClose, onLogin }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    resetMessages();
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/auth/forgot-password`, { email });
      setMessage(res.data?.message || 'Mã OTP đặt lại mật khẩu đã được gửi.');
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi OTP đặt lại mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    resetMessages();

    if (password.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/auth/reset-password`, { email, otp, password });
      setMessage(res.data?.message || 'Đặt lại mật khẩu thành công.');
      setOtp('');
      setPassword('');
      setConfirmPassword('');
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetMessages();
    onClose();
  };

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
            Đã nhớ mật khẩu? <button type="button" className="auth-link" onClick={onLogin}>Đăng nhập</button>
          </p>

          {step === 'email' && (
            <form className="auth-form" onSubmit={handleForgot}>
              <TextField className="auth-field" label="Email đăng ký" type="email" fullWidth variant="filled" value={email} onChange={(event) => setEmail(event.target.value)} />
              {error && <Alert severity="error">{error}</Alert>}
              {message && <Alert severity="success">{message}</Alert>}
              <Button type="submit" disabled={submitting} className="auth-primary-btn" variant="contained" fullWidth>
                {submitting ? 'Đang gửi...' : 'Gửi mã OTP'}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form className="auth-form" onSubmit={handleResetPassword}>
              <TextField className="auth-field" label="Email" fullWidth variant="filled" value={email} onChange={(event) => setEmail(event.target.value)} />
              <TextField className="auth-field" label="Mã OTP" fullWidth variant="filled" value={otp} onChange={(event) => setOtp(event.target.value)} />
              <TextField className="auth-field" label="Mật khẩu mới" type="password" fullWidth variant="filled" value={password} onChange={(event) => setPassword(event.target.value)} />
              <TextField className="auth-field" label="Nhập lại mật khẩu mới" type="password" fullWidth variant="filled" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              {error && <Alert severity="error">{error}</Alert>}
              {message && <Alert severity="success">{message}</Alert>}
              <div className="auth-actions-row">
                <Button type="submit" disabled={submitting} className="auth-primary-btn" variant="contained" fullWidth>
                  {submitting ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
                </Button>
                <Button type="button" disabled={submitting} className="auth-secondary-btn" variant="outlined" onClick={handleForgot}>
                  Gửi lại
                </Button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="auth-form">
              {message && <Alert severity="success">{message}</Alert>}
              <Button className="auth-primary-btn" variant="contained" fullWidth onClick={onLogin}>Đăng nhập ngay</Button>
            </div>
          )}
        </main>
      </div>
    </Dialog>
  );
}
