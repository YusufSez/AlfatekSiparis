import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { homeFor } from '../lib/format';

export default function ForbiddenPage() {
  const { user } = useAuth();
  const to = homeFor(user?.role);

  return (
    <div className="forbidden-shell">
      <div className="forbidden-card card-surface">
        <div className="empty-icon" aria-hidden>
          🔒
        </div>
        <h1>Yetki yok</h1>
        <p className="muted">
          Bu sayfayı görüntülemek için admin yetkisi gerekir. JSON hata ekranı yerine bu bilgilendirme
          gösterilir.
        </p>
        <div className="row-actions wrap">
          <Link className="btn primary" to={to}>
            Ana ekrana dön
          </Link>
          <Link className="btn ghost" to="/login">
            Farklı hesapla giriş
          </Link>
        </div>
      </div>
    </div>
  );
}
