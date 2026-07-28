/** Role → which notification `event` values may appear in the inbox / OS toast. */

const OFFICE_EVENTS = new Set([
  'session.opened',
  'session.sent',
  'session.closed',
  'ticket.preparing',
  'ticket.delivered',
  'ticket.unavailable',
]);

const KITCHEN_EVENTS = new Set([
  'kitchen:new_ticket',
  'kitchen:staff_call',
  'ticket.unavailable',
  'session.closed',
]);

export function isNotificationEventAllowed(role, event) {
  if (!event) return true;
  if (role === 'admin') return true;
  if (role === 'kitchen') return KITCHEN_EVENTS.has(event);
  if (role === 'office_user') return OFFICE_EVENTS.has(event);
  return false;
}
