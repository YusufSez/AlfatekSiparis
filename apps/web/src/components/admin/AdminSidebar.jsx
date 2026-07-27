import { NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';

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
      {mobileOpen && <button type="button" className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={onCloseMobile} />}
      <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/alfatek.png" alt="" width={28} height={28} />
          {!collapsed && <span>ALFATEK</span>}
          <button
            type="button"
            className="btn ghost sidebar-collapse-btn"
            onClick={onToggle}
            aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            title={collapsed ? 'Genişlet' : 'Daralt'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Admin menü">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title={item.label}
              onClick={onCloseMobile}
            >
              <span className="sidebar-ico" aria-hidden>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink
            to="/admin/profile"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            title="Profil"
            onClick={onCloseMobile}
          >
            <span className="avatar sm" aria-hidden>
              {initials(user?.name)}
            </span>
            {!collapsed && <span>Profil</span>}
          </NavLink>
          <button type="button" className="sidebar-link sidebar-logout" onClick={logout} title="Çıkış">
            <span className="sidebar-ico" aria-hidden>
              🚪
            </span>
            {!collapsed && <span>Çıkış</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
