import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import { authMiddleware, requireRoles } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { notificationService } from './notification.service.js';
import {
  deletePushSubscription,
  getVapidPublicKey,
  upsertPushSubscription,
} from './push.service.js';

const router = Router();
router.use(authMiddleware);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const take = Math.min(100, Number(req.query.take) || 40);
    const list = await prisma.userNotification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json({
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        event: n.event,
        payload: JSON.parse(n.payload),
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
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

router.get('/push/vapid-public-key', async (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: 'Push bildirimleri yapılandırılmamış' });
    return;
  }
  res.json({ publicKey: key, configured: true });
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
        payload: JSON.parse(e.payload),
        requestId: e.requestId,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
