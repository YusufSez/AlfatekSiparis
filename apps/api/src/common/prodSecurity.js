/**
 * Production boot guards — fail fast on insecure / incomplete configuration.
 * Development and test keep permissive defaults.
 */
import { WEAK_JWT_SECRETS, resolveJwtSecret } from './auth.js';
import { logger } from './logger.js';

export function assertProductionSecurityConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET tanımlı değil; local-dev-secret kullanılıyor');
    }
    return;
  }

  try {
    resolveJwtSecret();
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  const cors = String(process.env.CORS_ORIGIN || '').trim();
  if (!cors || cors === '*') {
    logger.error('CORS_ORIGIN production için zorunludur (* kullanılamaz)');
    process.exit(1);
  }

  const vapidPub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPriv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!vapidPub || !vapidPriv) {
    logger.error('VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY production için zorunludur');
    process.exit(1);
  }

  const metricsToken = String(process.env.METRICS_TOKEN || '').trim();
  if (!metricsToken || WEAK_JWT_SECRETS.has(metricsToken)) {
    logger.error('METRICS_TOKEN production için zorunlu ve tahmin edilemez olmalıdır');
    process.exit(1);
  }
}
