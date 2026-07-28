import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { homeFor } from './lib/format';
import LoginPage from './pages/LoginPage';
import OfficePage from './pages/OfficePage';
import KitchenPage from './pages/KitchenPage';
import ProfilePage from './pages/ProfilePage';
import ForbiddenPage from './pages/ForbiddenPage';

const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const OfficesPage = lazy(() => import('./pages/admin/OfficesPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const MenuPage = lazy(() => import('./pages/admin/MenuPage'));
const LogsPage = lazy(() => import('./pages/admin/LogsPage'));
const AnnouncementsPage = lazy(() => import('./pages/admin/AnnouncementsPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const AdminProfilePage = lazy(() => import('./pages/admin/AdminProfilePage'));

function BootFallback() {
  return <div className="boot">Yükleniyor…</div>;
}

function returnPath(location) {
  return `${location.pathname}${location.search || ''}`;
}

function Guard({ roles, children, onForbidden = 'home', loginTo = '/login' }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BootFallback />;

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

  if (loading) return <BootFallback />;

  if (!user) {
    return (
      <Navigate to="/admin/login" replace state={{ from: returnPath(location) }} />
    );
  }

  if (user.role !== 'admin') {
    return <ForbiddenPage />;
  }

  return (
    <Suspense fallback={<BootFallback />}>
      <AdminLayout />
    </Suspense>
  );
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
  if (loading) return <BootFallback />;
  if (user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return (
    <Suspense fallback={<BootFallback />}>
      <AdminLoginPage />
    </Suspense>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <BootFallback />;

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
