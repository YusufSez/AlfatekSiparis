import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import {
  authMiddleware,
  clientMeta,
  publicUser,
  requireRoles,
} from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { getSettings, writeAudit, getPresenceForOffice } from '../orders/orders.domain.js';
import { getDashboardStats, globalSearch } from './admin.analytics.js';

const router = Router();
router.use(authMiddleware, requireRoles('admin'));

router.get('/dashboard', async (_req, res, next) => {
  try {
    res.json(await getDashboardStats());
  } catch (e) {
    next(e);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const parsed = z.object({ q: z.string().min(1) }).safeParse(req.query);
    if (!parsed.success) throw httpError(400, 'q parametresi gerekli');
    res.json({ q: parsed.data.q, results: await globalSearch(parsed.data.q) });
  } catch (e) {
    next(e);
  }
});

router.get('/offices', async (_req, res, next) => {
  try {
    const offices = await prisma.office.findMany({ orderBy: { name: 'asc' } });
    res.json({ offices });
  } catch (e) {
    next(e);
  }
});

router.post('/offices', async (req, res, next) => {
  try {
    const parsed = z
      .object({ name: z.string().min(1), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz ofis');
    const office = await prisma.office.create({
      data: { name: parsed.data.name.trim(), color: parsed.data.color || '#1B6B4A' },
    });
    await writeAudit(req.user.id, 'admin.office_create', office, clientMeta(req));
    res.status(201).json({ office });
  } catch (e) {
    next(e.status ? e : httpError(400, 'Ofis adı kullanılıyor olabilir'));
  }
});

router.patch('/offices/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({ name: z.string().min(1).optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz veri');
    const office = await prisma.office.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
      },
    });
    await writeAudit(req.user.id, 'admin.office_update', office, clientMeta(req));
    res.json({ office });
  } catch (e) {
    next(e.status ? e : httpError(404, 'Ofis güncellenemedi'));
  }
});

router.delete('/offices/:id', async (req, res, next) => {
  try {
    const users = await prisma.user.count({
      where: { officeId: req.params.id, deletedAt: null },
    });
    if (users > 0) throw httpError(400, 'Önce ofisteki kullanıcıları taşıyın veya silin');
    await prisma.office.delete({ where: { id: req.params.id } });
    await writeAudit(req.user.id, 'admin.office_delete', { id: req.params.id }, clientMeta(req));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { office: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users: users.map(publicUser) });
  } catch (e) {
    next(e);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        name: z.string().min(1),
        username: z.string().min(2),
        password: z.string().min(8),
        role: z.enum(['admin', 'office_user', 'kitchen']),
        officeId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz kullanıcı');
    if (parsed.data.role === 'office_user' && !parsed.data.officeId) {
      throw httpError(400, 'Ofis kullanıcısı için ofis seçilmeli');
    }
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        username: parsed.data.username.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        role: parsed.data.role,
        officeId: parsed.data.role === 'office_user' ? parsed.data.officeId : null,
        active: parsed.data.active ?? true,
      },
      include: { office: true },
    });
    await writeAudit(req.user.id, 'admin.user_create', { id: user.id }, clientMeta(req));
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    next(e.status ? e : httpError(400, 'Kullanıcı adı kullanılıyor olabilir'));
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        name: z.string().min(1).optional(),
        password: z.string().min(8).optional(),
        role: z.enum(['admin', 'office_user', 'kitchen']).optional(),
        officeId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz veri');

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) throw httpError(404, 'Kullanıcı bulunamadı');

    const data = {};
    if (parsed.data.name) data.name = parsed.data.name.trim();
    if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.role === 'admin' || parsed.data.role === 'kitchen') data.officeId = null;
    else if (parsed.data.officeId !== undefined) data.officeId = parsed.data.officeId;

    const nextRole = data.role ?? existing.role;
    const nextOfficeId =
      data.officeId !== undefined ? data.officeId : existing.officeId;
    if (nextRole === 'office_user' && !nextOfficeId) {
      throw httpError(400, 'Ofis kullanıcısı için ofis seçilmeli');
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: { office: true },
    });
    await writeAudit(req.user.id, 'admin.user_update', { id: user.id }, clientMeta(req));
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e.status ? e : httpError(404, 'Kullanıcı güncellenemedi'));
  }
});

/**
 * Permanent delete via anonymization — keeps order/audit FK integrity.
 * Row remains; PII cleared; login impossible; hidden from admin lists.
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      throw httpError(400, 'Kendi hesabınızı silemezsiniz');
    }

    const existing = await prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
    });
    if (!existing) throw httpError(404, 'Kullanıcı bulunamadı');

    if (existing.role === 'admin' && existing.active) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: 'admin', active: true, deletedAt: null, id: { not: targetId } },
      });
      if (otherActiveAdmins < 1) {
        throw httpError(400, 'Son aktif admin hesabı silinemez');
      }
    }

    const tombstoneUsername = `deleted_${existing.id}`;
    const passwordHash = await bcrypt.hash(
      `deleted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      10
    );

    await prisma.$transaction(async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { userId: targetId } });
      await tx.userNotification.deleteMany({ where: { userId: targetId } });
      await tx.user.update({
        where: { id: targetId },
        data: {
          name: 'Silinmiş Kullanıcı',
          username: tombstoneUsername,
          passwordHash,
          officeId: null,
          active: false,
          deletedAt: new Date(),
        },
      });
    });

    await writeAudit(
      req.user.id,
      'admin.user_delete',
      { id: targetId, previousUsername: existing.username, previousRole: existing.role },
      clientMeta(req)
    );
    res.json({ ok: true, id: targetId });
  } catch (e) {
    next(e.status ? e : httpError(400, 'Kullanıcı silinemedi'));
  }
});

router.get('/menu-items', async (_req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.post('/menu-items', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        name: z.string().min(1),
        icon: z.string().optional(),
        sortOrder: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz ürün');
    const item = await prisma.menuItem.create({
      data: {
        name: parsed.data.name.trim(),
        icon: parsed.data.icon || 'cup',
        sortOrder: parsed.data.sortOrder ?? 0,
        active: parsed.data.active ?? true,
      },
    });
    await writeAudit(req.user.id, 'admin.menu_create', item, clientMeta(req));
    res.status(201).json({ item });
  } catch (e) {
    next(e.status ? e : httpError(400, 'Ürün adı kullanılıyor olabilir'));
  }
});

router.patch('/menu-items/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        name: z.string().min(1).optional(),
        icon: z.string().optional(),
        sortOrder: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz veri');
    const item = await prisma.menuItem.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });
    await writeAudit(req.user.id, 'admin.menu_update', item, clientMeta(req));
    res.json({ item });
  } catch (e) {
    next(e.status ? e : httpError(404, 'Ürün güncellenemedi'));
  }
});

router.put('/menu-items/reorder', async (req, res, next) => {
  try {
    const parsed = z
      .object({ orderedIds: z.array(z.string().min(1)).min(1) })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz sıralama');
    await prisma.$transaction(
      parsed.data.orderedIds.map((id, index) =>
        prisma.menuItem.update({ where: { id }, data: { sortOrder: index + 1 } })
      )
    );
    await writeAudit(req.user.id, 'admin.menu_reorder', parsed.data, clientMeta(req));
    const items = await prisma.menuItem.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    res.json({ settings: await getSettings() });
  } catch (e) {
    next(e);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        sessionDurationSec: z.number().int().min(30).max(3600).optional(),
        companyName: z.string().min(1).optional(),
        notificationSound: z.boolean().optional(),
        autoClose: z.boolean().optional(),
        workingHoursStart: z.string().optional(),
        workingHoursEnd: z.string().optional(),
        config: z.record(z.any()).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz ayar');

    const settings = await prisma.appSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        sessionDurationSec: parsed.data.sessionDurationSec ?? 120,
        companyName: parsed.data.companyName ?? 'Ofis Sipariş',
        notificationSound: parsed.data.notificationSound ?? true,
        autoClose: parsed.data.autoClose ?? true,
        workingHoursStart: parsed.data.workingHoursStart ?? '08:00',
        workingHoursEnd: parsed.data.workingHoursEnd ?? '19:00',
        config: JSON.stringify(parsed.data.config ?? {}),
      },
      update: {
        ...(parsed.data.sessionDurationSec !== undefined
          ? { sessionDurationSec: parsed.data.sessionDurationSec }
          : {}),
        ...(parsed.data.companyName !== undefined
          ? { companyName: parsed.data.companyName }
          : {}),
        ...(parsed.data.notificationSound !== undefined
          ? { notificationSound: parsed.data.notificationSound }
          : {}),
        ...(parsed.data.autoClose !== undefined ? { autoClose: parsed.data.autoClose } : {}),
        ...(parsed.data.workingHoursStart !== undefined
          ? { workingHoursStart: parsed.data.workingHoursStart }
          : {}),
        ...(parsed.data.workingHoursEnd !== undefined
          ? { workingHoursEnd: parsed.data.workingHoursEnd }
          : {}),
        ...(parsed.data.config !== undefined
          ? { config: JSON.stringify(parsed.data.config) }
          : {}),
      },
    });
    await writeAudit(req.user.id, 'admin.settings', settings, clientMeta(req));
    res.json({ settings: await getSettings() });
  } catch (e) {
    next(e);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const take = Math.min(200, Number(req.query.take) || 100);
    const action = req.query.action ? String(req.query.action) : undefined;
    const logs = await prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      include: { actor: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        actor: l.actor,
        payload: JSON.parse(l.payload),
        ip: l.ip,
        userAgent: l.userAgent,
        requestId: l.requestId,
        createdAt: l.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/presence', async (_req, res, next) => {
  try {
    const offices = await prisma.office.findMany({ orderBy: { name: 'asc' } });
    const result = [];
    for (const o of offices) {
      result.push({ office: o, users: await getPresenceForOffice(o.id) });
    }
    res.json({ offices: result });
  } catch (e) {
    next(e);
  }
});

export default router;
