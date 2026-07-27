export function EmptyState({ title, description, action, icon = '📭' }) {
  return (
    <section className="hero-panel empty-state-panel">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {action}
    </section>
  );
}

export function Skeleton({ rows = 3, className = '' }) {
  return (
    <div className={`skeleton-block ${className}`} aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${92 - (i % 4) * 10}%` }} />
      ))}
    </div>
  );
}

export function OfflineBanner({ online, onRetry }) {
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <span>Çevrimdışısınız. Bağlantı gelince veriler yenilenecek.</span>
      {onRetry && (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Yeniden dene
        </button>
      )}
    </div>
  );
}

export function LoadError({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert load-error">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}
