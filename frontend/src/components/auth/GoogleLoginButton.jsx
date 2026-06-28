import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
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
              setStatus('Đang xử lý Google...');
              const res = await axios.post(`${API}/auth/google`, { credential: response.credential });
              localStorage.setItem('user', JSON.stringify(res.data));
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
    <div className="flex flex-col items-center gap-2 mt-4 w-full">
      <div 
        ref={containerRef} 
        className="min-h-[40px]" 
        style={{ display: clientId ? 'block' : 'none' }} 
      />
      
      {status && (
        <p className="text-xs text-center text-text-secondary">
          {status}
        </p>
      )}
      
      {!clientId && (
        <button 
          disabled 
          className="w-full max-w-[320px] py-2 px-4 border border-white/20 rounded text-text-secondary bg-white/5 opacity-50 cursor-not-allowed text-sm font-medium"
        >
          Google Sign-In chưa cấu hình
        </button>
      )}
    </div>
  );
}
