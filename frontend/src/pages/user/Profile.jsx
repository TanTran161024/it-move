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

function formatGenderLabel(value) {
  if (value === 'male') return 'Nam';
  if (value === 'female') return 'Nữ';
  return 'Khác';
}

function formatSubtitleStyle(value) {
  const dictionary = {
    default: 'Mặc định',
    large: 'Chữ lớn',
    yellow: 'Màu vàng',
    boxed: 'Nền đen',
  };
  return dictionary[value] || value || 'Mặc định';
}

function StatCard({ icon, label, value, helper, accent = 'rgba(229,9,20,0.9)', progress = null }) {
  const IconComponent = icon;
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:border-white/20">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl transition-opacity group-hover:opacity-80"
        style={{ background: accent, opacity: 0.18 }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/35 text-white shadow-inner">
          <IconComponent sx={{ fontSize: 21 }} />
        </span>
      </div>
      <div className="relative mt-5 text-3xl font-black leading-none text-white md:text-4xl">{value}</div>
      {helper ? <p className="relative mt-2 line-clamp-1 text-sm text-white/55">{helper}</p> : null}
      {typeof progress === 'number' ? (
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: accent }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ProfileAvatarPreview({ activeProfile, profile, playerSettings }) {
  const avatar = activeProfile.avatar_url || profile.avatar_url || profile.avatar || '';
  const displayName = activeProfile.name || profile.username || 'Profile';

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.14),rgba(255,255,255,0.035))] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.35)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(229,9,20,0.22),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(99,102,241,0.22),transparent_34%)]" />
      <div className="relative flex flex-col items-center text-center">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-[2rem] blur-2xl"
            style={{ backgroundColor: activeProfile.avatar_color || '#E50914', opacity: 0.35 }}
          />
          {avatar ? (
            <img src={avatar} alt="" className="relative h-28 w-28 rounded-[2rem] border border-white/20 object-cover shadow-2xl" referrerPolicy="no-referrer" />
          ) : (
            <div
              className="relative grid h-28 w-28 place-items-center rounded-[2rem] border border-white/20 text-5xl font-black text-white shadow-2xl"
              style={{ backgroundColor: activeProfile.avatar_color || '#E50914' }}
            >
              {profileInitial(displayName)}
            </div>
          )}
        </div>
        <div className="mt-5 flex max-w-full flex-wrap items-center justify-center gap-2">
          <h2 className="truncate text-2xl font-black text-white">{displayName}</h2>
          {activeProfile.is_kids ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/75">
              <ChildCareIcon sx={{ fontSize: 14 }} />
              Trẻ em
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/70">Người lớn</span>
          )}
        </div>
        <p className="mt-2 text-sm text-white/55">Profile đang hoạt động trên thiết bị này</p>
        <div className="mt-5 grid w-full grid-cols-3 gap-2 text-left">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="text-[11px] text-white/45">Tự phát</div>
            <div className="mt-1 text-sm font-black text-white">{playerSettings.autoplayNext ? 'Bật' : 'Tắt'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="text-[11px] text-white/45">Rạp phim</div>
            <div className="mt-1 text-sm font-black text-white">{playerSettings.cinemaDefault ? 'Bật' : 'Tắt'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="text-[11px] text-white/45">Phụ đề</div>
            <div className="mt-1 truncate text-sm font-black text-white">{formatSubtitleStyle(playerSettings.subtitleStyle)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingPill({ icon, label, value, helper }) {
  const IconComponent = icon;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.055]">
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-white/10 text-white">
        <IconComponent sx={{ fontSize: 20 }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.15em] text-white/45">{label}</span>
        <span className="block truncate text-sm font-bold text-white">{value}</span>
        {helper ? <span className="mt-0.5 block truncate text-xs text-white/40">{helper}</span> : null}
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
      accent: 'linear-gradient(135deg,#f97316,#ef4444)',
    },
    {
      icon: MovieFilterIcon,
      label: 'Phim đã xem',
      value: statsLoading ? '...' : compactNumber(stats?.total_movies),
      helper: `${compactNumber(stats?.total_episodes)} tập đã mở`,
      accent: 'linear-gradient(135deg,#8b5cf6,#06b6d4)',
    },
    {
      icon: DoneAllIcon,
      label: 'Hoàn thành',
      value: statsLoading ? '...' : compactNumber(stats?.completed_episodes),
      helper: `${compactNumber(stats?.completion_rate)}% tỷ lệ hoàn thành`,
      progress: Number(stats?.completion_rate) || 0,
      accent: 'linear-gradient(135deg,#22c55e,#14b8a6)',
    },
    {
      icon: LocalFireDepartmentIcon,
      label: 'Chuỗi xem',
      value: statsLoading ? '...' : `${compactNumber(stats?.current_streak_days)} ngày`,
      helper: `Kỷ lục ${compactNumber(stats?.longest_streak_days)} ngày`,
      accent: 'linear-gradient(135deg,#eab308,#f97316)',
    },
  ];

  const accountFacts = [
    ['Email', profile.email || 'Chưa có'],
    ['Giới tính', formatGenderLabel(profile.gender)],
    ['Ngày sinh', profile.birth_date || 'Chưa cập nhật'],
    ['Số điện thoại', profile.phone || 'Chưa cập nhật'],
  ];

  return (
    <>
      <div className="min-h-screen bg-[#050505] pb-12 pt-24 text-white">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(229,9,20,0.18),transparent_30%),radial-gradient(circle_at_78%_0%,rgba(99,102,241,0.16),transparent_28%),linear-gradient(180deg,#070707_0%,#050505_48%,#000_100%)]" />
        <div className="container mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-8 lg:flex-row">
          <ProfileSidebar user={user} profile={{ ...profile, username: displayName }} />

          <main className="min-w-0 flex-1 space-y-6">
            <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.13),rgba(255,255,255,0.035)_45%,rgba(255,255,255,0.02))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(229,9,20,0.24),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(79,70,229,0.22),transparent_32%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

              <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-h-[330px] flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-white/60">
                      <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_16px_rgba(229,9,20,0.8)]" />
                      IT Move Profile
                    </div>
                    <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[0.98] tracking-tight text-white md:text-6xl">
                      Xin chào, {displayName || 'bạn'}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-white/62 md:text-lg">
                      Quản lý tài khoản, profile xem phim, thói quen phát video và thống kê cá nhân trong một không gian gọn như ứng dụng streaming cao cấp.
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-[0_18px_45px_rgba(255,255,255,0.12)] transition-colors hover:bg-white/85"
                      onClick={() => setShowChangePassword(true)}
                    >
                      Đổi mật khẩu
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-6 py-3 text-sm font-black text-white backdrop-blur transition-colors hover:bg-white/14"
                      onClick={clearActiveProfile}
                    >
                      Đổi profile
                    </button>
                    {activeProfile.is_kids ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold text-white/70">
                        <ChildCareIcon sx={{ fontSize: 17 }} />
                        Chế độ trẻ em
                      </span>
                    ) : null}
                  </div>
                </div>

                <ProfileAvatarPreview
                  activeProfile={activeProfile}
                  profile={{ ...profile, username: displayName }}
                  playerSettings={playerSettings}
                />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statCards.map((card) => <StatCard key={card.label} {...card} />)}
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <form className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.3)] backdrop-blur-xl md:p-7" onSubmit={handleUpdate}>
                  <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">Account</div>
                      <h2 className="mt-2 text-2xl font-black text-white">Thông tin tài khoản</h2>
                      <p className="mt-1 text-sm text-white/50">Thông tin này thuộc tài khoản đăng nhập, không tách theo profile.</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs font-bold text-white/55">
                      {profile.email || 'Chưa có email'}
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex h-56 items-center justify-center rounded-3xl border border-white/10 bg-black/25 text-white/55">Đang tải...</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-white/75">Email</span>
                        <input type="email" value={profile.email} disabled className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white/45 outline-none" />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-white/75">Tên hiển thị</span>
                        <input
                          type="text"
                          value={profile.username}
                          onChange={(event) => handleProfileChange('username', event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/[0.07]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-white/75">Số điện thoại</span>
                        <input
                          type="tel"
                          value={profile.phone}
                          onChange={(event) => handleProfileChange('phone', event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/[0.07]"
                          placeholder="Nhập số điện thoại"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-white/75">Ngày sinh</span>
                        <input
                          type="date"
                          value={profile.birth_date}
                          onChange={(event) => handleProfileChange('birth_date', event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition-colors focus:border-white/30 focus:bg-white/[0.07] [color-scheme:dark]"
                        />
                      </label>
                      <div className="md:col-span-2">
                        <div className="mb-3 text-sm font-bold text-white/75">Giới tính</div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            ['male', 'Nam'],
                            ['female', 'Nữ'],
                            ['other', 'Khác'],
                          ].map(([value, label]) => (
                            <label
                              key={value}
                              className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-black transition-colors ${
                                profile.gender === value
                                  ? 'border-primary/50 bg-primary/15 text-white'
                                  : 'border-white/10 bg-black/25 text-white/60 hover:bg-white/[0.07] hover:text-white'
                              }`}
                            >
                              <input
                                type="radio"
                                name="gender"
                                value={value}
                                checked={profile.gender === value}
                                onChange={() => handleProfileChange('gender', value)}
                                className="sr-only"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="block md:col-span-2">
                        <span className="mb-2 block text-sm font-bold text-white/75">Ảnh đại diện tài khoản URL</span>
                        <input
                          type="url"
                          value={profile.avatar_url}
                          onChange={(event) => handleProfileChange('avatar_url', event.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/[0.07]"
                          placeholder="https://..."
                        />
                      </label>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="mt-7 inline-flex rounded-full bg-primary px-8 py-3 font-black text-white shadow-[0_18px_40px_rgba(229,9,20,0.24)] transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={saving || loading}
                  >
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </form>
              </div>

              <aside className="space-y-6 xl:col-span-2">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.3)] backdrop-blur-xl md:p-6">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">Profile Settings</div>
                  <h2 className="mt-2 text-2xl font-black text-white">Trải nghiệm xem</h2>
                  <p className="mt-1 text-sm text-white/50">Các tùy chọn này dùng cho profile đang chọn.</p>
                  <div className="mt-5 grid grid-cols-1 gap-3">
                    <SettingPill icon={PlayCircleIcon} label="Tự phát tập tiếp" value={playerSettings.autoplayNext ? 'Đang bật' : 'Đang tắt'} helper="Tự chuyển khi hết tập" />
                    <SettingPill icon={TheaterComedyIcon} label="Tắt đèn mặc định" value={playerSettings.cinemaDefault ? 'Đang bật' : 'Đang tắt'} helper="Ưu tiên cinema mode khi xem" />
                    <SettingPill icon={SubtitlesIcon} label="Kiểu phụ đề" value={formatSubtitleStyle(playerSettings.subtitleStyle)} helper="Áp dụng cho trình phát" />
                  </div>
                  <button
                    type="button"
                    onClick={clearActiveProfile}
                    className="mt-5 w-full rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-white/14"
                  >
                    Đổi hoặc chỉnh profile
                  </button>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5 md:p-6">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-white/35">Account Snapshot</div>
                  <div className="mt-4 divide-y divide-white/10">
                    {accountFacts.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 py-3">
                        <span className="text-sm text-white/45">{label}</span>
                        <span className="min-w-0 truncate text-right text-sm font-bold text-white/80">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
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
