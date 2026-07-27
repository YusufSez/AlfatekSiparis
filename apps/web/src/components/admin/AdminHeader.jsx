import { Link } from 'react-router-dom';
import Breadcrumb from '../ui/Breadcrumb';
import NotificationCenter from '../NotificationCenter';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import { roleLabel } from '../../lib/uxLabels';

export default function AdminHeader({ breadcrumb = [], onSearch, searchValue, onSearchChange, onOpenMobileNav }) {
  const theme = useTheme();
  const { user } = useAuth();

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <button type="button" className="btn ghost mobile-nav-btn" onClick={onOpenMobileNav} aria-label="Menü">
          ☰
        </button>
        <Breadcrumb items={breadcrumb} />
      </div>
      <div className="admin-topbar-right">
        <form className="admin-search" onSubmit={onSearch}>
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Ara…"
            aria-label="Admin arama"
          />
        </form>
        <button
          type="button"
          className="btn ghost theme-toggle"
          onClick={() => theme.toggle()}
          aria-label={theme.isDark ? 'Açık tema' : 'Koyu tema'}
        >
          {theme.isDark ? '☀' : '🌙'}
        </button>
        <NotificationCenter />
        <Link to="/admin/profile" className="profile-chip admin-profile-chip" title="Profil">
          <span className="avatar" aria-hidden>
            {initials(user?.name)}
          </span>
          <span className="profile-chip-meta">
            <strong>{user?.name}</strong>
            <small>{roleLabel(user?.role)}</small>
          </span>
        </Link>
      </div>
    </header>
  );
}
