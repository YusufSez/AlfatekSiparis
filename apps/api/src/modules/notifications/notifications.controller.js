import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import { authMiddleware, requireRoles } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { notificationService } from './notification.service.js';
import { isNotificationEventAllowed } from './notificationAudience.js';
import { safeJsonParse } from '../../common/safeJson.js';
import {
  deletePushSubscription,
  getVapidPublicKey,
  isPushConfigured,
  upsertPushSubscription,
} from './push.service.js';

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});

/**
 * Public VAPID key — required before PushManager.subscribe.
 * Must stay unauthenticated (only the public key is exposed).
 */
router.get('/push/vapid-public-key', async (_req, res) => {
  const key = String(getVapidPublicKey() || '')
    .trim()
    .replace(/\s+/g, '');
  const configured = Boolean(key) && isPushConfigured();
  logger.info('push.vapid_public_key', {
    message: 'VAPID configured',
    configured,
    publicKeyLength: key.length,
  });
  if (!key) {
    res.status(503).json({ error: 'Push bildirimleri yapılandırılmamış' });
    return;
  }
  res.json({ publicKey: key, configured: true });
});

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const take = Math.min(100, Number(req.query.take) || 40);
    const list = await prisma.userNotification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, take * 3),
    });
    const role = req.user.role;
    const filtered = list
      .filter((n) => isNotificationEventAllowed(role, n.event))
      .slice(0, take)
      .map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        event: n.event,
        payload: safeJsonParse(n.payload, {}),
        readAt: n.readAt,
        createdAt: n.createdAt,
      }));
    res.json({ notifications: filtered });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await prisma.userNotification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/push/subscribe', async (req, res, next) => {
  try {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz subscription');
    const row = await upsertPushSubscription(req.user.id, {
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      userAgent: req.get('user-agent') || null,
    });
    logger.info('push.subscription_saved', {
      message: 'Subscription saved',
      userId: req.user.id,
      id: row.id,
      endpoint: row.endpoint.slice(0, 48),
    });
    res.json({
      ok: true,
      subscription: {
        id: row.id,
        endpoint: row.endpoint,
        createdAt: row.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/push/unsubscribe', async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint || req.query?.endpoint || null;
    await deletePushSubscription(req.user.id, endpoint || undefined);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/push/status', async (req, res, next) => {
  try {
    const rows = await prisma.pushSubscription.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    res.json({
      configured: notificationService.isPushConfigured(),
      subscribed: rows.length > 0,
      devices: rows.length,
      lastSeenAt: rows[0]?.updatedAt || null,
      subscriptions: rows.map((r) => ({
        id: r.id,
        userAgent: r.userAgent,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/push/test', async (req, res, next) => {
  try {
    if (!notificationService.isPushConfigured()) {
      throw httpError(503, 'Push bildirimleri yapılandırılmamış');
    }
    const count = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
    if (!count) {
      throw httpError(400, 'Bu cihazda push aboneliği yok. Önce bildirimleri açın.');
    }
    const result = await notificationService.sendPushToUser(req.user.id, {
      title: 'Alfatek Test Bildirimi',
      body: 'Bildirim sistemi başarıyla çalışıyor.',
      url: '/profile',
      event: 'push.test',
      tag: 'alfatek-push-test',
    });
    logger.info('push.test_sent', {
      message: 'Push test sent',
      userId: req.user.id,
      sent: result.sent,
    });
    res.json({ ok: true, sent: result.sent });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/sessions/:id/events', requireRoles('admin'), async (req, res, next) => {
  try {
    const events = await prisma.sessionEvent.findMany({
      where: { sessionId: req.params.id },
      include: { actor: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        actor: e.actor,
        payload: safeJsonParse(e.payload, {}),
        requestId: e.requestId,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
