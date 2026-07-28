/**
 * Capture beforeinstallprompt so the UI can offer "Uygulamayı Yükle".
 */
let deferredPrompt = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn(getInstallState());
    } catch {
      /* ignore */
    }
  }
}

export function getInstallState() {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  return {
    canInstall: Boolean(deferredPrompt) && !standalone,
    installed: standalone,
    isIos,
    hasPrompt: Boolean(deferredPrompt),
  };
}

export function subscribeInstallState(fn) {
  listeners.add(fn);
  fn(getInstallState());
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' };
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  emit();
  promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  emit();
  return choice;
}

export function initPwaInstallListeners() {
  if (typeof window === 'undefined') return () => {};
  function onBip(e) {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  }
  function onInstalled() {
    deferredPrompt = null;
    emit();
  }
  window.addEventListener('beforeinstallprompt', onBip);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBip);
    window.removeEventListener('appinstalled', onInstalled);
  };
}
