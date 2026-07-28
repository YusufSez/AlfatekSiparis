import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { Badge, StatusDot } from '../Badge';
import Button from '../ui/Button';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';
import { useConfirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';
import { Avatar } from '../Avatar';
import { ROLE_META } from '../../lib/uxLabels';

export default function OfficeDetailModal({ office, onClose, onEdit }) {
  const {
    users,
    offices,
    onlineMap,
    logs,
    refresh,
    notify,
    setError,
  } = useAdminData();
  const { confirm } = useConfirm();
  const [addUserId, setAddUserId] = useState('');
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const members = useMemo(
    () => (office ? users.filter((u) => u.officeId === office.id) : []),
    [users, office]
  );
  const onlineCount = members.filter((u) => onlineMap.get(u.id)).length;
  const candidates = users.filter((u) => u.role === 'office_user' && u.officeId !== office?.id);

  const officeOrderLogs = useMemo(() => {
    if (!office) return [];
    return logs.filter((l) => {
      const actor = users.find((u) => u.id === l.actor?.id);
      return actor?.officeId === office.id && /session\.|ticket\.|kitchen\./.test(l.action || '');
    });
  }, [logs, users, office]);

  const todayOrders = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return officeOrderLogs.filter((l) => new Date(l.createdAt) >= start && l.action === 'session.opened')
      .length;
  }, [officeOrderLogs]);

  const topOrderer = useMemo(() => {
    const counts = new Map();
    for (const l of officeOrderLogs) {
      if (l.action !== 'session.opened' || !l.actor?.id) continue;
      counts.set(l.actor.id, (counts.get(l.actor.id) || 0) + 1);
    }
    let best = null;
    let max = 0;
    for (const [id, n] of counts) {
      if (n > max) {
        max = n;
        best = users.find((u) => u.id === id);
      }
    }
    return best ? { user: best, count: max } : null;
  }, [officeOrderLogs, users]);

  const lastOrder = officeOrderLogs[0] || null;

  async function patchUser(u, body, okMsg) {
    setBusy(true);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body });
      await refresh();
      if (okMsg) notify.success(okMsg);
    } catch (err) {
      notify.error(err.message);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addUser() {
    if (!addUserId) return;
    const u = users.find((x) => x.id === addUserId);
    if (!u) return;
    await patchUser(u, { role: 'office_user', officeId: office.id }, `${u.name} ofise eklendi`);
    setAddUserId('');
  }

  async function removeFromOffice(u) {
    const other = offices.find((o) => o.id !== office.id);
    if (!other) {
      notify.warning('Taşımak için başka bir ofis gerekli veya rolünü değiştirin.');
      return;
    }
    const ok = await confirm({
      title: 'Ofisten çıkar',
      message: `${u.name} ${other.name} ofisine taşınacak. Onaylıyor musunuz?`,
      confirmLabel: 'Taşı',
    });
    if (!ok) return;
    await patchUser(u, { officeId: other.id }, `${u.name} taşındı`);
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!resetUser || resetPassword.length < 8) {
      notify.error('Şifre en az 8 karakter olmalı');
      return;
    }
    await patchUser(resetUser, { password: resetPassword }, 'Şifre güncellendi');
    setResetUser(null);
    setResetPassword('');
  }

  if (!office) return null;

  return (
    <>
      <Modal
        open
        title={`${office.name} — detay`}
        onClose={onClose}
        footer={
          <div className="row-actions wrap">
            {onEdit && (
              <Button variant="ghost" onClick={() => onEdit(office)}>
                Düzenle
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Kapat
            </Button>
          </div>
        }
      >
        <div className="office-detail">
          <div className="office-detail-stats">
            <div>
              <span className="muted">Toplam kullanıcı</span>
              <strong>{members.length}</strong>
            </div>
            <div>
              <span className="muted">Online</span>
              <strong>{onlineCount}</strong>
            </div>
            <div>
              <span className="muted">Bugünkü sipariş</span>
              <strong>{todayOrders}</strong>
            </div>
            <div>
              <span className="muted">Aktif oturum</span>
              <strong>{office.activeCollectingSessionId ? 'Var' : 'Yok'}</strong>
            </div>
            <div>
              <span className="muted">Son sipariş</span>
              <strong>{formatDateTime(lastOrder?.createdAt)}</strong>
            </div>
            <div>
              <span className="muted">En çok sipariş veren</span>
              <strong>
                {topOrderer ? `${topOrderer.user.name} (${topOrderer.count})` : '—'}
              </strong>
            </div>
          </div>

          <div className="add-to-office">
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">Kullanıcı ekle…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={!addUserId || busy} loading={busy} onClick={addUser}>
              Ekle
            </Button>
          </div>

          {members.length === 0 ? (
            <p className="muted">Bu ofiste kullanıcı yok.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kullanıcı</th>
                    <th>Rol</th>
                    <th>Durum</th>
                    <th>Online</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((u) => (
                    <tr key={u.id} className={!u.active ? 'row-muted' : ''}>
                      <td>
                        <div className="user-cell">
                          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                          <div>
                            <strong>{u.name}</strong>
                            <div className="muted">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="table-select"
                          value={u.role}
                          onChange={(e) =>
                            patchUser(u, { role: e.target.value }, 'Rol güncellendi')
                          }
                        >
                          {Object.entries(ROLE_META).map(([value, meta]) => (
                            <option key={value} value={value}>
                              {meta.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Badge tone={u.active ? 'success' : 'danger'}>
                          {u.active ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </td>
                      <td>
                        <span className="inline-status">
                          <StatusDot online={onlineMap.get(u.id)} />
                          {onlineMap.get(u.id) ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions wrap">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              patchUser(
                                u,
                                { active: !u.active },
                                u.active ? 'Pasifleştirildi' : 'Aktifleştirildi'
                              )
                            }
                          >
                            {u.active ? 'Pasifleştir' : 'Aktifleştir'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setResetUser(u);
                              setResetPassword('');
                            }}
                          >
                            Şifre
                          </button>
                          <button
                            type="button"
                            className="btn danger-ghost"
                            onClick={() => removeFromOffice(u)}
                          >
                            Çıkar
                          </button>
                          <select
                            className="table-select"
                            value={u.officeId || ''}
                            onChange={(e) =>
                              patchUser(u, { officeId: e.target.value }, 'Ofis güncellendi')
                            }
                          >
                            {offices.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!resetUser}
        title="Şifre sıfırla"
        onClose={() => setResetUser(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetUser(null)}>
              Vazgeç
            </Button>
            <Button type="submit" form="office-reset-pwd" variant="primary">
              Kaydet
            </Button>
          </>
        }
      >
        {resetUser && (
          <form id="office-reset-pwd" className="stack-form" onSubmit={submitReset}>
            <p>
              <strong>{resetUser.name}</strong> için yeni şifre
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
    </>
  );
}
