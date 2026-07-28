import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Tooltip from '../../components/ui/Tooltip';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminStatic } from '../../lib/adminData';
import { useConfirm } from '../../lib/confirm';
import { ICON_META, iconMeta } from '../../lib/uxLabels';

const ICON_OPTIONS = Object.entries(ICON_META).filter(([k]) => k !== 'cup');

export default function MenuPage() {
  const { menu, setMenu, refresh, notify } = useAdminStatic();
  const { confirm } = useConfirm();
  const [iconDraft, setIconDraft] = useState('tea');
  const [dragId, setDragId] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = iconMeta(iconDraft);

  async function createMenu(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setBusy(true);
    try {
      await api('/admin/menu-items', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          icon: fd.get('icon') || 'other',
          sortOrder: Number(fd.get('sortOrder') || menu.length + 1),
        },
      });
      e.target.reset();
      setIconDraft('tea');
      await refresh();
      notify.success('Ürün eklendi');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setIcon(item, icon) {
    try {
      await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body: { icon } });
      await refresh();
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function softDelete(item) {
    const ok = await confirm({
      title: 'Ürünü sil',
      message: `“${item.name}” pasifleştirilecek (soft delete). Geri alınabilir.`,
      confirmLabel: 'Sil',
    });
    if (!ok) return;
    try {
      await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body: { active: false } });
      await refresh();
      notify.success(`${item.name} silindi`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function restore(item) {
    try {
      await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body: { active: true } });
      await refresh();
      notify.success(`${item.name} geri alındı`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function onDrop(targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = menu.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setDragId(null);
    try {
      const data = await api('/admin/menu-items/reorder', {
        method: 'PUT',
        body: { orderedIds: ids },
      });
      setMenu(data.items);
      notify.success('Sıra güncellendi');
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <div className="admin-page-body">
      <PageHeader title="Menü" description="Ürün kartları, simgeler ve sıra yönetimi" />

      <form className="stack-form card-form menu-create-form" onSubmit={createMenu}>
        <h3 className="form-title">Yeni ürün</h3>
        <label>
          Ürün adı
          <input name="name" required placeholder="Örn. Çay" />
        </label>
        <label>
          <span className="label-with-tip">
            Ürün Simgesi
            <Tooltip label="Ofis ekranında ürün kartında gösterilir. Sipariş mantığını değiştirmez.">
              <span className="tip-dot" tabIndex={0} aria-label="Bilgi">
                ?
              </span>
            </Tooltip>
          </span>
          <select name="icon" value={iconDraft} onChange={(e) => setIconDraft(e.target.value)}>
            {ICON_OPTIONS.map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.emoji} {meta.label}
              </option>
            ))}
          </select>
        </label>
        <div className="icon-preview product-preview">
          <div className="product-thumb" aria-hidden>
            <span>{preview.emoji}</span>
          </div>
          <div>
            <strong>Önizleme</strong>
            <p className="muted">
              {preview.emoji} {preview.label}
            </p>
          </div>
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          Ürün ekle
        </Button>
      </form>

      {!menu.length ? (
        <EmptyState icon="☕" title="Menü boş" description="İlk içecek ürününü ekleyin." />
      ) : (
        <div className="menu-card-grid">
          {menu.map((item) => {
            const meta = iconMeta(item.icon);
            return (
              <article
                key={item.id}
                className={`menu-product-card pro ${item.active ? '' : 'is-passive'}`}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(item.id)}
              >
                <div className="product-thumb lg" aria-hidden>
                  {meta.emoji}
                </div>
                <div className="menu-product-body">
                  <div className="menu-product-top">
                    <div>
                      <strong>{item.name}</strong>
                      <p className="muted">Sıra #{item.sortOrder}</p>
                    </div>
                    <Badge tone={item.active ? 'success' : 'danger'}>
                      {item.active ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                  <Badge tone="secondary">{meta.label}</Badge>
                  <label className="compact-select">
                    <span className="sr-only">Ürün Simgesi</span>
                    <select value={item.icon} onChange={(e) => setIcon(item, e.target.value)}>
                      {ICON_OPTIONS.map(([value, m]) => (
                        <option key={value} value={value}>
                          {m.emoji} {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="row-actions wrap">
                    {item.active ? (
                      <Button variant="danger-ghost" onClick={() => softDelete(item)}>
                        Sil
                      </Button>
                    ) : (
                      <Button variant="success-ghost" onClick={() => restore(item)}>
                        Geri al
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
