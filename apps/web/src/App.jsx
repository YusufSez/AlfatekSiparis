import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import OfficePage from './pages/OfficePage';
import KitchenPage from './pages/KitchenPage';
import AdminPage from './pages/AdminPage';

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot">Yükleniyor…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'kitchen') return <Navigate to="/kitchen" replace />;
    return <Navigate to="/office" replace />;
  }
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
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
          ) : user.role === 'admin' ? (
            <Navigate to="/admin" replace />
          ) : user.role === 'kitchen' ? (
            <Navigate to="/kitchen" replace />
          ) : (
            <Navigate to="/office" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
