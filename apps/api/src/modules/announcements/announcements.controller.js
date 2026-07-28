import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import {
  authMiddleware,
  clientMeta,
  requireRoles,
} from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { SocketEvents } from '../../common/sessionEventType.js';
import { notificationService } from '../notifications/notification.service.js';
import { writeAudit } from '../orders/orders.domain.js';

const router = Router();

function serialize(a) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    active: a.active,
    severity: a.severity,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    createdBy: a.createdBy,
  };
}

export async function listActiveAnnouncements() {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: [{ severity: 'desc' }, { startsAt: 'desc' }],
  });
  return rows.map(serialize);
}

async function broadcast() {
  const announcements = await listActiveAnnouncements();
  await notificationService.notify({
    event: SocketEvents.ANNOUNCEMENT,
    payload: { announcements },
    broadcast: true,
  });
  const top = announcements[0];
  if (top) {
    await notificationService.sendPushToAll({
      title: `📢 Duyuru: ${top.title}`,
      body: top.body,
      url: '/',
      event: SocketEvents.ANNOUNCEMENT,
      tag: `announce-${top.id}`,
    });
  }
}

router.get('/active', authMiddleware, async (_req, res, next) => {
  try {
    res.json({ announcements: await listActiveAnnouncements() });
  } catch (err) {
    next(err);
  }
});

router.use(authMiddleware, requireRoles('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ announcements: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

function parseOptionalDate(value, label) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(400, `Geçersiz ${label}`);
  return d;
}

router.post('/', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        title: z.string().min(1),
        body: z.string().min(1),
        active: z.boolean().optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz duyuru');

    const row = await prisma.announcement.create({
      data: {
        title: parsed.data.title.trim(),
        body: parsed.data.body.trim(),
        active: parsed.data.active ?? true,
        severity: parsed.data.severity ?? 'info',
        startsAt: parsed.data.startsAt
          ? parseOptionalDate(parsed.data.startsAt, 'başlangıç tarihi')
          : new Date(),
        endsAt: parsed.data.endsAt
          ? parseOptionalDate(parsed.data.endsAt, 'bitiş tarihi')
          : null,
        createdBy: req.user.id,
      },
    });
    await writeAudit(req.user.id, 'announcement.create', { id: row.id }, clientMeta(req));
    await broadcast();
    res.status(201).json({ announcement: serialize(row) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        title: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        active: z.boolean().optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz duyuru');

    const data = {};
    if (parsed.data.title) data.title = parsed.data.title.trim();
    if (parsed.data.body) data.body = parsed.data.body.trim();
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.severity) data.severity = parsed.data.severity;
    if (parsed.data.startsAt) data.startsAt = parseOptionalDate(parsed.data.startsAt, 'başlangıç tarihi');
    if (parsed.data.endsAt !== undefined) {
      data.endsAt = parsed.data.endsAt
        ? parseOptionalDate(parsed.data.endsAt, 'bitiş tarihi')
        : null;
    }

    const row = await prisma.announcement.update({
      where: { id: req.params.id },
      data,
    });
    await writeAudit(req.user.id, 'announcement.update', { id: row.id }, clientMeta(req));
    await broadcast();
    res.json({ announcement: serialize(row) });
  } catch (err) {
    next(err.status ? err : httpError(404, 'Duyuru bulunamadı'));
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    await writeAudit(req.user.id, 'announcement.delete', { id: req.params.id }, clientMeta(req));
    await broadcast();
    res.json({ ok: true });
  } catch (err) {
    next(err.status ? err : httpError(404, 'Duyuru silinemedi'));
  }
});

export default router;
