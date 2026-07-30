/** Keep in sync with apps/api/src/common/ticketCancelReason.js + Prisma TicketCancelReason. */
export const TicketCancelReason = Object.freeze({
  USER_CANCELLED: 'user_cancelled',
  MISSING_PRODUCT: 'missing_product',
  OFFICE_CANCELLED: 'office_cancelled',
  ADMIN_CANCELLED: 'admin_cancelled',
});

/** Kitchen history / status pill */
export function kitchenCancelStatusLabel(cancelReason) {
  if (cancelReason === TicketCancelReason.MISSING_PRODUCT) {
    return '🟠 Eksik Ürün Nedeniyle İptal';
  }
  return 'İptal Edildi';
}

/** Office history badge */
export function officeCancelBadgeLabel(cancelReason) {
  if (cancelReason === TicketCancelReason.MISSING_PRODUCT) {
    return '🟠 Eksik Ürün';
  }
  return '🔴 İptal Edildi';
}

/** Office history empty-state / body line */
export function officeCancelBodyText(cancelReason) {
  if (cancelReason === TicketCancelReason.MISSING_PRODUCT) {
    return 'Sipariş eksik ürün nedeniyle hazırlanamadı.';
  }
  return 'Sipariş iptal edildi.';
}
