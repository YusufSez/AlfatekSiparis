import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import { notificationDedupeKey, showOsNotification } from '../lib/osNotify';
import { isNotificationEventAllowed } from '../lib/notificationRoles';
import { playOrderNotificationSound } from '../lib/orderSound';

export default function NotificationCenter() {
  const { user } = useAuth();
  const { on } = useSocket();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const role = user?.role;

  async function load() {
    try {
      const data = await api('/notifications');
      setItems(
        (data.notifications || []).filter((n) => isNotificationEventAllowed(role, n.event))
      );
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    return on('notification:new', (n) => {
      if (!isNotificationEventAllowed(role, n.event)) return;

      // Special in-app sound is independent of inbox / OS toast / push.
      playOrderNotificationSound(user?.id, n);

      showOsNotification(n.title, n.body, {
        tag: n.tag,
        event: n.event,
        payload: n.payload,
      });

      const key = notificationDedupeKey(n);
      setItems((prev) => {
        if (prev.some((item) => item._dedupeKey === key || notificationDedupeKey(item) === key)) {
          return prev;
        }
        return [
          {
            id: `live-${Date.now()}`,
            _dedupeKey: key,
            title: n.title,
            body: n.body,
            event: n.event,
            payload: n.payload,
            createdAt: new Date().toISOString(),
            readAt: null,
          },
          ...prev,
        ];
      });
    });
  }, [on, role, user?.id]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setCoords(null);
      return;
    }

    function place() {
      const btn = wrapRef.current.querySelector('.notif-btn')?.getBoundingClientRect();
      if (!btn) return;
      const pad = 8;
      const width = Math.min(360, window.innerWidth - pad * 2);
      let left = btn.right - width;
      if (left < pad) left = pad;
      if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;

      const top = Math.min(btn.bottom + 6, window.innerHeight - 120);
      const maxHeight = Math.max(180, window.innerHeight - top - pad);

      setCoords({ top, left, width, maxHeight });
    }

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e) {
      const t = e.target;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('touchstart', onClick);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('touchstart', onClick);
    };
  }, [open]);

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    load();
  }

  const unread = items.filter((i) => !i.readAt).length;

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`btn ghost notif-btn ${unread ? 'has-unread' : ''}`}
        aria-label="Bildirimler"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="notif-btn-label">Bildirim</span>
        <span className="notif-btn-ico" aria-hidden>
          🔔
        </span>
        {unread > 0 && <span className="notif-count">{unread}</span>}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            className="notif-panel notif-panel-v2 notif-panel-portal"
            role="dialog"
            aria-label="Bildirimler"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
          >
            <div className="notif-head">
              <strong>Bildirimler</strong>
              {unread > 0 && <span className="badge badge-warning">{unread} yeni</span>}
            </div>
            <div className="notif-scroll">
              {items.length === 0 ? (
                <p className="muted empty-mini">Bildirim yok</p>
              ) : (
                <ul className="notif-list">
                  {items.slice(0, 30).map((n) => (
                    <li key={n.id} className={!n.readAt ? 'unread' : 'read'}>
                      <div className="notif-item-top">
                        <strong>{n.title}</strong>
                        <span className={`notif-state ${n.readAt ? 'read' : 'unread'}`}>
                          {n.readAt ? 'Okundu' : 'Yeni'}
                        </span>
                      </div>
                      <span>{n.body}</span>
                      <small>{new Date(n.createdAt).toLocaleString('tr-TR')}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="notif-foot">
              <button type="button" className="btn ghost" onClick={markAll} disabled={!unread}>
                Tümünü okundu yap
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
