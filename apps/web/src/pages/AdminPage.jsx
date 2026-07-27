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
import { ICON_META, ROLE_META, iconMeta, roleHint, roleLabel } from '../lib/uxLabels';

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
    <div className={`dash-card ${tone ? `tone-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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
  const [expandedOffice, setExpandedOffice] = useState(null);
  const [userRole, setUserRole] = useState('office_user');
  const [userFilter, setUserFilter] = useState('');
  const [logFilter, setLogFilter] = useState('');
  const [logRange, setLogRange] = useState('all');
  const [logCategory, setLogCategory] = useState('all');
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [editOffice, setEditOffice] = useState(null);
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

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        (u.office?.name || '').toLowerCase().includes(q)
    );
  }, [users, userFilter]);

  const filteredLogs = useMemo(() => {
    const q = logFilter.trim().toLowerCase();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return logs.filter((l) => {
      const t = new Date(l.createdAt).getTime();
      if (logRange === 'today' && now - t > day) return false;
      if (logRange === 'week' && now - t > 7 * day) return false;
      if (logRange === 'month' && now - t > 30 * day) return false;

      const action = l.action || '';
      if (logCategory === 'order' && !/session\.|ticket\.|kitchen\./.test(action)) return false;
      if (logCategory === 'user' && !/user|auth\.|password/.test(action)) return false;
      if (logCategory === 'admin' && !/^admin\.|^announcement\./.test(action)) return false;
      if (logCategory === 'kitchen' && !/kitchen\.|ticket\./.test(action)) return false;

      if (!q) return true;
      const actor = l.actor?.name || '';
      return (
        action.toLowerCase().includes(q) ||
        actor.toLowerCase().includes(q) ||
        JSON.stringify(l.payload || {}).toLowerCase().includes(q)
      );
    });
  }, [logs, logFilter, logRange, logCategory]);

  const enrichedLogs = useMemo(
    () =>
      filteredLogs.map((l) => {
        if (!l.actor) return l;
        const full = users.find((u) => u.id === l.actor.id);
        return {
          ...l,
          actor: {
            ...l.actor,
            office: full?.office || null,
          },
        };
      }),
    [filteredLogs, users]
  );

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
      if (expandedOffice === o.id) setExpandedOffice(null);
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

  async function toggleUser(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      await refresh();
      flash(u.active ? `${u.name} pasifleştirildi` : `${u.name} aktifleştirildi`);
    } catch (err) {
      setError(err.message);
    }
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
          icon: fd.get('icon') || 'cup',
          sortOrder: Number(fd.get('sortOrder') || menu.length + 1),
        },
      });
      e.target.reset();
      await refresh();
      flash('Ürün eklendi');
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

  function officeUsers(officeId) {
    return users.filter((u) => u.officeId === officeId);
  }

  return (
    <div className="page admin-page">
      <AppHeader title="Admin" subtitle="Yönetim paneli" onLogout={logout} userName={user.name} />
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
                <div className="dash-grid">
                  <DashCard label="Aktif kullanıcı" value={cards.totalUsers} />
                  <DashCard label="Online kullanıcı" value={cards.onlineUsers} tone="success" />
                  <DashCard label="Bugün verilen sipariş" value={cards.todayOrders} />
                  <DashCard label="Aktif sipariş (toplanıyor)" value={cards.activeOrders} tone="warning" />
                  <DashCard label="Bekleyen mutfak siparişi" value={pendingKitchen} tone="warning" />
                  <DashCard label="Bugün teslim edilen" value={cards.deliveredToday} tone="success" />
                  {(charts?.byOffice || []).map((o) => (
                    <DashCard
                      key={o.officeId}
                      label={`${o.name} (7 gün)`}
                      value={o.count}
                    />
                  ))}
                  {Object.entries(cards.onlineByOffice || {}).map(([name, n]) => (
                    <DashCard key={`on-${name}`} label={`${name} online`} value={n} tone="info" />
                  ))}
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

                {offices.length === 0 ? (
                  <EmptyState
                    icon="🏢"
                    title="Henüz ofis yok"
                    description="Teknik veya Operasyon ofisini ekleyerek başlayın."
                  />
                ) : (
                  <div className="office-accordion">
                    {offices.map((o) => {
                      const open = expandedOffice === o.id;
                      const members = officeUsers(o.id);
                      const onlineCount = members.filter((u) => onlineMap.get(u.id)).length;
                      const hasActive = Boolean(o.activeCollectingSessionId);
                      return (
                        <article key={o.id} className={`office-panel ${open ? 'open' : ''}`}>
                          <button
                            type="button"
                            className="office-panel-head"
                            onClick={() => setExpandedOffice(open ? null : o.id)}
                            aria-expanded={open}
                          >
                            <span className="dot" style={{ background: o.color }} />
                            <span className="office-head-text">
                              <strong>{o.name}</strong>
                              <small className="muted">
                                {members.length} kullanıcı · {onlineCount} online
                                {hasActive ? ' · Aktif sipariş var' : ''}
                              </small>
                            </span>
                            <Badge tone={hasActive ? 'warning' : 'secondary'}>
                              {hasActive ? 'Aktif sipariş' : 'Boş'}
                            </Badge>
                            <span className="chevron">{open ? '▾' : '▸'}</span>
                          </button>
                          {open && (
                            <div className="office-panel-body">
                              <div className="row-actions wrap">
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() => setEditOffice(o)}
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  className="btn danger-ghost"
                                  onClick={() => deleteOffice(o)}
                                >
                                  Ofisi sil
                                </button>
                              </div>
                              {members.length === 0 ? (
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
                                      {members.map((u) => (
                                        <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                                          <td>
                                            <strong>{u.name}</strong>
                                            <div className="muted">@{u.username}</div>
                                          </td>
                                          <td>
                                            <Badge tone="info">{roleLabel(u.role)}</Badge>
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
                                              <button
                                                type="button"
                                                className="btn ghost"
                                                onClick={() => toggleUser(u)}
                                              >
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
                            </div>
                          )}
                        </article>
                      );
                    })}
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
                    <select
                      name="role"
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value)}
                    >
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
                      <small className="field-hint">Ofis kullanıcıları bir ofise bağlı olmalıdır.</small>
                    </label>
                  )}
                  <button className="btn primary" type="submit">
                    Kullanıcı ekle
                  </button>
                </form>

                <div className="toolbar-row">
                  <input
                    className="filter-input"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    placeholder="Kullanıcı ara…"
                  />
                  <span className="muted">{filteredUsers.length} kayıt</span>
                </div>

                {filteredUsers.length === 0 ? (
                  <EmptyState icon="👤" title="Kullanıcı bulunamadı" description="Aramayı değiştirin veya yeni kullanıcı ekleyin." />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ad</th>
                          <th>Rol</th>
                          <th>Ofis</th>
                          <th>Durum</th>
                          <th>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                            <td>
                              <strong>{u.name}</strong>
                              <div className="muted">@{u.username}</div>
                            </td>
                            <td>
                              <Badge tone="info">{roleLabel(u.role)}</Badge>
                              <div className="muted tiny">{roleHint(u.role)}</div>
                            </td>
                            <td>{u.office?.name || '—'}</td>
                            <td>
                              <Badge tone={u.active ? 'success' : 'danger'}>
                                {u.active ? 'Aktif' : 'Pasif'}
                              </Badge>
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
                    Görsel simge
                    <select name="icon" defaultValue="cup">
                      {Object.entries(ICON_META).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.emoji} {meta.label}
                        </option>
                      ))}
                    </select>
                    <small className="field-hint">
                      Ofis ekranında ürün kartında gösterilir. Sipariş mantığını değiştirmez.
                    </small>
                  </label>
                  <button className="btn primary" type="submit">
                    Ürün ekle
                  </button>
                </form>

                <p className="muted section-note">Sürükleyerek sırayı değiştirin. Pasif ürünler ofiste görünmez.</p>

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
                            <span className="muted">Sıra #{item.sortOrder}</span>
                          </div>
                          <label className="compact-select">
                            <span className="sr-only">Simge</span>
                            <select value={item.icon} onChange={(e) => setIcon(item, e.target.value)}>
                              {Object.entries(ICON_META).map(([value, m]) => (
                                <option key={value} value={value}>
                                  {m.emoji} {m.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Badge tone={item.active ? 'success' : 'danger'}>
                            {item.active ? 'Aktif' : 'Pasif'}
                          </Badge>
                          <button
                            type="button"
                            className={item.active ? 'btn danger-ghost' : 'btn success-ghost'}
                            onClick={() => toggleMenu(item)}
                          >
                            {item.active ? 'Pasifleştir' : 'Aktifleştir'}
                          </button>
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
                          <div className="muted tiny">
                            {new Date(a.startsAt).toLocaleString('tr-TR')}
                            {a.endsAt ? ` → ${new Date(a.endsAt).toLocaleString('tr-TR')}` : ''}
                          </div>
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
                    <small className="field-hint">Yalnızca teknik ayarlar içindir.</small>
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
                    placeholder="Loglarda ara…"
                  />
                  <div className="filter-chips">
                    {[
                      ['all', 'Tümü'],
                      ['today', 'Bugün'],
                      ['week', 'Bu Hafta'],
                      ['month', 'Bu Ay'],
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
                  <div className="filter-chips">
                    {[
                      ['all', 'Hepsi'],
                      ['order', 'Sipariş'],
                      ['user', 'Kullanıcı'],
                      ['admin', 'Admin'],
                      ['kitchen', 'Kitchen'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`chip-btn ${logCategory === id ? 'active' : ''}`}
                        onClick={() => setLogCategory(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="muted">{enrichedLogs.length} kayıt</span>
                </div>
                {enrichedLogs.length === 0 ? (
                  <EmptyState icon="📋" title="Log bulunamadı" description="Henüz kayıt yok veya arama sonucu boş." />
                ) : (
                  <ul className="log-feed">{enrichedLogs.map((log) => <LogEntry key={log.id} log={log} />)}</ul>
                )}
              </section>
            )}
          </>
        )}
      </main>

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
