import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { homeFor } from './lib/format';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import OfficePage from './pages/OfficePage';
import KitchenPage from './pages/KitchenPage';
import ProfilePage from './pages/ProfilePage';
import ForbiddenPage from './pages/ForbiddenPage';
import AdminLayout from './components/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import OfficesPage from './pages/admin/OfficesPage';
import UsersPage from './pages/admin/UsersPage';
import MenuPage from './pages/admin/MenuPage';
import LogsPage from './pages/admin/LogsPage';
import AnnouncementsPage from './pages/admin/AnnouncementsPage';
import SettingsPage from './pages/admin/SettingsPage';
import AdminProfilePage from './pages/admin/AdminProfilePage';

function returnPath(location) {
  return `${location.pathname}${location.search || ''}`;
}

function Guard({ roles, children, onForbidden = 'home', loginTo = '/login' }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  if (!user) {
    return <Navigate to={loginTo} replace state={{ from: returnPath(location) }} />;
  }

  if (roles && !roles.includes(user.role)) {
    if (onForbidden === 'page') return <ForbiddenPage />;
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return children;
}

/** Admin area: guests → login; non-admin → forbidden; admin → layout */
function AdminGate() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  if (!user) {
    return (
      <Navigate to="/admin/login" replace state={{ from: returnPath(location) }} />
    );
  }

  if (user.role !== 'admin') {
    return <ForbiddenPage />;
  }

  return <AdminLayout />;
}

function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <LoginPage />;
  const from = location.state?.from;
  if (
    from &&
    typeof from === 'string' &&
    from !== '/login' &&
    !from.startsWith('/login') &&
    !from.startsWith('/admin')
  ) {
    return <Navigate to={from} replace />;
  }
  return <Navigate to={homeFor(user.role)} replace />;
}

function AdminLoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot">Yükleniyor…</div>;
  if (user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <AdminLoginPage />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="boot">Yükleniyor…</div>;

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/admin/login" element={<AdminLoginRoute />} />

      <Route
        path="/profile"
        element={
          <Guard>
            {user?.role === 'admin' ? <Navigate to="/admin/profile" replace /> : <ProfilePage />}
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

      <Route path="/admin" element={<AdminGate />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="offices" element={<OfficesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
      </Route>

      <Route
        path="/"
        element={!user ? <Navigate to="/login" replace /> : <Navigate to={homeFor(user.role)} replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
