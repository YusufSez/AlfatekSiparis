import { Router } from 'express';
import { prisma } from '../../common/db.js';
import {
  APP_VERSION,
  BUILD_DATE,
  isSocketReady,
  startedAt,
} from '../../common/runtime.js';
import { logger } from '../../common/logger.js';

const router = Router();

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (err) {
    logger.error('health.database', { message: err.message });
    return 'error';
  }
}

router.get('/health', async (_req, res) => {
  const database = await checkDatabase();
  const socket = isSocketReady() ? 'ok' : 'error';
  const status = database === 'ok' && socket === 'ok' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    database,
    socket,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

router.get('/version', (_req, res) => {
  const dbUrl = process.env.DATABASE_URL || '';
  const database = dbUrl.includes('postgresql') || dbUrl.includes('postgres')
    ? 'postgresql'
    : dbUrl.includes('mysql')
      ? 'mysql'
      : 'sqlite';

  res.json({
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    database,
    commit: process.env.GIT_COMMIT || process.env.COMMIT_SHA || null,
  });
});

export default router;
