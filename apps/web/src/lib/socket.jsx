import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken, resolveApiBaseUrl } from './api';
import { useAuth } from './auth';

const SocketContext = createContext(null);

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
  const handlers = useRef(new Map());
  const hadConnect = useRef(false);

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
      auth: { token: getToken() },
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
  }, [user?.id]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      reconnectKey,
      on(event, fn) {
        if (!handlers.current.has(event)) handlers.current.set(event, new Set());
        handlers.current.get(event).add(fn);
        return () => handlers.current.get(event)?.delete(fn);
      },
    }),
    [socket, connected, reconnectKey]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
