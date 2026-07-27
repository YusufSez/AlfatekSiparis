export const SessionEventType = Object.freeze({
  OPENED: 'session.opened',
  LINE_UPSERTED: 'session.line_upserted',
  LINE_REMOVED: 'session.line_removed',
  LEFT: 'session.left',
  SKIPPED: 'session.skipped',
  SENT: 'session.sent',
  CLOSED: 'session.closed',
  PREPARING: 'ticket.preparing',
  READY: 'ticket.ready',
  DELIVERED: 'ticket.delivered',
});

export const SocketEvents = Object.freeze({
  SESSION_OPENED: 'session:opened',
  SESSION_UPDATED: 'session:updated',
  SESSION_SENT: 'session:sent',
  SESSION_CLOSED: 'session:closed',
  KITCHEN_NEW: 'kitchen:new_ticket',
  KITCHEN_UPDATED: 'kitchen:updated',
  PRESENCE_UPDATE: 'presence:update',
  NOTIFICATION: 'notification:new',
  ANNOUNCEMENT: 'announcement:updated',
});
