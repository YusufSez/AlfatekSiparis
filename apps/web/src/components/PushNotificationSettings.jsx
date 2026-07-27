import { useCallback, useEffect, useState } from 'react';
import Button from './ui/Button';
import {
  detectDeviceLabel,
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
  promptInstall,
  subscribeInstallState,
} from '../lib/pwaInstall';
import { useToast } from '../lib/toast';
import { formatDateTime } from '../lib/format';

function statusLabel({ supported, permission, subscribed, configured, blockers }) {
  if (!supported) {
    const first = blockers?.[0];
    return {
      text: first || 'Desteklenmiyor',
      tone: 'danger',
      emoji: '❌',
    };
  }
  if (!configured) return { text: 'Sunucu yapılandırılmamış', tone: 'warning', emoji: '🟡' };
  if (permission === 'denied') return { text: 'İzin verilmedi', tone: 'danger', emoji: '🔴' };
  if (subscribed && permission === 'granted') return { text: 'Aktif', tone: 'success', emoji: '🟢' };
  if (permission === 'granted') return { text: 'İzin var · abone değil', tone: 'warning', emoji: '🟡' };
  return { text: 'Kapalı', tone: 'muted', emoji: '⚪' };
}

function Badge({ ok, label, detail }) {
  return (
    <li className={`push-debug-badge ${ok ? 'is-ok' : 'is-bad'}`}>
      <span className="push-debug-mark" aria-hidden>
        {ok ? '✔' : '✖'}
      </span>
      <span>
        {label}
        {detail != null && detail !== '' ? (
          <span className="push-debug-detail"> · {detail}</span>
        ) : null}
      </span>
    </li>
  );
}

export default function PushNotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(getPushPrefs);
  const [status, setStatus] = useState({
    supported: isPushSupported(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    subscribed: false,
    configured: false,
    lastSeenAt: null,
    devices: 0,
    blockers: [],
    debug: {
      swActive: false,
      subscriptionLocal: false,
      permission: 'denied',
      device: detectDeviceLabel(),
      beforeInstallPrompt: 'Bekleniyor',
      manifest: { status: '—' },
    },
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
    const unsub = subscribeInstallState(() => {
      setInstall(getInstallState());
      refresh();
    });
    refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      unsub();
      clearInterval(t);
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
      if (!status.subscribed) {
        await subscribePush();
      }
      const res = await sendTestPush();
      toast.success(res.sent ? 'Test bildirimi gönderildi' : 'Abonelik yok — bildirim gönderilemedi');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Test bildirimi başarısız');
    } finally {
      setBusy(false);
    }
  }

  const label = statusLabel(status);
  const showIosHint = install.isIos && !install.installed;
  const d = status.debug || {};
  const bip =
    d.beforeInstallPrompt ||
    (install.hasPrompt ? 'Hazır' : install.installed ? 'Kurulu' : 'Bekleniyor');
  const perm =
    status.permission === 'granted'
      ? 'Granted'
      : status.permission === 'denied'
        ? 'Denied'
        : 'Default';
  const manifestOk = d.manifest?.ok === true;
  const manifestDetail = d.manifest?.status || '—';

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
            beforeinstallprompt: <strong>{bip}</strong>
          </p>
        )}
      </div>

      <div className={`push-status-pill tone-${label.tone}`}>
        Bildirim Durumu: {label.emoji} <strong>{label.text}</strong>
      </div>

      {!status.supported && status.blockers?.length > 0 && (
        <ul className="push-blocker-list">
          {status.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <dl className="push-meta-grid">
        <div>
          <dt>Cihaz</dt>
          <dd>{d.device || detectDeviceLabel()}</dd>
        </div>
        <div>
          <dt>Push</dt>
          <dd>{status.subscribed ? 'Aktif' : 'Pasif'}</dd>
        </div>
        <div>
          <dt>Son bağlantı</dt>
          <dd>{status.lastSeenAt ? formatDateTime(status.lastSeenAt) : '—'}</dd>
        </div>
      </dl>

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

      {status.supported && status.configured && (
        <Button variant="ghost" loading={busy} onClick={onTestPush}>
          Test Bildirimi Gönder
        </Button>
      )}

      <details className="push-debug" open>
        <summary>Debug bilgisi</summary>
        <ul className="push-debug-badges">
          <Badge ok={Boolean(d.secureContext)} label="Secure Context" />
          <Badge
            ok={Boolean(d.serviceWorkerApi) && Boolean(d.swActive)}
            label="Service Worker"
            detail={d.swActive ? 'Aktif' : d.serviceWorkerApi ? 'Pasif' : 'Yok'}
          />
          <Badge ok={Boolean(d.pushManager)} label="PushManager" />
          <Badge ok={Boolean(d.notificationApi)} label="Notification" />
          <Badge
            ok={status.permission === 'granted'}
            label="Permission"
            detail={perm}
          />
          <Badge ok={manifestOk} label="Manifest" detail={manifestDetail} />
          <Badge ok={Boolean(d.standalone || install.installed)} label="Standalone" />
          <Badge
            ok={bip === 'Hazır' || bip === 'Kurulu'}
            label="BeforeInstallPrompt"
            detail={bip}
          />
          <Badge
            ok={Boolean(d.subscriptionLocal || status.subscribed)}
            label="Subscription"
            detail={d.subscriptionLocal || status.subscribed ? 'Var' : 'Yok'}
          />
        </ul>
        <p className="muted tiny push-debug-extra">
          Sunucu cihaz sayısı: <strong>{status.devices || 0}</strong>
        </p>
      </details>
    </section>
  );
}
