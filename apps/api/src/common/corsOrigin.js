/**
 * CORS / Socket.io origin helper.
 * Production: CORS_ORIGIN (comma-separated) only.
 * Development: also allows Vite on localhost and private LAN IPs.
 */

function isPrivateHostname(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  // Link-local / APIPA
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

function parseConfiguredOrigins(corsOrigin) {
  if (!corsOrigin || corsOrigin === '*') return [];
  return String(corsOrigin)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} corsOriginEnv
 * @returns {boolean | string[] | function}
 */
export function buildCorsOriginOption(corsOriginEnv) {
  const configured = parseConfiguredOrigins(corsOriginEnv || 'http://localhost:5173');
  const isProd = process.env.NODE_ENV === 'production';

  return function corsOriginCheck(origin, callback) {
    // Same-origin / non-browser tools
    if (!origin) return callback(null, true);

    if (configured.includes('*') || configured.includes(origin)) {
      return callback(null, true);
    }

    if (!isProd) {
      try {
        const url = new URL(origin);
        const vitePorts = new Set(['5173', '4173', '']);
        if (vitePorts.has(url.port) && isPrivateHostname(url.hostname)) {
          return callback(null, true);
        }
      } catch {
        /* ignore */
      }
    }

    callback(null, false);
  };
}

/** Socket.io accepts boolean | string | string[] | function */
export function buildSocketCorsOrigin(corsOriginEnv) {
  return buildCorsOriginOption(corsOriginEnv);
}
