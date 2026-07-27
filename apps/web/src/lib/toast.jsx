import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, opts = {}) => {
      const id = ++toastId;
      const ttl = opts.ttl ?? 3200;
      const action = opts.action || null;
      setToasts((prev) => [...prev.slice(-4), { id, tone, message, action }]);
      if (ttl > 0) {
        setTimeout(() => dismiss(id), ttl);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (msg, opts) => push('success', msg, opts),
      info: (msg, opts) => push('info', msg, opts),
      warning: (msg, opts) => push('warning', msg, opts),
      error: (msg, opts) => push('error', msg, opts),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`app-toast tone-${t.tone}`} role="status">
            <span className="toast-msg">{t.message}</span>
            <div className="toast-actions">
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action.onClick?.();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Kapat">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
