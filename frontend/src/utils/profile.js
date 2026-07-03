export const ACTIVE_PROFILE_KEY = 'activeProfile';
export const PROFILE_CHANGE_EVENT = 'profilechange';
export const DEFAULT_PROFILE_SETTINGS = {
  autoplayNext: true,
  subtitleStyle: 'default',
  subtitleTrack: 'auto',
  cinemaDefault: false,
};

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

export function getProfilePlayerSettings(profile = getActiveProfile()) {
  const source = profile?.player_settings || profile || {};
  return {
    autoplayNext: source.autoplayNext ?? source.autoplay_next ?? DEFAULT_PROFILE_SETTINGS.autoplayNext,
    subtitleStyle: source.subtitleStyle || source.subtitle_style || DEFAULT_PROFILE_SETTINGS.subtitleStyle,
    subtitleTrack: source.subtitleTrack || source.subtitle_track || DEFAULT_PROFILE_SETTINGS.subtitleTrack,
    cinemaDefault: source.cinemaDefault ?? source.cinema_default ?? DEFAULT_PROFILE_SETTINGS.cinemaDefault,
  };
}

export function mergeProfilePlayerSettings(profile, settings) {
  const nextSettings = { ...DEFAULT_PROFILE_SETTINGS, ...getProfilePlayerSettings(profile), ...settings };
  return {
    ...(profile || {}),
    autoplay_next: Boolean(nextSettings.autoplayNext),
    subtitle_style: nextSettings.subtitleStyle,
    subtitle_track: nextSettings.subtitleTrack,
    cinema_default: Boolean(nextSettings.cinemaDefault),
    player_settings: nextSettings,
  };
}

export function profileInitial(name) {
  return String(name || 'P').trim().charAt(0).toUpperCase() || 'P';
}
