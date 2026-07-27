export function Skeleton({ rows = 3, className = '' }) {
  return (
    <div className={`skeleton-block ${className}`} aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <section className="hero-panel empty-state-panel">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {action}
    </section>
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
