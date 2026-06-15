import { useState } from 'react';
import { Container, Typography, TextField, Button, Box, Alert } from '@mui/material';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await axios.post(`${API}/api/auth/register`, { username, password, email });
      setNeedsVerification(Boolean(res.data.requiresVerification));
      setEmail(res.data.email || email);
      setSuccess('Đăng ký thành công. Nhập OTP để xác nhận email. Nếu chưa cấu hình SMTP, xem terminal server.');
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
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Typography variant="h4" gutterBottom align="center">Đăng ký</Typography>
      <Box component="form" onSubmit={handleSubmit}>
        <TextField label="Tên đăng nhập" fullWidth margin="normal" value={username} onChange={e => setUsername(e.target.value)} />
        <TextField label="Email" fullWidth margin="normal" value={email} onChange={e => setEmail(e.target.value)} />
        <TextField label="Mật khẩu" type="password" fullWidth margin="normal" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Đăng ký</Button>
      </Box>
      {needsVerification && (
        <Box sx={{ mt: 2 }}>
          <TextField label="Mã OTP" fullWidth margin="normal" value={otp} onChange={e => setOtp(e.target.value)} />
          <Button onClick={handleVerify} variant="outlined" fullWidth>Xác nhận email</Button>
        </Box>
      )}
    </Container>
  );
}
