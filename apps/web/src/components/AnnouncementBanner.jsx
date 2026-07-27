import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

export default function AnnouncementBanner() {
  const { on } = useSocket();
  const [items, setItems] = useState([]);
  /** Session-only dismiss: clears on full page reload / new login session */
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  useEffect(() => {
    api('/announcements/active')
      .then((d) => setItems(d.announcements || []))
      .catch(() => {});
    return on('announcement:updated', (payload) => {
      setItems(payload.announcements || []);
    });
  }, [on]);

  const visible = useMemo(
    () => items.filter((a) => !hiddenIds.has(a.id)),
    [items, hiddenIds]
  );

  function dismiss(id) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  if (!visible.length) return null;

  return (
    <div className="announce-stack" role="region" aria-label="Duyurular">
      {visible.map((a) => (
        <article key={a.id} className={`announce-banner announce-banner-pro sev-${a.severity}`}>
          <div className="announce-banner-head">
            <span className="announce-badge" aria-hidden>
              📢
            </span>
            <span className="announce-kicker">Duyuru</span>
            <button
              type="button"
              className="announce-dismiss"
              aria-label="Duyuruyu şimdilik gizle"
              onClick={() => dismiss(a.id)}
            >
              ✕
            </button>
          </div>
          <strong className="announce-title">{a.title}</strong>
          {a.body && <p className="announce-body">{a.body}</p>}
        </article>
      ))}
    </div>
  );
}
