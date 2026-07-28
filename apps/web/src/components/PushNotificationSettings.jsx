import { useCallback, useEffect, useState } from 'react';
import Button from './ui/Button';
import {
  getPushPrefs,
  getPushStatus,
  isLikelyMobile,
  isPushSupported,
  sendTestPush,
  setPushPrefs,
  subscribePush,
  unsubscribePush,
} from '../lib/push';
import {
  getInstallState,
  initPwaInstallListeners,
  promptInstall,
  subscribeInstallState,
} from '../lib/pwaInstall';
import { useToast } from '../lib/toast';

function statusLabel({ supported, permission, subscribed, configured }) {
  if (!supported) return { text: 'Desteklenmiyor', tone: 'muted', emoji: '⚪' };
  if (!configured) return { text: 'Sunucu yapılandırılmamış', tone: 'warning', emoji: '🟡' };
  if (permission === 'denied') return { text: 'İzin verilmedi', tone: 'danger', emoji: '🔴' };
  if (subscribed && permission === 'granted') return { text: 'Aktif', tone: 'success', emoji: '🟢' };
  if (permission === 'granted') return { text: 'İzin var · abone değil', tone: 'warning', emoji: '🟡' };
  return { text: 'Kapalı', tone: 'muted', emoji: '⚪' };
}

export default function PushNotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(getPushPrefs);
  const [status, setStatus] = useState({
    supported: isPushSupported(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    subscribed: false,
    configured: false,
  });
  const [install, setInstall] = useState(getInstallState);
  const [busy, setBusy] = useState(false);
  const mobile = isLikelyMobile();

  const refresh = useCallback(async () => {
    const s = await getPushStatus();
    setStatus(s);
    setPrefs(getPushPrefs());
    setInstall(getInstallState());
  }, []);

  useEffect(() => {
    const stop = initPwaInstallListeners();
    const unsub = subscribeInstallState(setInstall);
    refresh();
    return () => {
      stop();
      unsub();
    };
  }, [refresh]);

  async function applyDevicePref(key, value) {
    const next = setPushPrefs({ [key]: value });
    setPrefs(next);
    const thisKey = mobile ? 'mobile' : 'desktop';
    setBusy(true);
    try {
      if (key === thisKey) {
        if (value) await subscribePush();
        else await unsubscribePush();
      }
      await refresh();
      toast.success(value ? 'Bildirimler açıldı' : 'Bildirimler kapatıldı');
    } catch (err) {
      toast.error(err.message || 'Bildirim ayarı uygulanamadı');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function enableHere() {
    setBusy(true);
    try {
      const key = mobile ? 'mobile' : 'desktop';
      setPushPrefs({ [key]: true });
      await subscribePush();
      await refresh();
      toast.success('Push bildirimleri aktif');
    } catch (err) {
      toast.error(err.message || 'Abonelik başarısız');
    } finally {
      setBusy(false);
    }
  }

  async function disableHere() {
    setBusy(true);
    try {
      await unsubscribePush();
      await refresh();
      toast.success('Abonelik kaldırıldı');
    } catch (err) {
      toast.error(err.message || 'Abonelik kaldırılamadı');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onInstall() {
    setBusy(true);
    try {
      const result = await promptInstall();
      if (result?.outcome === 'accepted') {
        toast.success('Uygulama yükleniyor…');
      } else if (result?.outcome === 'unavailable') {
        toast.info('Kurulum bu tarayıcıda şu an kullanılamıyor');
      }
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Kurulum başlatılamadı');
    } finally {
      setBusy(false);
    }
  }

  async function onTestPush() {
    setBusy(true);
    try {
      const s = await getPushStatus();
      setStatus(s);
      if (!s.subscribed) {
        toast.error('Önce bu cihazda push aboneliği açın');
        return;
      }
      const res = await sendTestPush();
      toast.success(res.sent ? 'Test bildirimi gönderildi' : 'Abonelik yok — bildirim gönderilemedi');
    } catch (err) {
      toast.error(err.message || 'Test bildirimi başarısız');
    } finally {
      setBusy(false);
    }
  }

  const label = statusLabel(status);
  const showIosHint = install.isIos && !install.installed;

  return (
    <section className="card-surface push-settings">
      <h3 className="form-title">Bildirimler</h3>
      <p className="muted tiny">
        Siteyi uygulama gibi kurun; kapalıyken de sipariş ve duyuru bildirimleri alın. Socket canlı
        bağlantısı ayrıca çalışmaya devam eder.
      </p>

      <div className="push-install-block">
        {install.installed ? (
          <p className="push-installed-msg">✓ Alfatek Sipariş uygulaması yüklendi</p>
        ) : install.canInstall ? (
          <Button variant="primary" loading={busy} onClick={onInstall}>
            📱 Uygulamayı Yükle
          </Button>
        ) : showIosHint ? (
          <p className="muted tiny push-ios-hint">
            iOS: Safari → Paylaş → <strong>Ana Ekrana Ekle</strong>. Web Push için PWA olarak açın
            (iOS 16.4+).
          </p>
        ) : (
          <p className="muted tiny">
            Kurulum butonu, tarayıcı hazır olduğunda (genelde Android Chrome) burada görünür.
          </p>
        )}
      </div>

      <div className={`push-status-pill tone-${label.tone}`}>
        Bildirim Durumu: {label.emoji} <strong>{label.text}</strong>
      </div>

      <div className="push-pref-list">
        <div className="push-pref-row">
          <div>
            <strong>🔔 Masaüstü bildirimleri</strong>
            <p className="muted tiny">PC / laptop tarayıcısı</p>
          </div>
          <button
            type="button"
            className={`btn ${prefs.desktop ? 'primary' : 'ghost'} push-toggle`}
            disabled={busy || !status.supported}
            onClick={() => applyDevicePref('desktop', !prefs.desktop)}
          >
            {prefs.desktop ? 'Açık' : 'Kapalı'}
          </button>
        </div>
        <div className="push-pref-row">
          <div>
            <strong>📱 Mobil bildirimler</strong>
            <p className="muted tiny">Telefon / tablet · PWA önerilir</p>
          </div>
          <button
            type="button"
            className={`btn ${prefs.mobile ? 'primary' : 'ghost'} push-toggle`}
            disabled={busy || !status.supported}
            onClick={() => applyDevicePref('mobile', !prefs.mobile)}
          >
            {prefs.mobile ? 'Açık' : 'Kapalı'}
          </button>
        </div>
      </div>

      {status.supported && status.permission !== 'granted' && (
        <Button variant="primary" loading={busy} onClick={enableHere}>
          Bildirimleri Aç
        </Button>
      )}
      {status.supported && status.permission === 'granted' && !status.subscribed && (
        <Button variant="primary" loading={busy} onClick={enableHere}>
          Bu cihazda abone ol
        </Button>
      )}
      {status.supported && status.subscribed && (
        <Button variant="ghost" loading={busy} onClick={disableHere}>
          Abonelikten çık
        </Button>
      )}

      {status.supported && status.configured && (
        <Button variant="ghost" loading={busy} onClick={onTestPush}>
          Test Bildirimi Gönder
        </Button>
      )}
    </section>
  );
}
