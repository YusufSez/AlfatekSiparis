import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { isElectronDesktop } from '../lib/desktop';
import { getInstallState, subscribeInstallState } from '../lib/pwaInstall';

/** Shared desktop-app download entry — hidden in Electron and installed PWA. */
export default function DesktopNavButton() {
  const [standalone, setStandalone] = useState(() => getInstallState().installed);

  useEffect(() => subscribeInstallState((s) => setStandalone(Boolean(s.installed))), []);

  if (isElectronDesktop() || standalone) return null;

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
