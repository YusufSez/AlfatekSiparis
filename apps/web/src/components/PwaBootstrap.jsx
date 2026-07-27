import { useEffect } from 'react';
import { registerAppServiceWorker } from '../lib/registerSw';
import { initPwaInstallListeners } from '../lib/pwaInstall';
import { useToast } from '../lib/toast';

/**
 * One-time PWA bootstrap: SW register + install prompt capture + SW error toast.
 * Must render under ToastProvider.
 */
export default function PwaBootstrap() {
  const toast = useToast();

  useEffect(() => {
    const stopInstall = initPwaInstallListeners();
    registerAppServiceWorker();

    function onSwError(e) {
      const reason = e.detail?.message || 'Bilinmeyen hata';
      toast.error(`Service Worker kaydedilemedi.\nSebep: ${reason}`, { ttl: 8000 });
    }
    window.addEventListener('sw:register-error', onSwError);
    return () => {
      stopInstall();
      window.removeEventListener('sw:register-error', onSwError);
    };
  }, [toast]);

  return null;
}
