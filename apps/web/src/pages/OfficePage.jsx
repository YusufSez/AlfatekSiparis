import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import { useCountdown } from '../lib/useCountdown';
import { useConfirm } from '../lib/confirm';
import { initials } from '../lib/format';
import { iconMeta } from '../lib/uxLabels';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { Skeleton, LoadError, OfflineBanner, EmptyState } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';
import { StatusDot } from '../components/Badge';
import { showOsNotification } from '../lib/osNotify';

function eventLabel(type, actor, payload) {
  const who = actor?.name || 'Sistem';
  switch (type) {
    case 'session.opened':
      return `${who} sipariş açtı`;
    case 'session.line_upserted':
      return payload?.note
        ? `${who}: ${payload.qty}× ${payload.menuItemName} (${payload.note})`
        : `${who}: ${payload.qty}× ${payload.menuItemName}`;
    case 'session.line_removed':
      return `${who} ${payload.menuItemName} kaldırdı`;
    case 'session.left':
      return `${who} siparişten çıktı`;
    case 'session.skipped':
      return `${who} isteğinin olmadığını bildirdi`;
    case 'session.sent':
      return 'Mutfağa gönderildi';
    case 'session.closed':
      return payload?.message || (payload?.reason === 'cancel' ? `${who} siparişi iptal etti` : 'Sipariş kapandı');
    case 'ticket.preparing':
      return 'Hazırlanıyor';
    case 'ticket.delivered':
      return 'Teslim edildi';
    default:
      return type;
  }
}

/** Collapse consecutive qty bumps for same user + product (display only). */
function groupTimelineEvents(events, { windowMs = 90_000 } = {}) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const grouped = [];

  for (const event of events) {
    if (event.type !== 'session.line_upserted') {
      grouped.push(event);
      continue;
    }

    const last = grouped[grouped.length - 1];
    const sameActor = last?.actor?.id && event.actor?.id && last.actor.id === event.actor.id;
    const sameItem =
      last?.payload?.menuItemId &&
      event.payload?.menuItemId &&
      last.payload.menuItemId === event.payload.menuItemId;
    const closeInTime =
      last?.createdAt &&
      event.createdAt &&
      Math.abs(new Date(event.createdAt).getTime() - new Date(last.createdAt).getTime()) <= windowMs;

    if (last?.type === 'session.line_upserted' && sameActor && sameItem && closeInTime) {
      grouped[grouped.length - 1] = {
        ...event,
        id: last.id,
        groupKey: last.groupKey || last.id,
        createdAt: last.createdAt,
      };
      continue;
    }

    grouped.push({ ...event, groupKey: event.id });
  }

  return grouped;
}

function isOtherItem(item) {
  return item?.icon === 'other' || item?.name?.toLocaleLowerCase?.('tr') === 'diğer';
}

function buildOrderReceipt(source) {
  if (!source) return null;

  let items = (source.summary || [])
    .filter((s) => (s.qty || 0) > 0)
    .map((s) => ({
      menuItemId: s.menuItemId,
      name: s.name,
      icon: s.icon,
      qty: s.qty,
    }));

  if (items.length === 0 && Array.isArray(source.lines)) {
    const map = new Map();
    for (const line of source.lines) {
      if (!line?.qty) continue;
      const key = line.menuItemId || line.menuItem?.id;
      const prev = map.get(key) || {
        menuItemId: key,
        name: line.menuItem?.name || line.menuItemName || 'Ürün',
        icon: line.menuItem?.icon || line.icon,
        qty: 0,
      };
      prev.qty += line.qty;
      map.set(key, prev);
    }
    items = [...map.values()];
  }

  if (items.length === 0 && Array.isArray(source.details)) {
    const map = new Map();
    for (const d of source.details) {
      if (!d?.qty) continue;
      const key = d.menuItemId;
      const prev = map.get(key) || {
        menuItemId: key,
        name: d.menuItemName || 'Ürün',
        icon: d.icon,
        qty: 0,
      };
      prev.qty += d.qty;
      map.set(key, prev);
    }
    items = [...map.values()];
  }

  const notes = [];
  const seen = new Set();
  function pushNote(note, userName, itemName) {
    if (!note) return;
    const key = `${userName || ''}::${itemName || ''}::${note}`;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({ note, userName: userName || null, itemName: itemName || null });
  }

  for (const s of source.summary || []) {
    for (const n of s.notes || []) pushNote(n.note, n.userName, s.name);
  }
  for (const line of source.lines || []) {
    pushNote(line.note, line.user?.name, line.menuItem?.name);
  }
  for (const d of source.details || []) {
    pushNote(d.note, d.userName, d.menuItemName);
  }

  if (items.length === 0 && notes.length === 0) return null;

  const orderId = source.sessionId || source.id || null;

  return {
    id: orderId,
    sessionId: source.sessionId || (source.lines ? source.id : null) || orderId,
    ticketId: source.sessionId ? source.id : null,
    items,
    notes,
    sentAt: source.confirmedAt || source.createdAt || source.updatedAt || new Date().toISOString(),
    total: source.total ?? source.totalAmount ?? null,
  };
}

function formatOrderTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const RECEIPT_STATUS = {
  dispatching: 'Mutfağa gönderiliyor…',
  collected: 'Mutfağa gönderildi',
  preparing: 'Mutfakta hazırlanıyor',
  delivered: 'Teslim edildi',
};

const ORDER_HISTORY_FETCH_LIMIT = 20;
const ORDER_HISTORY_PREVIEW = 5;
const ORDER_HISTORY_PREFIX = 'alfatek-office-order-history';
const ORDER_HISTORY_VERSION = 'v2';

function orderHistoryStorageKey(userId, officeId) {
  return `${ORDER_HISTORY_PREFIX}:${ORDER_HISTORY_VERSION}:${userId || 'u'}:${officeId || 'o'}`;
}

/** Drop legacy office-only keys so DB-clean ghosts disappear. */
function clearLegacyOrderHistoryKeys() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(ORDER_HISTORY_PREFIX)) continue;
      if (!key.includes(`:${ORDER_HISTORY_VERSION}:`)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
    if (doomed.length) {
      console.log('[order-history] cleared legacy localStorage keys', doomed);
    }
  } catch {
    /* ignore */
  }
}

function ticketToHistoryEntry(ticket) {
  const receipt = buildOrderReceipt(ticket);
  if (!receipt?.items?.length || !ticket?.sessionId) return null;
  return {
    id: ticket.sessionId,
    sessionId: ticket.sessionId,
    ticketId: ticket.id,
    items: receipt.items,
    notes: receipt.notes || [],
    sentAt: ticket.createdAt || receipt.sentAt,
    _source: 'api',
  };
}

function loadCachedOrderHistory(userId, officeId) {
  if (!userId || !officeId) return [];
  try {
    const raw = localStorage.getItem(orderHistoryStorageKey(userId, officeId));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry) => entry?.sessionId && Array.isArray(entry.items) && entry.items.length)
      .slice(0, ORDER_HISTORY_FETCH_LIMIT)
      .map((entry) => ({ ...entry, _source: entry._source || 'localStorage' }));
  } catch {
    return [];
  }
}

function saveCachedOrderHistory(userId, officeId, list) {
  if (!userId || !officeId) return;
  try {
    const clean = (list || [])
      .filter((entry) => entry?.sessionId && Array.isArray(entry.items) && entry.items.length)
      .slice(0, ORDER_HISTORY_FETCH_LIMIT)
      .map(({ id, sessionId, ticketId, items, notes, sentAt, total }) => ({
        id: id || sessionId,
        sessionId,
        ticketId: ticketId || null,
        items,
        notes: notes || [],
        sentAt,
        total: total ?? null,
      }));
    localStorage.setItem(orderHistoryStorageKey(userId, officeId), JSON.stringify(clean));
  } catch {
    /* ignore quota */
  }
}

function receiptFingerprint(receipt) {
  const items = (receipt.items || []).map((i) => `${i.menuItemId || i.name}:${i.qty}`).join(',');
  return `${receipt.sessionId || receipt.id || ''}|${items}|${String(receipt.sentAt || '').slice(0, 16)}`;
}

function pushOrderHistoryLocal(userId, officeId, receipt) {
  if (!userId || !officeId || !receipt?.items?.length || !receipt.sessionId) {
    return loadCachedOrderHistory(userId, officeId);
  }
  const id = receipt.sessionId;
  const entry = {
    id,
    sessionId: receipt.sessionId,
    ticketId: receipt.ticketId || null,
    items: receipt.items,
    notes: receipt.notes || [],
    sentAt: receipt.sentAt,
    total: receipt.total ?? null,
    _source: 'state',
  };
  const existing = loadCachedOrderHistory(userId, officeId);
  const fp = receiptFingerprint(entry);
  const next = [
    entry,
    ...existing.filter((x) => x.sessionId !== id && receiptFingerprint(x) !== fp),
  ].slice(0, ORDER_HISTORY_FETCH_LIMIT);
  saveCachedOrderHistory(userId, officeId, next);
  return next;
}

function formatHistoryWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
    return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
  } catch {
    return '—';
  }
}

function OrderHistoryAccordion({ entries }) {
  const [expanded, setExpanded] = useState(false);
  if (!entries?.length) return null;

  const visible = expanded ? entries : entries.slice(0, ORDER_HISTORY_PREVIEW);
  const canExpand = entries.length > ORDER_HISTORY_PREVIEW;

  return (
    <details className="order-history-accordion">
      <summary className="order-history-summary">
        <span className="order-history-title">
          <span className="order-history-ico" aria-hidden>
            🕘
          </span>
          Geçmiş Siparişler
        </span>
        <span className="order-history-count">{entries.length}</span>
        <span className="order-history-chevron" aria-hidden>
          ›
        </span>
      </summary>
      <p className="order-history-hint muted tiny">Son siparişleriniz</p>
      <div className="order-history-list">
        {visible.map((entry) => (
          <article key={entry.id} className="order-history-item">
            <time className="order-history-when">{formatHistoryWhen(entry.sentAt)}</time>
            <ul className="order-history-products">
              {(entry.items || []).map((item) => (
                <li key={`${entry.id}-${item.menuItemId || item.name}`}>
                  <span aria-hidden>{iconMeta(item.icon).emoji}</span>
                  <span>
                    {item.name} x{item.qty}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {canExpand && (
        <button
          type="button"
          className="order-history-more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Daha az göster' : 'Daha fazla göster'}
        </button>
      )}
    </details>
  );
}

export default function OfficePage() {
  const { user, logout } = useAuth();
  const { on, connected, reconnectKey } = useSocket();
  const { confirm: confirmDialog } = useConfirm();
  const online = useOnline(connected);
  const [session, setSession] = useState(null);
  const [menu, setMenu] = useState([]);
  const [events, setEvents] = useState([]);
  const [presence, setPresence] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [otherDraft, setOtherDraft] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  /** collecting | dispatching | collected | preparing | delivered | null */
  const [orderPhase, setOrderPhase] = useState(null);
  const [lastSentOrder, setLastSentOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [shortageAlert, setShortageAlert] = useState(null);
  const { label, urgent, remaining } = useCountdown(session?.endsAt);

  useEffect(() => {
    clearLegacyOrderHistoryKeys();
    if (!user?.id || !user?.officeId) {
      setOrderHistory([]);
      console.log('[order-history] source=state empty (no user/office)');
      return;
    }

    const cached = loadCachedOrderHistory(user.id, user.officeId);
    console.log('[order-history] source=localStorage', cached);

    let cancelled = false;
    api(`/sessions/history?limit=${ORDER_HISTORY_FETCH_LIMIT}`)
      .then((data) => {
        if (cancelled) return;
        const fromApi = (data.tickets || []).map(ticketToHistoryEntry).filter(Boolean);
        console.log('[order-history] source=API', fromApi);
        setOrderHistory(fromApi);
        saveCachedOrderHistory(user.id, user.officeId, fromApi);
        console.log('[order-history] source=state (synced from API)', fromApi);
      })
      .catch((err) => {
        if (cancelled) return;
        console.log('[order-history] API failed — not showing unverified cache', err?.message);
        setOrderHistory([]);
        saveCachedOrderHistory(user.id, user.officeId, []);
        console.log('[order-history] source=state empty (API error)');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.officeId, reconnectKey]);

  const rememberSentOrder = useCallback(
    (sourceOrReceipt) => {
      const receipt =
        sourceOrReceipt && Array.isArray(sourceOrReceipt.items) && sourceOrReceipt.sentAt
          ? sourceOrReceipt
          : buildOrderReceipt(sourceOrReceipt);
      if (!receipt) return;
      if (!receipt.sessionId) {
        receipt.sessionId = receipt.id || null;
      }
      if (!receipt.sessionId) {
        console.log('[order-history] skip remember — missing sessionId', receipt);
        return;
      }
      receipt.id = receipt.sessionId;
      setLastSentOrder((prev) => {
        if (!prev) return receipt;
        if (prev.sessionId && receipt.sessionId && prev.sessionId === receipt.sessionId) {
          return { ...prev, ...receipt, id: receipt.sessionId, sessionId: receipt.sessionId };
        }
        if (!prev.sessionId && receipt.sessionId) {
          return { ...prev, ...receipt, id: receipt.sessionId, sessionId: receipt.sessionId };
        }
        return prev;
      });
      const next = pushOrderHistoryLocal(user?.id, user?.officeId, receipt);
      setOrderHistory(next);
      console.log('[order-history] source=state (after send)', next);
    },
    [user?.id, user?.officeId]
  );

  const pastOrders = useMemo(() => {
    if (!lastSentOrder) return orderHistory;
    const currentId = lastSentOrder.id || lastSentOrder.sessionId;
    const fp = receiptFingerprint(lastSentOrder);
    return orderHistory.filter((entry) => {
      if (currentId && (entry.id === currentId || entry.sessionId === currentId)) return false;
      return receiptFingerprint(entry) !== fp;
    });
  }, [orderHistory, lastSentOrder]);

  const load = useCallback(async () => {
    const [active, menuRes, presenceRes] = await Promise.all([
      api('/sessions/active'),
      api('/menu'),
      api('/sessions/presence'),
    ]);
    setSession(active.session);
    setMenu(menuRes.items);
    setPresence(presenceRes.users || active.session?.presence || []);
    if (active.session) {
      setOrderPhase('collecting');
      const ev = await api(`/sessions/${active.session.id}/events`);
      setEvents(ev.events);
    } else {
      setEvents([]);
      setOrderPhase(null);
      setLastSentOrder(null);
    }
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [load, reconnectKey]);

  useEffect(() => {
    if (!session || remaining > 0) return;
    rememberSentOrder(session);
    setOrderPhase('dispatching');
    const t = setTimeout(() => {
      setOrderPhase((p) => (p === 'dispatching' ? 'collected' : p));
    }, 1800);
    return () => clearTimeout(t);
  }, [session, remaining, rememberSentOrder]);

  useEffect(() => {
    const offs = [
      on('session:opened', (payload) => {
        setSession(payload);
        setOrderPhase('collecting');
        // No notifyUsers for open — keep a single OS toast here
        showOsNotification('Yeni sipariş', `${payload.openedBy.name} sipariş açtı`, {
          event: 'session.opened',
          payload: { sessionId: payload.id },
        });
      }),
      on('session:updated', (payload) => {
        if (payload == null || payload.session === null) {
          setSession(null);
          return;
        }
        setSession(payload);
        setOrderPhase('collecting');
        if (payload?.presence) setPresence(payload.presence);
      }),
      on('session:sent', (payload) => {
        rememberSentOrder(payload);
        setSession(null);
        setOrderPhase('dispatching');
        setTimeout(() => setOrderPhase((p) => (p === 'dispatching' ? 'collected' : p)), 1600);
      }),
      on('session:closed', (payload) => {
        setSession(null);
        setOrderPhase(null);
        setLastSentOrder(null);
      }),
      on('presence:update', (payload) => {
        if (payload.officeId === user.officeId) setPresence(payload.users);
      }),
      on('kitchen:updated', (ticket) => {
        if (ticket.officeId !== user.officeId) return;
        if (ticket.status === 'preparing') {
          setOrderPhase('preparing');
        } else if (ticket.status === 'delivered') {
          setOrderPhase('delivered');
          setTimeout(() => {
            setOrderPhase((p) => (p === 'delivered' ? null : p));
            setLastSentOrder(null);
          }, 8000);
        } else if (ticket.status === 'new') {
          setOrderPhase('collected');
          rememberSentOrder(ticket);
        }
      }),
      on('kitchen:new_ticket', (ticket) => {
        if (ticket.officeId !== user.officeId) return;
        setOrderPhase('collected');
        rememberSentOrder(ticket);
      }),
      on('kitchen:unavailable', (payload) => {
        if (payload?.officeId && payload.officeId !== user.officeId) return;
        setShortageAlert({
          ticketId: payload?.ticketId,
          items: payload?.items || [],
          note: payload?.note || '',
          at: new Date().toISOString(),
        });
      }),
      // OS toasts for inbox events → NotificationCenter (role-filtered)
    ];
    return () => offs.forEach((off) => off());
  }, [on, user.officeId, rememberSentOrder]);

  useEffect(() => {
    if (!session?.id) return;
    api(`/sessions/${session.id}/events`)
      .then((ev) => setEvents(ev.events))
      .catch(() => {});
  }, [session?.id, session?.lines?.length, session?.skippedUsers?.length, session?.status]);

  const myQty = useMemo(() => {
    const map = {};
    if (!session) return map;
    for (const line of session.lines) {
      if (line.userId === user.id) map[line.menuItemId] = { qty: line.qty, note: line.note };
    }
    return map;
  }, [session, user.id]);

  const isOpener = session?.openedBy?.id === user.id;
  const myHasLines = session?.lines?.some((l) => l.userId === user.id && l.qty > 0);
  const mySkipped = session?.skippedUsers?.some((u) => u.id === user.id);
  const otherItem = useMemo(() => menu.find(isOtherItem), [menu]);
  const regularMenu = useMemo(() => menu.filter((item) => !isOtherItem(item)), [menu]);

  const presenceList = presence.length ? presence : session?.presence || [];

  const timerTone =
    remaining > 0 && remaining <= 5
      ? 'final'
      : remaining > 0 && remaining <= 10
        ? 'critical'
        : remaining > 0 && remaining <= 30
          ? 'warn'
          : '';

  const statusMeta = {
    collecting: { icon: '🟡', title: 'Sipariş Toplanıyor', hint: 'Herkes seçimini yapsın' },
    dispatching: { icon: '📤', title: 'Sipariş mutfağa gönderiliyor…', hint: 'Lütfen bekleyin' },
    collected: { icon: '✓', title: 'Sipariş toplandı', hint: 'Mutfak sıraya aldı' },
    preparing: { icon: '🍳', title: 'Mutfakta Hazırlanıyor', hint: 'Siparişiniz hazırlanıyor' },
    delivered: { icon: '✅', title: 'Teslim Edildi', hint: 'Afiyet olsun' },
  };

  const activePhase = session ? (orderPhase === 'dispatching' ? 'dispatching' : 'collecting') : orderPhase;
  const status = activePhase ? statusMeta[activePhase] : null;

  const specialNotes = useMemo(() => {
    if (!session?.summary) return [];
    const notes = [];
    for (const s of session.summary) {
      if (!(s.icon === 'other' || String(s.name || '').toLocaleLowerCase('tr') === 'diğer')) continue;
      for (const n of s.notes || []) notes.push(n);
    }
    return notes;
  }, [session?.summary]);

  const timelineEvents = useMemo(() => groupTimelineEvents(events), [events]);

  const menuIconById = useMemo(() => {
    const map = new Map();
    for (const item of menu) map.set(item.id, item.icon);
    return map;
  }, [menu]);

  async function openSession() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/sessions', { method: 'POST', body: {} });
      setSession(data.session);
      setLastSentOrder(null);
      setOrderPhase('collecting');
    } catch (err) {
      setError(err.message);
      if (err.data?.session) setSession(err.data.session);
    } finally {
      setBusy(false);
    }
  }

  async function setQty(menuItemId, qty, note = null) {
    if (!session) return;
    setError('');
    try {
      const body = { menuItemId, qty };
      if (note != null) body.note = note;
      const data = await api(`/sessions/${session.id}/lines`, {
        method: 'POST',
        body,
      });
      setSession(data.session);
    } catch (err) {
      setError(err.message);
    }
  }

  async function tapItem(item) {
    if (isOtherItem(item)) {
      const current = myQty[item.id];
      setOtherDraft(current?.note || '');
      setOtherOpen(true);
      return;
    }
    const qty = myQty[item.id]?.qty || 0;
    await setQty(item.id, qty + 1);
  }

  async function saveOther() {
    if (!otherItem || !session) return;
    const note = otherDraft.trim();
    if (!note) {
      setError('Diğer için açıklama yazın');
      return;
    }
    const qty = myQty[otherItem.id]?.qty || 0;
    await setQty(otherItem.id, Math.max(1, qty), note);
    setOtherOpen(false);
  }

  async function leave() {
    if (!session) return;
    setBusy(true);
    try {
      const data = await api(`/sessions/${session.id}/leave`, { method: 'POST', body: {} });
      setSession(data.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const data = await api(`/sessions/${session.id}/skip`, { method: 'POST', body: {} });
      setSession(data.session);
      setOtherOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    const ok = await confirmDialog({
      title: 'Oturumu kapat',
      message: 'Sipariş onaylanmadan kapatılacak. Mutfağa ticket gitmeyecek. Devam?',
      confirmLabel: 'Oturumu kapat',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api(`/sessions/${session.id}/close`, { method: 'POST', body: {} });
      setSession(null);
      setOrderPhase(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!session) return;
    if (session.pendingUsers?.length) {
      const names = session.pendingUsers.map((u) => u.name).join(', ');
      const ok = await confirmDialog({
        title: 'Siparişi gönder',
        message: `Henüz cevap vermeyenler: ${names}. Yine de mutfağa göndermek istiyor musunuz?`,
        confirmLabel: 'Gönder',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const receipt = buildOrderReceipt(session);
      await api(`/sessions/${session.id}/confirm`, { method: 'POST', body: {} });
      if (receipt) rememberSentOrder(receipt);
      setSession(null);
      setOrderPhase('dispatching');
      setTimeout(() => setOrderPhase((p) => (p === 'dispatching' ? 'collected' : p)), 1600);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <AppHeader
        title={user.office?.name || 'Ofis'}
        subtitle={connected ? 'Canlı bağlantı' : 'Yeniden bağlanıyor…'}
        accent={user.office?.color}
        onLogout={logout}
        userName={user.name}
      />

      <main className="content">
        <AnnouncementBanner />
        <OfflineBanner online={online} onRetry={() => load().catch((e) => setError(e.message))} />
        {shortageAlert && (
          <div className="shortage-alert" role="status">
            <div className="shortage-alert-main">
              <strong>⚠ Siparişinizde eksik ürün var</strong>
              <p>
                {(shortageAlert.items || []).map((i) => i.name).filter(Boolean).join(', ') || 'Ürün'}{' '}
                mevcut olmadığı için hazırlanamadı.
              </p>
              {shortageAlert.note ? <p className="shortage-alert-note">{shortageAlert.note}</p> : null}
              {shortageAlert.ticketId ? (
                <p className="muted tiny">Sipariş: #{String(shortageAlert.ticketId).slice(-6)}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShortageAlert(null)}
              aria-label="Kapat"
            >
              ✕
            </button>
          </div>
        )}
        <LoadError
          message={error}
          onRetry={() => {
            setError('');
            load().catch((e) => setError(e.message));
          }}
        />

        {booting ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <section className="presence-bar office-presence">
              {presenceList.map((u) => (
                <span
                  key={u.id}
                  className={`presence-chip rich ${u.online ? 'on' : 'off'} resp-${u.response || 'pending'}`}
                >
                  <span className="avatar sm">{initials(u.name)}</span>
                  <StatusDot online={u.online} />
                  <span>{u.name}</span>
                  {u.response === 'skipped' && <em className="resp-badge skip">Gelmeyecek</em>}
                  {u.response === 'ordered' && <em className="resp-badge ordered">Sipariş</em>}
                </span>
              ))}
            </section>

            {!session && !status && (
              <section className="order-idle-screen">
                <div className="order-success-primary">
                  <EmptyState
                    icon="🧾"
                    title="Sipariş yok"
                    description="Ofisiniz için yeni bir toplu sipariş açın. Herkes anında bildirim alır."
                  />
                  <div className="order-success-cta order-idle-cta">
                    <button
                      type="button"
                      className="btn primary xl pressable order-success-btn"
                      disabled={busy}
                      onClick={openSession}
                    >
                      <span className="order-cta-ico" aria-hidden>
                        🛒
                      </span>
                      <span>Sipariş aç</span>
                    </button>
                  </div>
                </div>
                <OrderHistoryAccordion entries={orderHistory} />
              </section>
            )}

            {!session && status && (
              <section className={`order-success-screen phase-${activePhase}`}>
                <div className="order-success-primary">
                  <div className="order-success-body">
                    <div className={`order-success-hero office-phase-card phase-${activePhase}`}>
                      <span className="office-status-icon" aria-hidden>
                        {status.icon}
                      </span>
                      <div>
                        <strong>{status.title}</strong>
                        <p className="muted">{status.hint}</p>
                      </div>
                    </div>

                    {lastSentOrder && activePhase !== 'dispatching' && (
                      <article className="order-receipt-card" aria-label="Sipariş özeti">
                        <header className="order-receipt-head">
                          <h3>Sipariş Özeti</h3>
                        </header>

                        {lastSentOrder.items.length > 0 ? (
                          <ul className="order-receipt-items">
                            {lastSentOrder.items.map((item) => (
                              <li key={item.menuItemId || `${item.name}-${item.qty}`}>
                                <span className="order-receipt-emoji" aria-hidden>
                                  {iconMeta(item.icon).emoji}
                                </span>
                                <span className="order-receipt-name">{item.name}</span>
                                <span className="order-receipt-qty">x{item.qty}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted tiny">Ürün detayı bulunamadı</p>
                        )}

                        {lastSentOrder.notes.length > 0 && (
                          <div className="order-receipt-notes">
                            <h4>Not</h4>
                            <ul>
                              {lastSentOrder.notes.map((n, i) => (
                                <li key={`${n.note}-${i}`}>
                                  <span className="note-text">{n.note}</span>
                                  {(n.userName || n.itemName) && (
                                    <span className="note-meta muted tiny">
                                      {[n.itemName, n.userName].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <dl className="order-receipt-meta">
                          <div>
                            <dt>Durum</dt>
                            <dd>{RECEIPT_STATUS[activePhase] || status.title}</dd>
                          </div>
                          <div>
                            <dt>Saat</dt>
                            <dd>{formatOrderTime(lastSentOrder.sentAt)}</dd>
                          </div>
                          {lastSentOrder.total != null && lastSentOrder.total !== '' && (
                            <div>
                              <dt>Toplam</dt>
                              <dd>{lastSentOrder.total}</dd>
                            </div>
                          )}
                        </dl>
                      </article>
                    )}
                  </div>

                  {(activePhase === 'delivered' ||
                    activePhase === 'collected' ||
                    activePhase === 'preparing') && (
                    <div className="order-success-cta">
                      <button
                        type="button"
                        className="btn primary xl pressable order-success-btn"
                        disabled={busy}
                        onClick={openSession}
                      >
                        <span className="order-cta-ico" aria-hidden>
                          🛒
                        </span>
                        <span>Yeni sipariş aç</span>
                      </button>
                    </div>
                  )}
                </div>

                {activePhase !== 'dispatching' && <OrderHistoryAccordion entries={pastOrders} />}
              </section>
            )}

            {session && (
              <>
                <section
                  className={`office-timer-section tone-${timerTone} ${urgent ? 'urgent' : ''} ${
                    activePhase === 'dispatching' ? 'is-dispatching' : ''
                  }`}
                >
                  <p className="eyebrow">Aktif Sipariş</p>
                  <p className="session-opener muted">{session.openedBy.name} sipariş topluyor</p>
                  <div className="office-timer-slot">
                    {activePhase === 'dispatching' ? (
                      <div className="timer mega countdown-hero dispatching" aria-live="polite">
                        <strong className="dispatch-text">Sipariş mutfağa gönderiliyor…</strong>
                        <small>Lütfen bekleyin</small>
                      </div>
                    ) : (
                      <div
                        className={`timer mega countdown-hero tone-${timerTone} ${
                          timerTone === 'final' ? 'pulse-final' : timerTone === 'critical' ? 'pulse' : ''
                        }`}
                        aria-live="polite"
                      >
                        <strong>{label}</strong>
                        <small>{remaining === 0 ? 'Kapanıyor' : 'Kalan Süre'}</small>
                      </div>
                    )}
                  </div>
                </section>

                {status && (
                  <section className={`office-phase-card phase-${activePhase}`}>
                    <span className="office-status-icon" aria-hidden>
                      {status.icon}
                    </span>
                    <div>
                      <strong>{status.title}</strong>
                      <p className="muted">{status.hint}</p>
                    </div>
                  </section>
                )}

                <section className="office-participants-section">
                  <div className="participant-boards groups-3">
                    <div className="participant-col">
                      <h4>🟢 Sipariş Verdi</h4>
                      <div className="participant-chips scrollable">
                        {(session.participants || []).length === 0 && (
                          <span className="muted">Henüz yok</span>
                        )}
                        {(session.participants || []).map((p) => (
                          <span key={p.id} className="participant-chip joined">
                            <span className="avatar sm">{initials(p.name)}</span>
                            <span className="chip-name">{p.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="participant-col">
                      <h4>🟡 İsteğim Yok</h4>
                      <div className="participant-chips scrollable">
                        {(session.skippedUsers || []).length === 0 && (
                          <span className="muted">Henüz yok</span>
                        )}
                        {(session.skippedUsers || []).map((u) => (
                          <span key={u.id} className="participant-chip skipped">
                            <span className="avatar sm">{initials(u.name)}</span>
                            <span className="chip-name">{u.name}</span>
                            <em>Gelmeyecek</em>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="participant-col">
                      <h4>⚪ Henüz Cevap Vermedi</h4>
                      <div className="participant-chips scrollable">
                        {(session.pendingUsers || []).length === 0 && (
                          <span className="muted">Herkes cevapladı</span>
                        )}
                        {(session.pendingUsers || []).map((u) => (
                          <span key={u.id} className="participant-chip pending">
                            <span className="avatar sm">{initials(u.name)}</span>
                            <span className="chip-name">{u.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="quick-order">
                  <h3>Hızlı Sipariş</h3>
                  <p className="muted tiny">Karta dokunun — her dokunuş +1. Azaltmak için −.</p>
                  <div className="quick-order-grid tap-grid">
                    {regularMenu.map((item) => {
                      const qty = myQty[item.id]?.qty || 0;
                      return (
                        <div key={item.id} className={`quick-order-card tap-card pressable ${qty ? 'has-qty' : ''}`}>
                          {qty > 0 && <span className="qo-badge">{qty}</span>}
                          {qty > 0 && (
                            <button
                              type="button"
                              className="qo-minus"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQty(item.id, Math.max(0, qty - 1));
                              }}
                              aria-label="Azalt"
                            >
                              −
                            </button>
                          )}
                          <button
                            type="button"
                            className="quick-order-main"
                            onClick={() => tapItem(item)}
                            aria-label={`${item.name} ekle`}
                          >
                            <span className="qo-emoji" aria-hidden>
                              {iconMeta(item.icon).emoji}
                            </span>
                            <strong>{item.name}</strong>
                          </button>
                        </div>
                      );
                    })}

                    <div className={`quick-order-card tap-card special skip-card pressable ${mySkipped ? 'has-qty' : ''}`}>
                      <button
                        type="button"
                        className="quick-order-main"
                        disabled={busy || mySkipped}
                        onClick={skip}
                        aria-label="İsteğim yok"
                      >
                        <span className="qo-emoji" aria-hidden>
                          🚫
                        </span>
                        <strong>İsteğim Yok</strong>
                        {mySkipped && <em className="qo-state">Seçildi</em>}
                      </button>
                    </div>

                    {otherItem && (
                      <div
                        className={`quick-order-card tap-card special other-card pressable ${myQty[otherItem.id]?.qty ? 'has-qty' : ''}`}
                      >
                        {(myQty[otherItem.id]?.qty || 0) > 0 && (
                          <span className="qo-badge">{myQty[otherItem.id].qty}</span>
                        )}
                        {(myQty[otherItem.id]?.qty || 0) > 0 && (
                          <button
                            type="button"
                            className="qo-minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              const q = myQty[otherItem.id]?.qty || 0;
                              const note = myQty[otherItem.id]?.note;
                              setQty(otherItem.id, Math.max(0, q - 1), q - 1 > 0 ? note : null);
                            }}
                            aria-label="Azalt"
                          >
                            −
                          </button>
                        )}
                        <button
                          type="button"
                          className="quick-order-main"
                          onClick={() => tapItem(otherItem)}
                          aria-label="Diğer"
                        >
                          <span className="qo-emoji" aria-hidden>
                            📝
                          </span>
                          <strong>Diğer</strong>
                          {myQty[otherItem.id]?.note && (
                            <em className="qo-state">{myQty[otherItem.id].note}</em>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {otherOpen && otherItem && (
                    <div className="other-note-panel">
                      <label htmlFor="other-note">Ne istersiniz?</label>
                      <textarea
                        id="other-note"
                        rows={2}
                        maxLength={120}
                        placeholder="Limonlu çay, şekersiz kahve, sade soda…"
                        value={otherDraft}
                        onChange={(e) => setOtherDraft(e.target.value)}
                      />
                      <div className="other-note-actions">
                        <button type="button" className="btn ghost" onClick={() => setOtherOpen(false)}>
                          Vazgeç
                        </button>
                        <button type="button" className="btn primary pressable" onClick={saveOther}>
                          Kaydet
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="summary-panel">
                  <h3>Ofis özeti</h3>
                  {session.summary.length === 0 ? (
                    <p className="muted">Henüz sipariş yok</p>
                  ) : (
                    <ul className="summary-list">
                      {session.summary.map((s) => (
                        <li key={s.menuItemId}>
                          <span aria-hidden>{iconMeta(s.icon).emoji}</span>
                          <strong>{s.qty}×</strong> {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {specialNotes.length > 0 && (
                    <div className="special-notes-box">
                      <div className="special-notes-head">
                        <span aria-hidden>📝</span>
                        <strong>Özel İstek</strong>
                      </div>
                      <ul>
                        {specialNotes.map((n, i) => (
                          <li key={`${n.userName}-${i}`}>
                            <span className="note-text">{n.note}</span>
                            <span className="note-user">{n.userName}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="detail-lines">
                    {session.lines.map((l) => (
                      <span key={l.id} className="chip">
                        {l.user.name}: {l.qty}× {l.menuItem.name}
                        {l.note ? ` — ${l.note}` : ''}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="timeline-panel">
                  <h3>Zaman çizelgesi</h3>
                  <ul className="timeline">
                    {timelineEvents.map((e) => (
                      <li key={e.groupKey || e.id}>
                        <time>
                          {new Date(e.createdAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        {e.type === 'session.line_upserted' ? (
                          <span className="timeline-line">
                            <span className="timeline-who">{e.actor?.name || 'Sistem'}:</span>
                            <span className="timeline-product">
                              <span aria-hidden>
                                {iconMeta(
                                  menuIconById.get(e.payload?.menuItemId) || e.payload?.icon
                                ).emoji}
                              </span>
                              <span>
                                {e.payload?.menuItemName || 'Ürün'} x{e.payload?.qty ?? 0}
                                {e.payload?.note ? ` — ${e.payload.note}` : ''}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span>{eventLabel(e.type, e.actor, e.payload)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                <div className="cta-row sticky-cta">
                  {!isOpener && myHasLines && (
                    <button className="btn ghost xl pressable" disabled={busy} onClick={leave}>
                      Siparişten çık
                    </button>
                  )}
                  {isOpener ? (
                    <>
                      <button className="btn ghost xl danger-ghost pressable" disabled={busy} onClick={closeSession}>
                        Oturumu Kapat
                      </button>
                      <button className="btn primary xl pressable" disabled={busy} onClick={confirm}>
                        Mutfağa gönder
                      </button>
                    </>
                  ) : (
                    <p className="muted center grow">
                      Siparişi {session.openedBy.name} onaylayacak veya süre dolunca gidecek.
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
