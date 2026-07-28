import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import ActionMenu from '../../components/ui/ActionMenu';
import Modal from '../../components/Modal';
import { Badge } from '../../components/Badge';
import { EmptyState, TableSkeleton } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';
import { useAuth } from '../../lib/auth';
import { useConfirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { ROLE_META, roleHint, roleLabel } from '../../lib/uxLabels';

export default function UsersPage() {
  const [params] = useSearchParams();
  const { user: me } = useAuth();
  const { confirm } = useConfirm();
  const { users, offices, onlineMap, lastLoginMap, refresh, notify, booting } = useAdminData();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState(params.get('online') === '1' ? 'all' : 'all');
  const [onlineOnly, setOnlineOnly] = useState(params.get('online') === '1');
  const [userRole, setUserRole] = useState('office_user');
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (officeFilter !== 'all' && (u.officeId || '') !== officeFilter) return false;
      if (activeFilter === 'active' && !u.active) return false;
      if (activeFilter === 'passive' && u.active) return false;
      if (onlineOnly && !onlineMap.get(u.id)) return false;
      if (!query) return true;
      return (
        u.name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        (u.office?.name || '').toLowerCase().includes(query)
      );
    });
  }, [users, q, roleFilter, officeFilter, activeFilter, onlineOnly, onlineMap]);

  async function createUser(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const role = fd.get('role');
    setBusy(true);
    try {
      await api('/admin/users', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          username: fd.get('username'),
          password: fd.get('password'),
          role,
          officeId: role === 'office_user' ? fd.get('officeId') || null : null,
        },
      });
      e.target.reset();
      setUserRole('office_user');
      await refresh();
      notify.success('Kullanıcı eklendi');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      await refresh();
      notify.success(u.active ? `${u.name} pasifleştirildi` : `${u.name} aktifleştirildi`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function deleteUser(u) {
    if (me?.id && u.id === me.id) {
      notify.error('Kendi hesabınızı silemezsiniz');
      return;
    }
    const ok = await confirm({
      title: 'Kullanıcıyı sil',
      message: `“${u.name}” (@${u.username}) kalıcı olarak silinsin mi? Bu işlem geri alınamaz. Sipariş ve log geçmişi korunur; hesap anonimleştirilir.`,
      confirmLabel: 'Kalıcı sil',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      await refresh();
      notify.success('Kullanıcı silindi');
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!resetUser || resetPassword.length < 8) {
      notify.error('Şifre en az 8 karakter olmalı');
      return;
    }
    try {
      await api(`/admin/users/${resetUser.id}`, {
        method: 'PATCH',
        body: { password: resetPassword },
      });
      notify.success('Şifre güncellendi');
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      notify.error(err.message);
    }
  }

  const columns = [
    {
      key: 'avatar',
      header: 'Avatar',
      render: (u) => <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />,
    },
    {
      key: 'name',
      header: 'Ad Soyad',
      render: (u) => <strong>{u.name}</strong>,
    },
    {
      key: 'username',
      header: 'Kullanıcı adı',
      render: (u) => <span className="muted">@{u.username}</span>,
    },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => <Badge tone="info">{roleLabel(u.role)}</Badge>,
    },
    {
      key: 'office',
      header: 'Ofis',
      render: (u) => u.office?.name || '—',
    },
    {
      key: 'lastLogin',
      header: 'Son giriş',
      render: (u) => formatDateTime(lastLoginMap.get(u.id)),
    },
    {
      key: 'status',
      header: 'Durum',
      render: (u) => (
        <div className="row-actions wrap">
          <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Aktif' : 'Pasif'}</Badge>
          {onlineMap.get(u.id) && <Badge tone="success">Online</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'İşlemler',
      render: (u) => (
        <ActionMenu
          label={`${u.name} işlemleri`}
          items={[
            {
              id: 'toggle',
              label: u.active ? 'Pasifleştir' : 'Aktifleştir',
              onSelect: () => toggleUser(u),
            },
            {
              id: 'reset',
              label: 'Şifre sıfırla',
              onSelect: () => {
                setResetUser(u);
                setResetPassword('');
              },
            },
            ...(me?.id === u.id
              ? []
              : [
                  {
                    id: 'delete',
                    label: 'Sil',
                    tone: 'danger',
                    onSelect: () => deleteUser(u),
                  },
                ]),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="admin-page-body">
      <PageHeader title="Kullanıcılar" description="Hesap yönetimi ve filtreler" />

      <form className="stack-form card-form" onSubmit={createUser}>
        <h3 className="form-title">Kullanıcı ekle</h3>
        <label>
          Ad soyad
          <input name="name" required />
        </label>
        <label>
          Kullanıcı adı
          <input name="username" required autoComplete="off" />
        </label>
        <label>
          Şifre
          <input name="password" type="password" minLength={8} required autoComplete="new-password" />
        </label>
        <label>
          Rol
          <select name="role" value={userRole} onChange={(e) => setUserRole(e.target.value)}>
            {Object.entries(ROLE_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label} — {meta.hint}
              </option>
            ))}
          </select>
          <small className="field-hint">{roleHint(userRole)}</small>
        </label>
        {userRole === 'office_user' && (
          <label>
            Ofis
            <select name="officeId" defaultValue={offices[0]?.id || ''} required>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          Kullanıcı ekle
        </Button>
      </form>

      <div className="toolbar-row filters-bar">
        <input
          className="filter-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara…"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Tüm roller</option>
          {Object.entries(ROLE_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
          <option value="all">Tüm ofisler</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
          <option value="all">Aktif / Pasif</option>
          <option value="active">Aktif</option>
          <option value="passive">Pasif</option>
        </select>
        <label className="check remember-row">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
          />
          <span>Sadece online</span>
        </label>
        <span className="muted">{filtered.length} kayıt</span>
      </div>

      {booting ? (
        <TableSkeleton cols={8} />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered.map((u) => ({ ...u, _muted: !u.active }))}
          empty={
            <EmptyState
              icon="👤"
              title="Kullanıcı bulunamadı"
              description="Filtreleri değiştirin veya yeni kullanıcı ekleyin."
            />
          }
        />
      )}

      <Modal
        open={!!resetUser}
        title="Şifre sıfırla"
        onClose={() => setResetUser(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetUser(null)}>
              Vazgeç
            </Button>
            <Button type="submit" form="users-reset-pwd" variant="primary">
              Kaydet
            </Button>
          </>
        }
      >
        {resetUser && (
          <form id="users-reset-pwd" className="stack-form" onSubmit={submitReset}>
            <p>
              <strong>{resetUser.name}</strong> (@{resetUser.username})
            </p>
            <label>
              Yeni şifre
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
