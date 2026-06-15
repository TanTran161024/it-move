import { useState } from 'react';
import { Container, Typography, TextField, Button, Box, Alert, Divider } from '@mui/material';
import axios from 'axios';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await axios.post(`${API}/api/auth/login`, { username: identifier, password });
      localStorage.setItem('user', JSON.stringify(res.data));
      window.location.href = '/movies';
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
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Typography variant="h4" gutterBottom align="center">Đăng nhập</Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <TextField label="Email hoặc tên đăng nhập" fullWidth margin="normal" value={identifier} onChange={e => setIdentifier(e.target.value)} />
        <TextField label="Mật khẩu" type="password" fullWidth margin="normal" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Đăng nhập</Button>
      </Box>
      {verifyEmail && (
        <Box sx={{ mt: 2 }}>
          <TextField label="Mã OTP xác nhận email" fullWidth margin="normal" value={otp} onChange={e => setOtp(e.target.value)} />
          <Button onClick={handleVerify} variant="outlined" fullWidth>Xác nhận email</Button>
        </Box>
      )}
      <Divider sx={{ my: 3 }} />
      <GoogleLoginButton onSuccess={() => { window.location.href = '/movies'; }} onError={setError} />
    </Container>
  );
}
