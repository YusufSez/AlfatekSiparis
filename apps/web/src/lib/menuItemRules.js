/** Allowed sweetness notes for Türk Kahvesi (OrderLine.note). */
export const TURKISH_COFFEE_SWEETNESS = Object.freeze([
  'Sade',
  'Az Şekerli',
  'Orta Şekerli',
  'Şekerli',
]);

export function isOtherItem(item) {
  if (!item) return false;
  return (
    item.icon === 'other' ||
    String(item.name || '').toLocaleLowerCase('tr') === 'diğer'
  );
}

export function isTurkishCoffeeItem(item) {
  if (!item) return false;
  return (
    item.icon === 'turkish_coffee' ||
    String(item.name || '').toLocaleLowerCase('tr') === 'türk kahvesi'
  );
}

/** Display label — e.g. "Türk Kahvesi (Orta Şekerli)". */
export function formatOrderedItemLabel(name, icon, note) {
  const n = String(name || '').trim() || 'Ürün';
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (!trimmed) return n;
  if (isTurkishCoffeeItem({ name: n, icon })) {
    return `${n} (${trimmed})`;
  }
  return n;
}
