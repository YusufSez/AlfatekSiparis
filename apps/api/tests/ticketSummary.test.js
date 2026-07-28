import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTicketSummaryJson, ticketSummaryItems } from '../src/common/ticketSummary.js';
import { toUserFacingErrorMessage } from '../src/common/errors.js';

describe('parseTicketSummaryJson', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('null → empty', () => {
    expect(parseTicketSummaryJson(null)).toEqual({ summary: [], specialRequests: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('undefined → empty', () => {
    expect(parseTicketSummaryJson(undefined)).toEqual({ summary: [], specialRequests: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('empty string → empty', () => {
    expect(parseTicketSummaryJson('')).toEqual({ summary: [], specialRequests: [] });
    expect(parseTicketSummaryJson('   ')).toEqual({ summary: [], specialRequests: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('legacy array format', () => {
    const raw = JSON.stringify([{ name: 'Çay', qty: 2 }]);
    expect(parseTicketSummaryJson(raw)).toEqual({
      summary: [{ name: 'Çay', qty: 2 }],
      specialRequests: [],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('new { items, specialRequests } format', () => {
    const raw = JSON.stringify({
      items: [{ name: 'Kahve', qty: 1 }],
      specialRequests: [{ note: 'şekersiz', userName: 'Ali' }],
    });
    const result = parseTicketSummaryJson(raw);
    expect(result.summary).toEqual([{ name: 'Kahve', qty: 1 }]);
    expect(result.specialRequests[0].note).toBe('şekersiz');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('broken JSON → empty + Invalid warning', () => {
    expect(parseTicketSummaryJson('{ broken')).toEqual({ summary: [], specialRequests: [] });
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/Invalid summaryJson/);
  });

  it('unknown object → empty + Unknown warning', () => {
    expect(parseTicketSummaryJson({ foo: 123 })).toEqual({
      summary: [],
      specialRequests: [],
    });
    expect(parseTicketSummaryJson({ summary: [{ name: 'x' }] })).toEqual({
      summary: [],
      specialRequests: [],
    });
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/Unknown summaryJson format/);
  });

  it('never throws for any input', () => {
    const weird = [null, undefined, '', '   ', 0, 42, true, false, [], {}, '{', '[]', 'null'];
    for (const value of weird) {
      expect(() => parseTicketSummaryJson(value)).not.toThrow();
      const result = parseTicketSummaryJson(value);
      expect(Array.isArray(result.summary)).toBe(true);
      expect(Array.isArray(result.specialRequests)).toBe(true);
    }
  });

  it('ticketSummaryItems always returns an array', () => {
    expect(ticketSummaryItems('{ broken')).toEqual([]);
    expect(ticketSummaryItems({ items: [{ name: 'Soda', qty: 3 }] })).toEqual([
      { name: 'Soda', qty: 3 },
    ]);
  });
});

describe('toUserFacingErrorMessage', () => {
  it('hides technical 500 messages', () => {
    expect(toUserFacingErrorMessage(new Error('summary is not iterable'), 500)).toMatch(
      /Beklenmeyen/
    );
  });

  it('keeps intentional Turkish client messages', () => {
    expect(toUserFacingErrorMessage(new Error('Sipariş oturumu bulunamadı'), 404)).toBe(
      'Sipariş oturumu bulunamadı'
    );
  });
});
