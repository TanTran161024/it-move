import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL as API } from '../../config/api';
import {
  clearActiveProfile,
  DEFAULT_PROFILE_SETTINGS,
  getActiveProfile,
  getProfilePlayerSettings,
  getStoredUser,
  mergeProfilePlayerSettings,
  PROFILE_CHANGE_EVENT,
  profileInitial,
  setActiveProfile,
} from '../../utils/profile';

const AVATAR_COLORS = ['#E50914', '#2DD48F', '#3B82F6', '#FACC15', '#A855F7', '#F97316'];

function ProfileAvatar({ profile, size = 'large' }) {
  const dimension = size === 'small' ? 'h-12 w-12 text-lg' : 'h-28 w-28 text-5xl md:h-36 md:w-36 md:text-6xl';
  const avatarUrl = String(profile?.avatar_url || '').trim();

  return (
    <div
      className={`${dimension} grid place-items-center overflow-hidden rounded-md font-black text-white shadow-2xl ring-2 ring-white/10 transition-colors`}
      style={{ backgroundColor: profile?.avatar_color || '#E50914' }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        profileInitial(profile?.name)
      )}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
    >
      <span>
        <span className="block font-semibold text-white">{label}</span>
        {description && <span className="mt-1 block text-xs text-white/45">{description}</span>}
      </span>
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-white/20'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

export default function ProfileGate({ children, disabled = false }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [active, setActive] = useState(() => getActiveProfile());
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    avatar_color: AVATAR_COLORS[0],
    avatar_url: '',
    is_kids: false,
    ...DEFAULT_PROFILE_SETTINGS,
  });
  const [saving, setSaving] = useState(false);
  const hasUser = Boolean(user.id);

  const activeIsValid = useMemo(
    () => hasUser && active?.id && profiles.some((profile) => Number(profile.id) === Number(active.id)),
    [active?.id, hasUser, profiles]
  );

  const loadProfiles = useCallback(async () => {
    const currentUser = getStoredUser();
    setUser(currentUser);
    setActive(getActiveProfile());
    if (!currentUser.id || disabled) return;

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/profiles`, {
        headers: { 'x-user-id': currentUser.id },
      });
      const body = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(body.message || 'Không thể tải profile.');
      const list = Array.isArray(body) ? body : [];
      setProfiles(list);

      const stored = getActiveProfile();
      const freshStored = list.find((profile) => Number(profile.id) === Number(stored?.id));
      if (freshStored) {
        setActiveProfile(freshStored);
        setActive(freshStored);
      } else if (stored?.id) {
        clearActiveProfile();
        setActive({});
      }
    } catch (err) {
      setError(err.message || 'Không thể tải profile.');
    } finally {
      setLoading(false);
    }
  }, [disabled]);

  useEffect(() => {
    loadProfiles();
    const handleChange = () => {
      setUser(getStoredUser());
      setActive(getActiveProfile());
    };
    window.addEventListener(PROFILE_CHANGE_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, [loadProfiles]);

  if (disabled || !hasUser || activeIsValid) return children;

  const resetForm = (profile = null) => {
    const settings = getProfilePlayerSettings(profile || {});
    setForm({
      name: profile?.name || '',
      avatar_color: profile?.avatar_color || AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
      avatar_url: profile?.avatar_url || '',
      is_kids: Boolean(profile?.is_kids),
      ...settings,
    });
  };

  const openCreate = () => {
    setEditing({ mode: 'create' });
    resetForm(null);
    setError('');
  };

  const openEdit = (profile) => {
    setEditing({ mode: 'edit', profile });
    resetForm(profile);
    setError('');
  };

  const closeForm = () => {
    setEditing(null);
    setSaving(false);
  };

  const updateSetting = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('Nhập tên profile trước nhé.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const isEdit = editing?.mode === 'edit';
      const url = isEdit ? `${API}/profiles/${editing.profile.id}` : `${API}/profiles`;
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          name,
          avatar_color: form.avatar_color,
          avatar_url: form.avatar_url,
          is_kids: form.is_kids,
          autoplayNext: form.autoplayNext,
          subtitleStyle: form.subtitleStyle,
          subtitleTrack: form.subtitleTrack,
          cinemaDefault: form.cinemaDefault,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể lưu profile.');

      if (Number(active?.id) === Number(body.profile?.id)) {
        setActiveProfile(body.profile);
        setActive(body.profile);
      }
      await loadProfiles();
      closeForm();
    } catch (err) {
      setError(err.message || 'Không thể lưu profile.');
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (editing?.mode !== 'edit') return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/profiles/${editing.profile.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Không thể xóa profile.');
      if (Number(active?.id) === Number(editing.profile.id)) clearActiveProfile();
      await loadProfiles();
      closeForm();
    } catch (err) {
      setError(err.message || 'Không thể xóa profile.');
      setSaving(false);
    }
  };

  const chooseProfile = (profile) => {
    setActiveProfile(mergeProfilePlayerSettings(profile, getProfilePlayerSettings(profile)));
    setActive(profile);
  };

  return (
    <div className="fixed inset-0 z-[10000] min-h-screen overflow-y-auto bg-[#141414] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-wide md:text-5xl">Ai đang xem?</h1>
          <p className="mt-3 text-sm text-white/50 md:text-base">Mỗi profile có lịch sử xem, danh sách, đánh giá và cài đặt phát riêng.</p>
        </div>

        {loading && (
          <div className="grid min-h-[220px] place-items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          </div>
        )}

        {!loading && (
          <div className="grid w-full grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-5 md:gap-8">
            {profiles.map((profile) => (
              <div key={profile.id} className="group flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => chooseProfile(profile)}
                  className="rounded-md outline-none ring-offset-4 ring-offset-[#141414] transition-colors hover:ring-4 hover:ring-white focus-visible:ring-4 focus-visible:ring-white"
                >
                  <ProfileAvatar profile={profile} />
                </button>
                <button
                  type="button"
                  onClick={() => chooseProfile(profile)}
                  className="max-w-full truncate text-lg font-medium text-white/60 transition-colors group-hover:text-white"
                >
                  {profile.name}
                </button>
                {profile.is_kids ? (
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/55">Trẻ em</span>
                ) : (
                  <span className="h-[26px]" />
                )}
                <button
                  type="button"
                  onClick={() => openEdit(profile)}
                  className="text-sm text-white/35 transition-colors hover:text-white"
                >
                  Quản lý
                </button>
              </div>
            ))}

            {profiles.length < 5 && (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={openCreate}
                  className="grid h-28 w-28 place-items-center rounded-md border-2 border-dashed border-white/25 text-5xl text-white/45 transition-colors hover:border-white hover:text-white md:h-36 md:w-36"
                >
                  +
                </button>
                <button type="button" onClick={openCreate} className="text-lg font-medium text-white/55 hover:text-white">
                  Thêm profile
                </button>
              </div>
            )}
          </div>
        )}

        {error && <div className="mt-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[10001] grid place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={saveProfile} className="w-full max-w-lg rounded-xl border border-white/10 bg-[#181818] p-6 shadow-2xl">
            <h2 className="mb-5 text-2xl font-bold">{editing.mode === 'edit' ? 'Quản lý profile' : 'Thêm profile'}</h2>

            <div className="mb-5 flex items-center gap-4">
              <ProfileAvatar profile={{ name: form.name, avatar_color: form.avatar_color, avatar_url: form.avatar_url }} size="small" />
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition-colors focus:border-white/40"
                placeholder="Tên profile"
              />
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-semibold text-white/60" htmlFor="profile-avatar-url">Avatar URL</label>
              <input
                id="profile-avatar-url"
                value={form.avatar_url}
                onChange={(event) => setForm((current) => ({ ...current, avatar_url: event.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition-colors focus:border-white/40"
                placeholder="https://..."
              />
            </div>

            <div className="mb-5">
              <div className="mb-2 text-sm font-semibold text-white/60">Màu avatar dự phòng</div>
              <div className="flex flex-wrap gap-3">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, avatar_color: color }))}
                    className={`h-9 w-9 rounded-md transition-colors ${form.avatar_color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#181818]' : 'ring-1 ring-white/10'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Chọn màu ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="mb-5 space-y-3">
              <ToggleRow
                label="Profile trẻ em"
                description="Ưu tiên trải nghiệm nhẹ nhàng hơn cho profile này."
                checked={Boolean(form.is_kids)}
                onChange={(value) => updateSetting('is_kids', value)}
              />
              <ToggleRow
                label="Tự phát tập tiếp"
                description="Dùng mặc định khi profile này xem phim bộ."
                checked={Boolean(form.autoplayNext)}
                onChange={(value) => updateSetting('autoplayNext', value)}
              />
              <ToggleRow
                label="Mặc định tắt đèn"
                description="Tự bật cinema mode khi vào trang xem phim."
                checked={Boolean(form.cinemaDefault)}
                onChange={(value) => updateSetting('cinemaDefault', value)}
              />
            </div>

            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-white/60">Kiểu phụ đề mặc định</span>
              <select
                value={form.subtitleStyle}
                onChange={(event) => updateSetting('subtitleStyle', event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white outline-none transition-colors focus:border-white/40"
              >
                <option value="default">Mặc định</option>
                <option value="large">Chữ lớn</option>
                <option value="yellow">Vàng</option>
                <option value="boxed">Nền đen</option>
              </select>
            </label>

            <div className="flex flex-wrap justify-between gap-3">
              {editing.mode === 'edit' ? (
                <button
                  type="button"
                  onClick={deleteProfile}
                  disabled={saving || profiles.length <= 1}
                  className="rounded-lg border border-red-500/40 px-4 py-2 font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Xóa
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-3">
                <button type="button" onClick={closeForm} className="rounded-lg px-4 py-2 font-semibold text-white/65 hover:text-white">
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-white px-5 py-2 font-bold text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Đang lưu' : 'Lưu'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
