import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from './api';
import { useSocketApi, useSocketReconnectKey } from './socket';
import { useToast } from './toast';
import { logSentence } from './uxLabels';

const AdminStaticContext = createContext(null);
const AdminLiveContext = createContext(null);

export function AdminDataProvider({ children }) {
  const { on } = useSocketApi();
  const reconnectKey = useSocketReconnectKey();
  const toast = useToast();

  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);
  const [menu, setMenu] = useState([]);
  const [logs, setLogs] = useState([]);
  const [presence, setPresence] = useState([]);
  const [settings, setSettings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [pendingKitchen, setPendingKitchen] = useState(0);
  const [kitchenStats, setKitchenStats] = useState({ waiting: 0, preparing: 0 });
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [apiMeta, setApiMeta] = useState(null);

  const applyKitchenCounts = useCallback((tickets) => {
    const list = tickets || [];
    setPendingKitchen(list.length);
    setKitchenStats({
      waiting: list.filter((t) => t.status === 'new').length,
      preparing: list.filter((t) => t.status === 'preparing').length,
    });
  }, []);

  const refresh = useCallback(
    async (signal) => {
      const [o, u, m, s, l, p, d, a, k] = await Promise.all([
        api('/admin/offices', { signal }),
        api('/admin/users', { signal }),
        api('/admin/menu-items', { signal }),
        api('/admin/settings', { signal }),
        api('/admin/logs?take=100', { signal }),
        api('/admin/presence', { signal }),
        api('/admin/dashboard', { signal }),
        api('/announcements', { signal }),
        api('/kitchen/tickets', { signal }).catch((err) => {
          if (err?.name === 'AbortError') throw err;
          return { tickets: [] };
        }),
      ]);
      if (signal?.aborted) return;
      setOffices(o.offices);
      setUsers(u.users);
      setMenu(m.items);
      setSettings(s.settings);
      setLogs(l.logs);
      setPresence(p.offices);
      setDashboard(d);
      setAnnouncements(a.announcements);
      applyKitchenCounts(k.tickets);
      setError('');
    },
    [applyKitchenCounts]
  );

  /** Soft reconnect: kitchen counters only (presence via socket; static data kept). */
  const softReconnect = useCallback(
    async (signal) => {
      const k = await api('/kitchen/tickets', { signal }).catch((err) => {
        if (err?.name === 'AbortError') throw err;
        return { tickets: [] };
      });
      if (signal?.aborted) return;
      applyKitchenCounts(k.tickets);
    },
    [applyKitchenCounts]
  );

  useEffect(() => {
    const ac = new AbortController();
    refresh(ac.signal)
      .catch((e) => {
        if (e?.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setBooting(false);
      });
    return () => ac.abort();
  }, [refresh]);

  useEffect(() => {
    if (reconnectKey === 0) return;
    const ac = new AbortController();
    softReconnect(ac.signal).catch((e) => {
      if (e?.name === 'AbortError' || ac.signal.aborted) return;
      setError(e.message);
    });
    return () => ac.abort();
  }, [reconnectKey, softReconnect]);

  useEffect(() => {
    api('/version')
      .then(setApiMeta)
      .catch(() => setApiMeta(null));
  }, []);

  useEffect(() => {
    let dashboardTimer = null;
    const off = on('presence:update', (payload) => {
      const officeId = payload?.officeId;
      if (officeId) {
        setPresence((prev) =>
          prev.map((block) =>
            block.office?.id === officeId
              ? { ...block, users: payload.users || [] }
              : block
          )
        );
      }

      if (dashboardTimer) clearTimeout(dashboardTimer);
      dashboardTimer = setTimeout(() => {
        dashboardTimer = null;
        api('/admin/dashboard')
          .then(setDashboard)
          .catch(() => {});
      }, 2500);
    });
    return () => {
      off();
      if (dashboardTimer) clearTimeout(dashboardTimer);
    };
  }, [on]);

  const onlineMap = useMemo(() => {
    const map = new Map();
    for (const block of presence) {
      for (const u of block.users || []) map.set(u.id, !!u.online);
    }
    return map;
  }, [presence]);

  const lastLoginMap = useMemo(() => {
    const map = new Map();
    for (const l of logs) {
      if (l.action !== 'auth.login' || !l.actor?.id) continue;
      if (!map.has(l.actor.id)) map.set(l.actor.id, l.createdAt);
    }
    return map;
  }, [logs]);

  const userMap = useMemo(() => {
    const map = new Map();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const officeMap = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      if (!u.officeId) continue;
      let list = map.get(u.officeId);
      if (!list) {
        list = [];
        map.set(u.officeId, list);
      }
      list.push(u);
    }
    return map;
  }, [users]);

  const lastOrderLogByOffice = useMemo(() => {
    const map = new Map();
    const orderAction = /session\.|ticket\.|kitchen\./;
    for (const l of logs) {
      if (!orderAction.test(l.action || '')) continue;
      const actor = userMap.get(l.actor?.id);
      const officeId = actor?.officeId;
      if (!officeId || map.has(officeId)) continue;
      map.set(officeId, l);
    }
    return map;
  }, [logs, userMap]);

  const officeStats = useMemo(() => {
    return offices.map((o) => {
      const members = officeMap.get(o.id) || [];
      let onlineCount = 0;
      for (const u of members) {
        if (onlineMap.get(u.id)) onlineCount += 1;
      }
      const lastOrderLog = lastOrderLogByOffice.get(o.id) || null;
      return {
        office: o,
        members,
        onlineCount,
        activeOrder: Boolean(o.activeCollectingSessionId),
        lastOrderAt: lastOrderLog?.createdAt || null,
        lastOrderText: lastOrderLog ? logSentence(lastOrderLog) : null,
      };
    });
  }, [offices, officeMap, onlineMap, lastOrderLogByOffice]);

  const enrichLogs = useCallback(
    (list) =>
      list.map((l) => {
        if (!l.actor) return l;
        const full = userMap.get(l.actor.id);
        return {
          ...l,
          actor: {
            ...l.actor,
            office: full?.office || null,
          },
        };
      }),
    [userMap]
  );

  const staticValue = useMemo(
    () => ({
      offices,
      users,
      menu,
      setMenu,
      logs,
      settings,
      setSettings,
      announcements,
      booting,
      error,
      setError,
      lastLoginMap,
      apiMeta,
      refresh,
      enrichLogs,
      notify: toast,
    }),
    [
      offices,
      users,
      menu,
      logs,
      settings,
      announcements,
      booting,
      error,
      lastLoginMap,
      apiMeta,
      refresh,
      enrichLogs,
      toast,
    ]
  );

  const liveValue = useMemo(
    () => ({
      presence,
      dashboard,
      pendingKitchen,
      kitchenStats,
      onlineMap,
      officeStats,
    }),
    [presence, dashboard, pendingKitchen, kitchenStats, onlineMap, officeStats]
  );

  return (
    <AdminStaticContext.Provider value={staticValue}>
      <AdminLiveContext.Provider value={liveValue}>{children}</AdminLiveContext.Provider>
    </AdminStaticContext.Provider>
  );
}

export function useAdminStatic() {
  const ctx = useContext(AdminStaticContext);
  if (!ctx) throw new Error('useAdminStatic must be used within AdminDataProvider');
  return ctx;
}

export function useAdminLive() {
  const ctx = useContext(AdminLiveContext);
  if (!ctx) throw new Error('useAdminLive must be used within AdminDataProvider');
  return ctx;
}

/** Merges static + live (re-renders on either). Prefer useAdminStatic / useAdminLive. */
export function useAdminData() {
  const staticCtx = useAdminStatic();
  const liveCtx = useAdminLive();
  return useMemo(() => ({ ...staticCtx, ...liveCtx }), [staticCtx, liveCtx]);
}
