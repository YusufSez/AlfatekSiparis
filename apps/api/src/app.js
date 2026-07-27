import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { requestIdMiddleware } from './common/requestId.js';
import { errorHandler } from './common/errors.js';
import { openApiSpec } from './common/openapi.js';
import { logger } from './common/logger.js';
import { metricsMiddleware, renderPrometheusMetrics } from './common/metrics.js';
import authRoutes from './modules/auth/auth.controller.js';
import sessionRoutes from './modules/orders/orders.controller.js';
import kitchenRoutes from './modules/kitchen/kitchen.controller.js';
import adminRoutes from './modules/admin/admin.controller.js';
import menuRoutes from './modules/menu/menu.controller.js';
import notificationRoutes from './modules/notifications/notifications.controller.js';
import announcementRoutes from './modules/announcements/announcements.controller.js';
import systemRoutes from './modules/system/system.controller.js';

export function createApp(corsOrigin) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);

  app.use((req, _res, next) => {
    logger.info('http', {
      method: req.method,
      path: req.path,
      requestId: req.requestId,
    });
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin.' },
  });

  app.use(systemRoutes);

  app.get('/metrics', async (_req, res, next) => {
    try {
      const body = await renderPrometheusMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(body);
    } catch (err) {
      next(err);
    }
  });

  if (!isProd) {
    app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  }

  if (!isTest) {
    app.use('/auth/login', loginLimiter);
  }
  app.use('/auth', authRoutes);
  app.use('/sessions', sessionRoutes);
  app.use('/kitchen', kitchenRoutes);
  app.use('/admin', adminRoutes);
  app.use('/menu', menuRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/announcements', announcementRoutes);

  app.use(errorHandler);
  return app;
}
