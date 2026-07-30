/** Canonical ticket cancel reasons — keep in sync with Prisma TicketCancelReason. */
export const TicketCancelReason = Object.freeze({
  USER_CANCELLED: 'user_cancelled',
  MISSING_PRODUCT: 'missing_product',
  OFFICE_CANCELLED: 'office_cancelled',
  ADMIN_CANCELLED: 'admin_cancelled',
});

export const TICKET_CANCEL_REASONS = Object.freeze(Object.values(TicketCancelReason));

export function isTicketCancelReason(value) {
  return TICKET_CANCEL_REASONS.includes(value);
}
