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

/** True when this device has an active PushManager subscription (sync-friendly for notify policy). */
export async function hasLocalPushSubscription() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    return Boolean(sub?.endpoint);
  } catch {
    return false;
  }
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
  if (!isPushSupported()) {
    console.warn('[push] subscribe skipped — not supported');
    throw new Error('Bu tarayıcı push bildirimini desteklemiyor');
  }
  if (!wantsPushOnThisDevice()) {
    console.warn('[push] subscribe skipped — device pref off');
    throw new Error('Bu cihaz türü için bildirimler kapalı');
  }

  const permission = await Notification.requestPermission();
  console.info('[push] permission', { permission });
  if (permission !== 'granted') {
    console.warn('[push] subscribe failed — permission denied');
    throw new Error('Bildirim izni verilmedi');
  }

  const reg = await ensureServiceWorker();
  if (!reg?.pushManager) {
    console.error('[push] subscribe failed — no PushManager');
    throw new Error('Service worker hazır değil');
  }

  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    console.error('[push] subscribe failed — no VAPID public key');
    throw new Error('VAPID anahtarı yapılandırılmamış');
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existing = sub.toJSON();
    if (!existing?.keys?.p256dh || !existing?.keys?.auth) {
      console.warn('[push] existing subscription missing keys — unsubscribing');
      await sub.unsubscribe();
      sub = null;
    } else {
      console.info('[push] reusing existing PushManager subscription', {
        endpoint: String(existing.endpoint || '').slice(0, 48),
      });
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      console.info('[push] PushManager.subscribe ok');
    } catch (err) {
      console.error('[push] PushManager.subscribe failed', err?.message || err);
      throw new Error(friendlySubscribeError(err));
    }
  }

  const json = sub.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
    console.error('[push] subscription keys incomplete');
    throw new Error('Tarayıcı subscription anahtarları eksik');
  }

  try {
    await api('/notifications/push/subscribe', {
      method: 'POST',
      body: {
        endpoint: json.endpoint,
        keys: json.keys,
        expirationTime: json.expirationTime ?? null,
      },
    });
  } catch (err) {
    console.error('[push] endpoint save failed', err?.message || err);
    throw err;
  }

  setPushPrefForThisDevice(true);
  console.info('[push] subscription saved', {
    endpoint: String(json.endpoint).slice(0, 48),
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    permission: Notification.permission,
  });
  return sub;
}

export async function unsubscribePush({ clearPref = true } = {}) {
  // clearPref only when the user opts out in settings — never on logout.
  if (clearPref) {
    setPushPrefForThisDevice(false);
  }

  if (!isPushSupported()) {
    console.info('[push] unsubscribe skipped — not supported');
    return;
  }
  const reg = await ensureServiceWorker();
  const sub = await reg?.pushManager?.getSubscription();
  const endpoint = sub?.endpoint;
  if (sub) {
    try {
      await sub.unsubscribe();
      console.info('[push] PushManager.unsubscribe ok', {
        endpoint: String(endpoint || '').slice(0, 48),
      });
    } catch (err) {
      console.warn('[push] PushManager.unsubscribe failed', err?.message || err);
    }
  } else {
    console.info('[push] unsubscribe — no local subscription');
  }
  try {
    await api('/notifications/push/unsubscribe', {
      method: 'DELETE',
      body: endpoint ? { endpoint } : {},
    });
    console.info('[push] server unsubscribe ok');
  } catch (err) {
    console.warn('[push] server unsubscribe failed', err?.message || err);
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
  if (!isPushSupported()) {
    console.info('[push] syncAfterLogin skipped — not supported');
    return;
  }
  if (!wantsPushOnThisDevice()) {
    console.info('[push] syncAfterLogin skipped — device pref off');
    return;
  }
  if (Notification.permission !== 'granted') {
    console.info('[push] syncAfterLogin skipped — permission', {
      permission: Notification.permission,
    });
    return;
  }
  try {
    await subscribePush();
    console.info('[push] syncAfterLogin success');
  } catch (err) {
    console.error('[push] syncAfterLogin failed', err?.message || err);
  }
}
