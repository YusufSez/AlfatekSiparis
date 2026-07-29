/**
 * JWT secret strength — production only enforcement via resolveJwtSecret / prodSecurity.
 */

export const JWT_SECRET_MIN_LENGTH = 32;

/** Exact weak / example secrets that must never be used in production. */
export const WEAK_JWT_SECRETS = new Set([
  'local-dev-secret',
  'local-dev-secret-change-later',
  'docker-dev-secret',
  'change-me-in-production',
  'ci-test-secret-not-for-production',
  'test-jwt-secret-vitest-do-not-use',
  'secret',
  'jwt-secret',
  'jwt_secret',
  'password',
  '12345678901234567890123456789012',
]);

/** Dev/test fallback only — never returned when NODE_ENV=production. */
export const DEV_JWT_FALLBACK = 'local-dev-secret';

/**
 * @param {string} secret
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assessJwtSecretStrength(secret) {
  const value = String(secret || '');
  if (!value) {
    return { ok: false, reason: 'JWT_SECRET tanımlı değil' };
  }
  if (WEAK_JWT_SECRETS.has(value)) {
    return { ok: false, reason: 'JWT_SECRET bilinen zayıf/örnek bir değer' };
  }
  if (value.length < JWT_SECRET_MIN_LENGTH) {
    return {
      ok: false,
      reason: `JWT_SECRET en az ${JWT_SECRET_MIN_LENGTH} karakter olmalıdır`,
    };
  }

  const unique = new Set(value).size;
  if (unique < 10) {
    return {
      ok: false,
      reason: 'JWT_SECRET yeterli çeşitlilikte (entropy) değil',
    };
  }

  // Reject trivial repeated / sequential patterns
  if (/^(.)\1+$/.test(value)) {
    return { ok: false, reason: 'JWT_SECRET tekrarlayan karakterlerden oluşamaz' };
  }
  if (/^(0123456789|9876543210|abcdefghijklmnopqrstuvwxyz)+$/i.test(value)) {
    return { ok: false, reason: 'JWT_SECRET tahmin edilebilir bir desen' };
  }

  return { ok: true };
}
