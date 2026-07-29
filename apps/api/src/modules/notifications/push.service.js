import webpush from 'web-push';
import { prisma } from '../../common/db.js';
import { logger } from '../../common/logger.js';

let vapidReady = false;

export function configureVapid() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '')
    .trim()
    .replace(/\s+/g, '');
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '')
    .trim()
    .replace(/\s+/g, '');
  const email = String(process.env.VAPID_EMAIL || 'mailto:admin@localhost').trim();
  if (!publicKey || !privateKey) {
    logger.warn('push.vapid_missing', { hint: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY' });
    vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(email.startsWith('mailto:') ? email : `mailto:${email}`, publicKey, privateKey);
    vapidReady = true;
    logger.info('push.vapid_configured', {
      message: 'VAPID configured',
      publicKeyLength: publicKey.length,
    });
    return true;
  } catch (err) {
    logger.warn('push.vapid_invalid', {
      message: 'VAPID keys rejected',
      detail: err?.message || String(err),
    });
    vapidReady = false;
    return false;
  }
}

export function getVapidPublicKey() {
  const key = String(process.env.VAPID_PUBLIC_KEY || '')
    .trim()
    .replace(/\s+/g, '');
  return key || null;
}

export function isPushConfigured() {
  const pub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  return vapidReady || Boolean(pub && priv);
}

function toWebPushSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function sendToSubscription(row, payload) {
  try {
    await webpush.sendNotification(toWebPushSubscription(row), JSON.stringify(payload));
    return true;
  } catch (err) {
    const status = err?.statusCode;
    // Gone / invalid / unauthorized — drop stale endpoints (incl. iOS expiry quirks)
    if (status === 404 || status === 410 || status === 400 || status === 401 || status === 403) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
      logger.info('push.subscription_gone', {
        status,
        endpoint: row.endpoint.slice(0, 48),
      });
    } else {
      logger.warn('push.send_failed', { status, message: err?.message });
    }
    return false;
  }
}

/**
 * @param {string[]} userIds
 * @param {{ title: string, body: string, url?: string, event?: string, tag?: string }} note
 */
export async function sendPushToUsers(userIds, note) {
  if (!isPushConfigured()) {
    configureVapid();
    if (!isPushConfigured()) return { sent: 0 };
  }
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return { sent: 0 };

  let rows;
  try {
    rows = await prisma.pushSubscription.findMany({
      where: { userId: { in: unique } },
    });
  } catch (err) {
    logger.warn('push.subscription_query_failed', { message: err?.message });
    return { sent: 0 };
  }
  if (!rows.length) return { sent: 0 };

  const payload = {
    title: note.title || 'Alfatek Sipariş',
    body: note.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    url: note.url || '/',
    event: note.event || null,
    tag: note.tag || note.event || 'alfatek',
  };

  const results = await Promise.all(rows.map((row) => sendToSubscription(row, payload)));
  return { sent: results.filter(Boolean).length };
}

export async function sendPushToUser(userId, note) {
  return sendPushToUsers([userId], note);
}

export async function sendPushToRole(role, note) {
  const users = await prisma.user.findMany({
    where: { role, active: true },
    select: { id: true },
  });
  return sendPushToUsers(
    users.map((u) => u.id),
    note
  );
}

export async function sendPushToAll(note) {
  const rows = await prisma.pushSubscription.findMany({ select: { userId: true } });
  return sendPushToUsers(
    rows.map((r) => r.userId),
    note
  );
}

export async function upsertPushSubscription(userId, { endpoint, keys, userAgent }) {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Geçersiz push subscription');
  }
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    },
    update: {
      userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    },
  });
}

export async function deletePushSubscription(userId, endpoint) {
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return;
  }
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}
