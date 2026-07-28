import { Router } from 'express';
import { prisma } from '../../common/db.js';
import { authMiddleware, requireRoles } from '../../common/auth.js';

const router = Router();
router.use(authMiddleware);

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
