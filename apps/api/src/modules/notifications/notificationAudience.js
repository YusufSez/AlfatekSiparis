import { SessionEventType, SocketEvents } from '../../common/sessionEventType.js';

/**
 * Role-based notification audience — single source of truth.
 *
 * Who receives UserNotification / push / notification:new is decided by
 * notifyUsers targets + this allow-list (defense in depth).
 *
 * Socket rooms for kitchen board sync (kitchen:new_ticket, kitchen:updated)
 * may still include `admins` so admins can watch the kitchen UI live —
 * that is NOT an inbox/push notification.
 */

/** Office users: own-office order lifecycle only (inbox/push). */
export const OFFICE_EVENTS = new Set([
  SessionEventType.OPENED,
  SessionEventType.CLOSED,
  SessionEventType.PREPARING,
  SessionEventType.UNAVAILABLE,
  SessionEventType.KITCHEN_NO_RESPONSE,
]);

/** Kitchen staff: new tickets, staff calls, peer shortage alerts. */
export const KITCHEN_EVENTS = new Set([
  SocketEvents.KITCHEN_NEW,
  SocketEvents.KITCHEN_STAFF_CALL,
  SessionEventType.STAFF_CALL,
  SessionEventType.UNAVAILABLE,
]);

/**
 * Admins: management / system only — never normal office or kitchen workflow.
 * Add new admin-facing events here when introducing them.
 */
export const ADMIN_EVENTS = new Set([
  'admin.user_created',
  'admin.user_deleted',
  'admin.system_alert',
]);

export function isNotificationEventAllowed(role, event) {
  if (!event) return false;
  if (role === 'admin') return ADMIN_EVENTS.has(event);
  if (role === 'kitchen') return KITCHEN_EVENTS.has(event);
  if (role === 'office_user') return OFFICE_EVENTS.has(event);
  return false;
}
