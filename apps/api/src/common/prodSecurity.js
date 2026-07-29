/**
 * Production boot guards — fail fast on insecure / incomplete configuration.
 * Development and test keep permissive defaults.
 */
import { WEAK_JWT_SECRETS, resolveJwtSecret } from './auth.js';
import { assessJwtSecretStrength } from './jwtSecret.js';
import { logger } from './logger.js';

function trustProxyEnabled() {
  const v = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function assertProductionSecurityConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET tanımlı değil; local-dev-secret kullanılıyor');
    }
    return;
  }

  // Never allow dotenv override files that might ship with known secrets.
  if (process.env.DOTENV_CONFIG_PATH) {
    const path = String(process.env.DOTENV_CONFIG_PATH).replace(/\\/g, '/').toLowerCase();
    if (path.endsWith('.env.development') || path.includes('/.env.development')) {
      logger.error('Production’da .env.development kullanılamaz');
      process.exit(1);
    }
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
  const metricsCheck = assessJwtSecretStrength(metricsToken);
  if (!metricsToken || WEAK_JWT_SECRETS.has(metricsToken) || !metricsCheck.ok) {
    logger.error('METRICS_TOKEN production için zorunlu, uzun ve tahmin edilemez olmalıdır');
    process.exit(1);
  }

  if (trustProxyEnabled()) {
    logger.info('trust proxy etkin (TRUST_PROXY) — reverse proxy X-Forwarded-For overwrite etmeli');
  } else {
    logger.info('trust proxy kapalı — istemci X-Forwarded-For yok sayılır');
  }
}
