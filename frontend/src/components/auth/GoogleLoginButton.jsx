import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL as API } from '../../config/api';
import { clearActiveProfile } from '../../utils/profile';
import './AuthStyles.css';

let googleScriptPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export default function GoogleLoginButton({ onSuccess, onError }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    let cancelled = false;

    async function initGoogle() {
      if (!clientId) {
        setStatus('Google Sign-In chưa được cấu hình');
        return;
      }

      try {
        await loadGoogleScript();
        if (cancelled || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            try {
              setStatus('Đang xử lý đăng nhập Google...');
              const res = await axios.post(`${API}/auth/google`, { credential: response.credential });
              localStorage.setItem('user', JSON.stringify(res.data));
              clearActiveProfile();
              setStatus('');
              onSuccess?.(res.data);
            } catch (err) {
              const message = err.response?.data?.message || 'Đăng nhập Google thất bại';
              setStatus(message);
              onError?.(message);
            }
          },
        });

        containerRef.current.replaceChildren();
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
        setStatus('');
      } catch {
        setStatus('Không tải được Google Sign-In');
      }
    }

    initGoogle();
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, onError, onSuccess]);

  return (
    <div className="auth-google-wrapper">
      <div
        ref={containerRef}
        style={{ minHeight: 40, display: clientId ? 'block' : 'none' }}
      />

      {status && (
        <p className="auth-google-status">
          {status}
        </p>
      )}

      {!clientId && (
        <button
          disabled
          className="auth-google-fallback"
        >
          Google Sign-In chưa được cấu hình
        </button>
      )}
    </div>
  );
}
