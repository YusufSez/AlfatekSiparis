import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'kitchen') return '/kitchen';
  return '/office';
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const from = location.state?.from;
    navigate(from && from !== '/login' ? from : homeFor(user.role), { replace: true });
  }, [user, navigate, location.state]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password, remember);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-bg" aria-hidden />
      <div className="login-split">
        <aside className="login-aside">
          <img src="/alfatek.png" alt="Alfatek" className="login-aside-logo" />
          <p className="brand">Alfatek</p>
          <h1>Ofis Sipariş Sistemi</h1>
          <p className="muted">
            Teknik ve Operasyon ofisleri için gerçek zamanlı, kurumsal sipariş yönetimi.
          </p>
        </aside>

        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-card-head">
            <h2>Giriş yap</h2>
            <p className="muted">Hesabınızla devam edin</p>
          </div>
          {error && <div className="alert">{error}</div>}
          <label>
            Kullanıcı adı
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="check remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Beni hatırla</span>
          </label>
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
