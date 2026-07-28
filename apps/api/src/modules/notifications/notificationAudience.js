import { SessionEventType, SocketEvents } from '../../common/sessionEventType.js';

/** Inbox/push events allowed per role (defense in depth; primary filter is who we notify). */
const OFFICE_EVENTS = new Set([
  SessionEventType.OPENED,
  SessionEventType.SENT,
  SessionEventType.CLOSED,
  SessionEventType.PREPARING,
  SessionEventType.DELIVERED,
  SessionEventType.UNAVAILABLE,
]);

const KITCHEN_EVENTS = new Set([
  SocketEvents.KITCHEN_NEW,
  SocketEvents.KITCHEN_STAFF_CALL,
  SessionEventType.STAFF_CALL,
  SessionEventType.UNAVAILABLE,
  SessionEventType.CLOSED,
]);

export function isNotificationEventAllowed(role, event) {
  if (!event) return true;
  if (role === 'admin') return true;
  if (role === 'kitchen') return KITCHEN_EVENTS.has(event);
  if (role === 'office_user') return OFFICE_EVENTS.has(event);
  return false;
}

export { OFFICE_EVENTS, KITCHEN_EVENTS };
