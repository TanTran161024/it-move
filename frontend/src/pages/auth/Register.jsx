import { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { API_URL as API } from '../../config/api';

export default function Register() {
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/auth/register`, { username, password, email });
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
      await axios.post(`${API}/auth/verify-email`, { email, otp });
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
      await axios.post(`${API}/auth/resend-verification`, { email });
      setSuccess('Mã OTP mới đã được gửi đến email của bạn.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi lại được mã OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative flex items-center justify-center overflow-hidden">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://assets.nflxext.com/ffe/siteui/vlv3/f85718e8-fc6d-4954-bca0-f5eaf78e0842/ea44b42b-ba19-4f35-ad27-45090e34a897/VN-vi-20230918-popsignuptwoweeks-perspective_alpha_website_large.jpg"
          alt="Background"
          className="w-full h-full object-cover opacity-40 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/80" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-[450px] px-4 py-8 md:py-0 mt-20">
        {/* Brand */}
        <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <PlayArrowIcon className="text-white" />
          </div>
          <span className="text-2xl font-black tracking-wider text-white">IT MOVE</span>
        </Link>

        {/* Register Card */}
        <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <h1 className="text-3xl font-bold mb-8 text-white">Đăng ký</h1>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
              {success}
            </div>
          )}

          {!needsVerification ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="relative group">
                <input
                  type="text"
                  id="reg-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                  placeholder=" "
                  autoComplete="username"
                  disabled={isLoading}
                />
                <label
                  htmlFor="reg-username"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Tên hiển thị
                </label>
              </div>

              <div className="relative group">
                <input
                  type="email"
                  id="reg-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                  placeholder=" "
                  autoComplete="email"
                  disabled={isLoading}
                />
                <label
                  htmlFor="reg-email"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Email
                </label>
              </div>

              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reg-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 pr-12 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                  placeholder=" "
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <label
                  htmlFor="reg-password"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Mật khẩu
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors p-1"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  tabIndex={-1}
                >
                  {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </button>
                <p className="mt-1.5 ml-1 text-xs text-white/35">Tối thiểu 6 ký tự</p>
              </div>

              <div className="relative group">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  id="reg-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 pr-12 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                  placeholder=" "
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <label
                  htmlFor="reg-confirm"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Nhập lại mật khẩu
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors p-1"
                  aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  tabIndex={-1}
                >
                  {showConfirm ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(229,9,20,0.3)] hover:shadow-[0_0_30px_rgba(229,9,20,0.5)] disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
              >
                {isLoading && (
                  <span className="inline-block w-5 h-5 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                )}
                {isLoading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
              </button>
            </form>
          ) : (
            <div>
              <p className="text-white/70 mb-6 text-sm leading-relaxed">
                Chúng tôi đã gửi mã OTP đến email <strong className="text-primary">{email}</strong>. Vui lòng kiểm tra hộp thư.
              </p>
              <div className="relative group mb-6">
                <input
                  type="text"
                  id="reg-otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer text-center tracking-[0.5em] font-bold text-xl"
                  placeholder=" "
                  maxLength={6}
                  disabled={isLoading}
                />
                <label
                  htmlFor="reg-otp"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Mã OTP (6 chữ số)
                </label>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleVerify}
                  disabled={isLoading}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold text-lg py-4 rounded-xl transition-all border border-white/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading && (
                    <span className="inline-block w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                  )}
                  Xác nhận Email
                </button>
                <button
                  onClick={handleResend}
                  disabled={isLoading}
                  className="flex-1 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-semibold py-4 rounded-xl transition-all border border-white/15 disabled:opacity-50"
                >
                  Gửi lại OTP
                </button>
              </div>
            </div>
          )}

          <p className="mt-10 text-text-secondary text-base">
            Đã có tài khoản IT Move?{' '}
            <Link to="/login" className="text-white hover:text-primary font-medium transition-colors">
              Đăng nhập ngay.
            </Link>
          </p>
          <p className="mt-4 text-xs text-text-secondary leading-relaxed">
            Trang này được bảo vệ để đảm bảo bạn không phải là robot.{' '}
            <a href="#" className="text-[#0071eb] hover:underline">Tìm hiểu thêm.</a>
          </p>
        </div>
      </div>
    </div>
  );
}
