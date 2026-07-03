import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ToastContext from './ToastContext';

function ToastIcon({ type }) {
  const variants = {
    success: {
      className: 'text-green-500',
      path: 'M9 12.5 11.2 14.7 15.5 9.3',
      circle: true,
    },
    error: {
      className: 'text-primary',
      path: 'M12 7.5v5M12 16.5h.01',
      circle: true,
    },
    info: {
      className: 'text-blue-500',
      path: 'M12 10.5v6M12 7.5h.01',
      circle: true,
    },
  };
  const variant = variants[type] || variants.info;

  return (
    <svg className={`h-5 w-5 ${variant.className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {variant.circle && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />}
      <path d={variant.path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToastMessage({ toast, onClose }) {
  useEffect(() => {
    if (toast.duration !== Infinity) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, toast.duration || 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast, onClose]);

  return (
    <div
      className="flex items-start gap-3 bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)] pointer-events-auto min-w-[300px] max-w-[400px] animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="mt-0.5"><ToastIcon type={toast.type} /></div>
      <div className="flex-1 flex flex-col">
        <span className="text-sm font-bold text-white">{toast.title}</span>
        {toast.message && <span className="text-xs text-white/60 mt-1">{toast.message}</span>}
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="text-white/40 hover:text-white transition-colors"
        aria-label="Đóng thông báo"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((title, options = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, type: 'info', duration: 3000, ...options }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 pointer-events-none">
          {toasts.map((toast) => (
            <ToastMessage key={toast.id} toast={toast} onClose={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
