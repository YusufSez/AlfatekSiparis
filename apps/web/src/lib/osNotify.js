/** Shared OS notification helpers — reduce duplicate browser toasts. */

export function notificationDedupeKey(n) {
  let p = n?.payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = {};
    }
  }
  if (!p || typeof p !== 'object') p = {};
  const orderId = p.ticketId || p.sessionId || '';
  const status = p.status || '';
  return `${n?.event || ''}|${orderId}|${status}|${n?.title || ''}`;
}

export function buildNotificationTag({ tag, event, payload } = {}) {
  if (tag) return String(tag);
  const p = payload && typeof payload === 'object' ? payload : {};
  if (p.ticketId) return `order-${p.ticketId}-${p.status || event || 'evt'}`;
  if (p.sessionId) return `order-${p.sessionId}-${event || 'evt'}`;
  if (event) return `evt-${event}`;
  return 'alfatek-notify';
}

/** Tab is in the foreground (visible). */
export function isAppForeground(visibilityState = globalThis.document?.visibilityState) {
  return visibilityState === 'visible';
}

/**
 * Browser Notification / push banner policy:
 * - Foreground → in-app only (caller shows toast/sound)
 * - Background → OS Notification only if no local push subscription (push covers that case)
 * - Closed app → service worker push only
 */
export function shouldShowOsNotification({
  visibilityState = globalThis.document?.visibilityState,
  hasPushSubscription = false,
} = {}) {
  if (isAppForeground(visibilityState)) return false;
  if (hasPushSubscription) return false;
  return true;
}

/** Service worker: suppress push UI when any window client is visible. */
export function shouldSuppressPushBanner(clients = []) {
  return (clients || []).some((c) => c?.visibilityState === 'visible');
}

/**
 * Show at most one OS notification per tag across tabs (≈2.5s window).
 * Skips when the app is foreground, or when push will deliver the same alert.
 */
export function showOsNotification(title, body, opts = {}) {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  if (!shouldShowOsNotification(opts)) return false;

  const tag = buildNotificationTag(opts);

  try {
    const lockKey = `alfatek-os-notify:${tag}`;
    const now = Date.now();
    const prev = Number(localStorage.getItem(lockKey) || 0);
    if (now - prev < 2500) return false;
    localStorage.setItem(lockKey, String(now));
  } catch {
    /* private mode / blocked storage */
  }

  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body: body || '', tag });
    return true;
  } catch {
    return false;
  }
}
