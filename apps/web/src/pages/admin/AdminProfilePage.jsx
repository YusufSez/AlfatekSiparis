import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSocket } from '../../lib/socket';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useAdminData } from '../../lib/adminData';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/Badge';
import PushNotificationSettings from '../../components/PushNotificationSettings';
import { Skeleton, EmptyState } from '../../components/LoadStates';
import { formatDateTime, initials } from '../../lib/format';
import { iconMeta, roleHint, roleLabel } from '../../lib/uxLabels';

export default function AdminProfilePage() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const theme = useTheme();
  const toast = useToast();
  const { lastLoginMap } = useAdminData();
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/profile')
      .then(setProfile)
      .catch((e) => toast.error(e.message))
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changePassword(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Şifreniz güncellendi');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const u = profile?.user || user;
  const stats = profile?.stats;

  if (booting) return <Skeleton rows={8} />;
  if (!u) return <EmptyState icon="👤" title="Profil yüklenemedi" />;

  return (
    <div className="admin-page-body">
      <PageHeader title="Profil" description="Hesap bilgileriniz" />

      <section className="profile-hero card-surface">
        <div className="avatar xl" aria-hidden>
          {initials(u.name)}
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
          <p className="muted tiny">Son giriş: {formatDateTime(lastLoginMap.get(u.id))}</p>
        </div>
      </section>

      <section className="dash-grid profile-stats">
        <div className="dash-card">
          <span>Katıldığı sipariş</span>
          <strong>{stats?.joinedSessions ?? '—'}</strong>
        </div>
        <div className="dash-card">
          <span>Açtığı sipariş</span>
          <strong>{stats?.openedSessions ?? '—'}</strong>
        </div>
        <div className="dash-card">
          <span>En çok istediği</span>
          <strong>
            {stats?.topProduct
              ? `${iconMeta(stats.topProduct.icon || 'cup').emoji} ${stats.topProduct.name}`
              : '—'}
          </strong>
        </div>
      </section>

      <section className="card-surface">
        <h3 className="form-title">Tema</h3>
        <div className="row-actions wrap">
          <Button
            variant={!theme.isDark ? 'primary' : 'ghost'}
            onClick={() => theme.setTheme('light')}
          >
            ☀ Açık
          </Button>
          <Button
            variant={theme.isDark ? 'primary' : 'ghost'}
            onClick={() => theme.setTheme('dark')}
          >
            🌙 Koyu
          </Button>
        </div>
      </section>

      <div style={{ marginTop: '1rem' }}>
        <PushNotificationSettings />
      </div>

      <section className="card-surface" style={{ marginTop: '1rem' }}>
        <h3 className="form-title">Şifre değiştir</h3>
        <form className="stack-form" onSubmit={changePassword}>
          <label>
            Mevcut şifre
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
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
            />
          </label>
          <Button type="submit" variant="primary" loading={busy}>
            Şifreyi güncelle
          </Button>
        </form>
      </section>
    </div>
  );
}
