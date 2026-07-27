import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { homeFor } from '../lib/format';

export default function ForbiddenPage() {
  const { user, logout } = useAuth();

  // Guests must never see this page — send them to admin login
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  const to = homeFor(user.role);

  return (
    <div className="forbidden-shell">
      <div className="forbidden-card card-surface">
        <div className="empty-icon" aria-hidden>
          🔒
        </div>
        <h1>Yetki yok</h1>
        <p className="muted">
          Bu hesap ({user.name}) yönetim paneline erişemez. Yalnızca admin hesabı kullanın.
        </p>
        <div className="row-actions wrap">
          <Link className="btn primary" to={to}>
            Ana ekrana dön
          </Link>
          <Link className="btn ghost" to="/admin/login" onClick={() => logout()}>
            Yönetici girişi
          </Link>
        </div>
      </div>
    </div>
  );
}
