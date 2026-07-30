import { useEffect, useState } from 'react';
import { getDesktopBridge, isElectronDesktop } from '../lib/desktop';
import { useToast } from '../lib/toast';

/**
 * Electron-only profile card. Renders nothing in browsers / PWA.
 */
export default function DesktopAppSettings() {
  const toast = useToast();
  const [visible, setVisible] = useState(() => isElectronDesktop());
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setVisible(false);
      return;
    }
    setVisible(true);
    let cancelled = false;
    (async () => {
      try {
        const value = await bridge.getAutoLaunch();
        if (!cancelled) setAutoLaunch(Boolean(value));
      } catch (err) {
        if (!cancelled) toast.error(err?.message || 'Masaüstü ayarı okunamadı');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  if (!visible) return null;

  async function onToggle(next) {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setBusy(true);
    const prev = autoLaunch;
    setAutoLaunch(next);
    try {
      const applied = await bridge.setAutoLaunch(next);
      setAutoLaunch(Boolean(applied));
      toast.success(next ? 'Otomatik başlatma açıldı' : 'Otomatik başlatma kapatıldı');
    } catch (err) {
      setAutoLaunch(prev);
      toast.error(err?.message || 'Ayar kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-surface desktop-app-settings">
      <h3 className="form-title">Masaüstü Uygulaması</h3>
      <p className="muted tiny">Yalnızca Alfatek masaüstü uygulamasında geçerli</p>
      <label className="settings-field settings-check desktop-auto-launch">
        <input
          type="checkbox"
          checked={autoLaunch}
          disabled={busy || !ready}
          onChange={(e) => void onToggle(e.target.checked)}
        />
        <span>Windows açıldığında otomatik başlat</span>
      </label>
    </section>
  );
}
