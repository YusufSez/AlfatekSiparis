import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import AppHeader from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { Skeleton, LoadError, EmptyState } from '../components/LoadStates';
import { iconMeta, roleHint, roleLabel } from '../lib/uxLabels';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    api('/auth/profile')
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
  }, []);

  async function changePassword(e) {
    e.preventDefault();
    setPwdBusy(true);
    setPwdMsg('');
    setError('');
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg('Şifreniz güncellendi');
    } catch (err) {
      setError(err.message);
    } finally {
      setPwdBusy(false);
    }
  }

  const u = profile?.user || user;
  const stats = profile?.stats;

  return (
    <div className="page">
      <AppHeader title="Profilim" subtitle="Hesap bilgileriniz" onLogout={logout} />
      <main className="content">
        <LoadError message={error} onRetry={() => window.location.reload()} />
        {booting ? (
          <Skeleton rows={7} />
        ) : !u ? (
          <EmptyState icon="👤" title="Profil yüklenemedi" />
        ) : (
          <div className="profile-layout">
            <section className="profile-hero card-surface">
              <div className="avatar xl" aria-hidden>
                {(u.name || '?')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('')}
              </div>
              <div>
                <h2>{u.name}</h2>
                <p className="muted">@{u.username}</p>
                <div className="profile-chips">
                  <Badge tone="info">{roleLabel(u.role)}</Badge>
                  {u.office && <Badge tone="secondary">{u.office.name}</Badge>}
                  <Badge tone={connected ? 'success' : 'warning'}>
                    {connected ? 'Online' : 'Bağlantı yok'}
                  </Badge>
                </div>
                <p className="muted tiny">{roleHint(u.role)}</p>
                {u.createdAt && (
                  <p className="muted tiny">
                    Hesap: {new Date(u.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                )}
              </div>
            </section>

            <section className="dash-grid profile-stats">
              <div className="dash-card">
                <span>Açtığı sipariş</span>
                <strong>{stats?.openedSessions ?? '—'}</strong>
              </div>
              <div className="dash-card">
                <span>Katıldığı sipariş</span>
                <strong>{stats?.joinedSessions ?? '—'}</strong>
              </div>
              <div className="dash-card">
                <span>En çok istediği</span>
                <strong>
                  {stats?.topProduct
                    ? `${stats.topProduct.name} (${stats.topProduct.qty})`
                    : '—'}
                </strong>
              </div>
            </section>

            <section className="card-surface">
              <h3 className="form-title">Son siparişler</h3>
              {!stats?.recentOrders?.length ? (
                <p className="muted">Henüz sipariş kaydı yok.</p>
              ) : (
                <ul className="profile-orders">
                  {stats.recentOrders.map((o) => (
                    <li key={o.id}>
                      <span aria-hidden>{iconMeta(o.icon).emoji}</span>
                      <div>
                        <strong>
                          {o.qty}× {o.product}
                        </strong>
                        <div className="muted tiny">
                          {o.office || '—'} · {o.status} ·{' '}
                          {o.at ? new Date(o.at).toLocaleString('tr-TR') : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card-surface">
              <h3 className="form-title">Şifre değiştir</h3>
              <form className="stack-form" onSubmit={changePassword}>
                <label>
                  Mevcut şifre
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  Yeni şifre
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                </label>
                {pwdMsg && <p className="toast inline-toast">{pwdMsg}</p>}
                <button className="btn primary" type="submit" disabled={pwdBusy}>
                  {pwdBusy ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
                </button>
              </form>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}
