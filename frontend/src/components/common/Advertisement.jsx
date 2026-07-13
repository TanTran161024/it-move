import { useEffect, useState } from 'react';
import { API_BASE_URL as API } from '../../config/api';

export default function Advertisement({ placement, className = '' }) {
  const [ads, setAds] = useState([]);
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const controller = new AbortController();
    fetch(`${API}/api/ads?placement=${encodeURIComponent(placement)}`, {
      headers: user.id ? { 'x-user-id': user.id } : {}, signal: controller.signal,
    }).then(r => r.ok ? r.json() : []).then(setAds).catch(() => {});
    return () => controller.abort();
  }, [placement]);
  if (!ads.length) return null;
  return <div className={`flex flex-col gap-3 ${className}`}>{ads.map(ad => {
    const image = <img src={ad.image_url} alt={ad.name} className="max-h-40 w-full rounded-xl object-cover" />;
    return ad.target_url ? <a key={ad.id} href={ad.target_url} target="_blank" rel="noreferrer" aria-label={ad.name}>{image}</a> : <div key={ad.id}>{image}</div>;
  })}</div>;
}
