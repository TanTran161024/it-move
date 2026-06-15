import { useState } from 'react';
import { Alert, Button, TextField } from '@mui/material';
import axios from 'axios';
import { Link } from 'react-router-dom';
import '../../components/auth/Auth.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
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

  return (
    <div className="auth-page">
      <div className="auth-page-shell">
        <section className="auth-visual">
          <div className="auth-brand">
            <span className="auth-brand-mark">▶</span>
            <span>IT Move</span>
          </div>
          <h1 className="auth-visual-title">Tạo tài khoản cho trải nghiệm cá nhân hơn</h1>
          <p className="auth-visual-text">Lưu phim yêu thích, tạo danh sách xem sau và theo dõi lịch sử xem trên mọi thiết bị.</p>
        </section>

        <main className="auth-panel">
          <div className="auth-eyebrow">Tài khoản mới</div>
          <h2 className="auth-title">Đăng ký</h2>
          <p className="auth-switch">
            Đã có tài khoản? <Link className="auth-link" to="/login">Đăng nhập</Link>
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <TextField className="auth-field" label="Tên hiển thị" fullWidth variant="filled" value={username} onChange={(event) => setUsername(event.target.value)} />
            <TextField className="auth-field" label="Email" type="email" fullWidth variant="filled" value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField className="auth-field" label="Mật khẩu" type="password" fullWidth variant="filled" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <Alert severity="error">{error}</Alert>}
            {success && <Alert severity="success">{success}</Alert>}
            <Button className="auth-primary-btn" type="submit" variant="contained" fullWidth>Đăng ký</Button>
          </form>

          {needsVerification && (
            <div className="auth-otp">
              <TextField className="auth-field" label="Mã OTP" fullWidth variant="filled" value={otp} onChange={(event) => setOtp(event.target.value)} />
              <Button className="auth-secondary-btn" onClick={handleVerify} variant="outlined" fullWidth sx={{ mt: 1.5 }}>Xác nhận email</Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
