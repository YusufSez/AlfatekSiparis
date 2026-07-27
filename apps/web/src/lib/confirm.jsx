import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from '../components/Modal';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    const opts =
      typeof options === 'string'
        ? { message: options }
        : options || {};
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        title: opts.title || 'Onay',
        message: opts.message || 'Bu işlemi onaylıyor musunuz?',
        confirmLabel: opts.confirmLabel || 'Onayla',
        cancelLabel: opts.cancelLabel || 'Vazgeç',
        tone: opts.tone || 'danger',
      });
    });
  }, []);

  function close(result) {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        title={state?.title}
        onClose={() => close(false)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => close(false)}>
              {state?.cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${state?.tone === 'danger' ? 'danger' : 'primary'}`}
              onClick={() => close(true)}
            >
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        {state && <p className="confirm-message">{state.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
