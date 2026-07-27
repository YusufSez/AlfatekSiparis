import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { Skeleton, LoadError, OfflineBanner, EmptyState } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';

const STATUS_LABEL = {
  new: 'Yeni',
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
  const sinceStatus = minutesAgo(ticket.updatedAt);
  if (ticket.status === 'new') return `${arrived} · ${wait} dk bekliyor`;
  return `${arrived} · ${STATUS_LABEL[ticket.status]} · ${sinceStatus} dk geçti`;
}

export default function KitchenPage() {
  const { user, logout } = useAuth();
  const { on, connected, reconnectKey } = useSocket();
  const online = useOnline(connected);
  const [tickets, setTickets] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [booting, setBooting] = useState(true);

  const load = useCallback(async () => {
    const [data, settings] = await Promise.all([
      api('/kitchen/tickets'),
      api('/menu/settings/public').catch(() => ({ settings: { notificationSound: true } })),
    ]);
    setTickets(data.tickets);
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
        const summary = ticket.summary.map((s) => `${s.qty}× ${s.name}`).join(', ');
        new Notification(`${ticket.office.name} siparişi`, { body: summary });
      }
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    });
    const offUpd = on('kitchen:updated', (ticket) => {
      setTickets((prev) => {
        if (ticket.status === 'delivered') return prev.filter((t) => t.id !== ticket.id);
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
    try {
      const data = await api(`/kitchen/tickets/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      setTickets((prev) => {
        if (data.ticket.status === 'delivered') return prev.filter((t) => t.id !== id);
        return prev.map((t) => (t.id === id ? data.ticket : t));
      });
    } catch (err) {
      setError(err.message);
    }
  }

  const nextAction = {
    new: { status: 'preparing', label: 'Hazırlıyorum' },
    preparing: { status: 'ready', label: 'Hazır' },
    ready: { status: 'delivered', label: 'Teslim ettim' },
  };

  return (
    <div className={`page kitchen ${fullscreen ? 'kitchen-full' : ''}`}>
      <AppHeader
        title="Mutfak"
        subtitle={connected ? 'Yeni siparişler anlık düşer' : 'Yeniden bağlanıyor…'}
        onLogout={logout}
        userName={user.name}
      />

      <main className="content">
        <AnnouncementBanner />
        <div className="kitchen-toolbar">
          <button type="button" className="btn ghost" onClick={() => setFullscreen((f) => !f)}>
            {fullscreen ? 'Normal görünüm' : 'Tam ekran kartlar'}
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
          <Skeleton rows={4} />
        ) : tickets.length === 0 ? (
          <EmptyState
            title="Bekleyen sipariş yok"
            description="Ofislerden onaylanan siparişler burada özet olarak görünür."
          />
        ) : null}

        {!booting && (
        <div className="ticket-grid kitchen-big">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className={`ticket-card big status-${ticket.status}`}
              style={{ '--office': ticket.office.color }}
            >
              <header>
                <span className="office-tag">{ticket.office.name}</span>
                <span className={`status-pill status-${ticket.status}`}>
                  {STATUS_LABEL[ticket.status]}
                </span>
              </header>
              <p className="ticket-age">
                <TicketAge ticket={ticket} />
              </p>
              <ul className="ticket-summary">
                {ticket.summary.map((s) => (
                  <li key={s.menuItemId}>
                    <span className="big-qty">{s.qty}</span>
                    <span>{s.name}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="linkish"
                onClick={() => setExpanded((e) => ({ ...e, [ticket.id]: !e[ticket.id] }))}
              >
                {expanded[ticket.id] ? 'Detayı gizle' : 'Kim ne istedi?'}
              </button>
              {expanded[ticket.id] && (
                <ul className="ticket-details">
                  {ticket.details.map((d, i) => (
                    <li key={`${d.userId}-${d.menuItemId}-${i}`}>
                      {d.userName}: {d.qty}× {d.menuItemName}
                    </li>
                  ))}
                </ul>
              )}
              <div className="ticket-actions">
                {nextAction[ticket.status] && (
                  <button
                    className="btn primary xl"
                    onClick={() => setStatus(ticket.id, nextAction[ticket.status].status)}
                  >
                    {nextAction[ticket.status].label}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        )}
      </main>
    </div>
  );
}
