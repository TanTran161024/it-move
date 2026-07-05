import { Alert, Dialog, IconButton, InputAdornment } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL as API } from '../../config/api';

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

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
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
          onClick={handleClose} 
          className="!absolute !top-4 !right-4 !text-white/50 hover:!text-white hover:!bg-white/10 transition-colors"
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(229,9,20,0.4)] mb-4">
            <PlayArrowIcon className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide">Quên mật khẩu</h2>
          <p className="text-text-secondary text-sm mt-2 text-center">Lấy lại quyền truy cập tài khoản</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div className="flex items-center gap-2" key={i}>
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === stepIndex 
                    ? 'bg-primary ring-4 ring-primary/20' 
                    : i < stepIndex 
                      ? 'bg-primary/50' 
                      : 'bg-white/10'
                }`}
              />
              {i < 2 && <div className={`w-8 h-[2px] rounded-full transition-all ${i < stepIndex ? 'bg-primary/50' : 'bg-white/10'}`} />}
            </div>
          ))}
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

        {step === 'email' && (
          <form onSubmit={handleForgot} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="relative group">
              <input
                type="email"
                id="dialog-forgot-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer"
                placeholder=" "
                autoComplete="email"
                disabled={submitting}
              />
              <label
                htmlFor="dialog-forgot-email"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
              >
                Email đăng ký
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(229,9,20,0.3)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.4)] disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
            >
              {submitting && <span className="inline-block w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />}
              {submitting ? 'Đang gửi...' : 'Gửi mã OTP'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="relative group">
              <input
                type="text"
                id="dialog-forgot-otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer tracking-[0.2em] font-bold"
                placeholder=" "
                maxLength={6}
                disabled={submitting}
              />
              <label
                htmlFor="dialog-forgot-otp"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
              >
                Mã OTP (6 chữ số)
              </label>
            </div>

            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                id="dialog-forgot-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 pr-12 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer"
                placeholder=" "
                autoComplete="new-password"
                disabled={submitting}
              />
              <label
                htmlFor="dialog-forgot-password"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
              >
                Mật khẩu mới (Tối thiểu 6 ký tự)
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

            <div className="relative group">
              <input
                type={showConfirm ? 'text' : 'password'}
                id="dialog-forgot-confirm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 pt-6 pb-2 pr-12 text-white focus:outline-none focus:border-primary focus:bg-white/10 transition-all peer"
                placeholder=" "
                autoComplete="new-password"
                disabled={submitting}
              />
              <label
                htmlFor="dialog-forgot-confirm"
                className="absolute left-4 top-4 text-text-secondary text-sm transition-all peer-focus:text-[11px] peer-focus:top-2 peer-focus:text-white/70 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:top-2 pointer-events-none"
              >
                Nhập lại mật khẩu mới
              </label>
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1"
                tabIndex={-1}
              >
                {showConfirm ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </button>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(229,9,20,0.3)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <span className="inline-block w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />}
                {submitting ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
              </button>
              <button
                type="button"
                onClick={handleForgot}
                disabled={submitting}
                className="flex-1 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-semibold py-3.5 rounded-xl transition-all border border-white/15 disabled:opacity-50 text-sm"
              >
                Gửi lại OTP
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
            <button
              type="button"
              onClick={onLogin}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(229,9,20,0.3)] hover:shadow-[0_6px_20px_rgba(229,9,20,0.4)] mt-2"
            >
              Đăng nhập ngay
            </button>
          </div>
        )}

        {step === 'email' && (
          <p className="mt-6 text-center text-text-secondary text-sm">
            Đã nhớ mật khẩu?{' '}
            <button type="button" onClick={onLogin} className="text-white hover:text-primary font-bold transition-colors">
              Đăng nhập
            </button>
          </p>
        )}
      </div>
    </Dialog>
  );
}
