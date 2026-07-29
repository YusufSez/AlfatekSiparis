import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { api, getRememberLogin, setToken } from '../lib/api';

export default function ForcePasswordChangePage() {
  const { user, setUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Yeni şifre en az 8 karakter olmalı');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Yeni şifreler eşleşmiyor');
      return;
    }
    setBusy(true);
    try {
      const remember = getRememberLogin();
      const data = await api('/auth/password', {
        method: 'POST',
        body: { currentPassword, newPassword, remember },
      });
      if (data?.token) {
        setToken(data.token, { remember });
        window.dispatchEvent(new CustomEvent('auth:token-rotated'));
      }
      if (data?.user) setUser(data.user);
    } catch (err) {
      setError(err.message || 'Şifre değiştirilemedi');
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
          <h1>Şifre değişikliği gerekli</h1>
          <p className="muted">
            Güvenliğiniz için ilk girişte veya yönetici sıfırlaması sonrası yeni bir şifre belirlemeniz
            zorunludur.
          </p>
        </aside>

        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-card-head">
            <h2>Zorunlu şifre değiştir</h2>
            <p className="muted">
              {user?.name ? `${user.name} (@${user.username})` : 'Hesabınız'}
            </p>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <label>
            Mevcut şifre
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Yeni şifre
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            Yeni şifre tekrar
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet ve devam et'}
          </button>
          <button className="btn ghost" type="button" onClick={() => logout()} disabled={busy}>
            Çıkış yap
          </button>
        </form>
      </div>
    </div>
  );
}
