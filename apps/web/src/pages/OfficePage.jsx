import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import { useCountdown } from '../lib/useCountdown';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { Skeleton, LoadError, OfflineBanner, EmptyState } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';

const ICONS = { tea: '🍵', soda: '🥤', coffee: '☕', water: '💧', cup: '🧁' };

function notify(title, body) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }
}

function eventLabel(type, actor, payload) {
  const who = actor?.name || 'Sistem';
  switch (type) {
    case 'session.opened':
      return `${who} sipariş açtı`;
    case 'session.line_upserted':
      return `${who}: ${payload.qty}× ${payload.menuItemName}`;
    case 'session.line_removed':
      return `${who} ${payload.menuItemName} kaldırdı`;
    case 'session.left':
      return `${who} siparişten çıktı`;
    case 'session.sent':
      return 'Mutfağa gönderildi';
    case 'session.closed':
      return 'Sipariş kapandı';
    case 'ticket.preparing':
      return 'Hazırlanıyor';
    case 'ticket.ready':
      return 'Hazır';
    case 'ticket.delivered':
      return 'Teslim edildi';
    default:
      return type;
  }
}

export default function OfficePage() {
  const { user, logout } = useAuth();
  const { on, connected, reconnectKey } = useSocket();
  const online = useOnline(connected);
  const [session, setSession] = useState(null);
  const [menu, setMenu] = useState([]);
  const [events, setEvents] = useState([]);
  const [presence, setPresence] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const { label, urgent, remaining } = useCountdown(session?.endsAt);

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
      const ev = await api(`/sessions/${active.session.id}/events`);
      setEvents(ev.events);
    } else {
      setEvents([]);
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
    const offs = [
      on('session:opened', (payload) => {
        setSession(payload);
        notify('Yeni sipariş', `${payload.openedBy.name} sipariş açtı`);
      }),
      on('session:updated', (payload) => {
        if (payload == null || payload.session === null) {
          setSession(null);
          return;
        }
        setSession(payload);
        if (payload?.presence) setPresence(payload.presence);
      }),
      on('session:sent', () => {
        setSession(null);
        notify('Sipariş gönderildi', 'Mutfağa iletildi');
      }),
      on('session:closed', () => setSession(null)),
      on('presence:update', (payload) => {
        if (payload.officeId === user.officeId) setPresence(payload.users);
      }),
      on('kitchen:updated', (ticket) => {
        if (ticket.officeId === user.officeId) {
          const map = {
            preparing: 'Sipariş hazırlanıyor',
            ready: 'Sipariş hazır!',
            delivered: 'Sipariş teslim edildi',
          };
          if (map[ticket.status]) notify(map[ticket.status], ticket.office.name);
        }
      }),
      on('notification:new', (n) => notify(n.title, n.body)),
    ];
    return () => offs.forEach((off) => off());
  }, [on, user.officeId]);

  useEffect(() => {
    if (!session?.id) return;
    api(`/sessions/${session.id}/events`)
      .then((ev) => setEvents(ev.events))
      .catch(() => {});
  }, [session?.id, session?.lines?.length, session?.status]);

  const myQty = useMemo(() => {
    const map = {};
    if (!session) return map;
    for (const line of session.lines) {
      if (line.userId === user.id) map[line.menuItemId] = line.qty;
    }
    return map;
  }, [session, user.id]);

  const isOpener = session?.openedBy?.id === user.id;
  const myHasLines = session?.lines?.some((l) => l.userId === user.id);

  async function openSession() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/sessions', { method: 'POST', body: {} });
      setSession(data.session);
    } catch (err) {
      setError(err.message);
      if (err.data?.session) setSession(err.data.session);
    } finally {
      setBusy(false);
    }
  }

  async function setQty(menuItemId, qty) {
    if (!session) return;
    setError('');
    try {
      const data = await api(`/sessions/${session.id}/lines`, {
        method: 'POST',
        body: { menuItemId, qty },
      });
      setSession(data.session);
    } catch (err) {
      setError(err.message);
    }
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

  async function confirm() {
    if (!session) return;
    if (session.pendingUsers?.length) {
      const names = session.pendingUsers.map((u) => u.name).join(', ');
      const ok = window.confirm(
        `Henüz sipariş vermeyenler: ${names}\n\nYine de mutfağa göndermek istiyor musunuz?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/sessions/${session.id}/confirm`, { method: 'POST', body: {} });
      setSession(null);
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
        <section className="presence-bar">
          {(presence.length ? presence : session?.presence || []).map((u) => (
            <span key={u.id} className={`presence-chip ${u.online ? 'on' : 'off'}`}>
              <i /> {u.name}
            </span>
          ))}
        </section>

        {!session && (
          <EmptyState
            icon="🧾"
            title="Sipariş yok"
            description="Ofisiniz için yeni bir toplu sipariş açın. Herkes anında bildirim alır."
            action={
              <button className="btn primary xl" disabled={busy} onClick={openSession}>
                Sipariş aç
              </button>
            }
          />
        )}

        {session && (
          <>
            <section className={`session-banner mega ${urgent ? 'urgent' : ''}`}>
              <div>
                <p className="eyebrow">Aktif sipariş</p>
                <h2>{session.openedBy.name} açtı</h2>
                <p className="muted">
                  Katılanlar:{' '}
                  {session.participants.length
                    ? session.participants.map((p) => p.name).join(', ')
                    : 'Henüz kimse kalem eklemedi'}
                </p>
                {session.pendingUsers?.length > 0 && (
                  <p className="pending-inline">
                    Bekleyenler: {session.pendingUsers.map((u) => u.name).join(', ')}
                  </p>
                )}
              </div>
              <div className={`timer mega ${urgent ? 'pulse' : ''}`}>
                <span>{label}</span>
                <small>{remaining === 0 ? 'Kapanıyor' : 'Kalan süre'}</small>
              </div>
            </section>

            <section className="menu-grid">
              {menu.map((item) => {
                const qty = myQty[item.id] || 0;
                return (
                  <div key={item.id} className={`menu-card ${qty ? 'active' : ''}`}>
                    <div className="menu-icon">{ICONS[item.icon] || ICONS.cup}</div>
                    <div className="menu-name">{item.name}</div>
                    <div className="qty-row">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setQty(item.id, Math.max(0, qty - 1))}
                      >
                        −
                      </button>
                      <span className="qty">{qty}</span>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setQty(item.id, qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="summary-panel">
              <h3>Ofis özeti</h3>
              {session.summary.length === 0 ? (
                <p className="muted">Henüz sipariş yok</p>
              ) : (
                <ul className="summary-list">
                  {session.summary.map((s) => (
                    <li key={s.menuItemId}>
                      <strong>{s.qty}×</strong> {s.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="detail-lines">
                {session.lines.map((l) => (
                  <span key={l.id} className="chip">
                    {l.user.name}: {l.qty}× {l.menuItem.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="timeline-panel">
              <h3>Zaman çizelgesi</h3>
              <ul className="timeline">
                {events.map((e) => (
                  <li key={e.id}>
                    <time>{new Date(e.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time>
                    <span>{eventLabel(e.type, e.actor, e.payload)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="cta-row sticky-cta">
              {!isOpener && myHasLines && (
                <button className="btn ghost xl" disabled={busy} onClick={leave}>
                  Siparişten çık
                </button>
              )}
              {isOpener ? (
                <button className="btn primary xl" disabled={busy} onClick={confirm}>
                  Mutfağa gönder
                </button>
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
