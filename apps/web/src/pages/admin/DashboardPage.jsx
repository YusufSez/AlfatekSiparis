import { useNavigate } from 'react-router-dom';
import StatsCard from '../../components/ui/StatsCard';
import PageHeader from '../../components/ui/PageHeader';
import { useAdminData } from '../../lib/adminData';
import { logSentence } from '../../lib/uxLabels';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/LoadStates';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { dashboard, pendingKitchen, offices, officeStats, enrichLogs, logs } = useAdminData();
  const cards = dashboard?.cards;
  const charts = dashboard?.charts;
  const recent = enrichLogs(logs).slice(0, 12);

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

  return (
    <div className="admin-page-body">
      <PageHeader title="Dashboard" description="Kurumsal özet ve canlı durum" />

      <div className="dash-grid dash-grid-hero">
        <StatsCard
          label="Aktif Sipariş"
          value={cards.activeOrders}
          tone="warning"
          hint="Detaya git"
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
          label="Bekleyen Mutfak"
          value={pendingKitchen}
          tone="warning"
          hint="Mutfak"
          onClick={() => navigate('/kitchen')}
        />
        <StatsCard
          label="Bugünkü Sipariş"
          value={cards.todayOrders}
          onClick={() => navigate('/admin/logs?range=today&category=order')}
        />
        <StatsCard
          label="Toplam Kullanıcı"
          value={cards.totalUsers}
          onClick={() => navigate('/admin/users')}
        />
        <StatsCard
          label="Toplam Ofis"
          value={offices.length}
          tone="info"
          onClick={() => navigate('/admin/offices')}
        />
      </div>

      <div className="admin-two-col">
        <div className="admin-col">
          <div className="panel-head">
            <h3>Ofis Durumu</h3>
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
                      <dt>Aktif sipariş</dt>
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
        </div>

        <div className="admin-col">
          <div className="panel-head">
            <h3>Son Hareketler</h3>
            <button type="button" className="btn ghost" onClick={() => navigate('/admin/logs')}>
              Tümü
            </button>
          </div>
          <ul className="activity-timeline">
            {recent.map((log) => (
              <li key={log.id}>
                <span className="timeline-dot" aria-hidden />
                <div>
                  <p>{logSentence(log)}</p>
                  <small className="muted">
                    {log.actor?.office?.name ? `${log.actor.office.name} · ` : ''}
                    {formatDateTime(log.createdAt)}
                  </small>
                </div>
              </li>
            ))}
            {!recent.length && <li className="muted">Henüz hareket yok</li>}
          </ul>
        </div>
      </div>

      {charts && (
        <div className="chart-grid">
          <div className="chart-panel">
            <h3>Son 7 gün</h3>
            <BarMini data={charts.last7Days} />
          </div>
          <div className="chart-panel">
            <h3>Ürün dağılımı</h3>
            {charts.productDistribution?.length ? (
              <BarMini data={charts.productDistribution} valueKey="qty" labelKey="name" />
            ) : (
              <p className="muted">Bugün veri yok</p>
            )}
          </div>
          <div className="chart-panel">
            <h3>Ofislere göre</h3>
            <BarMini data={charts.byOffice} labelKey="name" />
          </div>
        </div>
      )}
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
