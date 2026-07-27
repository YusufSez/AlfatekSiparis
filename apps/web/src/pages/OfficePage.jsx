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
  const { confirm: confirmDialog } = useConfirm();
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
      const ok = await confirmDialog({
        title: 'Siparişi gönder',
        message: `Henüz sipariş vermeyenler: ${names}. Yine de mutfağa göndermek istiyor musunuz?`,
        confirmLabel: 'Gönder',
        tone: 'danger',
      });
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
        <section className="presence-bar office-presence">
          {(presence.length ? presence : session?.presence || []).map((u) => (
            <span key={u.id} className={`presence-chip rich ${u.online ? 'on' : 'off'}`}>
              <span className="avatar sm">{initials(u.name)}</span>
              <StatusDot online={u.online} />
              <span>{u.name}</span>
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
            <section className={`session-banner mega active-order-card ${urgent ? 'urgent' : ''}`}>
              <div className="active-order-main">
                <p className="eyebrow">Aktif Sipariş</p>
                <h2>{session.openedBy.name} sipariş topluyor</h2>
                <p className="active-order-timer-line countdown-hero">
                  Kalan süre: <strong>{label}</strong>
                </p>
                <div className="participant-boards">
                  <div>
                    <h4>Katılanlar</h4>
                    <div className="participant-chips">
                      {(session.participants || []).length === 0 && (
                        <span className="muted">Henüz katılan yok</span>
                      )}
                      {(session.participants || []).map((p) => (
                        <span key={p.id} className="participant-chip joined">
                          <span className="avatar sm">{initials(p.name)}</span>
                          {p.name}
                          <em>Hazır</em>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Bekleyenler</h4>
                    <div className="participant-chips">
                      {(session.pendingUsers || []).length === 0 && (
                        <span className="muted">Herkes katıldı</span>
                      )}
                      {(session.pendingUsers || []).map((u) => (
                        <span key={u.id} className="participant-chip pending">
                          <span className="avatar sm">{initials(u.name)}</span>
                          {u.name}
                          <em>Bekliyor</em>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className={`timer mega ${urgent ? 'pulse' : ''}`} aria-live="polite">
                <span>{label}</span>
                <small>{remaining === 0 ? 'Kapanıyor' : 'Kalan süre'}</small>
              </div>
            </section>

            <section className="quick-order">
              <h3>Hızlı Sipariş</h3>
              <p className="muted tiny">Tek dokunuşla +1 ekler.</p>
              <div className="quick-order-grid">
                {menu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="quick-order-btn"
                    onClick={() => setQty(item.id, (myQty[item.id] || 0) + 1)}
                  >
                    <span aria-hidden>{iconMeta(item.icon).emoji}</span>
                    <strong>{item.name}</strong>
                    {(myQty[item.id] || 0) > 0 && <em>{myQty[item.id]}</em>}
                  </button>
                ))}
              </div>
            </section>

            <section className="menu-section">
              <h3 className="section-heading">Menü</h3>
              <div className="menu-grid">
                {menu.map((item) => {
                  const qty = myQty[item.id] || 0;
                  return (
                    <div key={item.id} className={`menu-card ${qty ? 'active' : ''}`}>
                      <div className="menu-icon">{iconMeta(item.icon).emoji}</div>
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
              </div>
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
