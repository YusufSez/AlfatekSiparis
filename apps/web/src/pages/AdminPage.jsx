import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import SearchResults from '../components/SearchResults';
import { Skeleton, LoadError, OfflineBanner, EmptyState } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';
import LogEntry from '../components/LogEntry';
import { Badge, StatusDot } from '../components/Badge';
import Modal from '../components/Modal';
import { ICON_META, ROLE_META, iconMeta, logSentence, roleHint, roleLabel } from '../lib/uxLabels';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'offices', label: 'Ofisler' },
  { id: 'users', label: 'Kullanıcılar' },
  { id: 'menu', label: 'Menü' },
  { id: 'announcements', label: 'Duyurular' },
  { id: 'settings', label: 'Ayarlar' },
  { id: 'presence', label: 'Online' },
  { id: 'logs', label: 'Loglar' },
];

function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

function BarChart({ data, valueKey = 'count', labelKey = 'label' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="chart-bars">
      {data.map((d) => (
        <div key={d[labelKey] || d.name || d.date} className="chart-bar-item">
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{
                height: `${((d[valueKey] || 0) / max) * 100}%`,
                background: d.color || undefined,
              }}
            />
          </div>
          <span>{d[labelKey] || d.name}</span>
          <small>{d[valueKey] || 0}</small>
        </div>
      ))}
    </div>
  );
}

function DashCard({ label, value, tone }) {
  return (
    <div className={`dash-card dash-card-lg ${tone ? `tone-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  );
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const { on, reconnectKey, connected } = useSocket();
  const [tab, setTab] = useState('dashboard');
  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);
  const [menu, setMenu] = useState([]);
  const [logs, setLogs] = useState([]);
  const [presence, setPresence] = useState([]);
  const [settings, setSettings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [pendingKitchen, setPendingKitchen] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dragId, setDragId] = useState(null);
  const [booting, setBooting] = useState(true);
  const [officeModal, setOfficeModal] = useState(null);
  const [userRole, setUserRole] = useState('office_user');
  const [userFilter, setUserFilter] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userOfficeFilter, setUserOfficeFilter] = useState('all');
  const [userActiveFilter, setUserActiveFilter] = useState('all');
  const [logFilter, setLogFilter] = useState('');
  const [logRange, setLogRange] = useState('all');
  const [logCategory, setLogCategory] = useState('all');
  const [logUserFilter, setLogUserFilter] = useState('all');
  const [logOfficeFilter, setLogOfficeFilter] = useState('all');
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [editOffice, setEditOffice] = useState(null);
  const [menuIconDraft, setMenuIconDraft] = useState('tea');
  const [addUserOfficeId, setAddUserOfficeId] = useState('');
  const online = useOnline(connected);

  async function refresh() {
    const [o, u, m, s, l, p, d, a, k] = await Promise.all([
      api('/admin/offices'),
      api('/admin/users'),
      api('/admin/menu-items'),
      api('/admin/settings'),
      api('/admin/logs?take=100'),
      api('/admin/presence'),
      api('/admin/dashboard'),
      api('/announcements'),
      api('/kitchen/tickets').catch(() => ({ tickets: [] })),
    ]);
    setOffices(o.offices);
    setUsers(u.users);
    setMenu(m.items);
    setSettings(s.settings);
    setLogs(l.logs);
    setPresence(p.offices);
    setDashboard(d);
    setAnnouncements(a.announcements);
    setPendingKitchen((k.tickets || []).length);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
  }, [reconnectKey]);

  useEffect(() => {
    return on('presence:update', () => {
      api('/admin/presence')
        .then((p) => setPresence(p.offices))
        .catch(() => {});
      api('/admin/dashboard')
        .then(setDashboard)
        .catch(() => {});
    });
  }, [on]);

  useEffect(() => {
    setOfficeModal((prev) => {
      if (!prev) return prev;
      return offices.find((o) => o.id === prev.id) || prev;
    });
  }, [offices]);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  }

  const onlineMap = useMemo(() => {
    const map = new Map();
    for (const block of presence) {
      for (const u of block.users || []) map.set(u.id, !!u.online);
    }
    return map;
  }, [presence]);

  const lastLoginMap = useMemo(() => {
    const map = new Map();
    for (const l of logs) {
      if (l.action !== 'auth.login' || !l.actor?.id) continue;
      if (!map.has(l.actor.id)) map.set(l.actor.id, l.createdAt);
    }
    return map;
  }, [logs]);

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userOfficeFilter !== 'all' && (u.officeId || '') !== userOfficeFilter) return false;
      if (userActiveFilter === 'active' && !u.active) return false;
      if (userActiveFilter === 'passive' && u.active) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.office?.name || '').toLowerCase().includes(q)
      );
    });
  }, [users, userFilter, userRoleFilter, userOfficeFilter, userActiveFilter]);

  const enrichedLogs = useMemo(() => {
    const q = logFilter.trim().toLowerCase();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return logs
      .filter((l) => {
        const t = new Date(l.createdAt).getTime();
        if (logRange === 'today') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          if (t < start.getTime()) return false;
        }
        if (logRange === 'week' && now - t > 7 * day) return false;

        const action = l.action || '';
        if (logCategory === 'order' && !/session\.|ticket\.|kitchen\./.test(action)) return false;
        if (logCategory === 'user' && !/user|auth\.|password/.test(action)) return false;
        if (logCategory === 'admin' && !/^admin\.|^announcement\./.test(action)) return false;
        if (logCategory === 'kitchen' && !/kitchen\.|ticket\./.test(action)) return false;

        if (logUserFilter !== 'all' && l.actor?.id !== logUserFilter) return false;

        const full = users.find((u) => u.id === l.actor?.id);
        const officeId = full?.officeId || '';
        if (logOfficeFilter !== 'all' && officeId !== logOfficeFilter) return false;

        if (!q) return true;
        const actor = l.actor?.name || '';
        const sentence = logSentence(l).toLowerCase();
        return actor.toLowerCase().includes(q) || sentence.includes(q) || action.toLowerCase().includes(q);
      })
      .map((l) => {
        if (!l.actor) return l;
        const full = users.find((u) => u.id === l.actor.id);
        return {
          ...l,
          actor: {
            ...l.actor,
            office: full?.office || null,
          },
        };
      });
  }, [logs, logFilter, logRange, logCategory, logUserFilter, logOfficeFilter, users]);

  const officeStats = useMemo(() => {
    return offices.map((o) => {
      const members = users.filter((u) => u.officeId === o.id);
      const onlineCount = members.filter((u) => onlineMap.get(u.id)).length;
      return {
        office: o,
        members,
        onlineCount,
        activeOrder: Boolean(o.activeCollectingSessionId),
      };
    });
  }, [offices, users, onlineMap]);

  async function runSearch(e) {
    e?.preventDefault();
    if (!searchQ.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const data = await api(`/admin/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchResults(data.results);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createOffice(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/offices', {
        method: 'POST',
        body: { name: fd.get('name'), color: fd.get('color') || '#1B6B4A' },
      });
      e.target.reset();
      await refresh();
      flash('Ofis eklendi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveOfficeEdit(e) {
    e.preventDefault();
    if (!editOffice) return;
    const fd = new FormData(e.target);
    try {
      await api(`/admin/offices/${editOffice.id}`, {
        method: 'PATCH',
        body: { name: fd.get('name'), color: fd.get('color') },
      });
      setEditOffice(null);
      await refresh();
      flash('Ofis güncellendi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteOffice(o) {
    if (!window.confirm(`“${o.name}” ofisi silinsin mi?`)) return;
    try {
      await api(`/admin/offices/${o.id}`, { method: 'DELETE' });
      if (officeModal?.id === o.id) setOfficeModal(null);
      await refresh();
      flash('Ofis silindi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function createUser(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const role = fd.get('role');
    try {
      await api('/admin/users', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          username: fd.get('username'),
          password: fd.get('password'),
          role,
          officeId: role === 'office_user' ? fd.get('officeId') || null : null,
        },
      });
      e.target.reset();
      setUserRole('office_user');
      await refresh();
      flash('Kullanıcı eklendi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function patchUser(u, body, okMsg) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      await refresh();
      if (officeModal) {
        const o = offices.find((x) => x.id === officeModal.id) || officeModal;
        setOfficeModal(o);
      }
      if (okMsg) flash(okMsg);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleUser(u) {
    await patchUser(u, { active: !u.active }, u.active ? `${u.name} pasifleştirildi` : `${u.name} aktifleştirildi`);
  }

  async function changeUserRole(u, role) {
    const body = { role };
    if (role !== 'office_user') body.officeId = null;
    await patchUser(u, body, `${u.name} rolü güncellendi`);
  }

  async function changeUserOffice(u, officeId) {
    await patchUser(u, { officeId: officeId || null }, `${u.name} ofisi güncellendi`);
  }

  async function removeFromOffice(u) {
    const other = offices.find((o) => o.id !== officeModal?.id);
    if (!other) {
      setError('Ofisten çıkarmak için başka bir ofis gerekli; veya kullanıcının rolünü değiştirin.');
      return;
    }
    await patchUser(u, { officeId: other.id }, `${u.name} ${other.name} ofisine taşındı`);
  }

  async function addUserToOffice() {
    if (!officeModal || !addUserOfficeId) return;
    const u = users.find((x) => x.id === addUserOfficeId);
    if (!u) return;
    await patchUser(u, { role: 'office_user', officeId: officeModal.id }, `${u.name} ofise eklendi`);
    setAddUserOfficeId('');
  }

  async function submitPasswordReset(e) {
    e.preventDefault();
    if (!resetUser || resetPassword.length < 8) {
      setError('Yeni şifre en az 8 karakter olmalı');
      return;
    }
    try {
      await api(`/admin/users/${resetUser.id}`, {
        method: 'PATCH',
        body: { password: resetPassword },
      });
      setResetUser(null);
      setResetPassword('');
      flash(`${resetUser.name} için şifre güncellendi`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createMenu(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/menu-items', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          icon: fd.get('icon') || 'other',
          sortOrder: Number(fd.get('sortOrder') || menu.length + 1),
        },
      });
      e.target.reset();
      setMenuIconDraft('tea');
      await refresh();
      flash('Ürün eklendi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function softDeleteMenu(item) {
    if (!window.confirm(`“${item.name}” silinsin mi? (Pasifleştirilir, geri alınabilir)`)) return;
    try {
      await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body: { active: false } });
      await refresh();
      flash(`${item.name} silindi`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleMenu(item) {
    try {
      await api(`/admin/menu-items/${item.id}`, {
        method: 'PATCH',
        body: { active: !item.active },
      });
      await refresh();
      flash(item.active ? `${item.name} pasifleştirildi` : `${item.name} aktifleştirildi`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function setIcon(item, icon) {
    try {
      await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body: { icon } });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onDrop(targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = menu.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setDragId(null);
    try {
      const data = await api('/admin/menu-items/reorder', {
        method: 'PUT',
        body: { orderedIds: ids },
      });
      setMenu(data.items);
      flash('Sıra güncellendi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      let config = {};
      try {
        config = JSON.parse(String(fd.get('config') || '{}'));
      } catch {
        throw new Error('config geçerli JSON olmalı');
      }
      const data = await api('/admin/settings', {
        method: 'PATCH',
        body: {
          sessionDurationSec: Number(fd.get('sessionDurationSec')),
          companyName: fd.get('companyName'),
          notificationSound: fd.get('notificationSound') === 'on',
          autoClose: fd.get('autoClose') === 'on',
          workingHoursStart: fd.get('workingHoursStart'),
          workingHoursEnd: fd.get('workingHoursEnd'),
          config,
        },
      });
      setSettings(data.settings);
      flash('Ayarlar kaydedildi');
    } catch (err) {
      setError(err.message);
    }
  }

  async function createAnnouncement(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const startsAt = fd.get('startsAt')
        ? new Date(String(fd.get('startsAt'))).toISOString()
        : undefined;
      const endsAtRaw = fd.get('endsAt');
      const endsAt = endsAtRaw ? new Date(String(endsAtRaw)).toISOString() : null;
      await api('/announcements', {
        method: 'POST',
        body: {
          title: fd.get('title'),
          body: fd.get('body'),
          severity: fd.get('severity'),
          active: true,
          startsAt,
          endsAt,
        },
      });
      e.target.reset();
      await refresh();
      flash('Duyuru yayınlandı');
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleAnnouncement(a) {
    try {
      await api(`/announcements/${a.id}`, { method: 'PATCH', body: { active: !a.active } });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm('Duyuru silinsin mi?')) return;
    try {
      await api(`/announcements/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const cards = dashboard?.cards;
  const charts = dashboard?.charts;
  const officeMembers = officeModal ? users.filter((u) => u.officeId === officeModal.id) : [];
  const candidatesToAdd = officeModal
    ? users.filter((u) => u.role === 'office_user' && u.officeId !== officeModal.id)
    : [];
  const previewIcon = iconMeta(menuIconDraft);

  function formatLastLogin(userId) {
    const iso = lastLoginMap.get(userId);
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="page admin-page">
      <AppHeader title="Yönetim paneli" subtitle="Kurumsal kontrol merkezi" onLogout={logout} />
      <main className="content">
        <AnnouncementBanner />
        <OfflineBanner online={online} onRetry={() => refresh().catch((e) => setError(e.message))} />
        <LoadError
          message={error}
          onRetry={() => {
            setError('');
            refresh().catch((e) => setError(e.message));
          }}
        />
        {message && <div className="toast">{message}</div>}

        <form className="global-search" onSubmit={runSearch}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Kullanıcı, ofis, sipariş veya log ara…"
            aria-label="Global arama"
          />
          <button className="btn primary" type="submit">
            Ara
          </button>
        </form>

        <SearchResults results={searchResults} />

        {booting ? (
          <Skeleton rows={8} className="admin-skeleton" />
        ) : (
          <>
            <nav className="tabs" aria-label="Admin sekmeleri">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? 'active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'dashboard' && cards && (
              <section className="admin-section">
                <div className="dash-grid dash-grid-hero">
                  <DashCard label="Aktif Sipariş" value={cards.activeOrders} tone="warning" />
                  <DashCard label="Bugünkü Sipariş" value={cards.todayOrders} />
                  <DashCard label="Online Kullanıcı" value={cards.onlineUsers} tone="success" />
                  <DashCard label="Bekleyen Mutfak" value={pendingKitchen} tone="warning" />
                  <DashCard label="Toplam Kullanıcı" value={cards.totalUsers} />
                  <DashCard label="Toplam Ofis" value={offices.length} tone="info" />
                </div>

                <div className="admin-two-col">
                  <div className="admin-col">
                    <div className="panel-head">
                      <h3>Ofis Durumu</h3>
                    </div>
                    <div className="office-status-grid">
                      {officeStats.map(({ office: o, members, onlineCount, activeOrder }) => (
                        <article key={o.id} className="office-status-card">
                          <div className="office-status-top">
                            <span className="dot" style={{ background: o.color }} />
                            <strong>{o.name}</strong>
                            <Badge tone={activeOrder ? 'warning' : 'secondary'}>
                              {activeOrder ? 'Aktif sipariş' : 'Boş'}
                            </Badge>
                          </div>
                          <dl className="stat-mini">
                            <div>
                              <dt>Online</dt>
                              <dd>{onlineCount}</dd>
                            </div>
                            <div>
                              <dt>Aktif sipariş</dt>
                              <dd>{activeOrder ? 1 : 0}</dd>
                            </div>
                            <div>
                              <dt>Kullanıcı</dt>
                              <dd>{members.length}</dd>
                            </div>
                          </dl>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setTab('offices');
                              setOfficeModal(o);
                            }}
                          >
                            Detaya Git
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="admin-col">
                    <div className="panel-head">
                      <h3>Son Hareketler</h3>
                    </div>
                    <ul className="activity-timeline">
                      {enrichedLogs.slice(0, 12).map((log) => (
                        <li key={log.id}>
                          <span className="timeline-dot" aria-hidden />
                          <div>
                            <p>{logSentence(log)}</p>
                            <small className="muted">
                              {log.actor?.office?.name ? `${log.actor.office.name} · ` : ''}
                              {new Date(log.createdAt).toLocaleString('tr-TR')}
                            </small>
                          </div>
                        </li>
                      ))}
                      {!enrichedLogs.length && <li className="muted">Henüz hareket yok</li>}
                    </ul>
                  </div>
                </div>

                <div className="chart-grid">
                  <div className="chart-panel">
                    <h3>Son 7 gün</h3>
                    <BarChart data={charts.last7Days} />
                  </div>
                  <div className="chart-panel">
                    <h3>Ürün dağılımı (bugün)</h3>
                    {charts.productDistribution?.length ? (
                      <BarChart data={charts.productDistribution} valueKey="qty" labelKey="name" />
                    ) : (
                      <p className="muted">Bugün henüz ürün verisi yok</p>
                    )}
                  </div>
                  <div className="chart-panel">
                    <h3>Ofislere göre (7 gün)</h3>
                    <BarChart data={charts.byOffice} labelKey="name" />
                  </div>
                </div>
              </section>
            )}

            {tab === 'offices' && (
              <section className="admin-section">
                <form className="inline-form" onSubmit={createOffice}>
                  <input name="name" placeholder="Ofis adı" required />
                  <input name="color" type="color" defaultValue="#1B6B4A" title="Ofis rengi" />
                  <button className="btn primary" type="submit">
                    Ofis ekle
                  </button>
                </form>

                {officeStats.length === 0 ? (
                  <EmptyState
                    icon="🏢"
                    title="Henüz ofis yok"
                    description="Teknik veya Operasyon ofisini ekleyerek başlayın."
                  />
                ) : (
                  <div className="office-card-grid">
                    {officeStats.map(({ office: o, members, onlineCount, activeOrder }) => (
                      <article key={o.id} className="office-card">
                        <div className="office-card-top">
                          <span className="dot lg" style={{ background: o.color }} />
                          <div>
                            <h3>{o.name}</h3>
                            <p className="muted">
                              {members.length} kullanıcı · {onlineCount} online
                            </p>
                          </div>
                        </div>
                        <dl className="stat-mini">
                          <div>
                            <dt>Online</dt>
                            <dd>{onlineCount}</dd>
                          </div>
                          <div>
                            <dt>Aktif sipariş</dt>
                            <dd>{activeOrder ? 1 : 0}</dd>
                          </div>
                          <div>
                            <dt>Kullanıcı</dt>
                            <dd>{members.length}</dd>
                          </div>
                        </dl>
                        <div className="row-actions wrap">
                          <button type="button" className="btn primary" onClick={() => setOfficeModal(o)}>
                            Detay
                          </button>
                          <button type="button" className="btn ghost" onClick={() => setEditOffice(o)}>
                            Düzenle
                          </button>
                          <button type="button" className="btn danger-ghost" onClick={() => deleteOffice(o)}>
                            Sil
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === 'users' && (
              <section className="admin-section">
                <form className="stack-form card-form" onSubmit={createUser}>
                  <h3 className="form-title">Kullanıcı ekle</h3>
                  <label>
                    Ad soyad
                    <input name="name" placeholder="Örn. Yusuf Yılmaz" required />
                  </label>
                  <label>
                    Kullanıcı adı
                    <input name="username" placeholder="Örn. yusuf" required autoComplete="off" />
                  </label>
                  <label>
                    Şifre
                    <input
                      name="password"
                      type="password"
                      placeholder="En az 8 karakter"
                      minLength={8}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Rol
                    <select name="role" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                      {Object.entries(ROLE_META).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label} — {meta.hint}
                        </option>
                      ))}
                    </select>
                    <small className="field-hint">{roleHint(userRole)}</small>
                  </label>
                  {userRole === 'office_user' && (
                    <label>
                      Ofis
                      <select name="officeId" defaultValue={offices[0]?.id || ''} required>
                        <option value="" disabled>
                          Ofis seçin
                        </option>
                        {offices.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button className="btn primary" type="submit">
                    Kullanıcı ekle
                  </button>
                </form>

                <div className="toolbar-row filters-bar">
                  <input
                    className="filter-input"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    placeholder="Ad veya kullanıcı adı ara…"
                  />
                  <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                    <option value="all">Tüm roller</option>
                    {Object.entries(ROLE_META).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                  <select value={userOfficeFilter} onChange={(e) => setUserOfficeFilter(e.target.value)}>
                    <option value="all">Tüm ofisler</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select value={userActiveFilter} onChange={(e) => setUserActiveFilter(e.target.value)}>
                    <option value="all">Aktif / Pasif</option>
                    <option value="active">Aktif</option>
                    <option value="passive">Pasif</option>
                  </select>
                  <span className="muted">{filteredUsers.length} kayıt</span>
                </div>

                {filteredUsers.length === 0 ? (
                  <EmptyState icon="👤" title="Kullanıcı bulunamadı" description="Filtreleri değiştirin veya yeni kullanıcı ekleyin." />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table users-table">
                      <thead>
                        <tr>
                          <th>Avatar</th>
                          <th>Ad Soyad</th>
                          <th>Rol</th>
                          <th>Ofis</th>
                          <th>Durum</th>
                          <th>Son giriş</th>
                          <th>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                            <td>
                              <span className="avatar">{initials(u.name)}</span>
                            </td>
                            <td>
                              <strong>{u.name}</strong>
                              <div className="muted">@{u.username}</div>
                            </td>
                            <td>
                              <Badge tone="info">{roleLabel(u.role)}</Badge>
                            </td>
                            <td>{u.office?.name || '—'}</td>
                            <td>
                              <Badge tone={u.active ? 'success' : 'danger'}>
                                {u.active ? 'Aktif' : 'Pasif'}
                              </Badge>
                            </td>
                            <td className="muted">{formatLastLogin(u.id)}</td>
                            <td>
                              <div className="row-actions wrap">
                                <button type="button" className="btn ghost" onClick={() => toggleUser(u)}>
                                  {u.active ? 'Pasifleştir' : 'Aktifleştir'}
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() => {
                                    setResetUser(u);
                                    setResetPassword('');
                                  }}
                                >
                                  Şifre sıfırla
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === 'menu' && (
              <section className="admin-section">
                <form className="stack-form card-form" onSubmit={createMenu}>
                  <h3 className="form-title">Ürün ekle</h3>
                  <label>
                    Ürün adı
                    <input name="name" placeholder="Örn. Çay" required />
                  </label>
                  <label>
                    İkon
                    <select
                      name="icon"
                      value={menuIconDraft}
                      onChange={(e) => setMenuIconDraft(e.target.value)}
                    >
                      {Object.entries(ICON_META)
                        .filter(([k]) => k !== 'cup')
                        .map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.emoji} {meta.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="icon-preview">
                    <span className="icon-preview-emoji">{previewIcon.emoji}</span>
                    <span>
                      Önizleme: <strong>{previewIcon.label}</strong>
                    </span>
                  </div>
                  <button className="btn primary" type="submit">
                    Ürün ekle
                  </button>
                </form>

                <p className="muted section-note">Sürükleyerek sırayı değiştirin. Silinen ürünler soft-delete ile pasifleşir.</p>

                {menu.length === 0 ? (
                  <EmptyState icon="🍽️" title="Menü boş" description="İlk içecek ürününü ekleyin." />
                ) : (
                  <ul className="menu-manage-list">
                    {menu.map((item) => {
                      const meta = iconMeta(item.icon);
                      return (
                        <li
                          key={item.id}
                          className={`menu-manage-item ${item.active ? '' : 'is-passive'}`}
                          draggable
                          onDragStart={() => setDragId(item.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDrop(item.id)}
                        >
                          <span className="drag-handle" title="Sürükle">
                            ⋮⋮
                          </span>
                          <span className="menu-manage-emoji" aria-hidden>
                            {meta.emoji}
                          </span>
                          <div className="menu-manage-info">
                            <strong>{item.name}</strong>
                            <span className="muted">
                              {meta.emoji} {meta.label}
                            </span>
                          </div>
                          <label className="compact-select">
                            <span className="sr-only">İkon</span>
                            <select value={item.icon} onChange={(e) => setIcon(item, e.target.value)}>
                              {Object.entries(ICON_META)
                                .filter(([k]) => k !== 'cup')
                                .map(([value, m]) => (
                                  <option key={value} value={value}>
                                    {m.emoji} {m.label}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <Badge tone={item.active ? 'success' : 'danger'}>
                            {item.active ? 'Aktif' : 'Pasif'}
                          </Badge>
                          {item.active ? (
                            <button type="button" className="btn danger-ghost" onClick={() => softDeleteMenu(item)}>
                              Sil
                            </button>
                          ) : (
                            <button type="button" className="btn success-ghost" onClick={() => toggleMenu(item)}>
                              Geri al
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {tab === 'announcements' && (
              <section className="admin-section">
                <form className="stack-form card-form" onSubmit={createAnnouncement}>
                  <h3 className="form-title">Duyuru yayınla</h3>
                  <label>
                    Başlık
                    <input name="title" required />
                  </label>
                  <label>
                    Mesaj
                    <textarea name="body" rows={3} required />
                  </label>
                  <label>
                    Önem
                    <select name="severity" defaultValue="info">
                      <option value="info">Bilgi</option>
                      <option value="warning">Uyarı</option>
                      <option value="critical">Kritik</option>
                    </select>
                  </label>
                  <div className="form-grid-2">
                    <label>
                      Başlangıç
                      <input name="startsAt" type="datetime-local" />
                    </label>
                    <label>
                      Bitiş (opsiyonel)
                      <input name="endsAt" type="datetime-local" />
                    </label>
                  </div>
                  <button className="btn primary" type="submit">
                    Yayınla
                  </button>
                </form>
                {announcements.length === 0 ? (
                  <EmptyState icon="📢" title="Duyuru yok" description="Ofis ve mutfağa duyuru yayınlayabilirsiniz." />
                ) : (
                  <ul className="admin-list">
                    {announcements.map((a) => (
                      <li key={a.id}>
                        <div>
                          <div className="row-actions wrap" style={{ marginBottom: '0.35rem' }}>
                            <Badge
                              tone={
                                a.severity === 'critical'
                                  ? 'danger'
                                  : a.severity === 'warning'
                                    ? 'warning'
                                    : 'info'
                              }
                            >
                              {a.severity}
                            </Badge>
                            <Badge tone={a.active ? 'success' : 'secondary'}>
                              {a.active ? 'Aktif' : 'Pasif'}
                            </Badge>
                          </div>
                          <strong>{a.title}</strong>
                          <div className="muted">{a.body}</div>
                        </div>
                        <span className="row-actions wrap">
                          <button type="button" className="btn ghost" onClick={() => toggleAnnouncement(a)}>
                            {a.active ? 'Pasifleştir' : 'Aktifleştir'}
                          </button>
                          <button
                            type="button"
                            className="btn danger-ghost"
                            onClick={() => deleteAnnouncement(a.id)}
                          >
                            Sil
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'settings' && settings && (
              <section className="admin-section">
                <form className="stack-form card-form" onSubmit={saveSettings}>
                  <h3 className="form-title">Sistem ayarları</h3>
                  <label>
                    Şirket adı
                    <input name="companyName" defaultValue={settings.companyName} required />
                  </label>
                  <label>
                    Sipariş süresi (saniye)
                    <input
                      name="sessionDurationSec"
                      type="number"
                      min={30}
                      max={3600}
                      defaultValue={settings.sessionDurationSec}
                      required
                    />
                  </label>
                  <label className="check switch-row">
                    <input
                      name="notificationSound"
                      type="checkbox"
                      defaultChecked={settings.notificationSound}
                    />
                    <span>Bildirim sesi açık</span>
                  </label>
                  <label className="check switch-row">
                    <input name="autoClose" type="checkbox" defaultChecked={settings.autoClose} />
                    <span>Süre bitince mutfağa gönder</span>
                  </label>
                  <div className="form-grid-2">
                    <label>
                      Mesai başlangıç
                      <input name="workingHoursStart" defaultValue={settings.workingHoursStart} />
                    </label>
                    <label>
                      Mesai bitiş
                      <input name="workingHoursEnd" defaultValue={settings.workingHoursEnd} />
                    </label>
                  </div>
                  <label>
                    Gelişmiş config (JSON)
                    <textarea
                      name="config"
                      rows={4}
                      defaultValue={JSON.stringify(settings.config || {}, null, 2)}
                    />
                  </label>
                  <button className="btn primary" type="submit">
                    Kaydet
                  </button>
                </form>
              </section>
            )}

            {tab === 'presence' && (
              <section className="admin-section">
                {presence.length === 0 ? (
                  <EmptyState icon="📡" title="Presence verisi yok" />
                ) : (
                  presence.map((block) => (
                    <div key={block.office.id} className="presence-block card-surface">
                      <h3>{block.office.name}</h3>
                      <div className="presence-bar">
                        {(block.users || []).length === 0 && (
                          <p className="muted">Bu ofiste kimse listelenmiyor.</p>
                        )}
                        {(block.users || []).map((u) => (
                          <span key={u.id} className={`presence-chip ${u.online ? 'on' : 'off'}`}>
                            <StatusDot online={u.online} /> {u.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}

            {tab === 'logs' && (
              <section className="admin-section">
                <div className="toolbar-row filters-bar">
                  <input
                    className="filter-input"
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
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
                        className={`chip-btn ${logRange === id ? 'active' : ''}`}
                        onClick={() => setLogRange(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select value={logUserFilter} onChange={(e) => setLogUserFilter(e.target.value)}>
                    <option value="all">Tüm kullanıcılar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <select value={logOfficeFilter} onChange={(e) => setLogOfficeFilter(e.target.value)}>
                    <option value="all">Tüm ofisler</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select value={logCategory} onChange={(e) => setLogCategory(e.target.value)}>
                    <option value="all">Tüm işlemler</option>
                    <option value="order">Sipariş</option>
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Admin</option>
                    <option value="kitchen">Mutfak</option>
                  </select>
                  <span className="muted">{enrichedLogs.length} kayıt</span>
                </div>
                {enrichedLogs.length === 0 ? (
                  <EmptyState icon="📋" title="Kayıt bulunamadı" description="Filtreleri değiştirin veya daha sonra tekrar bakın." />
                ) : (
                  <ul className="log-feed">{enrichedLogs.map((log) => <LogEntry key={log.id} log={log} />)}</ul>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <Modal
        open={!!officeModal}
        title={officeModal ? `${officeModal.name} — kullanıcılar` : ''}
        onClose={() => setOfficeModal(null)}
        footer={
          <button type="button" className="btn primary" onClick={() => setOfficeModal(null)}>
            Kapat
          </button>
        }
      >
        {officeModal && (
          <div className="office-modal-body">
            <div className="add-to-office">
              <select value={addUserOfficeId} onChange={(e) => setAddUserOfficeId(e.target.value)}>
                <option value="">Kullanıcı ekle…</option>
                {candidatesToAdd.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.username})
                    {u.office?.name ? ` — ${u.office.name}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary" disabled={!addUserOfficeId} onClick={addUserToOffice}>
                Ekle
              </button>
            </div>

            {officeMembers.length === 0 ? (
              <p className="muted">Bu ofiste kullanıcı yok.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kullanıcı</th>
                      <th>Rol</th>
                      <th>Durum</th>
                      <th>Online</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officeMembers.map((u) => (
                      <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                        <td>
                          <strong>{u.name}</strong>
                          <div className="muted">@{u.username}</div>
                        </td>
                        <td>
                          <select
                            className="table-select"
                            value={u.role}
                            onChange={(e) => changeUserRole(u, e.target.value)}
                          >
                            {Object.entries(ROLE_META).map(([value, meta]) => (
                              <option key={value} value={value}>
                                {meta.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Badge tone={u.active ? 'success' : 'danger'}>
                            {u.active ? 'Aktif' : 'Pasif'}
                          </Badge>
                        </td>
                        <td>
                          <span className="inline-status">
                            <StatusDot online={onlineMap.get(u.id)} />
                            {onlineMap.get(u.id) ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions wrap">
                            <button type="button" className="btn ghost" onClick={() => toggleUser(u)}>
                              {u.active ? 'Pasifleştir' : 'Aktifleştir'}
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                setResetUser(u);
                                setResetPassword('');
                              }}
                            >
                              Şifre sıfırla
                            </button>
                            <button type="button" className="btn danger-ghost" onClick={() => removeFromOffice(u)}>
                              Ofisten çıkar
                            </button>
                            <select
                              className="table-select"
                              value={u.officeId || ''}
                              onChange={(e) => changeUserOffice(u, e.target.value)}
                              title="Ofis değiştir"
                            >
                              <option value="">Ofis yok</option>
                              {offices.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!resetUser}
        title="Şifre sıfırla"
        onClose={() => setResetUser(null)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setResetUser(null)}>
              Vazgeç
            </button>
            <button type="submit" form="reset-password-form" className="btn primary">
              Kaydet
            </button>
          </>
        }
      >
        {resetUser && (
          <form id="reset-password-form" className="stack-form" onSubmit={submitPasswordReset}>
            <p>
              <strong>{resetUser.name}</strong> (@{resetUser.username}) için yeni şifre belirleyin.
            </p>
            <label>
              Yeni şifre
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
          </form>
        )}
      </Modal>

      <Modal
        open={!!editOffice}
        title="Ofisi düzenle"
        onClose={() => setEditOffice(null)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setEditOffice(null)}>
              Vazgeç
            </button>
            <button type="submit" form="edit-office-form" className="btn primary">
              Kaydet
            </button>
          </>
        }
      >
        {editOffice && (
          <form id="edit-office-form" className="stack-form" onSubmit={saveOfficeEdit}>
            <label>
              Ofis adı
              <input name="name" defaultValue={editOffice.name} required />
            </label>
            <label>
              Renk
              <input name="color" type="color" defaultValue={editOffice.color || '#1B6B4A'} />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
