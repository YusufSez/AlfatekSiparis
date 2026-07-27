const SESSION_TRANSITIONS = {
  collecting: ['sent', 'closed'],
};

const TICKET_TRANSITIONS = {
  new: ['preparing'],
  preparing: ['delivered'],
  /** UX undo within short window after deliver */
  delivered: ['preparing'],
};

export function canTransition(machine, from, to) {
  const table = machine === 'ticket' ? TICKET_TRANSITIONS : SESSION_TRANSITIONS;
  return (table[from] || []).includes(to);
}

export function assertTransition(machine, from, to) {
  if (!canTransition(machine, from, to)) {
    const err = new Error(`Geçersiz durum geçişi: ${from} → ${to}`);
    err.status = 400;
    throw err;
  }
}

export { SESSION_TRANSITIONS, TICKET_TRANSITIONS };
