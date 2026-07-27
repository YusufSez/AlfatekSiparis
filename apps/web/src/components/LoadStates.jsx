export function EmptyState({ title, description, action, icon = '📭', ctaLabel, onCta }) {
  const cta =
    action ||
    (ctaLabel && onCta ? (
      <button type="button" className="btn primary" onClick={onCta}>
        {ctaLabel}
      </button>
    ) : null);

  return (
    <section className="empty-state-panel card-surface">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
      {cta && <div className="empty-cta">{cta}</div>}
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

export function CardSkeleton({ count = 6 }) {
  return (
    <div className="dash-grid dash-grid-hero" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Tablo yükleniyor">
      <table className="data-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton-row" style={{ width: '70%' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div className="skeleton-row" style={{ width: `${80 - c * 8}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
