/**
 * Per-IP socket handshake / concurrent connection limits.
 * Uses remoteAddress only unless TRUST_PROXY is explicitly enabled
 * (never trust raw client X-Forwarded-For when proxy is not configured).
 */

const WINDOW_MS = 60_000;
const MAX_HANDSHAKES_PER_WINDOW = 40;
const MAX_CONCURRENT_PER_IP = 20;

/** @type {Map<string, { count: number, resetAt: number }>} */
const handshakeBuckets = new Map();
/** @type {Map<string, number>} */
const concurrentByIp = new Map();

function trustProxyEnabled() {
  const v = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function getSocketClientIp(req) {
  if (trustProxyEnabled()) {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
  }
  return (
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

function pruneHandshakeBucket(ip, now) {
  const bucket = handshakeBuckets.get(ip);
  if (!bucket) return null;
  if (now >= bucket.resetAt) {
    handshakeBuckets.delete(ip);
    return null;
  }
  return bucket;
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function claimSocketHandshake(ip) {
  const now = Date.now();
  let bucket = pruneHandshakeBucket(ip, now);
  if (!bucket) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    handshakeBuckets.set(ip, bucket);
  }
  if (bucket.count >= MAX_HANDSHAKES_PER_WINDOW) {
    return { ok: false, reason: 'rate_limited' };
  }
  const concurrent = concurrentByIp.get(ip) || 0;
  if (concurrent >= MAX_CONCURRENT_PER_IP) {
    return { ok: false, reason: 'concurrent_limit' };
  }
  bucket.count += 1;
  return { ok: true };
}

export function trackSocketConnected(ip) {
  concurrentByIp.set(ip, (concurrentByIp.get(ip) || 0) + 1);
}

export function trackSocketDisconnected(ip) {
  const n = (concurrentByIp.get(ip) || 0) - 1;
  if (n <= 0) concurrentByIp.delete(ip);
  else concurrentByIp.set(ip, n);
}

export const SOCKET_FLOOD_LIMITS = {
  WINDOW_MS,
  MAX_HANDSHAKES_PER_WINDOW,
  MAX_CONCURRENT_PER_IP,
};
