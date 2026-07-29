import { describe, it, expect } from 'vitest';
import {
  formatOrderedItemLabel,
  isTurkishCoffeeMenuItem,
  isValidTurkishCoffeeNote,
  summaryAggregateKey,
} from '../src/common/menuItemRules.js';

describe('menuItemRules', () => {
  it('detects turkish coffee and validates sweetness', () => {
    expect(isTurkishCoffeeMenuItem({ name: 'Türk Kahvesi', icon: 'turkish_coffee' })).toBe(true);
    expect(isValidTurkishCoffeeNote('Orta Şekerli')).toBe(true);
    expect(isValidTurkishCoffeeNote('Bol şeker')).toBe(false);
  });

  it('formats display label and splits summary keys by sweetness', () => {
    expect(formatOrderedItemLabel('Türk Kahvesi', 'turkish_coffee', 'Sade')).toBe(
      'Türk Kahvesi (Sade)'
    );
    expect(summaryAggregateKey('id1', { icon: 'turkish_coffee' }, 'Sade')).toBe('id1::Sade');
    expect(summaryAggregateKey('id1', { icon: 'tea' }, null)).toBe('id1');
  });
});
