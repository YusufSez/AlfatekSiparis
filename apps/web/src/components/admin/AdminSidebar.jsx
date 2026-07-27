import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
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

function useIsMobileNav(breakpoint = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return mobile;
}

export default function AdminSidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
  const isMobile = useIsMobileNav();
  const showLabels = isMobile || !collapsed;
  const brandCollapsed = !isMobile && collapsed;

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') onCloseMobile?.();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen, onCloseMobile]);

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
        className={`admin-sidebar ${brandCollapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      >
        <div className={`sidebar-brand ${brandCollapsed ? 'is-collapsed' : ''}`}>
          <div className="sidebar-brand-main">
            <img src="/alfatek.png" alt="" width={28} height={28} />
            {showLabels && <span className="sidebar-brand-text">ALFATEK</span>}
          </div>
          {!isMobile && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
              title={collapsed ? 'Genişlet' : 'Daralt'}
            >
              {collapsed ? '»' : '«'}
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              className="btn ghost sidebar-mobile-close"
              aria-label="Menüyü kapat"
              onClick={onCloseMobile}
            >
              ✕
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Admin menü">
          {NAV.map((item) => (
            <Tooltip key={item.to} label={!showLabels ? item.label : ''}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                title={item.label}
                onClick={onCloseMobile}
              >
                <span className="sidebar-ico" aria-hidden>
                  {item.icon}
                </span>
                {showLabels && <span className="sidebar-label">{item.label}</span>}
              </NavLink>
            </Tooltip>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Tooltip label={!showLabels ? 'Profil' : ''}>
            <NavLink
              to="/admin/profile"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title="Profil"
              onClick={onCloseMobile}
            >
              <span className="avatar sm" aria-hidden>
                {initials(user?.name)}
              </span>
              {showLabels && <span className="sidebar-label">Profil</span>}
            </NavLink>
          </Tooltip>
          <Tooltip label={!showLabels ? 'Çıkış' : ''}>
            <button
              type="button"
              className="sidebar-link sidebar-logout"
              onClick={logout}
              title="Çıkış"
            >
              <span className="sidebar-ico" aria-hidden>
                🚪
              </span>
              {showLabels && <span className="sidebar-label">Çıkış</span>}
            </button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
