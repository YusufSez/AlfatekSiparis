import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import {
  authMiddleware,
  clientMeta,
  publicUser,
  signToken,
} from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { writeAudit } from '../orders/orders.domain.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
        remember: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Kullanıcı adı ve şifre gerekli');

    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username.trim().toLowerCase() },
      include: { office: true },
    });
    if (!user || !user.active) throw httpError(401, 'Geçersiz giriş bilgileri');
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) throw httpError(401, 'Geçersiz giriş bilgileri');

    const remember = parsed.data.remember !== false;
    await writeAudit(
      user.id,
      'auth.login',
      { username: user.username, remember },
      clientMeta(req)
    );
    res.json({
      token: signToken(user, { remember }),
      user: publicUser(user),
      expiresIn: remember ? '7d' : '1d',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/** Profil istatistikleri — salt okunur, iş kurallarını değiştirmez; role göre alanlar değişir */
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'kitchen') {
      const audits = await prisma.auditLog.findMany({
        where: {
          actorId: userId,
          action: { in: ['kitchen.preparing', 'kitchen.delivered'] },
        },
        select: { action: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 80,
      });

      const ticketMeta = new Map();
      for (const row of audits) {
        let ticketId = null;
        try {
          ticketId = JSON.parse(row.payload || '{}')?.ticketId || null;
        } catch {
          ticketId = null;
        }
        if (!ticketId || ticketMeta.has(ticketId)) continue;
        ticketMeta.set(ticketId, { action: row.action, at: row.createdAt });
      }

      const ticketIds = [...ticketMeta.keys()];
      const tickets = ticketIds.length
        ? await prisma.kitchenTicket.findMany({
            where: { id: { in: ticketIds } },
            include: { office: { select: { id: true, name: true, color: true } } },
          })
        : [];
      const byId = new Map(tickets.map((t) => [t.id, t]));

      const recentPrepared = ticketIds
        .slice(0, 10)
        .map((id) => {
          const ticket = byId.get(id);
          const meta = ticketMeta.get(id);
          if (!ticket || !meta) return null;
          let summary = [];
          try {
            summary = JSON.parse(ticket.summaryJson || '[]');
          } catch {
            summary = [];
          }
          return {
            id: ticket.id,
            office: ticket.office?.name || null,
            status: ticket.status,
            action: meta.action,
            at: meta.at || ticket.updatedAt,
            summary: summary.map((s) => `${s.qty}× ${s.name}`).join(', '),
          };
        })
        .filter(Boolean);

      return res.json({
        user: publicUser(req.user),
        stats: {
          preparedTickets: ticketIds.length,
          recentPrepared,
        },
      });
    }

    const [openedCount, lines, recentLines, joinedSessions] = await Promise.all([
      prisma.orderSession.count({ where: { openedById: userId } }),
      prisma.orderLine.findMany({
        where: { userId, qty: { gt: 0 } },
        select: {
          qty: true,
          menuItemId: true,
          menuItem: { select: { name: true, icon: true } },
        },
      }),
      prisma.orderLine.findMany({
        where: { userId },
        include: {
          menuItem: { select: { id: true, name: true, icon: true } },
          session: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              confirmedAt: true,
              office: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      }),
      prisma.orderLine.findMany({
        where: { userId },
        select: { sessionId: true },
        distinct: ['sessionId'],
      }),
    ]);

    const productTotals = new Map();
    for (const line of lines) {
      const key = line.menuItem?.name || line.menuItemId;
      productTotals.set(key, (productTotals.get(key) || 0) + line.qty);
    }
    let topProduct = null;
    for (const [name, qty] of productTotals) {
      if (!topProduct || qty > topProduct.qty) topProduct = { name, qty };
    }

    res.json({
      user: publicUser(req.user),
      stats: {
        openedSessions: openedCount,
        joinedSessions: joinedSessions.length,
        topProduct,
        recentOrders: recentLines.map((l) => ({
          id: l.id,
          qty: l.qty,
          product: l.menuItem?.name,
          icon: l.menuItem?.icon,
          status: l.session?.status,
          office: l.session?.office?.name || null,
          at: l.updatedAt || l.session?.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/password', authMiddleware, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Mevcut ve yeni şifre gerekli (min 8 karakter)');

    const ok = await bcrypt.compare(parsed.data.currentPassword, req.user.passwordHash);
    if (!ok) throw httpError(400, 'Mevcut şifre hatalı');

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
    });
    await writeAudit(req.user.id, 'auth.password_change', {}, clientMeta(req));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
