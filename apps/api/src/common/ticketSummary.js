import { logger } from './logger.js';

/**
 * KitchenTicket.summaryJson formats:
 * - Legacy: JSON array of { menuItemId, name, icon, qty, notes? }
 * - Current: { items: [...], specialRequests: [...] }
 *
 * Always returns { summary: Array, specialRequests: Array }. Never throws.
 */

const EMPTY = Object.freeze({ summary: [], specialRequests: [] });

function emptyResult() {
  return { summary: [], specialRequests: [] };
}

function warnInvalid(detail, sample) {
  try {
    logger.warn('Invalid summaryJson', {
      detail,
      sample: typeof sample === 'string' ? sample.slice(0, 120) : undefined,
    });
  } catch {
    /* logging must never throw */
  }
}

function warnUnknown(detail, sample) {
  try {
    logger.warn('Unknown summaryJson format', {
      detail,
      sample:
        typeof sample === 'string'
          ? sample.slice(0, 120)
          : sample && typeof sample === 'object'
            ? Object.keys(sample).slice(0, 8)
            : typeof sample,
    });
  } catch {
    /* logging must never throw */
  }
}

function normalizeKnownObject(obj) {
  const hasItemsKey = Object.prototype.hasOwnProperty.call(obj, 'items');
  const hasSpecialKey = Object.prototype.hasOwnProperty.call(obj, 'specialRequests');

  // New format: object that declares items and/or specialRequests
  if (hasItemsKey || hasSpecialKey) {
    let summary = [];
    let specialRequests = [];

    if (hasItemsKey) {
      if (Array.isArray(obj.items)) {
        summary = obj.items;
      } else if (obj.items == null) {
        summary = [];
      } else {
        warnInvalid('items is not an array', obj.items);
        summary = [];
      }
    }

    if (hasSpecialKey) {
      if (Array.isArray(obj.specialRequests)) {
        specialRequests = obj.specialRequests;
      } else if (obj.specialRequests == null) {
        specialRequests = [];
      } else {
        warnInvalid('specialRequests is not an array', obj.specialRequests);
        specialRequests = [];
      }
    }

    return { summary, specialRequests };
  }

  warnUnknown('object without items/specialRequests', obj);
  return emptyResult();
}

function normalizeParsed(parsed, originalRaw) {
  if (Array.isArray(parsed)) {
    return { summary: parsed, specialRequests: [] };
  }

  if (parsed && typeof parsed === 'object') {
    return normalizeKnownObject(parsed);
  }

  warnUnknown('unsupported parsed type', originalRaw ?? parsed);
  return emptyResult();
}

/**
 * Safe entry point for all summaryJson consumers.
 * @returns {{ summary: any[], specialRequests: any[] }}
 */
export function parseTicketSummaryJson(raw) {
  try {
    if (raw == null) return emptyResult();

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return emptyResult();

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        warnInvalid('JSON parse failed', trimmed);
        return emptyResult();
      }
      return normalizeParsed(parsed, trimmed);
    }

    // Already-parsed value (array / object) — still normalize safely
    return normalizeParsed(raw, raw);
  } catch (err) {
    warnInvalid(err?.message || 'unexpected parser failure', raw);
    return emptyResult();
  }
}

/** Always returns an array of summary line items. Never throws. */
export function ticketSummaryItems(rawOrParsed) {
  try {
    return parseTicketSummaryJson(rawOrParsed).summary;
  } catch {
    return [];
  }
}

export { EMPTY as EMPTY_TICKET_SUMMARY };
