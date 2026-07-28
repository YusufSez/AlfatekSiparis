import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../src/common/safeJson.js';

describe('safeJsonParse', () => {
  it('geçerli JSON döner', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
    expect(safeJsonParse('[1,2]', [])).toEqual([1, 2]);
  });

  it('bozuk JSON fallback kullanır', () => {
    expect(safeJsonParse('{bad', {})).toEqual({});
    expect(safeJsonParse(undefined, [])).toEqual([]);
    expect(safeJsonParse('', null)).toBe(null);
  });
});
