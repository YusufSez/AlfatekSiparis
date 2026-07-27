import { useMemo } from 'react';

const CATEGORIES = [
  { key: 'users', label: 'Kullanıcılar', icon: '👤' },
  { key: 'sessions', label: 'Siparişler', icon: '🧾' },
  { key: 'tickets', label: 'Kitchen Ticket', icon: '🍽️' },
  { key: 'logs', label: 'Loglar', icon: '📋' },
  { key: 'notifications', label: 'Bildirimler', icon: '🔔' },
  { key: 'offices', label: 'Ofisler', icon: '🏢' },
  { key: 'announcements', label: 'Duyurular', icon: '📢' },
];

function formatWhen(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('tr-TR');
  } catch {
    return null;
  }
}

function SearchCard({ icon, title, meta, badges = [] }) {
  return (
    <article className="search-card">
      <div className="search-card-icon" aria-hidden>
        {icon}
      </div>
      <div className="search-card-body">
        <strong>{title}</strong>
        {meta && <p className="muted">{meta}</p>}
        {badges.length > 0 && (
          <div className="search-card-badges">
            {badges.filter(Boolean).map((b) => (
              <span key={b} className="chip">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function renderItem(cat, item) {
  switch (cat) {
    case 'users':
      return (
        <SearchCard
          key={item.id}
          icon="👤"
          title={item.name}
          meta={`@${item.username}${item.office ? ` · ${item.office}` : ''}`}
          badges={[item.role, item.active ? 'aktif' : 'pasif']}
        />
      );
    case 'sessions':
      return (
        <SearchCard
          key={item.id}
          icon="🧾"
          title={`${item.office} · ${item.openedBy}`}
          meta={formatWhen(item.createdAt)}
          badges={[item.status]}
        />
      );
    case 'tickets':
      return (
        <SearchCard
          key={item.id}
          icon="🍽️"
          title={item.office}
          meta={(item.summary || []).map((s) => `${s.qty}× ${s.name}`).join(', ')}
          badges={[item.status]}
        />
      );
    case 'logs':
      return (
        <SearchCard
          key={item.id}
          icon="📋"
          title={item.action}
          meta={[item.actor, formatWhen(item.createdAt)].filter(Boolean).join(' · ')}
        />
      );
    case 'notifications':
      return (
        <SearchCard
          key={item.id}
          icon="🔔"
          title={item.title}
          meta={item.body}
          badges={[formatWhen(item.createdAt)]}
        />
      );
    case 'offices':
      return (
        <SearchCard
          key={item.id}
          icon="🏢"
          title={item.name}
          badges={[item.color]}
        />
      );
    case 'announcements':
      return (
        <SearchCard
          key={item.id}
          icon="📢"
          title={item.title}
          badges={[item.severity, item.active ? 'aktif' : 'pasif']}
        />
      );
    default:
      return null;
  }
}

export default function SearchResults({ results }) {
  const sections = useMemo(() => {
    if (!results) return [];
    return CATEGORIES.map((c) => ({
      ...c,
      items: results[c.key] || [],
    })).filter((s) => s.items.length > 0);
  }, [results]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  if (!results) return null;

  return (
    <section className="admin-section search-results">
      <h3>Arama sonuçları ({total})</h3>
      {total === 0 && <p className="muted empty-state">Sonuç bulunamadı</p>}
      {sections.map((section) => (
        <div key={section.key} className="search-cat">
          <h4>
            <span aria-hidden>{section.icon}</span> {section.label}
            <small> ({section.items.length})</small>
          </h4>
          <div className="search-card-grid">
            {section.items.map((item) => renderItem(section.key, item))}
          </div>
        </div>
      ))}
    </section>
  );
}
