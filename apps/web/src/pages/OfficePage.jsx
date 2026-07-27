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
    case 'ticket.ready':
      return 'Hazır';
    case 'ticket.delivered':
      return 'Teslim edildi';
    default:
      return type;
  }
}

function isOtherItem(item) {
  return item?.icon === 'other' || item?.name?.toLocaleLowerCase?.('tr') === 'diğer';
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
      on('session:closed', (payload) => {
        setSession(null);
        const msg = payload?.events
          ? null
          : payload?.openedBy?.name
            ? `${payload.openedBy.name} siparişi iptal etti.`
            : 'Sipariş oturumu kapandı';
        if (msg) notify('Sipariş iptal', msg);
      }),
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
                <section className={`session-banner mega active-order-card countdown-focus ${urgent ? 'urgent' : ''}`}>
                  <p className="eyebrow">Aktif Sipariş</p>
                  <p className="session-opener muted">{session.openedBy.name} sipariş topluyor</p>
                  <div className={`timer mega countdown-hero ${urgent ? 'pulse' : ''}`} aria-live="polite">
                    <strong>{label}</strong>
                    <small>{remaining === 0 ? 'Kapanıyor' : 'Kalan Süre'}</small>
                  </div>

                  <div className="participant-boards groups-3">
                    <div>
                      <h4>🟢 Sipariş Verdi</h4>
                      <div className="participant-chips">
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
                    <div>
                      <h4>🟡 İsteğim Yok</h4>
                      <div className="participant-chips">
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
                    <div>
                      <h4>⚪ Henüz Cevap Vermedi</h4>
                      <div className="participant-chips">
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
                        <div key={item.id} className={`quick-order-card tap-card ${qty ? 'has-qty' : ''}`}>
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

                    <div className={`quick-order-card tap-card special skip-card ${mySkipped ? 'has-qty' : ''}`}>
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
                        className={`quick-order-card tap-card special other-card ${myQty[otherItem.id]?.qty ? 'has-qty' : ''}`}
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
                        <button type="button" className="btn primary" onClick={saveOther}>
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
                          {s.notes?.length > 0 && (
                            <span className="muted tiny">
                              {' '}
                              ({s.notes.map((n) => `${n.userName}: ${n.note}`).join('; ')})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
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
                    {events.map((e) => (
                      <li key={e.id}>
                        <time>
                          {new Date(e.createdAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
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
                    <>
                      <button className="btn ghost xl danger-ghost" disabled={busy} onClick={closeSession}>
                        Oturumu Kapat
                      </button>
                      <button className="btn primary xl" disabled={busy} onClick={confirm}>
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
