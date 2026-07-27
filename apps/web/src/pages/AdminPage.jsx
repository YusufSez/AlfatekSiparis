import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import AppHeader from '../components/AppHeader';
import AnnouncementBanner from '../components/AnnouncementBanner';
import SearchResults from '../components/SearchResults';
import { Skeleton, LoadError, OfflineBanner } from '../components/LoadStates';
import { useOnline } from '../lib/useOnline';

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

const ICONS = ['tea', 'soda', 'coffee', 'water', 'cup'];

function BarChart({ data, valueKey = 'count', labelKey = 'label' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="chart-bars">
      {data.map((d) => (
        <div key={d[labelKey] || d.name || d.date} className="chart-bar-item">
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{ height: `${((d[valueKey] || 0) / max) * 100}%` }}
            />
          </div>
          <span>{d[labelKey] || d.name}</span>
          <small>{d[valueKey] || 0}</small>
        </div>
      ))}
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
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dragId, setDragId] = useState(null);
  const [booting, setBooting] = useState(true);
  const online = useOnline(connected);

  async function refresh() {
    const [o, u, m, s, l, p, d, a] = await Promise.all([
      api('/admin/offices'),
      api('/admin/users'),
      api('/admin/menu-items'),
      api('/admin/settings'),
      api('/admin/logs?take=80'),
      api('/admin/presence'),
      api('/admin/dashboard'),
      api('/announcements'),
    ]);
    setOffices(o.offices);
    setUsers(u.users);
    setMenu(m.items);
    setSettings(s.settings);
    setLogs(l.logs);
    setPresence(p.offices);
    setDashboard(d);
    setAnnouncements(a.announcements);
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

  async function createUser(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/users', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          username: fd.get('username'),
          password: fd.get('password'),
          role: fd.get('role'),
          officeId: fd.get('officeId') || null,
        },
      });
      e.target.reset();
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
      await api(`/announcements/${a.id}`, {
        method: 'PATCH',
        body: { active: !a.active },
      });
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

  return (
    <div className="page admin-page">
      <AppHeader title="Admin" subtitle="Yönetim paneli" onLogout={logout} userName={user.name} />
      <main className="content">
        <AnnouncementBanner />
        <OfflineBanner online={online} onRetry={() => refresh().catch((e) => setError(e.message))} />
        <LoadError message={error} onRetry={() => { setError(''); refresh().catch((e) => setError(e.message)); }} />
        {message && <div className="toast">{message}</div>}

        <form className="global-search" onSubmit={runSearch}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Global ara: kullanıcı, ofis, sipariş, log…"
          />
          <button className="btn primary" type="submit">
            Ara
          </button>
        </form>

        <SearchResults results={searchResults} />

        {booting ? (
          <Skeleton rows={6} className="admin-skeleton" />
        ) : (
          <>
        <nav className="tabs">
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
              <div className="dash-card">
                <span>Bugünkü sipariş</span>
                <strong>{cards.todayOrders}</strong>
              </div>
              <div className="dash-card">
                <span>Aktif sipariş</span>
                <strong>{cards.activeOrders}</strong>
              </div>
              <div className="dash-card">
                <span>Teslim (bugün)</span>
                <strong>{cards.deliveredToday}</strong>
              </div>
              <div className="dash-card">
                <span>Toplam kullanıcı</span>
                <strong>{cards.totalUsers}</strong>
              </div>
              <div className="dash-card">
                <span>Online</span>
                <strong>{cards.onlineUsers}</strong>
              </div>
              {Object.entries(cards.onlineByOffice || {}).map(([name, n]) => (
                <div className="dash-card" key={name}>
                  <span>{name} online</span>
                  <strong>{n}</strong>
                </div>
              ))}
              <div className="dash-card">
                <span>Toplam çay (bugün)</span>
                <strong>{cards.teaTotal}</strong>
              </div>
              <div className="dash-card">
                <span>Toplam soda (bugün)</span>
                <strong>{cards.sodaTotal}</strong>
              </div>
              <div className="dash-card">
                <span>En çok sipariş</span>
                <strong>
                  {cards.topProduct
                    ? `${cards.topProduct.name} (${cards.topProduct.qty})`
                    : '—'}
                </strong>
              </div>
              <div className="dash-card">
                <span>Ort. hazırlanma (dk)</span>
                <strong>{cards.avgPrepMinutes}</strong>
              </div>
            </div>

            <div className="chart-grid">
              <div className="chart-panel">
                <h3>Son 7 gün</h3>
                <BarChart data={charts.last7Days} />
              </div>
              <div className="chart-panel">
                <h3>Ürün dağılımı (bugün)</h3>
                <BarChart
                  data={charts.productDistribution}
                  valueKey="qty"
                  labelKey="name"
                />
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
              <input name="color" type="color" defaultValue="#1B6B4A" />
              <button className="btn primary" type="submit">
                Ekle
              </button>
            </form>
            <ul className="admin-list">
              {offices.map((o) => (
                <li key={o.id}>
                  <span>
                    <span className="dot" style={{ background: o.color }} />
                    {o.name}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'users' && (
          <section className="admin-section">
            <form className="stack-form" onSubmit={createUser}>
              <input name="name" placeholder="Ad soyad" required />
              <input name="username" placeholder="Kullanıcı adı" required />
              <input name="password" placeholder="Şifre" required />
              <select name="role" defaultValue="office_user">
                <option value="office_user">Ofis kullanıcısı</option>
                <option value="kitchen">Mutfak</option>
                <option value="admin">Admin</option>
              </select>
              <select name="officeId" defaultValue="">
                <option value="">Ofis seçin</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" type="submit">
                Kullanıcı ekle
              </button>
            </form>
            <ul className="admin-list">
              {users.map((u) => (
                <li key={u.id}>
                  <div>
                    <strong>{u.name}</strong>
                    <span className="muted">
                      {' '}
                      @{u.username} · {u.role}
                      {u.office ? ` · ${u.office.name}` : ''}
                      {!u.active ? ' · PASİF' : ''}
                    </span>
                  </div>
                  <button type="button" className="btn ghost" onClick={() => toggleUser(u)}>
                    {u.active ? 'Pasifleştir' : 'Aktifleştir'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'menu' && (
          <section className="admin-section">
            <form className="inline-form menu-form" onSubmit={createMenu}>
              <input name="name" placeholder="Ürün adı" required />
              <select name="icon" defaultValue="cup">
                {ICONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <button className="btn primary" type="submit">
                Ekle
              </button>
            </form>
            <p className="muted">Sürükleyerek sıralayın</p>
            <ul className="admin-list drag-list">
              {menu.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(item.id)}
                >
                  <span>
                    #{item.sortOrder} [{item.icon}] {item.name}
                  </span>
                  <span className="row-actions">
                    <select value={item.icon} onChange={(e) => setIcon(item, e.target.value)}>
                      {ICONS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn ghost" onClick={() => toggleMenu(item)}>
                      {item.active ? 'Pasif' : 'Aktif'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'announcements' && (
          <section className="admin-section">
            <form className="stack-form" onSubmit={createAnnouncement}>
              <input name="title" placeholder="Başlık" required />
              <textarea name="body" placeholder="Mesaj" rows={3} required />
              <select name="severity" defaultValue="info">
                <option value="info">Bilgi</option>
                <option value="warning">Uyarı</option>
                <option value="critical">Kritik</option>
              </select>
              <label>
                Başlangıç
                <input name="startsAt" type="datetime-local" />
              </label>
              <label>
                Bitiş (opsiyonel)
                <input name="endsAt" type="datetime-local" />
              </label>
              <button className="btn primary" type="submit">
                Yayınla
              </button>
            </form>
            <ul className="admin-list">
              {announcements.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>
                      [{a.severity}] {a.title}
                    </strong>
                    <div className="muted">{a.body}</div>
                    <div className="muted">
                      {a.active ? 'Aktif' : 'Pasif'} ·{' '}
                      {new Date(a.startsAt).toLocaleString('tr-TR')}
                      {a.endsAt ? ` → ${new Date(a.endsAt).toLocaleString('tr-TR')}` : ''}
                    </div>
                  </div>
                  <span className="row-actions">
                    <button type="button" className="btn ghost" onClick={() => toggleAnnouncement(a)}>
                      {a.active ? 'Pasifleştir' : 'Aktifleştir'}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => deleteAnnouncement(a.id)}>
                      Sil
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'settings' && settings && (
          <section className="admin-section">
            <form className="stack-form" onSubmit={saveSettings}>
              <label>
                Şirket adı
                <input name="companyName" defaultValue={settings.companyName} required />
              </label>
              <label>
                Sipariş süresi (sn)
                <input
                  name="sessionDurationSec"
                  type="number"
                  min={30}
                  max={3600}
                  defaultValue={settings.sessionDurationSec}
                  required
                />
              </label>
              <label className="check">
                <input
                  name="notificationSound"
                  type="checkbox"
                  defaultChecked={settings.notificationSound}
                />{' '}
                Bildirim sesi
              </label>
              <label className="check">
                <input name="autoClose" type="checkbox" defaultChecked={settings.autoClose} />{' '}
                Süre bitince mutfağa gönder
              </label>
              <label>
                Mesai başlangıç
                <input name="workingHoursStart" defaultValue={settings.workingHoursStart} />
              </label>
              <label>
                Mesai bitiş
                <input name="workingHoursEnd" defaultValue={settings.workingHoursEnd} />
              </label>
              <label>
                config (JSON)
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
            {presence.map((block) => (
              <div key={block.office.id} className="presence-block">
                <h3>{block.office.name}</h3>
                <div className="presence-bar">
                  {block.users.map((u) => (
                    <span key={u.id} className={`presence-chip ${u.online ? 'on' : 'off'}`}>
                      <i /> {u.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'logs' && (
          <section className="admin-section">
            <ul className="log-list">
              {logs.map((log) => (
                <li key={log.id}>
                  <div className="log-head">
                    <strong>{log.action}</strong>
                    <span className="muted">
                      {new Date(log.createdAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="muted">
                    {log.actor ? `${log.actor.name}` : 'Sistem'}
                    {log.requestId ? ` · ${log.requestId.slice(0, 8)}` : ''}
                  </div>
                  <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                </li>
              ))}
            </ul>
          </section>
        )}
          </>
        )}
      </main>
    </div>
  );
}
