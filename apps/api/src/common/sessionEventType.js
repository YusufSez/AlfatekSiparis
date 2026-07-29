export const SessionEventType = Object.freeze({
  OPENED: 'session.opened',
  LINE_UPSERTED: 'session.line_upserted',
  LINE_REMOVED: 'session.line_removed',
  LEFT: 'session.left',
  SKIPPED: 'session.skipped',
  SPECIAL_REQUEST: 'session.special_request',
  SENT: 'session.sent',
  CLOSED: 'session.closed',
  PREPARING: 'ticket.preparing',
  DELIVERED: 'ticket.delivered',
  UNAVAILABLE: 'ticket.unavailable',
  /** Kitchen did not press preparing within admin timeout — notify opener once */
  KITCHEN_NO_RESPONSE: 'ticket.kitchen_no_response',
  STAFF_CALL: 'kitchen:staff_call',
});

export const SocketEvents = Object.freeze({
  SESSION_OPENED: 'session:opened',
  SESSION_UPDATED: 'session:updated',
  SESSION_SENT: 'session:sent',
  SESSION_CLOSED: 'session:closed',
  KITCHEN_NEW: 'kitchen:new_ticket',
  KITCHEN_UPDATED: 'kitchen:updated',
  KITCHEN_UNAVAILABLE: 'kitchen:unavailable',
  KITCHEN_STAFF_CALL: 'kitchen:staff_call',
  PRESENCE_UPDATE: 'presence:update',
  NOTIFICATION: 'notification:new',
  ANNOUNCEMENT: 'announcement:updated',
});
