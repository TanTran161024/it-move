import React, { useCallback, useEffect, useState } from 'react';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { API_BASE_URL as API } from '../../config/api';

const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

const emptyProfile = {
  username: '',
  email: '',
  gender: 'other',
  avatar_url: '',
  phone: '',
  birth_date: '',
};

export default function Profile() {
  const [user, setUser] = useState(storedUser);
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState({ old: false, next: false, confirm: false });
  const [changePwLoading, setChangePwLoading] = useState(false);

  const avatar = profile.avatar_url || profile.avatar || '';
  const displayName = profile.username || user.username || '';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      if (!user.id) {
        showToast('Chưa đăng nhập', 'error');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API}/api/user/profile`, {
          credentials: 'include',
          headers: { 'x-user-id': user.id },
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Không tải được thông tin tài khoản');
        setProfile({
          username: data.username || '',
          email: data.email || '',
          gender: data.gender || 'other',
          avatar_url: data.avatar_url || data.avatar || '',
          phone: data.phone || '',
          birth_date: data.birth_date || '',
        });
      } catch (error) {
        showToast(error.message || 'Lỗi khi tải thông tin tài khoản', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [showToast, user.id]);

  const handleProfileChange = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!user.id) {
      showToast('Chưa đăng nhập', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        credentials: 'include',
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Có lỗi xảy ra');

      const nextUser = {
        ...user,
        ...data.user,
        avatar: data.user.avatar_url || data.user.avatar || '',
      };
      localStorage.setItem('user', JSON.stringify(nextUser));
      setUser(nextUser);
      setProfile((current) => ({
        ...current,
        ...data.user,
        avatar_url: data.user.avatar_url || data.user.avatar || '',
        birth_date: data.user.birth_date || '',
      }));
      showToast('Cập nhật hồ sơ thành công');
    } catch (error) {
      showToast(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showToast('Vui lòng nhập đầy đủ thông tin', 'error');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('Mật khẩu mới không khớp', 'error');
      return;
    }

    setChangePwLoading(true);
    try {
      const res = await fetch(`${API}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        credentials: 'include',
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Có lỗi xảy ra');
      showToast('Đổi mật khẩu thành công');
      setShowChangePassword(false);
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showToast(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setChangePwLoading(false);
    }
  };

  const renderPasswordInput = (label, field, visibleKey) => (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <div className="relative">
        <input
          type={showPassword[visibleKey] ? 'text' : 'password'}
          value={passwordForm[field]}
          onChange={(event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-4 pr-12 py-2.5 text-white focus:border-primary focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => ({ ...current, [visibleKey]: !current[visibleKey] }))}
          aria-label={showPassword[visibleKey] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
        >
          {showPassword[visibleKey] ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-background pt-24 pb-12">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl flex flex-col lg:flex-row gap-8">
          <ProfileSidebar user={user} profile={{ ...profile, avatar }} />

          <main className="flex-1 min-w-0">
            <div className="bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-6 md:p-8 shadow-2xl min-h-[60vh]">
              <div className="mb-8 pb-6 border-b border-white/5">
                <h1 className="text-2xl md:text-3xl font-heading font-bold text-white mb-2">Tài khoản</h1>
                <p className="text-text-secondary text-sm md:text-base">Cập nhật thông tin cá nhân và bảo mật tài khoản</p>
              </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-text-secondary animate-pulse">Đang tải...</div>
            ) : (
              <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-12">
                <form className="flex-1 space-y-6" onSubmit={handleUpdate}>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2" htmlFor="profile-email">Email</label>
                    <input id="profile-email" type="email" value={profile.email} disabled className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white/50 cursor-not-allowed focus:outline-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2" htmlFor="profile-name">Tên hiển thị</label>
                    <input
                      id="profile-name"
                      type="text"
                      value={profile.username}
                      onChange={(event) => handleProfileChange('username', event.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2" htmlFor="profile-phone">Số điện thoại</label>
                    <input
                      id="profile-phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(event) => handleProfileChange('phone', event.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-primary focus:outline-none transition-colors"
                      placeholder="Nhập số điện thoại"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2" htmlFor="profile-birth-date">Ngày sinh</label>
                    <input
                      id="profile-birth-date"
                      type="date"
                      value={profile.birth_date}
                      onChange={(event) => handleProfileChange('birth_date', event.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-primary focus:outline-none transition-colors [color-scheme:dark]"
                    />
                  </div>

                  <div>
                    <div className="block text-sm font-medium text-white/80 mb-3">Giới tính</div>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer text-white/80 hover:text-white transition-colors">
                        <input type="radio" name="gender" value="male" checked={profile.gender === 'male'} onChange={() => handleProfileChange('gender', 'male')} className="w-4 h-4 accent-primary" />
                        Nam
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-white/80 hover:text-white transition-colors">
                        <input type="radio" name="gender" value="female" checked={profile.gender === 'female'} onChange={() => handleProfileChange('gender', 'female')} className="w-4 h-4 accent-primary" />
                        Nữ
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-white/80 hover:text-white transition-colors">
                        <input type="radio" name="gender" value="other" checked={profile.gender === 'other'} onChange={() => handleProfileChange('gender', 'other')} className="w-4 h-4 accent-primary" />
                        Khác
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2" htmlFor="profile-avatar">Ảnh đại diện URL</label>
                    <input
                      id="profile-avatar"
                      type="url"
                      value={profile.avatar_url}
                      onChange={(event) => handleProfileChange('avatar_url', event.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-primary focus:outline-none transition-colors"
                      placeholder="https://..."
                    />
                  </div>

                  <button type="submit" className="px-8 py-3 bg-primary hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-primary/20" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </form>

                <aside className="lg:w-48 flex flex-col items-center">
                  <div className="w-40 h-40 rounded-full border-4 border-white/10 overflow-hidden mb-4 shadow-xl">
                    {avatar ? (
                      <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-primary/80 to-primary/20 flex items-center justify-center text-5xl font-bold text-white">
                        {displayName ? displayName[0].toUpperCase() : '?'}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-text-secondary text-center">Ảnh đại diện</div>
                </aside>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/5 text-text-secondary text-sm">
              Đổi mật khẩu, nhấn vào{' '}
              <button type="button" className="text-primary hover:text-red-400 font-medium underline underline-offset-2 transition-colors" onClick={() => setShowChangePassword(true)}>đây</button>
            </div>
            </div>
          </main>
        </div>
      </div>

      {showChangePassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl" onSubmit={handleChangePassword}>
            <button type="button" className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors" onClick={() => setShowChangePassword(false)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-xl font-bold text-white mb-6">Đổi mật khẩu</div>
            <div className="space-y-4">
              {renderPasswordInput('Mật khẩu cũ', 'oldPassword', 'old')}
              {renderPasswordInput('Mật khẩu mới', 'newPassword', 'next')}
              {renderPasswordInput('Nhập lại mật khẩu mới', 'confirmPassword', 'confirm')}
            </div>
            <div className="flex items-center gap-3 mt-8">
              <button type="submit" className="flex-1 bg-primary hover:bg-red-600 text-white font-bold py-2.5 rounded-xl transition-colors" disabled={changePwLoading}>{changePwLoading ? 'Đang xác nhận...' : 'Xác nhận'}</button>
              <button type="button" className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl transition-colors" onClick={() => setShowChangePassword(false)}>Hủy</button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 font-medium ${toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="hover:opacity-70 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
