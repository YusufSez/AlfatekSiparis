import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  SESSION_TRANSITIONS,
  TICKET_TRANSITIONS,
} from '../src/common/stateMachine.js';

describe('STATE MACHINE', () => {
  it('collecting → sent', () => {
    expect(canTransition('session', 'collecting', 'sent')).toBe(true);
  });

  it('collecting → closed', () => {
    expect(canTransition('session', 'collecting', 'closed')).toBe(true);
  });

  it('new → preparing (ticket)', () => {
    expect(canTransition('ticket', 'new', 'preparing')).toBe(true);
  });

  it('preparing → delivered', () => {
    expect(canTransition('ticket', 'preparing', 'delivered')).toBe(true);
  });

  it('delivered → preparing (undo)', () => {
    expect(canTransition('ticket', 'delivered', 'preparing')).toBe(true);
  });

  it('ready adımı kaldırıldı', () => {
    expect(canTransition('ticket', 'preparing', 'ready')).toBe(false);
    expect(canTransition('ticket', 'ready', 'delivered')).toBe(false);
    expect(TICKET_TRANSITIONS.ready).toBeUndefined();
  });

  it('geçersiz session transition', () => {
    expect(canTransition('session', 'sent', 'collecting')).toBe(false);
    expect(() => assertTransition('session', 'closed', 'sent')).toThrow(/Geçersiz/);
  });

  it('geçersiz ticket transition', () => {
    expect(canTransition('ticket', 'new', 'delivered')).toBe(false);
    expect(canTransition('ticket', 'delivered', 'delivered')).toBe(false);
    expect(canTransition('ticket', 'preparing', 'preparing')).toBe(false);
    expect(canTransition('ticket', 'delivered', 'new')).toBe(false);
    expect(() => assertTransition('ticket', 'delivered', 'new')).toThrow(/Geçersiz/);
  });

  it('transition tabloları sabit', () => {
    expect(SESSION_TRANSITIONS.collecting).toEqual(['sent', 'closed']);
    expect(TICKET_TRANSITIONS.new).toEqual(['preparing']);
    expect(TICKET_TRANSITIONS.preparing).toEqual(['delivered']);
    expect(TICKET_TRANSITIONS.delivered).toEqual(['preparing']);
  });
});
