import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './auth';
import { useSocketApi } from './socket';

export const STAFF_CALL_TTL_MS = 10 * 60 * 1000;
export const STAFF_CALL_EVENT = 'kitchen:staff_call';

const StaffCallContext = createContext(null);

function parseJsonObject(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Single normalize path for board socket, notification:new, and HTTP hydrate.
 * Accepts flat board payloads or inbox notification envelopes.
 */
export function normalizeStaffCall(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const outer = parseJsonObject(raw);
  const nested = parseJsonObject(outer.payload);

  // notification:new envelope uses nested.payload; board event is flat
  const isEnvelope =
    outer.event === STAFF_CALL_EVENT ||
    (nested.officeId && (outer.title != null || outer.body != null));

  const src = isEnvelope ? { ...nested, title: outer.title, body: outer.body } : outer;
  const at =
    src.calledAt ||
    outer.calledAt ||
    nested.calledAt ||
    outer.createdAt ||
    nested.createdAt ||
    new Date().toISOString();
  const officeId = src.officeId || nested.officeId || outer.officeId;
  if (!officeId) return null;

  const officeName = src.officeName || nested.officeName || outer.officeName || 'Ofis';
  return {
    id: outer.id || `live-${officeId}-${at}`,
    officeId: String(officeId),
    officeName,
    title: src.title || outer.title || 'Cemile Abla',
    body: src.body || outer.body || `${officeName} sizi bekliyor.`,
    at,
    callerId: src.callerId || nested.callerId || null,
    callerName: src.callerName || nested.callerName || null,
  };
}

/** officeId-keyed merge + TTL trim — single reducer for live + hydrate. */
export function reduceStaffCalls(prev, incoming) {
  const list = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];
  const byOffice = new Map();
  for (const c of [...(prev || []), ...list]) {
    if (!c?.officeId) continue;
    const existing = byOffice.get(c.officeId);
    if (!existing || new Date(c.at).getTime() >= new Date(existing.at).getTime()) {
      byOffice.set(c.officeId, c);
    }
  }
  const cutoff = Date.now() - STAFF_CALL_TTL_MS;
  return [...byOffice.values()]
    .filter((c) => {
      const t = new Date(c.at).getTime();
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function shouldTrackStaffCalls(role) {
  return role === 'kitchen' || role === 'admin';
}

/**
 * App-level store so notification:new updates the card even if KitchenPage
 * listeners miss the board event. Mounted under SocketProvider.
 */
export function StaffCallProvider({ children }) {
  const { user } = useAuth();
  const { on } = useSocketApi();
  const [calls, setCalls] = useState([]);
  const dismissedRef = useRef(new Set());
  const role = user?.role;

  const ingest = useCallback((raw, { vibrate = false } = {}) => {
    const call = normalizeStaffCall(raw);
    if (!call?.officeId) return false;
    if (dismissedRef.current.has(call.officeId)) {
      dismissedRef.current.delete(call.officeId);
    }
    setCalls((prev) => reduceStaffCalls(prev, [call]));
    if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 40, 100]);
    }
    return true;
  }, []);

  const hydrateFromNotifications = useCallback((notifications) => {
    const fresh = (notifications || [])
      .filter((n) => n?.event === STAFF_CALL_EVENT && !n.readAt)
      .map((n) => normalizeStaffCall(n))
      .filter(Boolean)
      .filter((c) => !dismissedRef.current.has(c.officeId));
    setCalls((prev) => reduceStaffCalls(prev, fresh));
  }, []);

  const dismiss = useCallback((call) => {
    if (call?.officeId) dismissedRef.current.add(call.officeId);
    setCalls((prev) => (prev || []).filter((c) => c.officeId !== call?.officeId));
  }, []);

  // Live socket — always on while kitchen/admin session is active (not page-scoped)
  useEffect(() => {
    if (!shouldTrackStaffCalls(role)) {
      setCalls([]);
      dismissedRef.current.clear();
      return undefined;
    }

    const offBoard = on('kitchen:staff_call', (payload) => {
      ingest(payload, { vibrate: true });
    });

    const offInbox = on('notification:new', (n) => {
      if (n?.event !== STAFF_CALL_EVENT) return;
      ingest(n, { vibrate: true });
    });

    return () => {
      offBoard();
      offInbox();
    };
  }, [on, role, ingest]);

  // Drop expired cards
  useEffect(() => {
    if (!calls.length) return undefined;
    const id = setInterval(() => {
      setCalls((prev) => reduceStaffCalls(prev, []));
    }, 30_000);
    return () => clearInterval(id);
  }, [calls.length]);

  const value = useMemo(
    () => ({
      calls,
      ingest,
      hydrateFromNotifications,
      dismiss,
    }),
    [calls, ingest, hydrateFromNotifications, dismiss]
  );

  return <StaffCallContext.Provider value={value}>{children}</StaffCallContext.Provider>;
}

export function useStaffCalls() {
  const ctx = useContext(StaffCallContext);
  if (!ctx) {
    throw new Error('useStaffCalls must be used within StaffCallProvider');
  }
  return ctx;
}

/** Safe for NotificationCenter — no-op outside provider. */
export function useStaffCallIngest() {
  const ctx = useContext(StaffCallContext);
  return ctx?.ingest || null;
}
