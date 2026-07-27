import { useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { EmptyState } from '../../components/LoadStates';
import { api } from '../../lib/api';
import { useAdminData } from '../../lib/adminData';

export default function SettingsPage() {
  const { settings, setSettings, notify, presence, users, onlineMap, officeStats } = useAdminData();
  const [busy, setBusy] = useState(false);

  const live = useMemo(() => {
    const total = users.filter((u) => u.active).length;
    const online = users.filter((u) => u.active && onlineMap.get(u.id)).length;
    return {
      total,
      online,
      offline: Math.max(0, total - online),
      ordering: officeStats.filter((s) => s.activeOrder).length,
    };
  }, [users, onlineMap, officeStats]);

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
      <PageHeader title="Ayarlar" description="Sistem tercihleri ve canlı durum" />

      <form className="settings-form card-form" onSubmit={saveSettings}>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Şirket adı</span>
            <input name="companyName" defaultValue={settings.companyName} required />
          </label>
          <label className="settings-field">
            <span>Sipariş süresi (saniye)</span>
            <input
              name="sessionDurationSec"
              type="number"
              min={30}
              max={3600}
              defaultValue={settings.sessionDurationSec}
              required
            />
          </label>
          <label className="settings-field settings-check">
            <input
              name="notificationSound"
              type="checkbox"
              defaultChecked={settings.notificationSound}
            />
            <span>Bildirim sesi açık</span>
          </label>
          <label className="settings-field settings-check">
            <input name="autoClose" type="checkbox" defaultChecked={settings.autoClose} />
            <span>Süre bitince mutfağa gönder</span>
          </label>
          <label className="settings-field">
            <span>Mesai başlangıç</span>
            <input name="workingHoursStart" defaultValue={settings.workingHoursStart} />
          </label>
          <label className="settings-field">
            <span>Mesai bitiş</span>
            <input name="workingHoursEnd" defaultValue={settings.workingHoursEnd} />
          </label>
          <label className="settings-field settings-span-2">
            <span>Gelişmiş config (JSON)</span>
            <textarea
              name="config"
              rows={4}
              defaultValue={JSON.stringify(settings.config || {}, null, 2)}
            />
          </label>
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          Kaydet
        </Button>
      </form>

      <section className="card-surface live-status-panel">
        <h3 className="form-title">Aktif Kullanıcılar</h3>
        <p className="muted tiny">Canlı durum — ofis ve mutfak bağlantıları</p>
        <dl className="live-stat-list horizontal">
          <div>
            <dt>Toplam</dt>
            <dd>{live.total}</dd>
          </div>
          <div>
            <dt>Online</dt>
            <dd className="tone-ok">{live.online}</dd>
          </div>
          <div>
            <dt>Offline</dt>
            <dd>{live.offline}</dd>
          </div>
          <div>
            <dt>Aktif sipariş açan</dt>
            <dd className="tone-warn">{live.ordering}</dd>
          </div>
        </dl>
        <div className="live-presence-blocks">
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
        </div>
      </section>
    </div>
  );
}
