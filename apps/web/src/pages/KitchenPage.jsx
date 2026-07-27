import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import { useConfirm } from '../lib/confirm';
import { useToast } from '../lib/toast';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { LoadError, OfflineBanner, EmptyState, CardSkeleton } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';
import { iconMeta } from '../lib/uxLabels';

const STATUS_LABEL = {
  new: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  delivered: 'Teslim',
};

const STATUS_RANK = { new: 0, preparing: 1, delivered: 2 };

function playBeep(enabled) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 260);
  } catch {
    /* ignore */
  }
}

function itemCount(ticket) {
  return (ticket.summary || []).reduce((sum, s) => sum + (s.qty || 0), 0);
}

function personCount(ticket) {
  const ids = new Set((ticket.details || []).map((d) => d.userId));
  return ids.size;
}

function summaryText(ticket) {
  return (ticket.summary || []).map((s) => `${s.qty}× ${s.name}`).join(', ');
}

function collectSpecialNotes(summary) {
  const notes = [];
  for (const s of summary || []) {
    const isOther =
      s.icon === 'other' || String(s.name || '').toLocaleLowerCase('tr') === 'diğer';
    if (!isOther || !s.notes?.length) continue;
    for (const n of s.notes) {
      notes.push({ userName: n.userName, note: n.note });
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
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [since]);
  if (!since) return null;
  return (
    <div className="prep-timer" aria-live="polite">
      <span className="prep-timer-label">Hazırlanıyor</span>
      <strong className="prep-timer-value">{formatElapsed(Date.now() - new Date(since).getTime())}</strong>
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

function TicketProducts({ summary }) {
  const regular = (summary || []).filter(
    (s) => !(s.icon === 'other' || String(s.name || '').toLocaleLowerCase('tr') === 'diğer')
  );
  return (
    <ul className="ticket-summary kitchen-summary-boxes">
      {regular.map((s) => (
        <li key={s.menuItemId}>
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
  const { on, connected, reconnectKey } = useSocket();
  const { confirm: confirmDialog } = useConfirm();
  const toast = useToast();
  const online = useOnline(connected);
  const [tickets, setTickets] = useState([]);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [leaving, setLeaving] = useState({});
  const [flashOk, setFlashOk] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const inFlightRef = useRef(new Set());
  const ticketsRef = useRef([]);
  const undoToastRef = useRef(null);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  const load = useCallback(async () => {
    const [data, hist, settings] = await Promise.all([
      api('/kitchen/tickets'),
      api('/kitchen/tickets?status=delivered&take=20'),
      api('/menu/settings/public').catch(() => ({ settings: { notificationSound: true } })),
    ]);
    setTickets(data.tickets);
    setHistory(hist.tickets || []);
    setSoundOn(settings.settings?.notificationSound !== false);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
  }, [load, reconnectKey]);

  useEffect(() => {
    const offNew = on('kitchen:new_ticket', (ticket) => {
      setTickets((prev) => {
        if (prev.some((t) => t.id === ticket.id)) return prev;
        return [ticket, ...prev];
      });
      playBeep(soundOn);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${ticket.office.name} siparişi`, { body: summaryText(ticket) });
      }
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    });
    const offUpd = on('kitchen:updated', (ticket) => {
      if (inFlightRef.current.has(ticket.id)) return;

      if (ticket.status === 'delivered') {
        setLeaving((m) => ({ ...m, [ticket.id]: true }));
        setTimeout(() => {
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
    });
    return () => {
      offNew();
      offUpd();
    };
  }, [on, soundOn]);

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
      inFlightRef.current.delete(ticket.id);
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
        setTimeout(() => {
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
      inFlightRef.current.delete(id);
      setBusyId(null);
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

  return (
    <div className="page kitchen kitchen-mobile">
      <AppHeader
        title="Mutfak"
        subtitle={connected ? 'Canlı' : 'Yeniden bağlanıyor…'}
        onLogout={logout}
        accent="#c45c26"
      />

      <main className="content kitchen-content">
        <AnnouncementBanner />
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
        <OfflineBanner online={online} onRetry={() => load().catch((e) => setError(e.message))} />

        {booting ? (
          <CardSkeleton count={2} />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="🍽️"
            title="Bekleyen sipariş yok"
            description="Ofislerden onaylanan siparişler burada görünür."
          />
        ) : (
          <div className="ticket-grid kitchen-queue">
            {tickets.map((ticket) => {
              const action = nextAction[ticket.status];
              const specialNotes = collectSpecialNotes(ticket.summary);
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
                        className={`btn xl kitchen-action ${action.tone} pressable`}
                        disabled={busyId === ticket.id}
                        onClick={() => setStatus(ticket.id, action.status)}
                      >
                        {busyId === ticket.id ? '…' : action.label}
                      </button>
                    )}
                  </div>
                  {flashOk === ticket.id && <div className="success-burst">Teslim edildi</div>}
                </article>
              );
            })}
          </div>
        )}

        <section className="kitchen-history">
          <h3>Sipariş Geçmişi</h3>
          <p className="muted tiny">Son 20 teslim edilen sipariş</p>
          {history.length === 0 ? (
            <p className="muted">Henüz teslim kaydı yok.</p>
          ) : (
            <div className="history-grid">
              {history.map((ticket) => {
                const specialNotes = collectSpecialNotes(ticket.summary);
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
