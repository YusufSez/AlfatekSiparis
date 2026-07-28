import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import { authMiddleware, clientMeta, requireRoles } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { serializeTicket, updateTicketStatus, reportTicketUnavailable } from '../orders/orders.domain.js';

const router = Router();
router.use(authMiddleware, requireRoles('kitchen', 'admin'));

router.get('/tickets', async (req, res, next) => {
  try {
    const status = req.query.status;
    const where =
      status && ['new', 'preparing', 'delivered'].includes(String(status))
        ? { status: String(status) }
        : { status: { in: ['new', 'preparing'] } };

    const take = Math.min(50, Math.max(1, Number(req.query.take) || 50));
    const tickets = await prisma.kitchenTicket.findMany({
      where,
      include: { office: true },
      orderBy: status === 'delivered' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
      take: status === 'delivered' ? Math.min(take, 20) : take,
    });
    res.json({ tickets: tickets.map(serializeTicket) });
  } catch (err) {
    next(err);
  }
});

router.patch('/tickets/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({ status: z.enum(['preparing', 'delivered']) })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz durum');
    const ticket = await updateTicketStatus(
      req.user,
      req.params.id,
      parsed.data.status,
      clientMeta(req)
    );
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.post('/tickets/:id/unavailable', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        items: z
          .array(
            z.object({
              menuItemId: z.string().optional().nullable(),
              name: z.string().min(1).max(80),
            })
          )
          .min(1)
          .max(30),
        note: z.string().max(200).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz eksik ürün bildirimi');
    const result = await reportTicketUnavailable(
      req.user,
      req.params.id,
      parsed.data,
      clientMeta(req)
    );
    res.json({ ok: true, report: result });
  } catch (err) {
    next(err);
  }
});

export default router;
