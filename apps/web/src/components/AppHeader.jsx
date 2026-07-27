import NotificationCenter from './NotificationCenter';

export default function AppHeader({ title, subtitle, accent, onLogout, userName }) {
  return (
    <header className="app-header" style={accent ? { '--accent': accent } : undefined}>
      <div>
        <p className="brand-mini">Ofis Sipariş</p>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="header-actions">
        <NotificationCenter />
        <span className="user-pill">{userName}</span>
        <button type="button" className="btn ghost" onClick={onLogout}>
          Çıkış
        </button>
      </div>
    </header>
  );
}
