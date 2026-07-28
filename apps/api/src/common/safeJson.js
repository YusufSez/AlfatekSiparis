/**
 * Never throw on corrupt JSON — use a fallback so one bad row cannot 500 an endpoint.
 */
export function safeJsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
