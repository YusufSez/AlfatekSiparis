import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocketApi } from '../lib/socket';
import { useToast } from '../lib/toast';
import {
  isAppForeground,
  notificationDedupeKey,
  shouldShowOsNotification,
  showOsNotification,
} from '../lib/osNotify';
import { isNotificationEventAllowed } from '../lib/notificationRoles';
import { playOrderNotificationSound } from '../lib/orderSound';
import { hasLocalPushSubscription } from '../lib/push';

export default function NotificationCenter() {
  const { user } = useAuth();
  const { on } = useSocketApi();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const role = user?.role;

  async function load(signal) {
    try {
      const data = await api('/notifications', { signal });
      if (signal?.aborted) return;
      setItems(
        (data.notifications || []).filter((n) => isNotificationEventAllowed(role, n.event))
      );
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return;
      /* ignore */
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    const off = on('notification:new', (n) => {
      if (!isNotificationEventAllowed(role, n.event)) return;

      // Special in-app sound is independent of inbox / OS toast / push.
      playOrderNotificationSound(user?.id, n);

      const title = n.title || 'Bildirim';
      const body = n.body || '';

      void (async () => {
        const foreground = isAppForeground();
        if (foreground) {
          toast.info(body ? `${title} — ${body}` : title, { ttl: 4200 });
          return;
        }
        const hasPush = await hasLocalPushSubscription();
        if (
          shouldShowOsNotification({
            visibilityState: document.visibilityState,
            hasPushSubscription: hasPush,
          })
        ) {
          showOsNotification(title, body, {
            tag: n.tag,
            event: n.event,
            payload: n.payload,
            hasPushSubscription: hasPush,
          });
        }
      })();

      const key = notificationDedupeKey(n);
      setItems((prev) => {
        if (prev.some((item) => item._dedupeKey === key || notificationDedupeKey(item) === key)) {
          return prev;
        }
        return [
          {
            id:
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? `live-${crypto.randomUUID()}`
                : `live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    return () => {
      ac.abort();
      off();
    };
  }, [on, role, user?.id, toast]);

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
    try {
      await api('/notifications/read-all', { method: 'POST', body: {} });
      load();
    } catch {
      /* ignore */
    }
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
