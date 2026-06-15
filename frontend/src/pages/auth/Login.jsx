import { useState } from 'react';
import { Alert, Button, Divider, TextField } from '@mui/material';
import axios from 'axios';
import GoogleLoginButton from '../../components/auth/GoogleLoginButton';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../../components/auth/Auth.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const redirectTo = location.state?.from || '/movies';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${API}/api/auth/login`, { username: identifier, password });
      localStorage.setItem('user', JSON.stringify(res.data));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.response?.data?.requiresVerification) {
        setVerifyEmail(err.response.data.email || identifier);
      }
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
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
          <h1 className="auth-visual-title">Tiếp tục hành trình xem phim của bạn</h1>
          <p className="auth-visual-text">Đăng nhập để lưu yêu thích, xem tiếp phim đang dở và quản lý tài khoản cá nhân.</p>
        </section>

        <main className="auth-panel">
          <div className="auth-eyebrow">Thành viên</div>
          <h2 className="auth-title">Đăng nhập</h2>
          <p className="auth-switch">
            Chưa có tài khoản? <Link className="auth-link" to="/register">Đăng ký ngay</Link>
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <TextField className="auth-field" label="Email hoặc tên đăng nhập" fullWidth variant="filled" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            <TextField className="auth-field" label="Mật khẩu" type="password" fullWidth variant="filled" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            <Button className="auth-primary-btn" type="submit" variant="contained" fullWidth>Đăng nhập</Button>
          </form>

          {verifyEmail && (
            <div className="auth-otp">
              <TextField className="auth-field" label="Mã OTP xác nhận email" fullWidth variant="filled" value={otp} onChange={(event) => setOtp(event.target.value)} />
              <Button className="auth-secondary-btn" onClick={handleVerify} variant="outlined" fullWidth sx={{ mt: 1.5 }}>Xác nhận email</Button>
            </div>
          )}

          <Divider className="auth-divider" />
          <GoogleLoginButton onSuccess={() => navigate(redirectTo, { replace: true })} onError={setError} />
        </main>
      </div>
    </div>
  );
}
