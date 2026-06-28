import { useState } from 'react';
import axios from 'axios';
import GoogleLoginButton from '../../components/auth/GoogleLoginButton';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

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
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!identifier || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/login`, { username: identifier, password });
      localStorage.setItem('user', JSON.stringify(res.data));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.response?.data?.requiresVerification) {
        setVerifyEmail(err.response.data.email || identifier);
      }
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp) {
      setError('Vui lòng nhập mã OTP');
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
      setError(err.response?.data?.message || 'Xác nhận email thất bại');
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

        {/* Login Card */}
        <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <h1 className="text-3xl font-bold mb-8 text-white">Đăng nhập</h1>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="relative group">
              <input
                type="text"
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                placeholder=" "
              />
              <label 
                htmlFor="identifier"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
              >
                Email hoặc tên đăng nhập
              </label>
            </div>

            <div className="relative group">
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                placeholder=" "
              />
              <label 
                htmlFor="password"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
              >
                Mật khẩu
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(229,9,20,0.3)] hover:shadow-[0_0_30px_rgba(229,9,20,0.5)] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
            </button>

            <div className="flex items-center justify-between mt-2 text-sm text-text-secondary">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 checked:bg-primary checked:border-primary focus:ring-primary focus:ring-offset-0 transition-colors" />
                <span className="group-hover:text-white transition-colors">Ghi nhớ tôi</span>
              </label>
              <Link to="/forgot-password" className="hover:text-white transition-colors">Bạn quên mật khẩu?</Link>
            </div>
          </form>

          {verifyEmail && (
            <div className="mt-8 pt-8 border-t border-white/10 animate-in fade-in slide-in-from-top-4">
              <h3 className="text-white font-medium mb-4">Xác nhận Email</h3>
              <div className="relative group mb-4">
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all peer"
                  placeholder=" "
                />
                <label 
                  htmlFor="otp"
                  className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-xs peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-2"
                >
                  Mã OTP
                </label>
              </div>
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all border border-white/10 disabled:opacity-50"
              >
                {isLoading ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          )}

          <div className="mt-8 flex items-center gap-4 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10 text-text-secondary text-sm font-medium">
            HOẶC
          </div>

          <div className="mt-6 flex justify-center w-full overflow-hidden rounded-xl">
             <GoogleLoginButton onSuccess={() => navigate(redirectTo, { replace: true })} onError={setError} />
          </div>

          <p className="mt-10 text-text-secondary text-base">
            Mới tham gia IT Move?{' '}
            <Link to="/register" className="text-white hover:text-primary font-medium transition-colors">
              Đăng ký ngay.
            </Link>
          </p>
          <p className="mt-4 text-xs text-text-secondary leading-relaxed">
            Trang này được Google reCAPTCHA bảo vệ để đảm bảo bạn không phải là robot.{' '}
            <a href="#" className="text-[#0071eb] hover:underline">Tìm hiểu thêm.</a>
          </p>
        </div>
      </div>
    </div>
  );
}
