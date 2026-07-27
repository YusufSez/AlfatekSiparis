import { registerSW } from 'virtual:pwa-register';

const isDev = import.meta.env.DEV;

function log(...args) {
  if (isDev) console.log(...args);
}

/**
 * Register PWA service worker with development logs.
 * Dispatches `sw:register-error` on failure for toast UI.
 */
export function registerAppServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    log('SW registering... skipped (no API)');
    return;
  }

  log('SW registering...');

  try {
    registerSW({
      immediate: true,
      onRegisteredSW(swUrl, registration) {
        log('SW registered', swUrl);
        if (registration?.active) log('SW active');
        if (registration?.installing) {
          registration.installing.addEventListener('statechange', (e) => {
            if (e.target?.state === 'activated') log('SW active');
          });
        }
        registration?.addEventListener?.('updatefound', () => {
          log('SW update found');
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'activated') log('SW active');
          });
        });
      },
      onOfflineReady() {
        log('SW ready');
      },
      onNeedRefresh() {
        log('SW update found');
      },
      onRegisterError(error) {
        console.error('SW register failed', error);
        window.dispatchEvent(
          new CustomEvent('sw:register-error', {
            detail: { message: error?.message || String(error) },
          })
        );
      },
    });

    navigator.serviceWorker.ready
      .then((reg) => {
        log('SW ready');
        if (reg.active) log('SW active');
      })
      .catch((err) => {
        console.error('SW ready failed', err);
        window.dispatchEvent(
          new CustomEvent('sw:register-error', {
            detail: { message: err?.message || String(err) },
          })
        );
      });
  } catch (error) {
    console.error('SW register threw', error);
    window.dispatchEvent(
      new CustomEvent('sw:register-error', {
        detail: { message: error?.message || String(error) },
      })
    );
  }
}
