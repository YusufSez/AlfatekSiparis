import { describe, it, expect } from 'vitest';
import {
  buildNotificationTag,
  isAppForeground,
  notificationDedupeKey,
  shouldShowOsNotification,
  shouldSuppressPushBanner,
} from '../../web/src/lib/osNotify.js';

describe('notify visibility policy', () => {
  it('foreground → no OS notification (in-app only)', () => {
    expect(isAppForeground('visible')).toBe(true);
    expect(
      shouldShowOsNotification({ visibilityState: 'visible', hasPushSubscription: false })
    ).toBe(false);
  });

  it('background without push → OS notification', () => {
    expect(
      shouldShowOsNotification({ visibilityState: 'hidden', hasPushSubscription: false })
    ).toBe(true);
  });

  it('background with push → skip OS (push delivers)', () => {
    expect(
      shouldShowOsNotification({ visibilityState: 'hidden', hasPushSubscription: true })
    ).toBe(false);
  });

  it('SW suppresses only when a visible client exists', () => {
    expect(shouldSuppressPushBanner([{ visibilityState: 'visible' }])).toBe(true);
    expect(shouldSuppressPushBanner([{ visibilityState: 'hidden' }])).toBe(false);
    expect(shouldSuppressPushBanner([])).toBe(false);
  });

  it('tag + dedupe key stay stable', () => {
    expect(
      buildNotificationTag({
        tag: 'staff-call-abc',
        event: 'kitchen:staff_call',
      })
    ).toBe('staff-call-abc');
    expect(
      notificationDedupeKey({
        event: 'session.closed',
        title: 'Sipariş iptal edildi',
        payload: { sessionId: 's1', reason: 'cancel' },
      })
    ).toBe('session.closed|s1||Sipariş iptal edildi');
  });
});
