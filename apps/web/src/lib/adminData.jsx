import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useSocket } from './socket';
import { useToast } from './toast';
import { logSentence } from './uxLabels';

const AdminDataContext = createContext(null);

export function AdminDataProvider({ children }) {
  const { on, reconnectKey, connected } = useSocket();
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
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [apiMeta, setApiMeta] = useState(null);

  const refresh = useCallback(async () => {
    const [o, u, m, s, l, p, d, a, k] = await Promise.all([
      api('/admin/offices'),
      api('/admin/users'),
      api('/admin/menu-items'),
      api('/admin/settings'),
      api('/admin/logs?take=100'),
      api('/admin/presence'),
      api('/admin/dashboard'),
      api('/announcements'),
      api('/kitchen/tickets').catch(() => ({ tickets: [] })),
    ]);
    setOffices(o.offices);
    setUsers(u.users);
    setMenu(m.items);
    setSettings(s.settings);
    setLogs(l.logs);
    setPresence(p.offices);
    setDashboard(d);
    setAnnouncements(a.announcements);
    setPendingKitchen((k.tickets || []).length);
    setError('');
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
  }, [reconnectKey, refresh]);

  useEffect(() => {
    api('/version')
      .then(setApiMeta)
      .catch(() => setApiMeta(null));
  }, []);

  useEffect(() => {
    return on('presence:update', () => {
      api('/admin/presence')
        .then((p) => setPresence(p.offices))
        .catch(() => {});
      api('/admin/dashboard')
        .then(setDashboard)
        .catch(() => {});
    });
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

  const officeStats = useMemo(() => {
    return offices.map((o) => {
      const members = users.filter((u) => u.officeId === o.id);
      const onlineCount = members.filter((u) => onlineMap.get(u.id)).length;
      const officeLogs = logs.filter((l) => {
        const actor = users.find((u) => u.id === l.actor?.id);
        return actor?.officeId === o.id && /session\.|ticket\.|kitchen\./.test(l.action || '');
      });
      const lastOrderLog = officeLogs[0] || null;
      return {
        office: o,
        members,
        onlineCount,
        activeOrder: Boolean(o.activeCollectingSessionId),
        lastOrderAt: lastOrderLog?.createdAt || null,
        lastOrderText: lastOrderLog ? logSentence(lastOrderLog) : null,
      };
    });
  }, [offices, users, onlineMap, logs]);

  const enrichLogs = useCallback(
    (list) =>
      list.map((l) => {
        if (!l.actor) return l;
        const full = users.find((u) => u.id === l.actor.id);
        return {
          ...l,
          actor: {
            ...l.actor,
            office: full?.office || null,
          },
        };
      }),
    [users]
  );

  const value = useMemo(
    () => ({
      offices,
      users,
      menu,
      setMenu,
      logs,
      presence,
      settings,
      setSettings,
      dashboard,
      announcements,
      pendingKitchen,
      booting,
      error,
      setError,
      connected,
      onlineMap,
      lastLoginMap,
      officeStats,
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
      presence,
      settings,
      dashboard,
      announcements,
      pendingKitchen,
      booting,
      error,
      connected,
      onlineMap,
      lastLoginMap,
      officeStats,
      apiMeta,
      refresh,
      enrichLogs,
      toast,
    ]
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error('useAdminData must be used within AdminDataProvider');
  return ctx;
}
