import { Router } from 'express';
import { authMiddleware } from '../../common/auth.js';
import { prisma } from '../../common/db.js';
import { getSettings } from '../orders/orders.domain.js';

const router = Router();

router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.get('/settings/public', authMiddleware, async (_req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({
      settings: {
        companyName: settings.companyName,
        notificationSound: settings.notificationSound,
        sessionDurationSec: settings.sessionDurationSec,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
