import React, { useCallback, useEffect, useMemo, useState } from 'react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import TheaterComedyIcon from '@mui/icons-material/TheaterComedy';
import ProfileSidebar from '../../components/user/ProfileSidebar';
import { API_URL as API } from '../../config/api';
import {
  clearActiveProfile,
  getActiveProfile,
  getProfileHeaders,
  getProfilePlayerSettings,
  getStoredUser,
  PROFILE_CHANGE_EVENT,
  profileInitial,
} from '../../utils/profile';

const emptyProfile = {
  username: '',
  email: '',
  gender: 'other',
  avatar_url: '',
  phone: '',
  birth_date: '',
};

function formatWatchDuration(seconds) {
  const totalMinutes = Math.round((Number(seconds) || 0) / 60);
  if (totalMinutes < 60) return `${totalMinutes} phút`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function compactNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function StatCard({ icon, label, value, helper }) {
  const IconComponent = icon;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
          <IconComponent sx={{ fontSize: 21 }} />
        </span>
      </div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      {helper ? <p className="mt-1 line-clamp-1 text-xs text-text-secondary">{helper}</p> : null}
    </div>
  );
}

function ProfileAvatarPreview({ activeProfile, profile }) {
  const avatar = activeProfile.avatar_url || profile.avatar_url || profile.avatar || '';
  const displayName = activeProfile.name || profile.username || 'Profile';

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      {avatar ? (
        <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div
          className="grid h-20 w-20 place-items-center rounded-2xl text-3xl font-black text-white"
          style={{ backgroundColor: activeProfile.avatar_color || '#E50914' }}
        >
          {profileInitial(displayName)}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-xl font-black text-white">{displayName}</h2>
          {activeProfile.is_kids ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/65">
              <ChildCareIcon sx={{ fontSize: 14 }} />
              Trẻ em
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-text-secondary">Profile đang xem hiện tại</p>
      </div>
    </div>
  );
}

function SettingPill({ icon, label, value }) {
  const IconComponent = icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-primary"><IconComponent sx={{ fontSize: 20 }} /></span>
      <span className="min-w-0">
        <span className="block text-xs text-text-secondary">{label}</span>
        <span className="block truncate text-sm font-bold text-white">{value}</span>
      </span>
    </div>
  );
}

function PasswordInput({ label, value, visible, onToggle, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-white/80">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-4 pr-12 text-white outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 transition-colors hover:text-white"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
        </button>
      </div>
    </div>
  );
}

export default function Profile() {
  const [user, setUser] = useState(() => getStoredUser());
  const [activeProfile, setActiveProfileState] = useState(() => getActiveProfile());
  const [profile, setProfile] = useState(emptyProfile);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState({ old: false, next: false, confirm: false });
  const [changePwLoading, setChangePwLoading] = useState(false);

  const playerSettings = useMemo(() => getProfilePlayerSettings(activeProfile), [activeProfile]);
  const displayName = activeProfile.name || profile.username || user.username || '';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    const onProfileChange = () => {
      setUser(getStoredUser());
      setActiveProfileState(getActiveProfile());
    };
    window.addEventListener(PROFILE_CHANGE_EVENT, onProfileChange);
    window.addEventListener('storage', onProfileChange);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, onProfileChange);
      window.removeEventListener('storage', onProfileChange);
    };
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
        const response = await fetch(`${API}/user/profile`, {
          credentials: 'include',
          headers: getProfileHeaders(),
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Không tải được thông tin tài khoản');
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

  useEffect(() => {
    if (!user.id) {
      setStats(null);
      setStatsLoading(false);
      return;
    }

    const controller = new AbortController();
    setStatsLoading(true);
    fetch(`${API}/user/watch-stats`, {
      headers: getProfileHeaders(),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Không tải được thống kê xem phim');
        return response.json();
      })
      .then((data) => {
        setStats(data);
        setStatsLoading(false);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setStats(null);
        setStatsLoading(false);
      });

    return () => controller.abort();
  }, [user.id, activeProfile?.id]);

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
      const response = await fetch(`${API}/user/profile`, {
        method: 'PUT',
        headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Có lỗi xảy ra');

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
      const response = await fetch(`${API}/user/change-password`, {
        method: 'POST',
        headers: getProfileHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Có lỗi xảy ra');
      showToast('Đổi mật khẩu thành công');
      setShowChangePassword(false);
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showToast(error.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setChangePwLoading(false);
    }
  };

  const statCards = [
    {
      icon: AccessTimeIcon,
      label: 'Thời gian xem',
      value: statsLoading ? '...' : formatWatchDuration(stats?.watch_seconds),
      helper: `${compactNumber(stats?.active_days)} ngày hoạt động`,
    },
    {
      icon: MovieFilterIcon,
      label: 'Phim đã xem',
      value: statsLoading ? '...' : compactNumber(stats?.total_movies),
      helper: `${compactNumber(stats?.total_episodes)} tập đã mở`,
    },
    {
      icon: DoneAllIcon,
      label: 'Hoàn thành',
      value: statsLoading ? '...' : compactNumber(stats?.completed_episodes),
      helper: `${compactNumber(stats?.completion_rate)}% tỷ lệ hoàn thành`,
    },
    {
      icon: LocalFireDepartmentIcon,
      label: 'Chuỗi xem',
      value: statsLoading ? '...' : `${compactNumber(stats?.current_streak_days)} ngày`,
      helper: `Kỷ lục ${compactNumber(stats?.longest_streak_days)} ngày`,
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-background pb-12 pt-24">
        <div className="container mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-8 lg:flex-row">
          <ProfileSidebar user={user} profile={{ ...profile, username: displayName }} />

          <main className="min-w-0 flex-1">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(229,9,20,0.2),transparent_34%),rgba(255,255,255,0.035)] p-6 shadow-2xl md:p-8">
              <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">User / Profile</p>
                  <h1 className="mt-2 text-3xl font-black text-white md:text-5xl">Tài khoản của bạn</h1>
                  <p className="mt-2 max-w-2xl text-sm text-text-secondary md:text-base">
                    Quản lý thông tin cá nhân, profile đang xem và thống kê gu phim của bạn.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/15"
                  onClick={() => setShowChangePassword(true)}
                >
                  Đổi mật khẩu
                </button>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
                {statCards.map((card) => <StatCard key={card.label} {...card} />)}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <form className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6" onSubmit={handleUpdate}>
                    <div className="mb-5">
                      <h2 className="text-xl font-black text-white">Thông tin tài khoản</h2>
                      <p className="mt-1 text-sm text-text-secondary">Thông tin này thuộc tài khoản đăng nhập, không tách theo profile.</p>
                    </div>

                    {loading ? (
                      <div className="flex h-44 items-center justify-center text-text-secondary">Đang tải...</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-white/80">Email</span>
                          <input type="email" value={profile.email} disabled className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-white/50 outline-none" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-white/80">Tên hiển thị</span>
                          <input
                            type="text"
                            value={profile.username}
                            onChange={(event) => handleProfileChange('username', event.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition-colors focus:border-primary"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-white/80">Số điện thoại</span>
                          <input
                            type="tel"
                            value={profile.phone}
                            onChange={(event) => handleProfileChange('phone', event.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition-colors focus:border-primary"
                            placeholder="Nhập số điện thoại"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-white/80">Ngày sinh</span>
                          <input
                            type="date"
                            value={profile.birth_date}
                            onChange={(event) => handleProfileChange('birth_date', event.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition-colors focus:border-primary [color-scheme:dark]"
                          />
                        </label>
                        <div className="md:col-span-2">
                          <div className="mb-3 text-sm font-medium text-white/80">Giới tính</div>
                          <div className="flex flex-wrap items-center gap-4">
                            {[
                              ['male', 'Nam'],
                              ['female', 'Nữ'],
                              ['other', 'Khác'],
                            ].map(([value, label]) => (
                              <label key={value} className="flex cursor-pointer items-center gap-2 text-white/80 transition-colors hover:text-white">
                                <input
                                  type="radio"
                                  name="gender"
                                  value={value}
                                  checked={profile.gender === value}
                                  onChange={() => handleProfileChange('gender', value)}
                                  className="h-4 w-4 accent-primary"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <label className="block md:col-span-2">
                          <span className="mb-2 block text-sm font-medium text-white/80">Ảnh đại diện tài khoản URL</span>
                          <input
                            type="url"
                            value={profile.avatar_url}
                            onChange={(event) => handleProfileChange('avatar_url', event.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition-colors focus:border-primary"
                            placeholder="https://..."
                          />
                        </label>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="mt-6 rounded-xl bg-primary px-8 py-3 font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving || loading}
                    >
                      {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </form>
                </div>

                <aside className="space-y-4 xl:col-span-2">
                  <ProfileAvatarPreview activeProfile={activeProfile} profile={{ ...profile, username: displayName }} />
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                    <h2 className="text-xl font-black text-white">Cài đặt profile</h2>
                    <p className="mt-1 text-sm text-text-secondary">Dùng riêng cho profile đang chọn.</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <SettingPill icon={PlayCircleIcon} label="Tự phát tập tiếp" value={playerSettings.autoplayNext ? 'Bật' : 'Tắt'} />
                      <SettingPill icon={TheaterComedyIcon} label="Tắt đèn mặc định" value={playerSettings.cinemaDefault ? 'Bật' : 'Tắt'} />
                      <SettingPill icon={SubtitlesIcon} label="Kiểu phụ đề" value={playerSettings.subtitleStyle || 'default'} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearActiveProfile();
                      }}
                      className="mt-5 text-sm font-bold text-primary hover:text-red-300"
                    >
                      Đổi hoặc chỉnh profile ở màn hình chọn profile
                    </button>
                  </div>
                </aside>
              </div>
            </section>
          </main>
        </div>
      </div>

      {showChangePassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl" onSubmit={handleChangePassword}>
            <button type="button" className="absolute right-4 top-4 text-white/50 transition-colors hover:text-white" onClick={() => setShowChangePassword(false)}>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="mb-6 text-xl font-bold text-white">Đổi mật khẩu</div>
            <div className="space-y-4">
              <PasswordInput
                label="Mật khẩu cũ"
                value={passwordForm.oldPassword}
                visible={showPassword.old}
                onToggle={() => setShowPassword((current) => ({ ...current, old: !current.old }))}
                onChange={(value) => setPasswordForm((current) => ({ ...current, oldPassword: value }))}
              />
              <PasswordInput
                label="Mật khẩu mới"
                value={passwordForm.newPassword}
                visible={showPassword.next}
                onToggle={() => setShowPassword((current) => ({ ...current, next: !current.next }))}
                onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))}
              />
              <PasswordInput
                label="Nhập lại mật khẩu mới"
                value={passwordForm.confirmPassword}
                visible={showPassword.confirm}
                onToggle={() => setShowPassword((current) => ({ ...current, confirm: !current.confirm }))}
                onChange={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))}
              />
            </div>
            <div className="mt-8 flex items-center gap-3">
              <button type="submit" className="flex-1 rounded-xl bg-primary py-2.5 font-bold text-white transition-colors hover:bg-red-600" disabled={changePwLoading}>
                {changePwLoading ? 'Đang xác nhận...' : 'Xác nhận'}
              </button>
              <button type="button" className="flex-1 rounded-xl bg-white/10 py-2.5 font-bold text-white transition-colors hover:bg-white/20" onClick={() => setShowChangePassword(false)}>
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-lg px-6 py-3 font-medium shadow-2xl ${toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="transition-opacity hover:opacity-70">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
