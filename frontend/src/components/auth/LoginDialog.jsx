import { Dialog, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useState } from 'react';
import axios from 'axios';
import GoogleLoginButton from './GoogleLoginButton';
import { API_BASE_URL as API } from '../../config/api';
import { clearActiveProfile } from '../../utils/profile';

export default function LoginDialog({ open, onClose, onRegister, onForgot }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Vui lòng nhập đầy đủ email/tên đăng nhập và mật khẩu.');
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
        setError('Tài khoản chưa xác nhận email. Vui lòng nhập mã OTP.');
        return;
      }
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
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
    setMessage('');
    setIsLoading(true);
    try {
      await axios.post(`${API}/api/auth/verify-email`, { email: verifyEmail, otp });
      setMessage('Xác nhận email thành công. Bạn có thể đăng nhập.');
      setOtp('');
      setVerifyEmail('');
    } catch (err) {
      setError(err.response?.data?.message || 'Xác nhận email thất bại.');
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
      setError(err.response?.data?.message || 'Không gửi lại được mã OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xs" 
      fullWidth
      PaperProps={{ 
        sx: { 
          background: 'transparent', 
          boxShadow: 'none',
          overflow: 'visible',
          m: 2
        } 
      }}
    >
      <div className="bg-[#141414]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden text-white">
        {/* Background glow */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[60px] pointer-events-none" />

        <IconButton 
          onClick={onClose} 
          className="!absolute !top-4 !right-4 !text-white/50 hover:!text-white hover:!bg-white/10 transition-colors"
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(229,9,20,0.4)] mb-4">
            <PlayArrowIcon className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide">Đăng nhập</h2>
          <p className="text-text-secondary text-sm mt-2">Quay lại rạp phim riêng của bạn</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="relative group">
            <input
              type="text"
              id="dialog-login-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer"
              placeholder=" "
              autoComplete="username"
              disabled={isLoading}
            />
            <label
              htmlFor="dialog-login-identifier"
              className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
            >
              Email hoặc tên đăng nhập
            </label>
          </div>

          <div className="relative group">
            <input
              type={showPassword ? 'text' : 'password'}
              id="dialog-login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 pr-12 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer"
              placeholder=" "
              autoComplete="current-password"
              disabled={isLoading}
            />
            <label
              htmlFor="dialog-login-password"
              className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
            >
              Mật khẩu
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1"
              tabIndex={-1}
            >
              {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(229,9,20,0.3)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.4)] disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
          >
            {isLoading && <span className="inline-block w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />}
            {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
          </button>
          
          <div className="flex justify-center mt-1">
            <button type="button" onClick={onForgot} className="text-text-secondary hover:text-white text-sm transition-colors">
              Quên mật khẩu?
            </button>
          </div>
        </form>

        <div className="my-6 flex items-center gap-4 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10 text-text-secondary text-xs font-medium">
          HOẶC
        </div>

        <div className="flex justify-center w-full overflow-hidden rounded-xl">
          <GoogleLoginButton onSuccess={() => { onClose(); window.location.reload(); }} onError={setError} />
        </div>

        {verifyEmail && (
          <div className="mt-6 pt-6 border-t border-white/10 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-white font-medium mb-1">Xác nhận Email</h3>
            <p className="text-white/55 text-xs mb-4">
              Mã OTP đã được gửi đến <strong className="text-primary">{verifyEmail}</strong>
            </p>
            <div className="relative group mb-3">
              <input
                type="text"
                id="dialog-login-otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all text-center tracking-[0.5em] font-bold"
                placeholder="Mã OTP"
                maxLength={6}
                disabled={isLoading}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl transition-all border border-white/10 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                Xác nhận
              </button>
              <button
                onClick={handleResend}
                disabled={isLoading}
                className="flex-1 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-semibold py-2.5 rounded-xl transition-all border border-white/15 disabled:opacity-50 text-sm"
              >
                Gửi lại
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-text-secondary text-sm">
          Chưa có tài khoản?{' '}
          <button type="button" onClick={onRegister} className="text-white hover:text-primary font-bold transition-colors">
            Đăng ký ngay
          </button>
        </p>
      </div>
    </Dialog>
  );
}
