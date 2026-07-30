import { NavLink } from 'react-router-dom';

/** Shared desktop-app download entry — same look in AppHeader and AdminHeader. */
export default function DesktopNavButton() {
  return (
    <NavLink
      to="/desktop"
      className={({ isActive }) => `btn ghost nav-desktop-btn ${isActive ? 'active' : ''}`}
      title="Masaüstü Uygulaması"
      aria-label="Masaüstü Uygulaması"
    >
      <span className="nav-desktop-btn-ico" aria-hidden>
        💻
      </span>
      <span className="nav-desktop-btn-label">Masaüstü Uygulaması</span>
    </NavLink>
  );
}
