import { Alert, Button, Dialog, IconButton, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import axios from 'axios';
import './Auth.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function RegisterDialog({ open, onClose, onLogin }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirm) {
      setError('Mật khẩu không khớp');
      return;
    }
    try {
      const res = await axios.post(`${API}/api/auth/register`, { username, password, email });
      setNeedsVerification(Boolean(res.data.requiresVerification));
      setEmail(res.data.email || email);
      setSuccess('Đăng ký thành công. Nhập OTP để xác nhận email.');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    }
  };

  const handleVerify = async () => {
    setError('');
    setSuccess('');
    try {
      await axios.post(`${API}/api/auth/verify-email`, { email, otp });
      setSuccess('Xác nhận email thành công. Bạn có thể đăng nhập.');
      setNeedsVerification(false);
      setOtp('');
    } catch (err) {
      setError(err.response?.data?.message || 'Xác nhận email thất bại');
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    try {
      await axios.post(`${API}/api/auth/resend-verification`, { email });
      setSuccess('Mã OTP mới đã được gửi.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi lại được OTP');
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
          <h2 className="auth-visual-title">Tạo tài khoản và lưu mọi bộ phim bạn thích</h2>
          <p className="auth-visual-text">Danh sách xem sau, yêu thích và lịch sử xem sẽ đi cùng tài khoản của bạn.</p>
        </section>

        <main className="auth-dialog-panel">
          <IconButton onClick={onClose} className="auth-close" aria-label="Đóng">
            <CloseIcon />
          </IconButton>
          <div className="auth-eyebrow">Tài khoản mới</div>
          <h2 className="auth-title">Đăng ký</h2>
          <p className="auth-switch">
            Đã có tài khoản? <button type="button" className="auth-link" onClick={onLogin}>Đăng nhập</button>
          </p>

          <form className="auth-form" onSubmit={handleRegister}>
            <TextField className="auth-field" label="Tên hiển thị" fullWidth variant="filled" value={username} onChange={(event) => setUsername(event.target.value)} />
            <TextField className="auth-field" label="Email" fullWidth variant="filled" value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField className="auth-field" label="Mật khẩu" type="password" fullWidth variant="filled" value={password} onChange={(event) => setPassword(event.target.value)} />
            <TextField className="auth-field" label="Nhập lại mật khẩu" type="password" fullWidth variant="filled" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            <Button type="submit" className="auth-primary-btn" variant="contained" fullWidth>Đăng ký</Button>
          </form>

          {needsVerification && (
            <div className="auth-otp">
              <TextField className="auth-field" label="Mã OTP" fullWidth variant="filled" value={otp} onChange={(event) => setOtp(event.target.value)} />
              <div className="auth-actions-row">
                <Button onClick={handleVerify} className="auth-primary-btn" variant="contained">Xác nhận email</Button>
                <Button onClick={handleResend} className="auth-secondary-btn" variant="outlined">Gửi lại OTP</Button>
              </div>
            </div>
          )}

          {error && <Alert severity="error" className="auth-alert">{error}</Alert>}
          {success && <Alert severity="success" className="auth-alert">{success}</Alert>}
        </main>
      </div>
    </Dialog>
  );
}
