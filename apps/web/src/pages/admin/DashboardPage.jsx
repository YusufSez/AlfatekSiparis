import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StatsCard from '../../components/ui/StatsCard';
import PageHeader from '../../components/ui/PageHeader';
import { useAdminStatic, useAdminLive } from '../../lib/adminData';
import { logSentence } from '../../lib/uxLabels';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/LoadStates';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { offices, enrichLogs, logs, announcements, users } = useAdminStatic();
  const { dashboard, kitchenStats, officeStats, onlineMap } = useAdminLive();
  const cards = dashboard?.cards;
  const charts = dashboard?.charts;
  const recent = enrichLogs(logs).slice(0, 14);
  const activeOffices = officeStats.filter((s) => s.activeOrder).length;

  const livePresence = useMemo(() => {
    const total = users.filter((u) => u.active).length;
    const online = users.filter((u) => u.active && onlineMap.get(u.id)).length;
    const ordering = officeStats.filter((s) => s.activeOrder).length;
    return { total, online, offline: Math.max(0, total - online), ordering };
  }, [users, onlineMap, officeStats]);

  if (!cards) {
    return (
      <EmptyState
        icon="📊"
        title="Dashboard yüklenemedi"
        description="Veriler alınamadı. Yenilemeyi deneyin."
        ctaLabel="Yenile"
        onCta={() => window.location.reload()}
      />
    );
  }

  const topProducts = charts?.productDistribution || [];
  const activeAnnouncements = (announcements || []).filter((a) => a.active).slice(0, 4);

  return (
    <div className="admin-page-body dash-pro">
      <PageHeader
        title="Kontrol Merkezi"
        description="Canlı operasyon özeti · Alfatek Ofis Sipariş"
      />

      <div className="dash-grid dash-grid-hero dash-grid-6">
        <StatsCard
          label="Aktif Ofis"
          value={activeOffices}
          tone="info"
          hint="Sipariş toplayan"
          onClick={() => navigate('/admin/offices')}
        />
        <StatsCard
          label="Online Kullanıcı"
          value={cards.onlineUsers}
          tone="success"
          hint="Kullanıcılar"
          onClick={() => navigate('/admin/users?online=1')}
        />
        <StatsCard
          label="Bekleyen Sipariş"
          value={kitchenStats.waiting}
          tone="warning"
          hint="Mutfak kuyruğu"
          onClick={() => navigate('/kitchen')}
        />
        <StatsCard
          label="Hazırlanan"
          value={kitchenStats.preparing}
          tone="warning"
          hint="Mutfakta"
          onClick={() => navigate('/kitchen')}
        />
        <StatsCard
          label="Teslim Edilen"
          value={cards.deliveredToday}
          tone="success"
          hint="Bugün"
          onClick={() => navigate('/admin/logs?range=today&category=kitchen')}
        />
        <StatsCard
          label="Bugünkü Sipariş"
          value={cards.todayOrders}
          onClick={() => navigate('/admin/logs?range=today&category=order')}
        />
      </div>

      <div className="dash-board-grid">
        <section className="admin-col span-2">
          <div className="panel-head">
            <h3>Ofis Durumu</h3>
            <button type="button" className="btn ghost" onClick={() => navigate('/admin/offices')}>
              Tümü
            </button>
          </div>
          {!officeStats.length ? (
            <EmptyState
              icon="🏢"
              title="Ofis yok"
              description="İlk ofisi ekleyerek başlayın."
              ctaLabel="Ofis ekle"
              onCta={() => navigate('/admin/offices')}
            />
          ) : (
            <div className="office-status-grid">
              {officeStats.map(({ office: o, members, onlineCount, activeOrder, lastOrderAt }) => (
                <article key={o.id} className="office-status-card">
                  <div className="office-status-top">
                    <span className="dot" style={{ background: o.color }} />
                    <strong>{o.name}</strong>
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
                      <dt>Kullanıcı</dt>
                      <dd>{members.length}</dd>
                    </div>
                    <div>
                      <dt>Aktif</dt>
                      <dd>{activeOrder ? 1 : 0}</dd>
                    </div>
                  </dl>
                  <p className="muted tiny">Son sipariş: {formatDateTime(lastOrderAt)}</p>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => navigate(`/admin/offices?detail=${o.id}`)}
                  >
                    Detay
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="admin-col">
          <div className="panel-head">
            <h3>Canlı Durum</h3>
          </div>
          <dl className="live-stat-list">
            <div>
              <dt>Toplam kullanıcı</dt>
              <dd>{livePresence.total}</dd>
            </div>
            <div>
              <dt>Online</dt>
              <dd className="tone-ok">{livePresence.online}</dd>
            </div>
            <div>
              <dt>Offline</dt>
              <dd>{livePresence.offline}</dd>
            </div>
            <div>
              <dt>Aktif sipariş açan ofis</dt>
              <dd className="tone-warn">{livePresence.ordering}</dd>
            </div>
            <div>
              <dt>Toplam ofis</dt>
              <dd>{offices.length}</dd>
            </div>
            <div>
              <dt>Hazırlanan (mutfak)</dt>
              <dd>{kitchenStats.preparing}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-col span-2">
          <div className="panel-head">
            <h3>Canlı Hareketler</h3>
            <button type="button" className="btn ghost" onClick={() => navigate('/admin/logs')}>
              Loglar
            </button>
          </div>
          <ul className="activity-timeline dense">
            {recent.map((log) => (
              <li key={log.id}>
                <span className="timeline-dot" aria-hidden />
                <div>
                    <p>{logSentence(log, { withIcon: false })}</p>
                  <small className="muted">
                    {log.actor?.office?.name ? `${log.actor.office.name} · ` : ''}
                    {formatDateTime(log.createdAt)}
                  </small>
                </div>
              </li>
            ))}
            {!recent.length && <li className="muted">Henüz hareket yok</li>}
          </ul>
        </section>

        <section className="admin-col">
          <div className="panel-head">
            <h3>Duyurular</h3>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate('/admin/announcements')}
            >
              Yönet
            </button>
          </div>
          {!activeAnnouncements.length ? (
            <p className="muted">Aktif duyuru yok</p>
          ) : (
            <ul className="dash-announce-list">
              {activeAnnouncements.map((a) => (
                <li key={a.id}>
                  <div className="dash-announce-top">
                    <span aria-hidden>📢</span>
                    <Badge tone="info">Duyuru</Badge>
                    <Badge
                      tone={
                        a.severity === 'critical'
                          ? 'danger'
                          : a.severity === 'warning'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {a.severity === 'critical'
                        ? 'Kritik'
                        : a.severity === 'warning'
                          ? 'Uyarı'
                          : 'Bilgi'}
                    </Badge>
                  </div>
                  <strong>{a.title}</strong>
                  <p className="muted tiny">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-col span-2">
          <div className="panel-head">
            <h3>En çok sipariş edilenler (bugün)</h3>
          </div>
          {topProducts.length ? (
            <div className="top-product-row">
              {topProducts.slice(0, 6).map((p) => (
                <div key={p.name} className="top-product-chip">
                  <strong>{p.qty}</strong>
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Bugün henüz ürün verisi yok</p>
          )}
          {charts && (
            <div className="chart-grid compact-charts">
              <div className="chart-panel">
                <h3>Son 7 gün</h3>
                <BarMini data={charts.last7Days} />
              </div>
              <div className="chart-panel">
                <h3>Ofislere göre</h3>
                <BarMini data={charts.byOffice} labelKey="name" />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BarMini({ data = [], valueKey = 'count', labelKey = 'label' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="chart-bars">
      {data.map((d) => (
        <div key={d[labelKey] || d.name || d.date} className="chart-bar-item">
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{ height: `${((d[valueKey] || 0) / max) * 100}%` }}
            />
          </div>
          <span>{d[labelKey] || d.name}</span>
          <small>{d[valueKey] || 0}</small>
        </div>
      ))}
    </div>
  );
}
