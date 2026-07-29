/** Allowed sweetness notes for Türk Kahvesi (stored on OrderLine.note). */
export const TURKISH_COFFEE_SWEETNESS = Object.freeze([
  'Sade',
  'Az Şekerli',
  'Orta Şekerli',
  'Şekerli',
]);

const TURKISH_COFFEE_SET = new Set(TURKISH_COFFEE_SWEETNESS);

export function isOtherMenuItem(menuItem) {
  if (!menuItem) return false;
  return (
    menuItem.icon === 'other' ||
    String(menuItem.name || '').toLocaleLowerCase('tr') === 'diğer'
  );
}

export function isTurkishCoffeeMenuItem(menuItem) {
  if (!menuItem) return false;
  return (
    menuItem.icon === 'turkish_coffee' ||
    String(menuItem.name || '').toLocaleLowerCase('tr') === 'türk kahvesi'
  );
}

export function isValidTurkishCoffeeNote(note) {
  return TURKISH_COFFEE_SET.has(String(note || '').trim());
}

/** Display label for summaries / kitchen / chips. */
export function formatOrderedItemLabel(name, icon, note) {
  const n = String(name || '').trim() || 'Ürün';
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (!trimmed) return n;
  if (isTurkishCoffeeMenuItem({ name: n, icon })) {
    return `${n} (${trimmed})`;
  }
  return n;
}

/**
 * Summary aggregation key — Turkish coffee splits by sweetness so kitchen
 * shows e.g. "2× Türk Kahvesi (Orta Şekerli)" separately from Sade.
 */
export function summaryAggregateKey(menuItemId, menuItem, note) {
  if (isTurkishCoffeeMenuItem(menuItem) && note) {
    return `${menuItemId}::${note}`;
  }
  return menuItemId;
}
