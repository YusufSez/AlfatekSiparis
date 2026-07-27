import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'admin') navigate('/admin', { replace: true });
    else if (user.role === 'kitchen') navigate('/kitchen', { replace: true });
    else navigate('/office', { replace: true });
  }, [user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username.trim(), password, remember);
      if (u.role === 'admin') navigate('/admin');
      else if (u.role === 'kitchen') navigate('/kitchen');
      else navigate('/office');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-bg" aria-hidden />
      <form className="login-card" onSubmit={onSubmit}>
        <p className="brand">Ofis Sipariş</p>
        <h1>Giriş yap</h1>
        <p className="muted">Çay, soda ve diğer siparişleri ofis olarak toplu yönetin.</p>
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
        <label className="check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Beni hatırla (7 gün)
        </label>
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? 'Giriş…' : 'Giriş'}
        </button>
        {import.meta.env.DEV && (
          <p className="hint">Demo: yusuf / mutfak / admin — şifre 123456</p>
        )}
      </form>
    </div>
  );
}
