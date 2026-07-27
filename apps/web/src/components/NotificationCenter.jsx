import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

export default function NotificationCenter() {
  const { on } = useSocket();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);

  async function load() {
    try {
      const data = await api('/notifications');
      setItems(data.notifications);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    return on('notification:new', (n) => {
      setItems((prev) => [
        {
          id: `live-${Date.now()}`,
          title: n.title,
          body: n.body,
          event: n.event,
          createdAt: new Date().toISOString(),
          readAt: null,
        },
        ...prev,
      ]);
    });
  }, [on]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
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
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        Bildirim
        {unread > 0 && <span className="notif-count">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel notif-panel-v2" role="dialog" aria-label="Bildirimler">
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
        </div>
      )}
    </div>
  );
}
