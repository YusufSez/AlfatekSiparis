import { useEffect, useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import AdminFooter from './AdminFooter';
import SearchResults from '../SearchResults';
import { OfflineBanner, LoadError, CardSkeleton } from '../LoadStates';
import { AdminDataProvider, useAdminData } from '../../lib/adminData';
import { useOnline } from '../../lib/useOnline';
import { useSocket } from '../../lib/socket';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';

const CRUMB_MAP = {
  dashboard: 'Dashboard',
  offices: 'Ofisler',
  users: 'Kullanıcılar',
  menu: 'Menü',
  announcements: 'Duyurular',
  logs: 'Loglar',
  settings: 'Ayarlar',
  profile: 'Profil',
  presence: 'Online',
};

function AdminShellInner() {
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const { connected } = useSocket();
  const online = useOnline(connected);
  const { booting, error, setError, refresh, offices } = useAdminData();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('alfatek-admin-sidebar') === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem('alfatek-admin-sidebar', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const parts = location.pathname.split('/').filter(Boolean);
  const section = parts[1] || 'dashboard';
  const detailOffice =
    section === 'offices' && params.get('detail')
      ? offices.find((o) => o.id === params.get('detail'))
      : null;

  let crumbs;
  if (section === 'dashboard') {
    crumbs = [{ label: 'Dashboard' }];
  } else {
    crumbs = [
      { label: 'Dashboard', to: '/admin/dashboard' },
      {
        label: CRUMB_MAP[section] || section,
        to: detailOffice ? `/admin/${section}` : undefined,
      },
    ];
    if (detailOffice) crumbs.push({ label: detailOffice.name });
  }

  async function runSearch(e) {
    e?.preventDefault();
    if (!searchQ.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const data = await api(`/admin/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchResults(data.results);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className={`admin-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <AdminSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="admin-main">
        <AdminHeader
          breadcrumb={crumbs}
          searchValue={searchQ}
          onSearchChange={setSearchQ}
          onSearch={runSearch}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <div className="admin-content">
          <OfflineBanner online={online} onRetry={() => refresh().catch((e) => setError(e.message))} />
          <LoadError
            message={error}
            onRetry={() => {
              setError('');
              refresh().catch((e) => setError(e.message));
            }}
          />
          <SearchResults results={searchResults} onNavigate={() => setSearchResults(null)} />
          {booting ? <CardSkeleton /> : <Outlet />}
        </div>
        <AdminFooter />
      </div>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminDataProvider>
      <AdminShellInner />
    </AdminDataProvider>
  );
}
