import { describe, it, expect } from 'vitest';
import {
  isNotificationEventAllowed,
  ADMIN_EVENTS,
  OFFICE_EVENTS,
  KITCHEN_EVENTS,
} from '../src/modules/notifications/notificationAudience.js';

describe('notificationAudience', () => {
  it('admin yalnızca yönetimsel eventleri alır', () => {
    expect(isNotificationEventAllowed('admin', 'admin.user_created')).toBe(true);
    expect(isNotificationEventAllowed('admin', 'admin.user_deleted')).toBe(true);
    expect(isNotificationEventAllowed('admin', 'kitchen:new_ticket')).toBe(false);
    expect(isNotificationEventAllowed('admin', 'kitchen:staff_call')).toBe(false);
    expect(isNotificationEventAllowed('admin', 'ticket.preparing')).toBe(false);
    expect(isNotificationEventAllowed('admin', 'ticket.delivered')).toBe(false);
    expect(isNotificationEventAllowed('admin', 'ticket.unavailable')).toBe(false);
    expect(isNotificationEventAllowed('admin', 'session.opened')).toBe(false);
  });

  it('kitchen mutfak eventlerini alır, ofis workflow almaz', () => {
    expect(isNotificationEventAllowed('kitchen', 'kitchen:new_ticket')).toBe(true);
    expect(isNotificationEventAllowed('kitchen', 'kitchen:staff_call')).toBe(true);
    expect(isNotificationEventAllowed('kitchen', 'ticket.unavailable')).toBe(true);
    expect(isNotificationEventAllowed('kitchen', 'ticket.preparing')).toBe(false);
    expect(isNotificationEventAllowed('kitchen', 'ticket.delivered')).toBe(false);
    expect(isNotificationEventAllowed('kitchen', 'session.opened')).toBe(false);
    expect(isNotificationEventAllowed('kitchen', 'admin.user_created')).toBe(false);
  });

  it('office_user ofis sipariş eventlerini alır', () => {
    expect(isNotificationEventAllowed('office_user', 'session.opened')).toBe(true);
    expect(isNotificationEventAllowed('office_user', 'session.sent')).toBe(true);
    expect(isNotificationEventAllowed('office_user', 'ticket.preparing')).toBe(true);
    expect(isNotificationEventAllowed('office_user', 'ticket.delivered')).toBe(true);
    expect(isNotificationEventAllowed('office_user', 'ticket.unavailable')).toBe(true);
    expect(isNotificationEventAllowed('office_user', 'kitchen:new_ticket')).toBe(false);
    expect(isNotificationEventAllowed('office_user', 'kitchen:staff_call')).toBe(false);
    expect(isNotificationEventAllowed('office_user', 'admin.user_created')).toBe(false);
  });

  it('allow-list setleri tutarlı', () => {
    expect(ADMIN_EVENTS.has('admin.system_alert')).toBe(true);
    expect(OFFICE_EVENTS.has('session.closed')).toBe(true);
    expect(KITCHEN_EVENTS.has('kitchen:new_ticket')).toBe(true);
  });
});
