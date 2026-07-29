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
    await webpush.sendNotification(toWebPushSubscription(row), JSON.stringify(payload), {
      TTL: 60 * 60 * 24,
      urgency: 'high',
    });
    logger.info('push.send_ok', {
      userId: row.userId,
      endpoint: row.endpoint.slice(0, 48),
      event: payload?.event || null,
      tag: payload?.tag || null,
    });
    return { ok: true, userId: row.userId, status: 201 };
  } catch (err) {
    const status = err?.statusCode;
    // Gone / invalid / unauthorized — drop stale endpoints (incl. iOS expiry quirks)
    if (status === 404 || status === 410 || status === 400 || status === 401 || status === 403) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
      logger.info('push.subscription_gone', {
        status,
        userId: row.userId,
        endpoint: row.endpoint.slice(0, 48),
        event: payload?.event || null,
      });
      return { ok: false, userId: row.userId, status, gone: true };
    }
    logger.warn('push.send_failed', {
      status,
      userId: row.userId,
      message: err?.message,
      event: payload?.event || null,
    });
    return { ok: false, userId: row.userId, status: status || null, gone: false };
  }
}

/**
 * @param {string[]} userIds
 * @param {{ title: string, body: string, url?: string, event?: string, tag?: string }} note
 */
export async function sendPushToUsers(userIds, note) {
  if (!isPushConfigured()) {
    configureVapid();
    if (!isPushConfigured()) {
      logger.warn('push.send_skipped_vapid', {
        event: note?.event || null,
        userCount: (userIds || []).length,
      });
      return { sent: 0, attempted: 0, users: 0, gone: 0 };
    }
  }
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) {
    logger.info('push.send_skipped_no_users', { event: note?.event || null });
    return { sent: 0, attempted: 0, users: 0, gone: 0 };
  }

  let rows;
  try {
    rows = await prisma.pushSubscription.findMany({
      where: { userId: { in: unique } },
    });
  } catch (err) {
    logger.warn('push.subscription_query_failed', { message: err?.message });
    return { sent: 0, attempted: 0, users: unique.length, gone: 0 };
  }

  logger.info('push.send_start', {
    event: note?.event || null,
    tag: note?.tag || null,
    targetUsers: unique.length,
    subscriptions: rows.length,
    userIdsWithSub: [...new Set(rows.map((r) => r.userId))].length,
  });

  if (!rows.length) {
    logger.info('push.send_no_subscriptions', {
      event: note?.event || null,
      targetUsers: unique.length,
    });
    return { sent: 0, attempted: 0, users: unique.length, gone: 0 };
  }

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
  const sent = results.filter((r) => r.ok).length;
  const gone = results.filter((r) => r.gone).length;
  logger.info('push.send_done', {
    event: note?.event || null,
    tag: note?.tag || null,
    sent,
    attempted: rows.length,
    users: unique.length,
    gone,
  });
  return { sent, attempted: rows.length, users: unique.length, gone };
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
  const row = await prisma.pushSubscription.upsert({
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
  logger.info('push.subscription_upserted', {
    userId,
    id: row.id,
    endpoint: endpoint.slice(0, 48),
    userAgent: userAgent ? String(userAgent).slice(0, 80) : null,
  });
  return row;
}

export async function deletePushSubscription(userId, endpoint) {
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return;
  }
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}
