import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { homeFor, initials } from '../lib/format';
import { roleLabel } from '../lib/uxLabels';

export default function AppHeader({ title, subtitle, accent, onLogout }) {
  const { user } = useAuth();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const name = user?.name || '';

  const links = [];
  if (user?.role === 'office_user') links.push({ to: '/office', label: 'Sipariş' });
  if (user?.role === 'admin') {
    links.push({ to: '/admin/dashboard', label: 'Admin' });
    links.push({ to: '/kitchen', label: 'Mutfak' });
  }
  if (user?.role === 'kitchen') links.push({ to: '/kitchen', label: 'Mutfak' });
  links.push({ to: '/profile', label: 'Profil' });

  return (
    <header className="app-shell-header" style={accent ? { '--accent': accent } : undefined}>
      <div className="app-nav">
        <button
          type="button"
          className="nav-brand"
          onClick={() => navigate(homeFor(user?.role))}
          aria-label="Ana sayfa"
        >
          <img src="/alfatek.png" alt="" width={32} height={32} />
          <span>Alfatek</span>
        </button>

        <nav className="nav-links" aria-label="Ana menü">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end={!l.to.startsWith('/admin')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className="btn ghost theme-toggle"
            onClick={() => theme.toggle()}
            aria-label={theme.isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
            title={theme.isDark ? 'Açık tema' : 'Koyu tema'}
          >
            {theme.isDark ? '☀' : '🌙'}
          </button>
          <NotificationCenter />
          <div className="nav-user" title={`${name} · ${roleLabel(user?.role)}`}>
            <span className="avatar" aria-hidden>
              {initials(name)}
            </span>
            <span className="nav-user-meta">
              <strong>{name}</strong>
              <small>
                {roleLabel(user?.role)}
                {user?.office?.name ? ` · ${user.office.name}` : ''}
              </small>
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={onLogout}>
            Çıkış
          </button>
        </div>
      </div>

      {(title || subtitle) && location.pathname !== '/profile' && (
        <div className="page-title-row">
          <div>
            {title && <h1>{title}</h1>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
        </div>
      )}
    </header>
  );
}
