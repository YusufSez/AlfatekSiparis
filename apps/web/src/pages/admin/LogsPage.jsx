import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import LogEntry from '../../components/LogEntry';
import { EmptyState } from '../../components/LoadStates';
import { useAdminData } from '../../lib/adminData';
import { logSentence } from '../../lib/uxLabels';

export default function LogsPage() {
  const [params] = useSearchParams();
  const { logs, users, offices, enrichLogs } = useAdminData();
  const [q, setQ] = useState('');
  const [range, setRange] = useState(params.get('range') || 'all');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [userFilter, setUserFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return enrichLogs(
      logs.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        if (range === 'today') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          if (t < start.getTime()) return false;
        }
        if (range === 'week' && now - t > 7 * day) return false;

        const action = l.action || '';
        if (category === 'order' && !/session\.|ticket\.|kitchen\./.test(action)) return false;
        if (category === 'user' && !/user|auth\.|password/.test(action)) return false;
        if (category === 'admin' && !/^admin\.|^announcement\./.test(action)) return false;
        if (category === 'kitchen' && !/kitchen\.|ticket\./.test(action)) return false;
        if (userFilter !== 'all' && l.actor?.id !== userFilter) return false;

        const full = users.find((u) => u.id === l.actor?.id);
        if (officeFilter !== 'all' && (full?.officeId || '') !== officeFilter) return false;

        if (!query) return true;
        return (
          (l.actor?.name || '').toLowerCase().includes(query) ||
          logSentence(l).toLowerCase().includes(query)
        );
      })
    );
  }, [logs, q, range, category, userFilter, officeFilter, users, enrichLogs]);

  return (
    <div className="admin-page-body">
      <PageHeader title="Loglar" description="Operasyon ekibi için okunabilir hareketler" />

      <div className="toolbar-row filters-bar">
        <input
          className="filter-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hareketlerde ara…"
        />
        <div className="filter-chips">
          {[
            ['all', 'Tümü'],
            ['today', 'Bugün'],
            ['week', 'Bu hafta'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip-btn ${range === id ? 'active' : ''}`}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="all">Tüm kullanıcılar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
          <option value="all">Tüm ofisler</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Tüm işlemler</option>
          <option value="order">Sipariş</option>
          <option value="user">Kullanıcı</option>
          <option value="admin">Admin</option>
          <option value="kitchen">Mutfak</option>
        </select>
        <span className="muted">{filtered.length} kayıt</span>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon="📜"
          title="Kayıt bulunamadı"
          description="Filtreleri değiştirin veya daha sonra tekrar bakın."
        />
      ) : (
        <ul className="log-feed">{filtered.map((log) => <LogEntry key={log.id} log={log} />)}</ul>
      )}
    </div>
  );
}
