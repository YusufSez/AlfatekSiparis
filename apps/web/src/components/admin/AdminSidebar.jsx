import { NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import Tooltip from '../ui/Tooltip';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/admin/offices', label: 'Ofisler', icon: '🏢' },
  { to: '/admin/users', label: 'Kullanıcılar', icon: '👥' },
  { to: '/admin/menu', label: 'Menü', icon: '☕' },
  { to: '/admin/announcements', label: 'Duyurular', icon: '📢' },
  { to: '/admin/logs', label: 'Loglar', icon: '📜' },
  { to: '/admin/settings', label: 'Ayarlar', icon: '⚙' },
];

export default function AdminSidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Menüyü kapat"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      >
        <div className={`sidebar-brand ${collapsed ? 'collapsed' : ''}`}>
          <img src="/alfatek.png" alt="" width={28} height={28} />
          {!collapsed && <span className="sidebar-brand-text">ALFATEK</span>}
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
          title={collapsed ? 'Genişlet' : 'Daralt'}
        >
          {collapsed ? '»' : '«'}
        </button>

        <nav className="sidebar-nav" aria-label="Admin menü">
          {NAV.map((item) => (
            <Tooltip key={item.to} label={collapsed ? item.label : ''}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                title={item.label}
                onClick={onCloseMobile}
              >
                <span className="sidebar-ico" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed && <span className="sidebar-label">{item.label}</span>}
              </NavLink>
            </Tooltip>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Tooltip label={collapsed ? 'Profil' : ''}>
            <NavLink
              to="/admin/profile"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title="Profil"
              onClick={onCloseMobile}
            >
              <span className="avatar sm" aria-hidden>
                {initials(user?.name)}
              </span>
              {!collapsed && <span className="sidebar-label">Profil</span>}
            </NavLink>
          </Tooltip>
          <Tooltip label={collapsed ? 'Çıkış' : ''}>
            <button
              type="button"
              className="sidebar-link sidebar-logout"
              onClick={logout}
              title="Çıkış"
            >
              <span className="sidebar-ico" aria-hidden>
                🚪
              </span>
              {!collapsed && <span className="sidebar-label">Çıkış</span>}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
