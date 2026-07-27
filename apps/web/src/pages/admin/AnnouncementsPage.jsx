import { useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';
import { useConfirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';

const SEV_LABEL = {
  info: 'Bilgi',
  warning: 'Uyarı',
  critical: 'Kritik',
};

export default function AnnouncementsPage() {
  const { announcements, users, refresh, notify } = useAdminData();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [activeDraft, setActiveDraft] = useState(true);

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of users || []) m.set(u.id, u.name);
    return m;
  }, [users]);

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
          active: activeDraft,
          startsAt,
          endsAt,
        },
      });
      e.target.reset();
      setActiveDraft(true);
      await refresh();
      notify.success(activeDraft ? 'Duyuru yayınlandı' : 'Duyuru taslak olarak kaydedildi');
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
      <PageHeader
        title="Duyurular"
        description="Ofis ve mutfak ekranlarında belirgin duyuru bandı olarak yayınlanır"
      />

      <form className="stack-form card-form announce-create-form" onSubmit={createAnnouncement}>
        <div className="announce-form-head">
          <span className="announce-form-ico" aria-hidden>
            📢
          </span>
          <div>
            <h3 className="form-title">Yeni duyuru</h3>
            <p className="muted tiny">Kullanıcılar bunu “Duyuru” etiketiyle ayrı bir bantta görür.</p>
          </div>
        </div>
        <label>
          Başlık
          <input name="title" required placeholder="Örn. Bugün sipariş kapanışı" />
        </label>
        <label>
          Mesaj
          <textarea
            name="body"
            rows={3}
            required
            placeholder="Örn. Bugün sipariş kapanışı 15:30'dur"
          />
        </label>
        <label>
          Önem seviyesi
          <select name="severity" defaultValue="info">
            <option value="info">Bilgi</option>
            <option value="warning">Uyarı</option>
            <option value="critical">Kritik</option>
          </select>
        </label>
        <label className="check remember-row announce-active-row">
          <input
            type="checkbox"
            checked={activeDraft}
            onChange={(e) => setActiveDraft(e.target.checked)}
          />
          <span>Hemen aktif yayınla</span>
        </label>
        <div className="form-grid-2">
          <label>
            Başlangıç (opsiyonel)
            <input name="startsAt" type="datetime-local" />
          </label>
          <label>
            Bitiş (opsiyonel)
            <input name="endsAt" type="datetime-local" />
          </label>
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          {activeDraft ? 'Duyuruyu yayınla' : 'Taslak kaydet'}
        </Button>
      </form>

      {!announcements.length ? (
        <EmptyState icon="📢" title="Duyuru yok" description="Henüz yayınlanmış duyuru bulunmuyor." />
      ) : (
        <ul className="admin-list announce-admin-list">
          {announcements.map((a) => (
            <li key={a.id} className="announce-admin-item">
              <div className="announce-admin-main">
                <div className="announce-admin-top">
                  <span className="announce-admin-ico" aria-hidden>
                    📢
                  </span>
                  <Badge
                    tone={
                      a.severity === 'critical'
                        ? 'danger'
                        : a.severity === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {SEV_LABEL[a.severity] || a.severity}
                  </Badge>
                  <Badge tone={a.active ? 'success' : 'secondary'}>
                    {a.active ? 'Aktif' : 'Pasif'}
                  </Badge>
                </div>
                <strong className="announce-admin-title">{a.title}</strong>
                <p className="announce-admin-body muted">{a.body}</p>
                <div className="announce-admin-meta muted tiny">
                  <span>Yayın: {formatDateTime(a.startsAt || a.createdAt)}</span>
                  <span>·</span>
                  <span>Oluşturan: {userMap.get(a.createdBy) || 'Yönetici'}</span>
                </div>
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
