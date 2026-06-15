import React, { useState, useEffect } from 'react';
import './WatchMovie.css';
import './Profile.css';
import ProfileSidebar from '../components/user/ProfileSidebar';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const user = JSON.parse(localStorage.getItem('user') || '{}');

export default function Profile() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('other');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastProgress, setToastProgress] = useState(0);
  const toastDuration = 10000; // 10 giây
  const toastInterval = 30; // ms
  const toastSteps = toastDuration / toastInterval;
  const [toastType, setToastType] = useState('success'); // 'success' | 'error'
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changePwLoading, setChangePwLoading] = useState(false);

  // Fetch profile khi vào trang
  useEffect(() => {
    setLoading(true);
    setMessage('');
    if (!user.id) {
      setMessage('Chưa đăng nhập');
      setLoading(false);
      return;
    }
    fetch('http://localhost:5000/api/user/profile', {
      credentials: 'include',
      headers: { 'x-user-id': user.id }
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setMessage(data.error);
        } else {
          setDisplayName(data.username || '');
          setEmail(data.email || '');
          setGender(data.gender || 'other');
          setAvatar(data.avatar || '');
        }
        setLoading(false);
      })
      .catch(() => {
        setMessage('Lỗi khi tải thông tin tài khoản');
        setLoading(false);
      });
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    if (!user.id) {
      setMessage('Chưa đăng nhập');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        credentials: 'include',
        body: JSON.stringify({ username: displayName, gender }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Cập nhật thành công!');
        setToastMessage('Cập nhật hồ sơ thành công.');
        setToastType('success');
        setShowToast(true);
        setToastProgress(0);
      } else {
        setMessage(data.error || 'Có lỗi xảy ra!');
        setToastMessage(data.error || 'Có lỗi xảy ra!');
        setToastType('error');
        setShowToast(true);
        setToastProgress(0);
      }
    } catch (err) {
      setMessage('Có lỗi xảy ra!');
      setToastMessage('Có lỗi xảy ra!');
      setToastType('error');
      setShowToast(true);
      setToastProgress(0);
    }
    setSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setToastMessage('Vui lòng nhập đầy đủ thông tin!');
      setToastType('error');
      setShowToast(true);
      setToastProgress(0);
      return;
    }
    if (newPassword !== confirmPassword) {
      setToastMessage('Mật khẩu mới không khớp!');
      setToastType('error');
      setShowToast(true);
      setToastProgress(0);
      return;
    }
    setChangePwLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage('Đổi mật khẩu thành công!');
        setToastType('success');
        setShowToast(true);
        setToastProgress(0);
        setShowChangePassword(false);
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setToastMessage(data.error || 'Có lỗi xảy ra!');
        setToastType('error');
        setShowToast(true);
        setToastProgress(0);
      }
    } catch (err) {
      setToastMessage('Có lỗi xảy ra!');
      setToastType('error');
      setShowToast(true);
      setToastProgress(0);
    }
    setChangePwLoading(false);
  };

  // Toast progress effect
  useEffect(() => {
    if (!showToast) return;
    setToastProgress(0);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 100 / toastSteps;
      setToastProgress(progress);
      if (progress >= 100) {
        setShowToast(false);
        clearInterval(interval);
      }
    }, toastInterval);
    return () => clearInterval(interval);
  }, [showToast]);

  const handleCloseToast = () => {
    setShowToast(false);
    setToastProgress(0);
  };

  return (
    <>
      <div className="profile-bg">
        <div className="watch-movie-container profile-container">
          {/* Sidebar */}
          <ProfileSidebar user={user} profile={{ username: displayName, email, avatar }} />
          {/* Main content */}
          <div className="profile-main">
            <div className="profile-title">Tài khoản</div>
            <div className="profile-desc">Cập nhật thông tin tài khoản</div>
            {loading ? (
              <div style={{ color: '#FFD600', fontWeight: 600, fontSize: 18 }}>Đang tải...</div>
            ) : (
              <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
                <form style={{ flex: 1, maxWidth: 400 }} onSubmit={handleUpdate}>
                  <div className="profile-form-row">
                    <div className="profile-form-label">Email</div>
                    <input type="email" value={email} disabled className="profile-form-input" />
                  </div>
                  <div className="profile-form-row">
                    <div className="profile-form-label">Tên hiển thị</div>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="profile-form-input" />
                  </div>
                  <div className="profile-form-row">
                    <div className="profile-form-label">Giới tính</div>
                    <label className="profile-form-radio">
                      <input type="radio" name="gender" value="male" checked={gender === 'male'} onChange={() => setGender('male')} /> Nam
                    </label>
                    <label className="profile-form-radio">
                      <input type="radio" name="gender" value="female" checked={gender === 'female'} onChange={() => setGender('female')} /> Nữ
                    </label>
                    <label className="profile-form-radio">
                      <input type="radio" name="gender" value="other" checked={gender === 'other'} onChange={() => setGender('other')} /> Không xác định
                    </label>
                  </div>
                  <button type="submit" className="profile-form-btn" disabled={saving}>
                    Cập nhật
                    {saving && (
                      <span style={{
                        display: 'inline-block',
                        marginLeft: 10,
                        verticalAlign: 'middle',
                        width: 22,
                        height: 22,
                      }}>
                        <span style={{
                          display: 'block',
                          width: 22,
                          height: 22,
                          border: '3px solid #23242a',
                          borderTop: '3px solid #FFD600',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                      </span>
                    )}
                  </button>
                </form>
                <div className="profile-avatar-section">
                  {avatar ? (
                    <img src={avatar} alt="avatar" className="profile-avatar-large" />
                  ) : (
                    <div style={{
                      width: 110,
                      height: 110,
                      borderRadius: '50%',
                      background: '#bdbdbd',
                      border: '2px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 48,
                      color: '#fff',
                      marginBottom: 8
                    }}>
                      {displayName ? displayName[0].toUpperCase() : '?'}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="profile-change-password">
              Đổi mật khẩu, nhấn vào <span style={{ color: '#FFD600', cursor: 'pointer', fontWeight: 600 }} onClick={() => setShowChangePassword(true)}>đây</span>
            </div>
            {showChangePassword && (
              <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(24,26,32,0.85)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
              }}>
                <form onSubmit={handleChangePassword} style={{
                  background: '#232a3b',
                  borderRadius: 20,
                  minWidth: 500,
                  maxWidth: '95vw',
                  padding: '32px 28px 24px 28px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  color: '#fff',
                  fontFamily: 'inherit',
                  position: 'relative',
                }}>
                  <div style={{ fontWeight: 500, fontSize: 22, marginBottom: 18, color: '#fff', textAlign: 'center', letterSpacing: 1, fontFamily: 'inherit' }}>Đổi mật khẩu</div>
                  <button type="button" onClick={() => setShowChangePassword(false)} style={{
                    position: 'absolute',
                    top: 16, right: 18,
                    background: 'none', border: 'none', color: '#FFD600', fontSize: 22, cursor: 'pointer', fontWeight: 700
                  }}>×</button>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 500, marginBottom: 6, fontFamily: 'inherit' }}>Mật khẩu cũ</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#181A20', borderRadius: 10, border: '1.5px solid #232a3b', transition: 'border 0.18s' }}>
                      <input type={showOld ? 'text' : 'password'} value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '12px 14px', fontSize: 16, borderRadius: 10, fontWeight: 500, fontFamily: 'inherit', outline: 'none' }}
                        autoFocus
                        onFocus={e => e.target.parentNode.style.border = '1.5px solid #fff'}
                        onBlur={e => e.target.parentNode.style.border = '1.5px solid #232a3b'}
                      />
                      <span style={{ cursor: 'pointer', padding: 6 }} onClick={() => setShowOld(v => !v)}>
                        {showOld ? <VisibilityOffIcon sx={{ fontSize: 20, color: '#fff' }} /> : <VisibilityIcon sx={{ fontSize: 20, color: '#fff' }} />}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 500, marginBottom: 6, fontFamily: 'inherit' }}>Mật khẩu mới</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#181A20', borderRadius: 10, border: '1.5px solid #232a3b', transition: 'border 0.18s' }}>
                      <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '12px 14px', fontSize: 16, borderRadius: 10, fontWeight: 500, fontFamily: 'inherit', outline: 'none' }}
                        onFocus={e => e.target.parentNode.style.border = '1.5px solid #fff'}
                        onBlur={e => e.target.parentNode.style.border = '1.5px solid #232a3b'}
                      />
                      <span style={{ cursor: 'pointer', padding: 6 }} onClick={() => setShowNew(v => !v)}>
                        {showNew ? <VisibilityOffIcon sx={{ fontSize: 20, color: '#fff' }} /> : <VisibilityIcon sx={{ fontSize: 20, color: '#fff' }} />}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontWeight: 500, marginBottom: 6, fontFamily: 'inherit' }}>Nhập lại mật khẩu mới</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#181A20', borderRadius: 10, border: '1.5px solid #232a3b', transition: 'border 0.18s' }}>
                      <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '12px 14px', fontSize: 16, borderRadius: 10, fontWeight: 500, fontFamily: 'inherit', outline: 'none' }}
                        onFocus={e => e.target.parentNode.style.border = '1.5px solid #fff'}
                        onBlur={e => e.target.parentNode.style.border = '1.5px solid #232a3b'}
                      />
                      <span style={{ cursor: 'pointer', padding: 6 }} onClick={() => setShowConfirm(v => !v)}>
                        {showConfirm ? <VisibilityOffIcon sx={{ fontSize: 20, color: '#fff' }} /> : <VisibilityIcon sx={{ fontSize: 20, color: '#fff' }} />}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    <button type="submit" disabled={changePwLoading} style={{
                      background: '#FFD600', color: '#23242a', fontWeight: 700, border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 16, cursor: 'pointer', flex: 1, fontFamily: 'inherit', transition: 'background 0.18s, color 0.18s'
                    }}>
                      Xác nhận
                      {changePwLoading && (
                        <span style={{
                          display: 'inline-block', marginLeft: 10, verticalAlign: 'middle', width: 20, height: 20
                        }}>
                          <span style={{
                            display: 'block', width: 20, height: 20, border: '3px solid #23242a', borderTop: '3px solid #FFD600', borderRadius: '50%', animation: 'spin 1s linear infinite'
                          }} />
                          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                        </span>
                      )}
                    </button>
                    <button type="button" onClick={() => setShowChangePassword(false)} style={{
                      background: '#181A20', color: '#FFD600', fontWeight: 700, border: '1.5px solid #FFD600', borderRadius: 8, padding: '12px 0', fontSize: 16, cursor: 'pointer', flex: 1, fontFamily: 'inherit', transition: 'background 0.18s, color 0.18s, border 0.18s'
                    }}
                    onMouseOver={e => { e.target.style.background = '#232a3b'; e.target.style.color = '#FFD600'; }}
                    onMouseOut={e => { e.target.style.background = '#181A20'; e.target.style.color = '#FFD600'; }}
                    >Hủy</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Toast notification góc phải dưới */}
      {showToast && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          minWidth: 320,
          background: '#23242a',
          color: '#fff',
          borderRadius: 14,
          boxShadow: '0 2px 16px 0 rgba(0,0,0,0.15)',
          fontWeight: 500,
          fontSize: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 12px 16px', position: 'relative' }}>
            <span style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: toastType === 'success' ? '#19c37d' : '#e53935',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              marginRight: 12,
              flexShrink: 0
            }}>{toastType === 'success' ? '✔️' : '❌'}</span>
            <span style={{ flex: 1, color: '#fff', fontWeight: 500 }}>{toastMessage}</span>
            <button onClick={handleCloseToast} style={{
              background: 'none',
              border: 'none',
              color: '#bdbdbd',
              fontSize: 20,
              cursor: 'pointer',
              position: 'absolute',
              right: 12,
              top: 10,
              padding: 0,
              lineHeight: 1
            }} aria-label="Đóng">×</button>
          </div>
          <div style={{
            height: 4,
            width: '100%',
            background: '#23242a',
            borderRadius: '0 0 14px 14px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${toastProgress}%`,
              background: toastType === 'success' ? '#19c37d' : '#e53935',
              transition: 'width 0.03s linear',
            }} />
          </div>
        </div>
      )}
    </>
  );
} 
