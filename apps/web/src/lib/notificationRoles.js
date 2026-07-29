/**
 * Role → which notification `event` values may appear in the inbox / OS toast.
 * Keep in sync with apps/api/.../notificationAudience.js
 */

const OFFICE_EVENTS = new Set([
  'session.opened',
  'session.closed',
  'ticket.preparing',
  'ticket.unavailable',
  'ticket.kitchen_no_response',
]);

const KITCHEN_EVENTS = new Set([
  'kitchen:new_ticket',
  'kitchen:staff_call',
  'ticket.unavailable',
]);

/** Admins: management only — not order/kitchen workflow. */
const ADMIN_EVENTS = new Set([
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

export { OFFICE_EVENTS, KITCHEN_EVENTS, ADMIN_EVENTS };
