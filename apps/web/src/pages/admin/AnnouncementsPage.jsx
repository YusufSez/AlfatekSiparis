import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';
import { useConfirm } from '../../lib/confirm';

export default function AnnouncementsPage() {
  const { announcements, refresh, notify } = useAdminData();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);

  async function createAnnouncement(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setBusy(true);
    try {
      const startsAt = fd.get('startsAt')
        ? new Date(String(fd.get('startsAt'))).toISOString()
        : undefined;
      const endsAtRaw = fd.get('endsAt');
      const endsAt = endsAtRaw ? new Date(String(endsAtRaw)).toISOString() : null;
      await api('/announcements', {
        method: 'POST',
        body: {
          title: fd.get('title'),
          body: fd.get('body'),
          severity: fd.get('severity'),
          active: true,
          startsAt,
          endsAt,
        },
      });
      e.target.reset();
      await refresh();
      notify.success('Duyuru yayınlandı');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a) {
    try {
      await api(`/announcements/${a.id}`, { method: 'PATCH', body: { active: !a.active } });
      await refresh();
      notify.info(a.active ? 'Duyuru pasifleştirildi' : 'Duyuru aktifleştirildi');
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function remove(id) {
    const ok = await confirm({
      title: 'Duyuruyu sil',
      message: 'Bu duyuru silinsin mi?',
      confirmLabel: 'Sil',
    });
    if (!ok) return;
    try {
      await api(`/announcements/${id}`, { method: 'DELETE' });
      await refresh();
      notify.success('Duyuru silindi');
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <div className="admin-page-body">
      <PageHeader title="Duyurular" description="Ofis ve mutfağa duyuru yayınlayın" />

      <form className="stack-form card-form" onSubmit={createAnnouncement}>
        <h3 className="form-title">Yeni duyuru</h3>
        <label>
          Başlık
          <input name="title" required />
        </label>
        <label>
          Mesaj
          <textarea name="body" rows={3} required />
        </label>
        <label>
          Önem
          <select name="severity" defaultValue="info">
            <option value="info">Bilgi</option>
            <option value="warning">Uyarı</option>
            <option value="critical">Kritik</option>
          </select>
        </label>
        <div className="form-grid-2">
          <label>
            Başlangıç
            <input name="startsAt" type="datetime-local" />
          </label>
          <label>
            Bitiş
            <input name="endsAt" type="datetime-local" />
          </label>
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          Yayınla
        </Button>
      </form>

      {!announcements.length ? (
        <EmptyState icon="📢" title="Duyuru yok" description="Henüz yayınlanmış duyuru bulunmuyor." />
      ) : (
        <ul className="admin-list">
          {announcements.map((a) => (
            <li key={a.id}>
              <div>
                <div className="row-actions wrap" style={{ marginBottom: '0.35rem' }}>
                  <Badge
                    tone={
                      a.severity === 'critical'
                        ? 'danger'
                        : a.severity === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {a.severity}
                  </Badge>
                  <Badge tone={a.active ? 'success' : 'secondary'}>
                    {a.active ? 'Aktif' : 'Pasif'}
                  </Badge>
                </div>
                <strong>{a.title}</strong>
                <div className="muted">{a.body}</div>
              </div>
              <span className="row-actions wrap">
                <Button variant="ghost" onClick={() => toggle(a)}>
                  {a.active ? 'Pasifleştir' : 'Aktifleştir'}
                </Button>
                <Button variant="danger-ghost" onClick={() => remove(a.id)}>
                  Sil
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
