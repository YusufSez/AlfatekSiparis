import { api } from './api';
import { getInstallState } from './pwaInstall';

const PREF_KEY = 'alfatek-push-prefs';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Human-readable blockers when push is unavailable */
export function getPushBlockers() {
  const reasons = [];
  if (typeof window === 'undefined') {
    reasons.push('❌ Tarayıcı ortamı yok');
    return reasons;
  }
  if (!window.isSecureContext) reasons.push('❌ HTTPS gerekli');
  if (!('serviceWorker' in navigator)) reasons.push('❌ Service Worker bulunamadı');
  if (!('PushManager' in window)) reasons.push('❌ PushManager desteklenmiyor');
  if (!('Notification' in window)) reasons.push('❌ Notification API desteklenmiyor');
  return reasons;
}

export function isLikelyMobile() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touch = navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && window.innerWidth < 900);
}

export function detectDeviceLabel() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    if (/Chrome/i.test(ua)) return 'Android Chrome';
    return 'Android';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    if (/CriOS/i.test(ua)) return 'iOS Chrome';
    if (/Safari/i.test(ua)) return 'iOS Safari';
    return 'iOS';
  }
  if (/Edg\//i.test(ua)) return 'Desktop Edge';
  if (/Chrome/i.test(ua)) return 'Desktop Chrome';
  if (/Firefox/i.test(ua)) return 'Desktop Firefox';
  if (/Safari/i.test(ua)) return 'Desktop Safari';
  return 'Bilinmeyen tarayıcı';
}

export function getPushPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      desktop: parsed?.desktop !== false,
      mobile: parsed?.mobile !== false,
    };
  } catch {
    return { desktop: true, mobile: true };
  }
}

export function setPushPrefs(next) {
  const prefs = { ...getPushPrefs(), ...next };
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  return prefs;
}

export function wantsPushOnThisDevice() {
  const prefs = getPushPrefs();
  return isLikelyMobile() ? prefs.mobile : prefs.desktop;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getVapidPublicKey() {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (fromEnv) return fromEnv;
  const data = await api('/notifications/push/vapid-public-key');
  return data.publicKey;
}

export async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (import.meta.env.DEV) console.log('[SW] waiting ready...');
  const reg = await navigator.serviceWorker.ready;
  if (import.meta.env.DEV) console.log('[SW] ready');
  return reg;
}

async function probeManifest() {
  try {
    const res = await fetch('/manifest.webmanifest', { cache: 'no-store' });
    if (res.status === 404) return { ok: false, status: '404' };
    if (!res.ok) return { ok: false, status: String(res.status) };
    const data = await res.json().catch(() => null);
    return {
      ok: true,
      status: 'OK',
      name: data?.name || null,
      display: data?.display || null,
    };
  } catch (err) {
    return { ok: false, status: 'ERR', error: err?.message || 'fetch failed' };
  }
}

export async function getPushDebug() {
  const install = getInstallState();
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const hasSwApi = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPush = typeof window !== 'undefined' && 'PushManager' in window;
  const hasNotif = typeof window !== 'undefined' && 'Notification' in window;
  const permission = hasNotif ? Notification.permission : 'denied';
  const standalone = install.installed;
  const bip = install.hasPrompt ? 'Hazır' : install.installed ? 'Kurulu' : 'Bekleniyor';

  const base = {
    device: detectDeviceLabel(),
    secureContext: secure,
    serviceWorkerApi: hasSwApi,
    swActive: false,
    pushManager: hasPush,
    notificationApi: hasNotif,
    permission,
    subscriptionLocal: false,
    standalone,
    beforeInstallPrompt: bip,
    canInstall: install.canInstall,
    manifest: { ok: false, status: '—' },
    blockers: getPushBlockers(),
  };

  base.manifest = await probeManifest();

  if (!hasSwApi) return base;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    base.swActive = Boolean(reg?.active);
    if (hasPush && reg?.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      base.subscriptionLocal = Boolean(sub);
    }
  } catch {
    /* ignore */
  }
  return base;
}

export async function getPushStatus() {
  const debug = await getPushDebug();
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: debug.permission,
      subscribed: false,
      configured: false,
      lastSeenAt: null,
      devices: 0,
      blockers: debug.blockers,
      debug,
    };
  }
  let subscribed = debug.subscriptionLocal;
  let configured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
  let lastSeenAt = null;
  let devices = 0;
  try {
    const data = await api('/notifications/push/status');
    configured = data.configured;
    if (data.subscribed) subscribed = true;
    lastSeenAt = data.lastSeenAt || null;
    devices = data.devices || 0;
  } catch {
    /* ignore */
  }
  return {
    supported: true,
    permission: debug.permission,
    subscribed,
    configured,
    lastSeenAt,
    devices,
    blockers: [],
    debug,
  };
}

export async function subscribePush() {
  const blockers = getPushBlockers();
  if (blockers.length) throw new Error(blockers[0].replace(/^❌\s*/, ''));
  if (!wantsPushOnThisDevice()) throw new Error('Bu cihaz türü için bildirimler kapalı');

  if (import.meta.env.DEV) console.log('[Push] requesting permission...');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bildirim izni verilmedi');

  const reg = await ensureServiceWorker();
  if (!reg?.pushManager) throw new Error('Service Worker hazır değil');

  const publicKey = await getVapidPublicKey();
  if (!publicKey) throw new Error('VAPID anahtarı yapılandırılmamış');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    if (import.meta.env.DEV) console.log('[Push] subscribing...');
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  await api('/notifications/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      expirationTime: json.expirationTime ?? null,
    },
  });
  if (import.meta.env.DEV) console.log('Push subscribed');
  return sub;
}

export async function unsubscribePush() {
  if (!isPushSupported()) return;
  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager?.getSubscription();
  const endpoint = sub?.endpoint;
  if (sub) await sub.unsubscribe();
  try {
    await api('/notifications/push/unsubscribe', {
      method: 'DELETE',
      body: endpoint ? { endpoint } : {},
    });
  } catch {
    /* ignore if logged out */
  }
}

export async function sendTestPush() {
  return api('/notifications/push/test', { method: 'POST', body: {} });
}

export async function syncPushAfterLogin() {
  if (!isPushSupported() || !wantsPushOnThisDevice()) return;
  if (Notification.permission === 'denied') return;
  try {
    if (Notification.permission === 'granted') {
      await subscribePush();
    }
  } catch {
    /* silent */
  }
}
