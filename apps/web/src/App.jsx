import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import OfficePage from './pages/OfficePage';
import KitchenPage from './pages/KitchenPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'kitchen') return '/kitchen';
  return '/office';
}

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return children;
}

function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <LoginPage />;
  const from = location.state?.from;
  if (from && typeof from === 'string' && from !== '/login') {
    return <Navigate to={from} replace />;
  }
  return <Navigate to={homeFor(user.role)} replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/profile"
        element={
          <Guard>
            <ProfilePage />
          </Guard>
        }
      />
      <Route
        path="/office"
        element={
          <Guard roles={['office_user']}>
            <OfficePage />
          </Guard>
        }
      />
      <Route
        path="/kitchen"
        element={
          <Guard roles={['kitchen', 'admin']}>
            <KitchenPage />
          </Guard>
        }
      />
      <Route
        path="/admin"
        element={
          <Guard roles={['admin']}>
            <AdminPage />
          </Guard>
        }
      />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <Navigate to={homeFor(user.role)} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
