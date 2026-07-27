import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db.js';
import { authMiddleware, clientMeta, requireRoles } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { serializeTicket, updateTicketStatus } from '../orders/orders.domain.js';

const router = Router();
router.use(authMiddleware, requireRoles('kitchen', 'admin'));

router.get('/tickets', async (req, res, next) => {
  try {
    const status = req.query.status;
    const where =
      status && ['new', 'preparing', 'ready', 'delivered'].includes(String(status))
        ? { status: String(status) }
        : { status: { in: ['new', 'preparing', 'ready'] } };

    const tickets = await prisma.kitchenTicket.findMany({
      where,
      include: { office: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ tickets: tickets.map(serializeTicket) });
  } catch (err) {
    next(err);
  }
});

router.patch('/tickets/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({ status: z.enum(['preparing', 'ready', 'delivered']) })
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

export default router;
