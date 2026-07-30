import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { getToken, resolveApiBaseUrl } from './api';
import { useAuth } from './auth';

/** Stable API: subscribe to events (does not change on connect/disconnect). */
const SocketApiContext = createContext(null);
/** Only flips on connect/disconnect — isolate UI that shows connection status. */
const SocketConnectedContext = createContext(false);
/** Bumps only after reconnect — drives soft hydrate without notifying `on` consumers. */
const SocketReconnectContext = createContext(0);
/**
 * Bumps when the tab/window becomes visible again (Electron tray → show, mobile app switch).
 * Forces soft hydrate even if the socket never dropped (Chromium may have throttled events).
 */
const SocketResumeContext = createContext(0);

const EVENTS = [
  'session:opened',
  'session:updated',
  'session:sent',
  'session:closed',
  'kitchen:new_ticket',
  'kitchen:updated',
  'kitchen:unavailable',
  'kitchen:staff_call',
  'presence:update',
  'notification:new',
  'announcement:updated',
  'connected',
];

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [resumeKey, setResumeKey] = useState(0);
  const [tokenEpoch, setTokenEpoch] = useState(0);
  const handlers = useRef(new Map());
  const hadConnect = useRef(false);
  const wasHidden = useRef(false);

  const on = useCallback((event, fn) => {
    if (!handlers.current.has(event)) handlers.current.set(event, new Set());
    handlers.current.get(event).add(fn);
    return () => handlers.current.get(event)?.delete(fn);
  }, []);

  useEffect(() => {
    function onTokenRotated() {
      setTokenEpoch((n) => n + 1);
    }
    window.addEventListener('auth:token-rotated', onTokenRotated);
    return () => window.removeEventListener('auth:token-rotated', onTokenRotated);
  }, []);

  // Electron tray hide / mobile background: when visible again, soft-hydrate boards.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true;
        return;
      }
      if (document.visibilityState === 'visible' && wasHidden.current) {
        wasHidden.current = false;
        setResumeKey((k) => k + 1);
        // Nudge socket.io in case the transport went quiet while throttled
        try {
          socket?.emit?.('presence:ping');
        } catch {
          /* ignore */
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [socket]);

  useEffect(() => {
    if (!user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setConnected(false);
      hadConnect.current = false;
      return;
    }

    const s = io(resolveApiBaseUrl() || undefined, {
      auth: (cb) => {
        cb({ token: getToken() });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });

    s.on('connect', () => {
      setConnected(true);
      // Skip hydrate bump on first connect — pages already load via useEffect
      if (hadConnect.current) setReconnectKey((k) => k + 1);
      hadConnect.current = true;
    });
    s.on('disconnect', () => setConnected(false));
    // socket.io fires `connect` on reconnect; avoid double reconnectKey bump

    for (const event of EVENTS) {
      s.on(event, (payload) => {
        const set = handlers.current.get(event);
        if (set) for (const fn of set) fn(payload);
      });
    }

    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [user?.id, tokenEpoch]);

  const apiValue = useMemo(() => ({ socket, on }), [socket, on]);

  return (
    <SocketApiContext.Provider value={apiValue}>
      <SocketConnectedContext.Provider value={connected}>
        <SocketReconnectContext.Provider value={reconnectKey}>
          <SocketResumeContext.Provider value={resumeKey}>{children}</SocketResumeContext.Provider>
        </SocketReconnectContext.Provider>
      </SocketConnectedContext.Provider>
    </SocketApiContext.Provider>
  );
}

/** Event subscribe + raw socket. Stable across connect flips. */
export function useSocketApi() {
  const ctx = useContext(SocketApiContext);
  if (!ctx) throw new Error('useSocketApi must be used within SocketProvider');
  return ctx;
}

export function useSocketConnected() {
  return useContext(SocketConnectedContext);
}

export function useSocketReconnectKey() {
  return useContext(SocketReconnectContext);
}

/** Soft hydrate after window becomes visible again (tray / background). */
export function useSocketResumeKey() {
  return useContext(SocketResumeContext);
}

/** Compat: merges all socket slices (re-renders on any change). Prefer specific hooks. */
export function useSocket() {
  const api = useContext(SocketApiContext);
  const connected = useContext(SocketConnectedContext);
  const reconnectKey = useContext(SocketReconnectContext);
  const resumeKey = useContext(SocketResumeContext);
  return useMemo(
    () => ({
      socket: api?.socket ?? null,
      on: api?.on,
      connected,
      reconnectKey,
      resumeKey,
    }),
    [api, connected, reconnectKey, resumeKey]
  );
}
