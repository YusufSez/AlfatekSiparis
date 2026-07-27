import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

export default function AnnouncementBanner() {
  const { on } = useSocket();
  const [items, setItems] = useState([]);

  useEffect(() => {
    api('/announcements/active')
      .then((d) => setItems(d.announcements))
      .catch(() => {});
    return on('announcement:updated', (payload) => {
      setItems(payload.announcements || []);
    });
  }, [on]);

  if (!items.length) return null;

  return (
    <div className="announce-stack">
      {items.map((a) => (
        <div key={a.id} className={`announce-banner sev-${a.severity}`}>
          <strong>{a.title}</strong>
          <span>{a.body}</span>
        </div>
      ))}
    </div>
  );
}
