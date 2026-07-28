import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { homeFor } from '../lib/format';
import { roleLabel } from '../lib/uxLabels';
import { Avatar } from './Avatar';

const LINK_META = {
  '/office': { icon: '🛒', short: 'Sipariş' },
  '/kitchen': { icon: '🍳', short: 'Mutfak' },
  '/admin/dashboard': { icon: '⚙️', short: 'Admin' },
  '/profile': { icon: '👤', short: 'Profil' },
};

export default function AppHeader({ title, subtitle, accent, onLogout }) {
  const { user } = useAuth();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = user?.name || '';

  const links = [];
  if (user?.role === 'office_user') links.push({ to: '/office', label: 'Sipariş' });
  if (user?.role === 'admin') {
    links.push({ to: '/admin/dashboard', label: 'Admin' });
    links.push({ to: '/kitchen', label: 'Mutfak' });
  }
  if (user?.role === 'kitchen') links.push({ to: '/kitchen', label: 'Mutfak' });
  links.push({ to: '/profile', label: 'Profil' });

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function renderNavLink(l, className) {
    const meta = LINK_META[l.to] || { icon: '•', short: l.label };
    return (
      <NavLink
        key={l.to}
        to={l.to}
        className={({ isActive }) => `${className} ${isActive ? 'active' : ''}`}
        end={!l.to.startsWith('/admin')}
        onClick={() => setMenuOpen(false)}
      >
        <span className="nav-link-ico" aria-hidden>
          {meta.icon}
        </span>
        <span className="nav-link-label">{l.label}</span>
      </NavLink>
    );
  }

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
          <span className="nav-brand-text">Alfatek</span>
        </button>

        <nav className="nav-links nav-links-desktop" aria-label="Ana menü">
          {links.map((l) => renderNavLink(l, 'nav-link'))}
        </nav>

        <div className="nav-actions">
          <NotificationCenter />
          <button
            type="button"
            className="btn ghost theme-toggle"
            onClick={() => theme.toggle()}
            aria-label={theme.isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
            title={theme.isDark ? 'Açık tema' : 'Koyu tema'}
          >
            {theme.isDark ? '☀' : '🌙'}
          </button>

          <div className="nav-user-card">
            <button
              type="button"
              className="nav-user nav-user-btn"
              title={`${name} · ${roleLabel(user?.role)}`}
              aria-label="Profil"
              onClick={() => navigate('/profile')}
            >
              <Avatar name={name} avatarUrl={user?.avatarUrl} />
              <span className="nav-user-meta">
                <strong>{name}</strong>
                <small>
                  {roleLabel(user?.role)}
                  {user?.office?.name ? ` · ${user.office.name}` : ''}
                </small>
              </span>
            </button>
          </div>

          <button type="button" className="btn ghost nav-logout-btn" onClick={onLogout}>
            <span className="nav-logout-label">Çıkış</span>
          </button>

          <button
            type="button"
            className="btn ghost nav-menu-btn"
            aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="nav-drawer-backdrop"
            aria-label="Menüyü kapat"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="nav-drawer" aria-label="Mobil menü">
            <div className="nav-drawer-top">
              <div className="nav-drawer-user">
                <Avatar name={name} avatarUrl={user?.avatarUrl} />
                <div>
                  <strong>{name}</strong>
                  <small className="muted">
                    {roleLabel(user?.role)}
                    {user?.office?.name ? ` · ${user.office.name}` : ''}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="btn ghost nav-drawer-close"
                aria-label="Menüyü kapat"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="nav-drawer-links">
              {links.map((l) => renderNavLink(l, 'nav-drawer-link'))}
            </div>
            <button type="button" className="btn ghost nav-drawer-logout" onClick={onLogout}>
              Çıkış
            </button>
          </nav>
        </>
      )}

      {(title || subtitle) && location.pathname !== '/profile' && (
        <div className="page-title-row">
          <div className="page-title-inner">
            {title && <h1>{title}</h1>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
        </div>
      )}

      <nav className="app-bottom-nav" aria-label="Alt gezinme">
        {links.map((l) => renderNavLink(l, 'bottom-nav-link'))}
      </nav>
    </header>
  );
}
