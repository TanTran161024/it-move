export const FALLBACK_POSTER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23111111'/%3E%3Cpath d='M118 170v110l92-55z' fill='%23E50914'/%3E%3Ctext x='150' y='330' fill='%23fff' font-family='Arial,sans-serif' font-size='20' text-anchor='middle'%3ENo poster%3C/text%3E%3C/svg%3E";

export function safePosterUrl(url, fallback = FALLBACK_POSTER) {
  if (typeof url !== 'string' || !url.trim()) return fallback;
  if (/static\.nutscdn\.com/i.test(url)) return fallback;
  return url;
}
