import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, clientMeta, requireRoles } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import {
  confirmSession,
  getPresenceForOffice,
  leaveSession,
  openSession,
  serializeSession,
  upsertLine,
} from './orders.domain.js';
import { ordersRepository } from './orders.repository.js';

const router = Router();

router.use(authMiddleware);

router.get('/active', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const officeId = req.user.role === 'admin' ? req.query.officeId : req.user.officeId;
    if (!officeId) return res.json({ session: null });
    const session = await ordersRepository.findCollecting(String(officeId));
    res.json({ session: session ? await serializeSession(session) : null });
  } catch (err) {
    next(err);
  }
});

router.get('/presence', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const officeId = req.user.role === 'admin' ? req.query.officeId : req.user.officeId;
    if (!officeId) return res.json({ users: [] });
    res.json({ users: await getPresenceForOffice(String(officeId)) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRoles('office_user'), async (req, res, next) => {
  try {
    const session = await openSession(req.user, clientMeta(req));
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/lines', requireRoles('office_user'), async (req, res, next) => {
  try {
    const parsed = z
      .object({
        menuItemId: z.string().min(1),
        qty: z.number().int().min(0).max(20),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz kalem');
    const session = await upsertLine(
      req.user,
      req.params.id,
      parsed.data.menuItemId,
      parsed.data.qty,
      clientMeta(req)
    );
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/leave', requireRoles('office_user'), async (req, res, next) => {
  try {
    const session = await leaveSession(req.user, req.params.id, clientMeta(req));
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/confirm', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const session = await confirmSession(req.user, req.params.id, clientMeta(req));
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const session = await ordersRepository.findSession(req.params.id);
    if (!session) throw httpError(404, 'Sipariş bulunamadı');
    if (req.user.role === 'office_user' && session.officeId !== req.user.officeId) {
      throw httpError(403, 'Yetkisiz');
    }
    const events = await ordersRepository.listEvents(req.params.id);
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
