export const ACTIVE_PROFILE_KEY = 'activeProfile';
export const PROFILE_CHANGE_EVENT = 'profilechange';

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

export function getActiveProfile() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_PROFILE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setActiveProfile(profile) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile || {}));
  window.dispatchEvent(new Event(PROFILE_CHANGE_EVENT));
}

export function clearActiveProfile() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  window.dispatchEvent(new Event(PROFILE_CHANGE_EVENT));
}

export function getProfileHeaders(baseHeaders = {}) {
  const user = getStoredUser();
  const profile = getActiveProfile();
  return {
    ...baseHeaders,
    ...(user.id ? { 'x-user-id': user.id } : {}),
    ...(profile.id ? { 'x-profile-id': profile.id } : {}),
  };
}

export function profileInitial(name) {
  return String(name || 'P').trim().charAt(0).toUpperCase() || 'P';
}
