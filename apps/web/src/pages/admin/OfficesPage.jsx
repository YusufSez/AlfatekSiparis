import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import ActionMenu from '../../components/ui/ActionMenu';
import OfficeDetailModal from '../../components/admin/OfficeDetailModal';
import Modal from '../../components/Modal';
import { EmptyState } from '../../components/LoadStates';
import { Badge } from '../../components/Badge';
import { api } from '../../lib/api';
import { useAdminStatic, useAdminLive } from '../../lib/adminData';
import { useConfirm } from '../../lib/confirm';
import { formatDateTime } from '../../lib/format';

export default function OfficesPage() {
  const [params, setParams] = useSearchParams();
  const { refresh, notify } = useAdminStatic();
  const { officeStats } = useAdminLive();
  const { confirm } = useConfirm();
  const [detailId, setDetailId] = useState(params.get('detail'));
  const [editOffice, setEditOffice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = params.get('detail');
    setDetailId(id);
  }, [params]);

  const detailOffice = officeStats.find((s) => s.office.id === detailId)?.office || null;

  function openDetail(id) {
    setDetailId(id);
    setParams(id ? { detail: id } : {});
  }

  async function createOffice(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setBusy(true);
    try {
      await api('/admin/offices', {
        method: 'POST',
        body: { name: fd.get('name'), color: fd.get('color') || '#1B6B4A' },
      });
      e.target.reset();
      await refresh();
      notify.success('Ofis eklendi');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editOffice) return;
    const fd = new FormData(e.target);
    setBusy(true);
    try {
      await api(`/admin/offices/${editOffice.id}`, {
        method: 'PATCH',
        body: { name: fd.get('name'), color: fd.get('color') },
      });
      setEditOffice(null);
      await refresh();
      notify.success('Ofis güncellendi');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteOffice(o) {
    const ok = await confirm({
      title: 'Ofisi sil',
      message: `“${o.name}” ofisi silinsin mi? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/admin/offices/${o.id}`, { method: 'DELETE' });
      if (detailId === o.id) openDetail(null);
      await refresh();
      notify.success('Ofis silindi');
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <div className="admin-page-body">
      <PageHeader title="Ofisler" description="Ofis kartları ve kullanıcı yönetimi" />

      <form className="inline-form card-form" onSubmit={createOffice}>
        <input name="name" placeholder="Ofis adı" required />
        <input name="color" type="color" defaultValue="#1B6B4A" title="Ofis rengi" />
        <Button type="submit" variant="primary" loading={busy}>
          Ofis ekle
        </Button>
      </form>

      {!officeStats.length ? (
        <EmptyState
          icon="🏢"
          title="Henüz ofis yok"
          description="Teknik veya Operasyon ofisini ekleyerek başlayın."
        />
      ) : (
        <div className="office-card-grid">
          {officeStats.map(({ office: o, members, onlineCount, activeOrder, lastOrderAt }) => (
            <article key={o.id} className="office-card">
              <div className="office-card-top">
                <span className="dot lg" style={{ background: o.color }} />
                <div>
                  <h3>{o.name}</h3>
                  <p className="muted">
                    {members.length} kullanıcı · {onlineCount} online
                  </p>
                </div>
                <Badge tone={activeOrder ? 'warning' : 'secondary'}>
                  {activeOrder ? 'Aktif sipariş' : 'Boş'}
                </Badge>
              </div>
              <dl className="stat-mini">
                <div>
                  <dt>Online</dt>
                  <dd>{onlineCount}</dd>
                </div>
                <div>
                  <dt>Aktif sipariş</dt>
                  <dd>{activeOrder ? 1 : 0}</dd>
                </div>
                <div>
                  <dt>Son sipariş</dt>
                  <dd className="tiny-dd">{formatDateTime(lastOrderAt)}</dd>
                </div>
              </dl>
              <div className="row-actions wrap office-card-actions">
                <Button variant="primary" onClick={() => openDetail(o.id)}>
                  Detay
                </Button>
                <ActionMenu
                  label={`${o.name} işlemleri`}
                  items={[
                    {
                      id: 'edit',
                      label: 'Düzenle',
                      onSelect: () => setEditOffice(o),
                    },
                    {
                      id: 'delete',
                      label: 'Sil',
                      tone: 'danger',
                      onSelect: () => deleteOffice(o),
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      <OfficeDetailModal
        office={detailOffice}
        onClose={() => openDetail(null)}
        onEdit={(o) => {
          setEditOffice(o);
        }}
      />

      <Modal
        open={!!editOffice}
        title="Ofisi düzenle"
        onClose={() => setEditOffice(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOffice(null)}>
              Vazgeç
            </Button>
            <Button type="submit" form="edit-office-form" variant="primary" loading={busy}>
              Kaydet
            </Button>
          </>
        }
      >
        {editOffice && (
          <form id="edit-office-form" className="stack-form" onSubmit={saveEdit}>
            <label>
              Ofis adı
              <input name="name" defaultValue={editOffice.name} required />
            </label>
            <label>
              Renk
              <input name="color" type="color" defaultValue={editOffice.color || '#1B6B4A'} />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
