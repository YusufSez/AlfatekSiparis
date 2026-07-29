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
import { buildCorsOriginOption } from './common/corsOrigin.js';
import { AVATARS_DIR, ensureAvatarsDir } from './common/avatarStorage.js';
import {
  GENERIC_RATE_MESSAGE,
  LOGIN_RATE_MESSAGE,
  clientIpKey,
  loginIpUsernameKey,
  loginUsernameKey,
} from './common/rateLimitKeys.js';
import authRoutes from './modules/auth/auth.controller.js';
import sessionRoutes from './modules/orders/orders.controller.js';
import kitchenRoutes from './modules/kitchen/kitchen.controller.js';
import adminRoutes from './modules/admin/admin.controller.js';
import menuRoutes from './modules/menu/menu.controller.js';
import notificationRoutes from './modules/notifications/notifications.controller.js';
import announcementRoutes from './modules/announcements/announcements.controller.js';
import systemRoutes from './modules/system/system.controller.js';

function trustProxyEnabled() {
  const v = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function createApp(corsOrigin) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  ensureAvatarsDir();

  // Only trust X-Forwarded-For when explicitly behind a reverse proxy that overwrites it.
  if (trustProxyEnabled()) {
    const hops = Number(process.env.TRUST_PROXY_HOPS || 1);
    app.set('trust proxy', Number.isFinite(hops) && hops > 0 ? hops : 1);
  } else {
    app.set('trust proxy', false);
  }

  app.use(
    helmet({
      // Production API: lock down any accidental HTML. Dev/test: allow Swagger UI assets.
      contentSecurityPolicy: isProd
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'none'"],
              formAction: ["'none'"],
            },
          }
        : false,
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      // API JSON: same-origin. Avatar static route overrides to cross-origin below.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: isProd
        ? { maxAge: 15552000, includeSubDomains: true, preload: false }
        : false,
    })
  );
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    next();
  });

  app.use(
    cors({
      origin: buildCorsOriginOption(corsOrigin),
      credentials: true,
    })
  );
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

  // Public avatar files only (unique hashed names — no directory listing)
  app.use(
    '/uploads/avatars',
    (req, res, next) => {
      // Allow <img> from the SPA origin (may differ from API host).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(AVATARS_DIR, {
      fallthrough: false,
      index: false,
      maxAge: isProd ? '7d' : 0,
    })
  );

  const rateLimitValidate = {
    // Custom keyGenerators intentionally combine IP + username / path.
    keyGeneratorIpFallback: false,
    xForwardedForHeader: false,
  };

  const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: LOGIN_RATE_MESSAGE,
    keyGenerator: (req) => `login-ip:${clientIpKey(req)}`,
    validate: rateLimitValidate,
  });

  const loginUsernameLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: LOGIN_RATE_MESSAGE,
    keyGenerator: (req) => `login-user:${loginUsernameKey(req)}`,
    validate: rateLimitValidate,
  });

  const loginComboLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: LOGIN_RATE_MESSAGE,
    keyGenerator: (req) => `login-combo:${loginIpUsernameKey(req)}`,
    validate: rateLimitValidate,
  });

  /** Generous global cap for authenticated / business API traffic (not sockets). */
  const apiGlobalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: GENERIC_RATE_MESSAGE,
    keyGenerator: (req) => `api:${clientIpKey(req)}`,
    validate: rateLimitValidate,
  });

  const avatarLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: GENERIC_RATE_MESSAGE,
    keyGenerator: (req) => `avatar:${clientIpKey(req)}`,
    validate: rateLimitValidate,
  });

  const pushTestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: GENERIC_RATE_MESSAGE,
    keyGenerator: (req) => `push-test:${clientIpKey(req)}`,
    validate: rateLimitValidate,
  });

  const notifyWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: GENERIC_RATE_MESSAGE,
    keyGenerator: (req) => `notify-write:${clientIpKey(req)}`,
    validate: rateLimitValidate,
  });

  app.use(systemRoutes);

  /** Production: require METRICS_TOKEN (Bearer or X-Metrics-Token). Dev/test: open. */
  function metricsAuth(req, res, next) {
    if (!isProd) return next();
    const expected = String(process.env.METRICS_TOKEN || '').trim();
    if (!expected) {
      return res.status(503).json({ error: 'METRICS_TOKEN yapılandırılmamış' });
    }
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const provided = bearer || String(req.get('x-metrics-token') || '').trim();
    if (provided !== expected) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }
    return next();
  }

  app.get('/metrics', metricsAuth, async (_req, res, next) => {
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
    app.use('/auth/login', loginIpLimiter, loginUsernameLimiter, loginComboLimiter);
    app.use(['/sessions', '/kitchen', '/admin', '/menu', '/notifications', '/announcements'], apiGlobalLimiter);
    app.use('/auth/avatar', avatarLimiter);
    app.use('/auth/password', notifyWriteLimiter);
    app.use('/notifications/push/test', pushTestLimiter);
    app.use('/notifications/push/subscribe', notifyWriteLimiter);
    app.use('/notifications/push/unsubscribe', notifyWriteLimiter);
    app.use('/notifications/read-all', notifyWriteLimiter);
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
