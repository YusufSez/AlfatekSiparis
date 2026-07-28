import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSocket } from '../lib/socket';
import { useTheme } from '../lib/theme';
import { useToast } from '../lib/toast';
import AppHeader from '../components/AppHeader';
import { Badge } from '../components/Badge';
import Button from '../components/ui/Button';
import { Skeleton, EmptyState } from '../components/LoadStates';
import { formatDateTime } from '../lib/format';
import { iconMeta, roleHint, roleLabel } from '../lib/uxLabels';
import PushNotificationSettings from '../components/PushNotificationSettings';
import AvatarEditor from '../components/AvatarEditor';
import { getOrderSoundEnabled, setOrderSoundEnabled } from '../lib/orderSound';

const KITCHEN_ACTION_LABEL = {
  'kitchen.preparing': 'Hazırlanıyor',
  'kitchen.delivered': 'Teslim edildi',
};

function ProfileHero({ u, connected, onAvatarUpdated }) {
  return (
    <section className="profile-hero card-surface">
      <AvatarEditor user={u} onUpdated={onAvatarUpdated} />
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
          <p className="muted tiny">Hesap: {formatDateTime(u.createdAt)}</p>
        )}
      </div>
    </section>
  );
}

function ThemeSection({ theme, userId }) {
  const [soundOn, setSoundOn] = useState(() => getOrderSoundEnabled(userId));

  useEffect(() => {
    setSoundOn(getOrderSoundEnabled(userId));
  }, [userId]);

  return (
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
      <h3 className="form-title" style={{ marginTop: '1rem' }}>
        Ses Efekti
      </h3>
      <p className="muted tiny">Yeni sipariş / mutfak siparişi bildiriminde özel ses</p>
      <div className="row-actions wrap">
        <Button
          variant={soundOn ? 'primary' : 'ghost'}
          onClick={() => setSoundOn(setOrderSoundEnabled(userId, true))}
        >
          Açık
        </Button>
        <Button
          variant={!soundOn ? 'primary' : 'ghost'}
          onClick={() => setSoundOn(setOrderSoundEnabled(userId, false))}
        >
          Kapalı
        </Button>
      </div>
    </section>
  );
}

function PasswordSection({
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  busy,
  onSubmit,
}) {
  return (
    <section className="card-surface">
      <h3 className="form-title">Şifre değiştir</h3>
      <form className="stack-form" onSubmit={onSubmit}>
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
        <Button type="submit" variant="primary" loading={busy}>
          Şifreyi güncelle
        </Button>
      </form>
    </section>
  );
}

function OfficeStats({ stats }) {
  return (
    <>
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
        <h3 className="form-title">Son siparişler</h3>
        {!stats?.recentOrders?.length ? (
          <EmptyState
            icon="🧾"
            title="Henüz sipariş yok"
            description="İlk siparişiniz burada görünecek."
          />
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
                    {o.office || '—'} · {o.status} · {o.at ? formatDateTime(o.at) : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function KitchenStats({ stats }) {
  const prepared = stats?.preparedTickets;
  const recent = stats?.recentPrepared || [];

  return (
    <>
      <section className="dash-grid profile-stats">
        <div className="dash-card">
          <span>Hazırladığı sipariş</span>
          <strong>{prepared != null ? prepared : '—'}</strong>
        </div>
      </section>

      <section className="card-surface">
        <h3 className="form-title">Son hazırlanan siparişler</h3>
        {!recent.length ? (
          <EmptyState
            icon="🍳"
            title="Henüz kayıt yok"
            description="Hazırladığınız siparişler burada görünecek."
          />
        ) : (
          <ul className="profile-orders">
            {recent.map((o) => (
              <li key={o.id}>
                <span aria-hidden>🍽️</span>
                <div>
                  <strong>{o.summary || 'Sipariş'}</strong>
                  <div className="muted tiny">
                    {o.office || '—'} · {KITCHEN_ACTION_LABEL[o.action] || o.status || '—'}
                    {o.at ? ` · ${formatDateTime(o.at)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function ProfilePage() {
  const { user, logout, setUser } = useAuth();
  const { connected } = useSocket();
  const theme = useTheme();
  const toast = useToast();
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
  }, [toast]);

  function onAvatarUpdated(nextUser) {
    setUser(nextUser);
    setProfile((prev) => (prev ? { ...prev, user: nextUser } : { user: nextUser }));
  }

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
  const isKitchen = (u?.role || user?.role) === 'kitchen';

  return (
    <div className="page">
      <AppHeader title="Profilim" subtitle="Hesap bilgileriniz" onLogout={logout} />
      <main className="content">
        {booting ? (
          <Skeleton rows={7} />
        ) : !u ? (
          <EmptyState
            icon="👤"
            title="Profil yüklenemedi"
            ctaLabel="Yenile"
            onCta={() => window.location.reload()}
          />
        ) : (
          <div className="profile-layout">
            <ProfileHero u={u} connected={connected} onAvatarUpdated={onAvatarUpdated} />

            {isKitchen ? <KitchenStats stats={stats} /> : <OfficeStats stats={stats} />}

            <ThemeSection theme={theme} userId={u.id} />
            <PushNotificationSettings />
            <PasswordSection
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              busy={busy}
              onSubmit={changePassword}
            />
          </div>
        )}
      </main>
    </div>
  );
}
