import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function AdminLoginPage() {
  const { login, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      const from = location.state?.from;
      navigate(
        from && typeof from === 'string' && from.startsWith('/admin') && from !== '/admin/login'
          ? from
          : '/admin/dashboard',
        { replace: true }
      );
    }
  }, [user, navigate, location.state]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password, remember);
      if (u.role !== 'admin') {
        logout();
        setError('Bu hesap yönetim paneline erişemez.');
        return;
      }
      const from = location.state?.from;
      navigate(
        from && typeof from === 'string' && from.startsWith('/admin') && from !== '/admin/login'
          ? from
          : '/admin/dashboard',
        { replace: true }
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <div className="admin-login-bg" aria-hidden />
      <form className="admin-login-card" onSubmit={onSubmit} noValidate>
        <div className="admin-login-brand">
          <img src="/alfatek.png" alt="Alfatek" width={56} height={56} />
          <p className="brand">Alfatek</p>
          <h1>Yönetim Paneli</h1>
          <p className="muted">Yalnızca yetkili yöneticiler için kurumsal giriş</p>
        </div>

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        <label>
          Yönetici kullanıcı adı
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
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
        <label className="check remember-row compact-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Oturumu açık tut</span>
        </label>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Doğrulanıyor…' : 'Panele giriş'}
        </button>
        <p className="admin-login-foot muted">
          Ofis veya mutfak girişi için{' '}
          <Link to="/login">normal giriş</Link> sayfasını kullanın.
        </p>
      </form>
    </div>
  );
}
