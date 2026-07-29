/**
 * Rate-limit helpers — IP must come from Express (trust proxy aware), never raw XFF.
 */

export function clientIpKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function loginUsernameKey(req) {
  return String(req.body?.username || '')
    .trim()
    .toLowerCase() || 'unknown';
}

/** Combined IP + username — defeats XFF rotation when trust proxy is off / misconfigured. */
export function loginIpUsernameKey(req) {
  return `${clientIpKey(req)}:${loginUsernameKey(req)}`;
}

export const LOGIN_RATE_MESSAGE = {
  error: 'Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin.',
};

export const GENERIC_RATE_MESSAGE = {
  error: 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.',
};
