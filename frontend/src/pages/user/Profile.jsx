import React, { useEffect, useState } from 'react';
import '../movie/WatchMovie.css';
import './Profile.css';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

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

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 4200);
  };

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      if (!user.id) {
        showToast('Chưa đăng nhập', 'error');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('http://localhost:5000/api/user/profile', {
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
  }, [user.id]);

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
      const res = await fetch('http://localhost:5000/api/user/profile', {
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
      const res = await fetch('http://localhost:5000/api/user/change-password', {
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
    <label className="profile-password-field">
      <span>{label}</span>
      <div className="profile-password-input">
        <input
          type={showPassword[visibleKey] ? 'text' : 'password'}
          value={passwordForm[field]}
          onChange={(event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value }))}
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => ({ ...current, [visibleKey]: !current[visibleKey] }))}
          aria-label={showPassword[visibleKey] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {showPassword[visibleKey] ? <VisibilityOffIcon /> : <VisibilityIcon />}
        </button>
      </div>
    </label>
  );

  return (
    <>
      <div className="profile-bg">
        <div className="watch-movie-container profile-container">
          <ProfileSidebar user={user} profile={{ ...profile, avatar }} />

          <main className="profile-main">
            <div className="profile-title">Tài khoản</div>
            <div className="profile-desc">Cập nhật thông tin cá nhân và bảo mật tài khoản</div>

            {loading ? (
              <div className="profile-loading">Đang tải...</div>
            ) : (
              <div className="profile-content-grid">
                <form className="profile-form" onSubmit={handleUpdate}>
                  <div className="profile-form-row">
                    <label className="profile-form-label" htmlFor="profile-email">Email</label>
                    <input id="profile-email" type="email" value={profile.email} disabled className="profile-form-input" />
                  </div>

                  <div className="profile-form-row">
                    <label className="profile-form-label" htmlFor="profile-name">Tên hiển thị</label>
                    <input
                      id="profile-name"
                      type="text"
                      value={profile.username}
                      onChange={(event) => handleProfileChange('username', event.target.value)}
                      className="profile-form-input"
                    />
                  </div>

                  <div className="profile-form-row">
                    <label className="profile-form-label" htmlFor="profile-phone">Số điện thoại</label>
                    <input
                      id="profile-phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(event) => handleProfileChange('phone', event.target.value)}
                      className="profile-form-input"
                      placeholder="Nhập số điện thoại"
                    />
                  </div>

                  <div className="profile-form-row">
                    <label className="profile-form-label" htmlFor="profile-birth-date">Ngày sinh</label>
                    <input
                      id="profile-birth-date"
                      type="date"
                      value={profile.birth_date}
                      onChange={(event) => handleProfileChange('birth_date', event.target.value)}
                      className="profile-form-input"
                    />
                  </div>

                  <div className="profile-form-row">
                    <div className="profile-form-label">Giới tính</div>
                    <div className="profile-radio-group">
                      <label className="profile-form-radio">
                        <input type="radio" name="gender" value="male" checked={profile.gender === 'male'} onChange={() => handleProfileChange('gender', 'male')} />
                        Nam
                      </label>
                      <label className="profile-form-radio">
                        <input type="radio" name="gender" value="female" checked={profile.gender === 'female'} onChange={() => handleProfileChange('gender', 'female')} />
                        Nữ
                      </label>
                      <label className="profile-form-radio">
                        <input type="radio" name="gender" value="other" checked={profile.gender === 'other'} onChange={() => handleProfileChange('gender', 'other')} />
                        Không xác định
                      </label>
                    </div>
                  </div>

                  <div className="profile-form-row">
                    <label className="profile-form-label" htmlFor="profile-avatar">Ảnh đại diện URL</label>
                    <input
                      id="profile-avatar"
                      type="url"
                      value={profile.avatar_url}
                      onChange={(event) => handleProfileChange('avatar_url', event.target.value)}
                      className="profile-form-input"
                      placeholder="https://..."
                    />
                  </div>

                  <button type="submit" className="profile-form-btn" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Cập nhật'}
                  </button>
                </form>

                <aside className="profile-avatar-section">
                  {avatar ? (
                    <img src={avatar} alt="avatar" className="profile-avatar-large" />
                  ) : (
                    <div className="profile-avatar-placeholder">{displayName ? displayName[0].toUpperCase() : '?'}</div>
                  )}
                  <div className="profile-avatar-label">Ảnh đại diện</div>
                </aside>
              </div>
            )}

            <div className="profile-change-password">
              Đổi mật khẩu, nhấn vào{' '}
              <button type="button" onClick={() => setShowChangePassword(true)}>đây</button>
            </div>
          </main>
        </div>
      </div>

      {showChangePassword && (
        <div className="profile-modal-backdrop">
          <form className="profile-password-modal" onSubmit={handleChangePassword}>
            <button type="button" className="profile-modal-close" onClick={() => setShowChangePassword(false)}>×</button>
            <div className="profile-password-title">Đổi mật khẩu</div>
            {renderPasswordInput('Mật khẩu cũ', 'oldPassword', 'old')}
            {renderPasswordInput('Mật khẩu mới', 'newPassword', 'next')}
            {renderPasswordInput('Nhập lại mật khẩu mới', 'confirmPassword', 'confirm')}
            <div className="profile-password-actions">
              <button type="submit" disabled={changePwLoading}>{changePwLoading ? 'Đang xác nhận...' : 'Xác nhận'}</button>
              <button type="button" onClick={() => setShowChangePassword(false)}>Hủy</button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className={`profile-toast ${toast.type}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </>
  );
}
