import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { Skeleton, LoadError, OfflineBanner, EmptyState, CardSkeleton } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';
import { iconMeta } from '../lib/uxLabels';

const STATUS_LABEL = {
  new: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  delivered: 'Teslim',
};

function minutesAgo(date) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
}

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

function personCount(ticket) {
  const ids = new Set((ticket.details || []).map((d) => d.userId));
  return ids.size;
}

function summaryText(ticket) {
  return (ticket.summary || []).map((s) => `${s.qty}× ${s.name}`).join(', ');
}

function TicketAge({ ticket }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);
  const arrived = new Date(ticket.createdAt).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const wait = minutesAgo(ticket.createdAt);
  if (ticket.status === 'new') return `${arrived} · ${wait} dk bekliyor`;
  return `${arrived} · ${STATUS_LABEL[ticket.status]} · ${minutesAgo(ticket.updatedAt)} dk`;
}

function OfficeBanner({ office }) {
  return (
    <div className="kitchen-office-banner" style={{ '--office': office.color }}>
      <span className="kitchen-office-rule" aria-hidden />
      <div className="kitchen-office-title">
        <span className="kitchen-office-swatch" aria-hidden />
        <strong>{office.name}</strong>
      </div>
      <span className="kitchen-office-rule" aria-hidden />
    </div>
  );
}

function TicketSummaryBoxes({ summary }) {
  return (
    <ul className="ticket-summary hero-summary kitchen-summary-boxes">
      {(summary || []).map((s) => (
        <li key={s.menuItemId}>
          <span className="big-emoji" aria-hidden>
            {iconMeta(s.icon).emoji}
          </span>
          <div className="summary-box-text">
            <span className="big-qty">{s.qty}</span>
            <span className="big-name">{s.name}</span>
          </div>
          {s.notes?.length > 0 && (
            <ul className="summary-notes">
              {s.notes.map((n, i) => (
                <li key={`${n.userName}-${i}`}>
                  {n.userName}: {n.note}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function KitchenPage() {
  const { logout } = useAuth();
  const { on, connected, reconnectKey } = useSocket();
  const online = useOnline(connected);
  const [tickets, setTickets] = useState([]);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [leaving, setLeaving] = useState({});
  const [flashOk, setFlashOk] = useState(null);
  const [busyId, setBusyId] = useState(null);

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
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
      playBeep(soundOn);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${ticket.office.name} siparişi`, { body: summaryText(ticket) });
      }
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    });
    const offUpd = on('kitchen:updated', (ticket) => {
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
        }, 480);
        return;
      }
      setTickets((prev) => {
        const exists = prev.some((t) => t.id === ticket.id);
        if (!exists) return [ticket, ...prev];
        return prev.map((t) => (t.id === ticket.id ? ticket : t));
      });
    });
    return () => {
      offNew();
      offUpd();
    };
  }, [on, soundOn]);

  async function setStatus(id, status) {
    setError('');
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
        }, 650);
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === id ? data.ticket : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const nextAction = {
    new: { status: 'preparing', label: 'Hazırlamaya başla', tone: 'warning' },
    preparing: { status: 'ready', label: 'Hazır', tone: 'success' },
    ready: { status: 'delivered', label: 'Teslim et', tone: 'primary' },
  };

  const counts = useMemo(
    () => ({
      new: tickets.filter((t) => t.status === 'new').length,
      preparing: tickets.filter((t) => t.status === 'preparing').length,
      ready: tickets.filter((t) => t.status === 'ready').length,
    }),
    [tickets]
  );

  return (
    <div className={`page kitchen kitchen-pro ${fullscreen ? 'kitchen-full' : ''}`}>
      <AppHeader
        title="Mutfak Paneli"
        subtitle={connected ? 'Canlı sipariş kuyruğu' : 'Yeniden bağlanıyor…'}
        onLogout={logout}
        accent="#c45c26"
      />

      <main className="content">
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
          <div className="kitchen-stat tone-ready">
            <span>Hazır</span>
            <strong>{counts.ready}</strong>
          </div>
          <button type="button" className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
            {fullscreen ? 'Normal görünüm' : 'Tablet / tam ekran'}
          </button>
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
          <CardSkeleton count={3} />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon="🍽️"
            title="Bekleyen sipariş yok"
            description="Ofislerden onaylanan siparişler burada büyük kartlar halinde görünür."
          />
        ) : (
          <div className="ticket-grid kitchen-big">
            {tickets.map((ticket) => {
              const action = nextAction[ticket.status];
              return (
                <article
                  key={ticket.id}
                  className={`ticket-card big pro status-${ticket.status} ${leaving[ticket.id] ? 'leaving' : ''} ${flashOk === ticket.id ? 'success-flash' : ''}`}
                  style={{ '--office': ticket.office.color }}
                >
                  <OfficeBanner office={ticket.office} />
                  <div className="ticket-card-meta">
                    <span className={`status-pill status-${ticket.status}`}>
                      {STATUS_LABEL[ticket.status]}
                    </span>
                    <p className="ticket-age">
                      <TicketAge ticket={ticket} />
                    </p>
                  </div>
                  <TicketSummaryBoxes summary={ticket.summary} />
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
                        className={`btn xl kitchen-action ${action.tone}`}
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
              {history.map((ticket) => (
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
                  <p className="history-people muted tiny">{personCount(ticket)} kişi</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
