import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { homeFor } from '../lib/format';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function destination(u) {
    const from = location.state?.from;
    if (from && typeof from === 'string' && from !== '/login' && !from.startsWith('/login')) {
      return from;
    }
    return homeFor(u.role);
  }

  useEffect(() => {
    if (!user) return;
    navigate(destination(user), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password, remember);
      navigate(destination(u), { replace: true });
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
