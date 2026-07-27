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

  it('sent → preparing (ticket)', () => {
    expect(canTransition('ticket', 'new', 'preparing')).toBe(true);
  });

  it('preparing → ready', () => {
    expect(canTransition('ticket', 'preparing', 'ready')).toBe(true);
  });

  it('ready → delivered', () => {
    expect(canTransition('ticket', 'ready', 'delivered')).toBe(true);
  });

  it('geçersiz session transition', () => {
    expect(canTransition('session', 'sent', 'collecting')).toBe(false);
    expect(() => assertTransition('session', 'closed', 'sent')).toThrow(/Geçersiz/);
  });

  it('geçersiz ticket transition', () => {
    expect(canTransition('ticket', 'new', 'ready')).toBe(false);
    expect(canTransition('ticket', 'ready', 'preparing')).toBe(false);
    expect(() => assertTransition('ticket', 'delivered', 'new')).toThrow(/Geçersiz/);
  });

  it('transition tabloları sabit', () => {
    expect(SESSION_TRANSITIONS.collecting).toEqual(['sent', 'closed']);
    expect(TICKET_TRANSITIONS.new).toEqual(['preparing']);
  });
});
