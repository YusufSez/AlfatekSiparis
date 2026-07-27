import { Link } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { roleLabel } from '../lib/uxLabels';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

const THEME_LABEL = { light: 'Açık', dark: 'Koyu', system: 'Sistem' };

export default function AppHeader({ title, subtitle, accent, onLogout }) {
  const { user } = useAuth();
  const theme = useTheme();
  const name = user?.name || '';

  return (
    <header className="app-header" style={accent ? { '--accent': accent } : undefined}>
      <div className="header-brand">
        <img src="/alfatek.png" alt="" className="header-logo" width={36} height={36} />
        <div>
          <p className="brand-mini">Alfatek Sipariş</p>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="btn ghost theme-toggle"
          onClick={() => theme.cycle()}
          title={`Tema: ${THEME_LABEL[theme.preference]}`}
          aria-label="Tema değiştir"
        >
          {theme.resolved === 'dark' ? '◐' : '☀'}
          <span className="theme-label">{THEME_LABEL[theme.preference]}</span>
        </button>
        <NotificationCenter />
        <Link to="/profile" className="profile-chip" title="Profilim">
          <span className="avatar" aria-hidden>
            {initials(name)}
          </span>
          <span className="profile-chip-meta">
            <strong>{name}</strong>
            <small>
              {roleLabel(user?.role)}
              {user?.office?.name ? ` · ${user.office.name}` : ''}
            </small>
          </span>
        </Link>
        <button type="button" className="btn ghost" onClick={onLogout}>
          Çıkış
        </button>
      </div>
    </header>
  );
}
