import { api, resolveApiBaseUrl } from './api';

const PREF_KEY = 'alfatek-push-prefs';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isLikelyMobile() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touch = navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && window.innerWidth < 900);
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

/** Persist opt-in/out for the current device type (desktop vs mobile). */
export function setPushPrefForThisDevice(enabled) {
  const key = isLikelyMobile() ? 'mobile' : 'desktop';
  return setPushPrefs({ [key]: Boolean(enabled) });
}

/** Normalize VAPID public key from env/API (strip quotes, CRLF, whitespace). */
export function normalizeVapidPublicKey(raw) {
  if (raw == null) return '';
  return String(raw)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '');
}

function urlBase64ToUint8Array(base64String) {
  const cleaned = normalizeVapidPublicKey(base64String);
  if (!cleaned) {
    throw new Error('applicationServerKey boş — VAPID public key yok');
  }
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/');
  let raw;
  try {
    raw = atob(base64);
  } catch {
    throw new Error('VAPID public key base64 değil');
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  if (out.byteLength !== 65) {
    throw new Error(`VAPID public key uzunluğu geçersiz: ${out.byteLength} (beklenen 65)`);
  }
  return out;
}

/**
 * Resolve VAPID public key.
 * 1) API (source of truth, matches private key) — public endpoint, no auth required
 * 2) import.meta.env.VITE_VAPID_PUBLIC_KEY fallback
 */
export async function getVapidPublicKey() {
  const fromEnv = normalizeVapidPublicKey(import.meta.env.VITE_VAPID_PUBLIC_KEY);

  let fromApi = '';
  try {
    const base = resolveApiBaseUrl();
    const res = await fetch(`${base}/notifications/push/vapid-public-key`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (res.ok) fromApi = normalizeVapidPublicKey(data?.publicKey);
  } catch {
    /* fall back to env */
  }

  return fromApi || fromEnv || null;
}

export async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

async function getLocalPushState() {
  const permission =
    typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  let subscriptionLocal = false;
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      subscriptionLocal = Boolean(sub);
    } catch {
      /* ignore */
    }
  }
  return { permission, subscriptionLocal };
}

export async function getPushStatus() {
  const local = await getLocalPushState();
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: local.permission,
      subscribed: false,
      configured: false,
      lastSeenAt: null,
      devices: 0,
    };
  }
  let subscribed = local.subscriptionLocal;
  let configured = Boolean(normalizeVapidPublicKey(import.meta.env.VITE_VAPID_PUBLIC_KEY));
  let lastSeenAt = null;
  let devices = 0;
  try {
    const data = await api('/notifications/push/status');
    configured = data.configured;
    // This-device UI: only local PushManager subscription counts as subscribed.
    // Backend may still list other devices — do not force this device "aktif".
    lastSeenAt = data.lastSeenAt || null;
    devices = data.devices || 0;
  } catch {
    /* ignore */
  }
  return {
    supported: true,
    permission: local.permission,
    subscribed,
    configured,
    lastSeenAt,
    devices,
  };
}

function friendlySubscribeError(err) {
  const raw = String(err?.message || err || '');
  if (
    /push service not available/i.test(raw) ||
    /push service error/i.test(raw) ||
    /registration failed.*push/i.test(raw) ||
    err?.name === 'AbortError' ||
    err?.name === 'NotSupportedError'
  ) {
    return 'Bu tarayıcı push bildirimlerini desteklemiyor. Chrome veya Edge ile deneyebilirsiniz.';
  }
  return raw || 'Push aboneliği başarısız';
}

export async function subscribePush() {
  if (!isPushSupported()) throw new Error('Bu tarayıcı push bildirimini desteklemiyor');
  if (!wantsPushOnThisDevice()) throw new Error('Bu cihaz türü için bildirimler kapalı');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bildirim izni verilmedi');

  const reg = await ensureServiceWorker();
  if (!reg?.pushManager) throw new Error('Service worker hazır değil');

  const publicKey = await getVapidPublicKey();
  if (!publicKey) throw new Error('VAPID anahtarı yapılandırılmamış');

  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existing = sub.toJSON();
    if (!existing?.keys?.p256dh || !existing?.keys?.auth) {
      await sub.unsubscribe();
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (err) {
      throw new Error(friendlySubscribeError(err));
    }
  }

  const json = sub.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
    throw new Error('Tarayıcı subscription anahtarları eksik');
  }

  await api('/notifications/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      expirationTime: json.expirationTime ?? null,
    },
  });
  setPushPrefForThisDevice(true);
  return sub;
}

export async function unsubscribePush({ clearPref = true } = {}) {
  // clearPref only when the user opts out in settings — never on logout.
  if (clearPref) {
    setPushPrefForThisDevice(false);
  }

  if (!isPushSupported()) return;
  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager?.getSubscription();
  const endpoint = sub?.endpoint;
  if (sub) {
    try {
      await sub.unsubscribe();
    } catch {
      /* ignore */
    }
  }
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

/**
 * After login: restore subscription only if this device still opted in.
 * Notification.permission === 'granted' alone must not re-subscribe.
 */
export async function syncPushAfterLogin() {
  if (!isPushSupported() || !wantsPushOnThisDevice()) return;
  if (Notification.permission !== 'granted') return;
  try {
    await subscribePush();
  } catch {
    /* silent — user can enable from profile */
  }
}
