import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { EmptyState } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';

export default function SettingsPage() {
  const { settings, setSettings, notify, presence } = useAdminData();
  const [busy, setBusy] = useState(false);

  async function saveSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setBusy(true);
    try {
      let config = {};
      try {
        config = JSON.parse(String(fd.get('config') || '{}'));
      } catch {
        throw new Error('config geçerli JSON olmalı');
      }
      const data = await api('/admin/settings', {
        method: 'PATCH',
        body: {
          sessionDurationSec: Number(fd.get('sessionDurationSec')),
          companyName: fd.get('companyName'),
          notificationSound: fd.get('notificationSound') === 'on',
          autoClose: fd.get('autoClose') === 'on',
          workingHoursStart: fd.get('workingHoursStart'),
          workingHoursEnd: fd.get('workingHoursEnd'),
          config,
        },
      });
      setSettings(data.settings);
      notify.success('Ayarlar kaydedildi');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <EmptyState icon="⚙" title="Ayarlar yüklenemedi" description="Yenileyip tekrar deneyin." />
    );
  }

  return (
    <div className="admin-page-body">
      <PageHeader title="Ayarlar" description="Sistem tercihleri" />

      <form className="stack-form card-form" onSubmit={saveSettings}>
        <label>
          Şirket adı
          <input name="companyName" defaultValue={settings.companyName} required />
        </label>
        <label>
          Sipariş süresi (saniye)
          <input
            name="sessionDurationSec"
            type="number"
            min={30}
            max={3600}
            defaultValue={settings.sessionDurationSec}
            required
          />
        </label>
        <label className="check switch-row">
          <input name="notificationSound" type="checkbox" defaultChecked={settings.notificationSound} />
          <span>Bildirim sesi açık</span>
        </label>
        <label className="check switch-row">
          <input name="autoClose" type="checkbox" defaultChecked={settings.autoClose} />
          <span>Süre bitince mutfağa gönder</span>
        </label>
        <div className="form-grid-2">
          <label>
            Mesai başlangıç
            <input name="workingHoursStart" defaultValue={settings.workingHoursStart} />
          </label>
          <label>
            Mesai bitiş
            <input name="workingHoursEnd" defaultValue={settings.workingHoursEnd} />
          </label>
        </div>
        <label>
          Gelişmiş config (JSON)
          <textarea name="config" rows={4} defaultValue={JSON.stringify(settings.config || {}, null, 2)} />
        </label>
        <Button type="submit" variant="primary" loading={busy}>
          Kaydet
        </Button>
      </form>

      <section className="card-surface" style={{ marginTop: '1rem' }}>
        <h3 className="form-title">Online özet</h3>
        {presence.map((block) => (
          <div key={block.office.id} className="presence-block">
            <h4>{block.office.name}</h4>
            <div className="presence-bar">
              {(block.users || []).map((u) => (
                <span key={u.id} className={`presence-chip ${u.online ? 'on' : 'off'}`}>
                  {u.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
