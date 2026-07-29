import { describe, it, expect } from 'vitest';
import {
  JWT_SECRET_MIN_LENGTH,
  WEAK_JWT_SECRETS,
  assessJwtSecretStrength,
} from '../src/common/jwtSecret.js';
import {
  loginIpUsernameKey,
  loginUsernameKey,
} from '../src/common/rateLimitKeys.js';
import {
  claimSocketHandshake,
  trackSocketConnected,
  trackSocketDisconnected,
  SOCKET_FLOOD_LIMITS,
} from '../src/common/socketRateLimit.js';

describe('jwtSecret', () => {
  it('rejects known weak and short secrets', () => {
    expect(assessJwtSecretStrength('local-dev-secret-change-later').ok).toBe(false);
    expect(WEAK_JWT_SECRETS.has('local-dev-secret-change-later')).toBe(true);
    expect(assessJwtSecretStrength('a'.repeat(JWT_SECRET_MIN_LENGTH)).ok).toBe(false);
    expect(assessJwtSecretStrength('short').ok).toBe(false);
  });

  it('accepts long high-entropy secrets', () => {
    const secret = 'pK9#mQ2$vL8@nR4!wX7%yZ1^cB5&dF3*hG6';
    expect(secret.length).toBeGreaterThanOrEqual(JWT_SECRET_MIN_LENGTH);
    expect(assessJwtSecretStrength(secret).ok).toBe(true);
  });
});

describe('rateLimitKeys', () => {
  it('builds IP+username login key', () => {
    const req = { ip: '1.2.3.4', body: { username: ' Yusuf ' } };
    expect(loginUsernameKey(req)).toBe('yusuf');
    expect(loginIpUsernameKey(req)).toBe('1.2.3.4:yusuf');
  });
});

describe('socketRateLimit', () => {
  it('limits handshake flood per IP', () => {
    const ip = `test-flood-${Date.now()}`;
    let rejected = false;
    for (let i = 0; i < SOCKET_FLOOD_LIMITS.MAX_HANDSHAKES_PER_WINDOW + 5; i += 1) {
      const claim = claimSocketHandshake(ip);
      if (!claim.ok) {
        rejected = true;
        break;
      }
      trackSocketConnected(ip);
    }
    expect(rejected).toBe(true);
    // cleanup concurrent counters
    for (let i = 0; i < SOCKET_FLOOD_LIMITS.MAX_CONCURRENT_PER_IP; i += 1) {
      trackSocketDisconnected(ip);
    }
  });
});
