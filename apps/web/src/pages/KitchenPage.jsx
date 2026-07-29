import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocketApi, useSocketReconnectKey } from '../lib/socket';
import { useConfirm } from '../lib/confirm';
import { useToast } from '../lib/toast';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import Modal from '../components/Modal';
import { LoadError, EmptyState, CardSkeleton } from '../components/LoadStates';
import { SocketConnectionLabel, SocketOfflineBanner } from '../components/SocketStatus';
import { iconMeta } from '../lib/uxLabels';
import { isOtherItem } from '../lib/menuItemRules';

const STATUS_LABEL = {
  new: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  delivered: 'Teslim',
};

const STATUS_RANK = { new: 0, preparing: 1, delivered: 2 };

const KitchenClockContext = createContext(Date.now());

/** One shared 1s clock for all preparing timers on the board. */
function KitchenClockProvider({ active, children }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return <KitchenClockContext.Provider value={now}>{children}</KitchenClockContext.Provider>;
}

function asSummaryList(summary) {
  return Array.isArray(summary) ? summary : [];
}

function itemCount(ticket) {
  return asSummaryList(ticket.summary).reduce((sum, s) => sum + (s.qty || 0), 0);
}

function personCount(ticket) {
  const ids = new Set((ticket.details || []).map((d) => d.userId));
  return ids.size;
}

function summaryText(ticket) {
  return asSummaryList(ticket.summary)
    .map((s) => `${s.qty}× ${s.name}`)
    .join(', ');
}

function collectSpecialNotes(ticket) {
  const notes = [];
  const seen = new Set();
  function push(note, userName) {
    if (!note) return;
    const key = `${userName || ''}::${note}`;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({ userName: userName || null, note });
  }
  for (const r of ticket?.specialRequests || []) {
    push(r.note, r.userName);
  }
  for (const s of asSummaryList(ticket?.summary)) {
    if (!isOtherItem(s) || !s.notes?.length) continue;
    for (const n of s.notes) {
      push(n.note, n.userName);
    }
  }
  return notes;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function PreparingTimer({ since }) {
  const now = useContext(KitchenClockContext);
  if (!since) return null;
  return (
    <div className="prep-timer" aria-live="polite">
      <span className="prep-timer-label">Hazırlanıyor</span>
      <strong className="prep-timer-value">{formatElapsed(now - new Date(since).getTime())}</strong>
    </div>
  );
}

function OfficeBanner({ office }) {
  return (
    <div className="kitchen-office-banner" style={{ '--office': office.color }}>
      <span className="kitchen-office-swatch" aria-hidden />
      <strong>{office.name}</strong>
    </div>
  );
}

const STAFF_CALL_TTL_MS = 10 * 60 * 1000;

function parseStaffCallPayload(payload) {
  let p = payload;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = {};
    }
  }
  return p && typeof p === 'object' ? p : {};
}

function staffCallFromSocket(payload) {
  const p = parseStaffCallPayload(payload);
  const at = p.calledAt || new Date().toISOString();
  const officeId = p.officeId || `unknown-${at}`;
  return {
    id: `live-${officeId}-${at}`,
    officeId,
    officeName: p.officeName || 'Ofis',
    title: p.title || 'Cemile Abla',
    body: p.body || `${p.officeName || 'Ofis'} sizi bekliyor.`,
    at,
  };
}

function staffCallFromNotification(n) {
  const p = parseStaffCallPayload(n.payload);
  const at = p.calledAt || n.createdAt || new Date().toISOString();
  const officeId = p.officeId || n.id;
  return {
    id: n.id || `note-${officeId}-${at}`,
    officeId,
    officeName: p.officeName || 'Ofis',
    title: n.title || 'Cemile Abla',
    body: n.body || `${p.officeName || 'Ofis'} sizi bekliyor.`,
    at,
  };
}

function mergeStaffCalls(prev, incoming) {
  const byOffice = new Map();
  for (const c of [...prev, ...incoming]) {
    if (!c?.officeId) continue;
    const existing = byOffice.get(c.officeId);
    if (!existing || new Date(c.at).getTime() >= new Date(existing.at).getTime()) {
      byOffice.set(c.officeId, c);
    }
  }
  const cutoff = Date.now() - STAFF_CALL_TTL_MS;
  return [...byOffice.values()]
    .filter((c) => new Date(c.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function formatStaffCallTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function StaffCallAlerts({ calls, onDismiss }) {
  if (!calls?.length) return null;
  return (
    <section className="staff-call-alerts" aria-live="assertive" aria-label="Cemile Abla çağrıları">
      {calls.map((call) => (
        <article key={call.id} className="staff-call-card">
          <div className="staff-call-card-main">
            <p className="staff-call-eyebrow">Cemile Abla çağrısı</p>
            <strong className="staff-call-title">
              {call.officeName} sizi bekliyor
            </strong>
            <p className="staff-call-body muted">{call.body}</p>
            <time className="staff-call-time" dateTime={call.at}>
              {formatStaffCallTime(call.at)}
            </time>
          </div>
          <button
            type="button"
            className="btn ghost staff-call-dismiss"
            onClick={() => onDismiss(call)}
          >
            Tamam
          </button>
        </article>
      ))}
    </section>
  );
}

function TicketProducts({ summary }) {
  const regular = asSummaryList(summary).filter((s) => !isOtherItem(s));
  return (
    <ul className="ticket-summary kitchen-summary-boxes">
      {regular.map((s) => (
        <li key={`${s.menuItemId}-${s.name}`}>
          <span className="big-emoji" aria-hidden>
            {iconMeta(s.icon).emoji}
          </span>
          <div className="summary-box-text">
            <span className="big-qty">{s.qty}</span>
            <span className="big-name">{s.name}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SpecialNotesBox({ notes }) {
  if (!notes.length) return null;
  return (
    <div className="special-notes-box">
      <div className="special-notes-head">
        <span aria-hidden>📝</span>
        <strong>Özel İstek</strong>
      </div>
      <ul>
        {notes.map((n, i) => (
          <li key={`${n.userName}-${i}`}>
            <span className="note-text">{n.note}</span>
            {n.userName && <span className="note-user">{n.userName}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KitchenPage() {
  const { logout } = useAuth();
  const { on } = useSocketApi();
  const reconnectKey = useSocketReconnectKey();
  const { confirm: confirmDialog } = useConfirm();
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [leaving, setLeaving] = useState({});
  const [flashOk, setFlashOk] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [shortageTicket, setShortageTicket] = useState(null);
  const [shortageSelected, setShortageSelected] = useState({});
  const [shortageNote, setShortageNote] = useState('');
  const [shortageBusy, setShortageBusy] = useState(false);
  const [staffCalls, setStaffCalls] = useState([]);
  const dismissedStaffCallsRef = useRef(new Set());
  const inFlightRef = useRef(new Set());
  /** Latest kitchen:updated received while a ticket PATCH was in flight */
  const pendingSocketRef = useRef(new Map());
  const ticketsRef = useRef([]);
  const undoToastRef = useRef(null);
  const timersRef = useRef(new Set());

  function scheduleTimeout(fn, ms) {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  // Drop expired staff-call cards without a refresh
  useEffect(() => {
    if (!staffCalls.length) return undefined;
    const id = setInterval(() => {
      const cutoff = Date.now() - STAFF_CALL_TTL_MS;
      setStaffCalls((prev) => prev.filter((c) => new Date(c.at).getTime() >= cutoff));
    }, 30_000);
    return () => clearInterval(id);
  }, [staffCalls.length]);

  const applyTicketUpdate = useCallback((ticket) => {
    if (!ticket?.id) return;
    if (ticket.status === 'delivered') {
      setLeaving((m) => ({ ...m, [ticket.id]: true }));
      scheduleTimeout(() => {
        setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
        setHistory((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)].slice(0, 20));
        setLeaving((m) => {
          const next = { ...m };
          delete next[ticket.id];
          return next;
        });
      }, 420);
      return;
    }

    setTickets((prev) => {
      const exists = prev.some((t) => t.id === ticket.id);
      if (!exists) {
        setHistory((h) => h.filter((t) => t.id !== ticket.id));
        return [ticket, ...prev];
      }
      const current = prev.find((t) => t.id === ticket.id);
      if (
        current &&
        ticket.status !== 'preparing' &&
        (STATUS_RANK[ticket.status] ?? -1) < (STATUS_RANK[current.status] ?? -1)
      ) {
        return prev;
      }
      return prev.map((t) => (t.id === ticket.id ? ticket : t));
    });
  }, []);

  function releaseInFlight(ticketId) {
    inFlightRef.current.delete(ticketId);
    const pending = pendingSocketRef.current.get(ticketId);
    if (pending) {
      pendingSocketRef.current.delete(ticketId);
      applyTicketUpdate(pending);
    }
  }

  const loadTickets = useCallback(async (signal) => {
    const data = await api('/kitchen/tickets', { signal });
    if (signal?.aborted) return;
    setTickets(data.tickets);
  }, []);

  const loadHistory = useCallback(async (signal) => {
    const hist = await api('/kitchen/tickets?status=delivered&take=20', { signal });
    if (signal?.aborted) return;
    setHistory(hist.tickets || []);
  }, []);

  const hydrateStaffCalls = useCallback(async (signal) => {
    try {
      const data = await api('/notifications?take=40', { signal });
      if (signal?.aborted) return;
      const cutoff = Date.now() - STAFF_CALL_TTL_MS;
      const fresh = (data.notifications || [])
        .filter((n) => n.event === 'kitchen:staff_call' && !n.readAt)
        .map(staffCallFromNotification)
        .filter((c) => new Date(c.at).getTime() >= cutoff)
        .filter((c) => !dismissedStaffCallsRef.current.has(c.officeId));
      setStaffCalls((prev) => mergeStaffCalls(prev, fresh));
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return;
      /* non-fatal */
    }
  }, []);

  const load = useCallback(
    async (signal) => {
      // Tickets must refresh even if history fails (soft reconnect resilience)
      await loadTickets(signal);
      try {
        await loadHistory(signal);
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) throw err;
      }
      await hydrateStaffCalls(signal);
    },
    [loadTickets, loadHistory, hydrateStaffCalls]
  );

  // Boot: tickets + history
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal)
      .catch((e) => {
        if (e?.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setBooting(false);
      });
    return () => ac.abort();
  }, [load]);

  // Soft reconnect: active tickets + history (deliveries during gap)
  useEffect(() => {
    if (reconnectKey === 0) return;
    const ac = new AbortController();
    load(ac.signal).catch((e) => {
      if (e?.name === 'AbortError' || ac.signal.aborted) return;
      setError(e.message);
    });
    return () => ac.abort();
  }, [load, reconnectKey]);

  useEffect(() => {
    const offNew = on('kitchen:new_ticket', (ticket) => {
      setTickets((prev) => {
        if (prev.some((t) => t.id === ticket.id)) return prev;
        return [ticket, ...prev];
      });
      // Special order sound + OS toast → notification:new (playSound)
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    });
    // Board alert card — inbox/OS toast already via notification:new (avoid double toast)
    const offStaffCall = on('kitchen:staff_call', (payload) => {
      if (navigator.vibrate) navigator.vibrate([100, 40, 100]);
      const call = staffCallFromSocket(payload);
      if (dismissedStaffCallsRef.current.has(call.officeId)) {
        dismissedStaffCallsRef.current.delete(call.officeId);
      }
      setStaffCalls((prev) => mergeStaffCalls(prev, [call]));
    });
    const offUpd = on('kitchen:updated', (ticket) => {
      if (!ticket?.id) return;
      if (inFlightRef.current.has(ticket.id)) {
        pendingSocketRef.current.set(ticket.id, ticket);
        return;
      }
      applyTicketUpdate(ticket);
    });
    return () => {
      offNew();
      offStaffCall();
      offUpd();
    };
  }, [on, applyTicketUpdate]);

  async function undoDeliver(ticket) {
    if (!ticket?.id || inFlightRef.current.has(ticket.id)) return;
    inFlightRef.current.add(ticket.id);
    setBusyId(ticket.id);
    setError('');
    try {
      const data = await api(`/kitchen/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: { status: 'preparing' },
      });
      setHistory((prev) => prev.filter((t) => t.id !== ticket.id));
      setTickets((prev) => {
        if (prev.some((t) => t.id === ticket.id)) {
          return prev.map((t) => (t.id === ticket.id ? data.ticket : t));
        }
        return [data.ticket, ...prev];
      });
      toast.info('Sipariş geri alındı — hazırlanıyor.');
    } catch (err) {
      setError(err.message);
      toast.error(err.message || 'Geri alma başarısız');
    } finally {
      releaseInFlight(ticket.id);
      setBusyId(null);
    }
  }

  async function setStatus(id, status) {
    if (inFlightRef.current.has(id) || busyId === id) return;
    const current = ticketsRef.current.find((t) => t.id === id);
    if (!current || current.status === status) return;
    if (status === 'delivered' && current.status !== 'preparing') return;
    if (status === 'preparing' && current.status !== 'new') return;

    if (status === 'delivered') {
      const ok = await confirmDialog({
        title: 'Sipariş teslim edildi mi?',
        message: 'Bu işlem siparişi tamamlayacak ve geçmiş siparişlere taşıyacaktır.',
        confirmLabel: 'Teslim Ettim',
        cancelLabel: 'Geri Dön',
        tone: 'primary',
      });
      if (!ok) return;
    }

    setError('');
    inFlightRef.current.add(id);
    setBusyId(id);
    try {
      const data = await api(`/kitchen/tickets/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      if (data.ticket.status === 'delivered') {
        setFlashOk(id);
        setLeaving((m) => ({ ...m, [id]: true }));
        scheduleTimeout(() => {
          setTickets((prev) => prev.filter((t) => t.id !== id));
          setHistory((prev) => [data.ticket, ...prev.filter((t) => t.id !== id)].slice(0, 20));
          setLeaving((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
          setFlashOk(null);
        }, 500);

        if (undoToastRef.current) toast.dismiss(undoToastRef.current);
        undoToastRef.current = toast.success('✓ Sipariş teslim edildi.', {
          ttl: 10000,
          action: {
            label: 'Geri Al',
            onClick: () => undoDeliver(data.ticket),
          },
        });
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === id ? data.ticket : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      releaseInFlight(id);
      setBusyId(null);
    }
  }

  function openShortage(ticket) {
    const selected = {};
    for (const s of asSummaryList(ticket.summary)) {
      if (s.menuItemId) selected[s.menuItemId] = false;
    }
    setShortageSelected(selected);
    setShortageNote('');
    setShortageTicket(ticket);
  }

  function toggleShortageItem(menuItemId) {
    setShortageSelected((prev) => ({ ...prev, [menuItemId]: !prev[menuItemId] }));
  }

  async function submitShortage() {
    if (!shortageTicket) return;
    const items = asSummaryList(shortageTicket.summary)
      .filter((s) => shortageSelected[s.menuItemId])
      .map((s) => ({ menuItemId: s.menuItemId, name: s.name }));
    if (!items.length) {
      setError('En az bir ürün seçin');
      return;
    }
    setShortageBusy(true);
    setError('');
    try {
      await api(`/kitchen/tickets/${shortageTicket.id}/unavailable`, {
        method: 'POST',
        body: { items, note: shortageNote.trim() || null },
      });
      toast.success('Eksik ürün bildirimi gönderildi');
      setShortageTicket(null);
      setShortageNote('');
      setShortageSelected({});
    } catch (err) {
      setError(err.message);
    } finally {
      setShortageBusy(false);
    }
  }

  const nextAction = {
    new: { status: 'preparing', label: '🟡 Hazırlamaya Başla', tone: 'warning' },
    preparing: { status: 'delivered', label: '🟢 Teslim Ettim', tone: 'success' },
  };

  const counts = useMemo(
    () => ({
      new: tickets.filter((t) => t.status === 'new').length,
      preparing: tickets.filter((t) => t.status === 'preparing').length,
    }),
    [tickets]
  );

  const hasPreparing = counts.preparing > 0;

  function dismissStaffCall(call) {
    if (call?.officeId) dismissedStaffCallsRef.current.add(call.officeId);
    setStaffCalls((prev) => prev.filter((c) => c.officeId !== call.officeId));
  }

  return (
    <div className="page kitchen kitchen-mobile">
      <AppHeader
        title="Mutfak"
        subtitle={<SocketConnectionLabel online="Canlı" offline="Yeniden bağlanıyor…" />}
        onLogout={logout}
        accent="var(--accent-2)"
      />

      <main className="content kitchen-content">
        <AnnouncementBanner />
        <StaffCallAlerts calls={staffCalls} onDismiss={dismissStaffCall} />
        <div className="kitchen-stats-row">
          <div className="kitchen-stat tone-new">
            <span>Bekleyen</span>
            <strong>{counts.new}</strong>
          </div>
          <div className="kitchen-stat tone-prep">
            <span>Hazırlanan</span>
            <strong>{counts.preparing}</strong>
          </div>
        </div>

        <LoadError
          message={error}
          onRetry={() => {
            setError('');
            load().catch((e) => setError(e.message));
          }}
        />
        <SocketOfflineBanner onRetry={() => load().catch((e) => setError(e.message))} />

        {booting ? (
          <CardSkeleton count={2} />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="🍽️"
            title="Bekleyen sipariş yok"
            description="Ofislerden onaylanan siparişler burada görünür."
          />
        ) : (
          <KitchenClockProvider active={hasPreparing}>
          <div className="ticket-grid kitchen-queue">
            {tickets.map((ticket) => {
              const action = nextAction[ticket.status];
              const specialNotes = collectSpecialNotes(ticket);
              return (
                <article
                  key={ticket.id}
                  className={`ticket-card kitchen-card status-${ticket.status} ${leaving[ticket.id] ? 'leaving' : ''} ${flashOk === ticket.id ? 'success-flash' : ''}`}
                  style={{ '--office': ticket.office.color }}
                >
                  <OfficeBanner office={ticket.office} />
                  <div className="ticket-card-meta">
                    <span className={`status-pill status-${ticket.status}`}>
                      {STATUS_LABEL[ticket.status] || ticket.status}
                    </span>
                    <span className="ticket-count-pill">
                      {itemCount(ticket)} ürün · {personCount(ticket)} kişi
                    </span>
                  </div>

                  {ticket.status === 'preparing' && <PreparingTimer since={ticket.updatedAt} />}

                  <TicketProducts summary={ticket.summary} />
                  <SpecialNotesBox notes={specialNotes} />

                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setExpanded((e) => ({ ...e, [ticket.id]: !e[ticket.id] }))}
                  >
                    {expanded[ticket.id] ? 'Kişileri gizle' : 'Kim ne istedi?'}
                  </button>
                  {expanded[ticket.id] && (
                    <ul className="ticket-details">
                      {ticket.details.map((d, i) => (
                        <li key={`${d.userId}-${d.menuItemId}-${i}`}>
                          {d.userName}: {d.qty}× {d.menuItemName}
                          {d.note ? ` — ${d.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="ticket-actions">
                    {action && (
                      <button
                        className={`btn xl kitchen-action kitchen-primary-action ${action.tone} pressable`}
                        disabled={busyId === ticket.id}
                        onClick={() => setStatus(ticket.id, action.status)}
                      >
                        {busyId === ticket.id ? '…' : action.label}
                      </button>
                    )}
                    {ticket.status === 'new' && (
                      <button
                        type="button"
                        className="btn ghost kitchen-shortage-btn pressable"
                        disabled={busyId === ticket.id || shortageBusy}
                        onClick={() => openShortage(ticket)}
                      >
                        Ürün Yok
                      </button>
                    )}
                  </div>
                  {flashOk === ticket.id && <div className="success-burst">Teslim edildi</div>}
                </article>
              );
            })}
          </div>
          </KitchenClockProvider>
        )}

        <Modal
          open={Boolean(shortageTicket)}
          title="Eksik Ürün Bildir"
          onClose={() => {
            if (shortageBusy) return;
            setShortageTicket(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={shortageBusy}
                onClick={() => setShortageTicket(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn primary pressable"
                disabled={shortageBusy}
                onClick={submitShortage}
              >
                {shortageBusy ? 'Gönderiliyor…' : 'Bildir'}
              </button>
            </>
          }
        >
          {shortageTicket && (
            <div className="shortage-form">
              <p className="muted tiny">
                Sipariş: #{String(shortageTicket.id).slice(-6)} · {shortageTicket.office?.name}
              </p>
              <p className="shortage-form-label">Eksik ürün</p>
              <div className="shortage-check-list">
                {asSummaryList(shortageTicket.summary).map((s) => (
                  <label key={s.menuItemId} className="shortage-check">
                    <input
                      type="checkbox"
                      checked={Boolean(shortageSelected[s.menuItemId])}
                      onChange={() => toggleShortageItem(s.menuItemId)}
                    />
                    <span aria-hidden>{iconMeta(s.icon).emoji}</span>
                    <span>
                      {s.name} x{s.qty}
                    </span>
                  </label>
                ))}
              </div>
              <label className="shortage-note-label" htmlFor="shortage-note">
                Not
              </label>
              <textarea
                id="shortage-note"
                rows={2}
                maxLength={200}
                placeholder="Örn. Soda kalmadı"
                value={shortageNote}
                onChange={(e) => setShortageNote(e.target.value)}
              />
            </div>
          )}
        </Modal>

        <section className="kitchen-history">
          <h3>Sipariş Geçmişi</h3>
          <p className="muted tiny">Son 20 teslim edilen sipariş</p>
          {history.length === 0 ? (
            <p className="muted">Henüz teslim kaydı yok.</p>
          ) : (
            <div className="history-grid">
              {history.map((ticket) => {
                const specialNotes = collectSpecialNotes(ticket);
                return (
                  <article
                    key={ticket.id}
                    className="history-card"
                    style={{ '--office': ticket.office.color }}
                  >
                    <OfficeBanner office={ticket.office} />
                    <div className="history-meta">
                      <time>
                        {new Date(ticket.updatedAt || ticket.createdAt).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <span className="status-pill status-delivered">{STATUS_LABEL.delivered}</span>
                    </div>
                    <p className="history-summary">{summaryText(ticket) || '—'}</p>
                    <SpecialNotesBox notes={specialNotes} />
                    <p className="history-people muted tiny">{personCount(ticket)} kişi</p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
