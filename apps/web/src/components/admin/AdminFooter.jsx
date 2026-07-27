import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../lib/format';
import { useAdminData } from '../../lib/adminData';

export default function AdminFooter() {
  const { apiMeta } = useAdminData();
  const [build, setBuild] = useState('');

  useEffect(() => {
    setBuild(import.meta.env.VITE_BUILD_ID || new Date().toISOString().slice(0, 10));
  }, []);

  return (
    <footer className="admin-footer">
      <span>Alfatek Ofis Sipariş Sistemi</span>
      <span className="footer-sep">·</span>
      <span>v{APP_VERSION}</span>
      <span className="footer-sep">·</span>
      <span>Build {build}</span>
      <span className="footer-sep">·</span>
      <span>API {apiMeta?.version || apiMeta?.name || '—'}</span>
    </footer>
  );
}
