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

/**
 * Show at most one OS notification per tag across tabs (≈2.5s window).
 */
export function showOsNotification(title, body, opts = {}) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const tag = buildNotificationTag(opts);

  try {
    const lockKey = `alfatek-os-notify:${tag}`;
    const now = Date.now();
    const prev = Number(localStorage.getItem(lockKey) || 0);
    if (now - prev < 2500) return;
    localStorage.setItem(lockKey, String(now));
  } catch {
    /* private mode / blocked storage */
  }

  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body: body || '', tag });
  } catch {
    /* ignore */
  }
}
