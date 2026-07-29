import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, clientMeta, requireRoles, requirePasswordChanged } from '../../common/auth.js';
import { httpError } from '../../common/errors.js';
import { safeJsonParse } from '../../common/safeJson.js';
import {
  cancelSession,
  callKitchenStaff,
  confirmSession,
  findActiveTicketForOffice,
  getOfficeOrderHistory,
  getPresenceForOffice,
  leaveSession,
  openSession,
  serializeSession,
  serializeTicket,
  setSpecialRequest,
  skipSession,
  upsertLine,
} from './orders.domain.js';
import { ordersRepository } from './orders.repository.js';
import { prisma } from '../../common/db.js';

const router = Router();

router.use(authMiddleware, requirePasswordChanged);

router.post('/staff-call', requireRoles('office_user'), async (req, res, next) => {
  try {
    const result = await callKitchenStaff(req.user, clientMeta(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/active', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const officeId = req.user.role === 'admin' ? req.query.officeId : req.user.officeId;
    if (!officeId) return res.json({ session: null, activeTicket: null });
    const session = await ordersRepository.findCollecting(String(officeId));
    const activeTicket = session
      ? null
      : await findActiveTicketForOffice(String(officeId));
    res.json({
      session: session ? await serializeSession(session) : null,
      activeTicket,
    });
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

/** Recent finished orders for the office — delivered + cancelled (OfficePage history). */
router.get('/history', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const officeId = req.user.role === 'admin' ? req.query.officeId : req.user.officeId;
    if (!officeId) return res.json({ tickets: [], entries: [], limit: 0 });
    const rawLimit = Number(req.query.limit ?? req.query.take ?? 20);
    const limit = Math.min(20, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));
    const history = await getOfficeOrderHistory(String(officeId), limit);
    res.json(history);
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
        note: z.string().max(120).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Geçersiz kalem');
    const session = await upsertLine(
      req.user,
      req.params.id,
      parsed.data.menuItemId,
      parsed.data.qty,
      clientMeta(req),
      parsed.data.note ?? null
    );
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/special-request', requireRoles('office_user'), async (req, res, next) => {
  try {
    const parsed = z
      .object({
        note: z.string().max(200).optional().nullable(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) throw httpError(400, 'Geçersiz özel istek');
    const session = await setSpecialRequest(
      req.user,
      req.params.id,
      parsed.data.note ?? '',
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

router.post('/:id/skip', requireRoles('office_user'), async (req, res, next) => {
  try {
    const session = await skipSession(req.user, req.params.id, clientMeta(req));
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', requireRoles('office_user', 'admin'), async (req, res, next) => {
  try {
    const session = await cancelSession(req.user, req.params.id, clientMeta(req));
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
