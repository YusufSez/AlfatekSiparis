export default function StatsCard({ label, value, tone, onClick, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`dash-card dash-card-lg stats-card ${tone ? `tone-${tone}` : ''} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
      {hint && <small className="muted">{hint}</small>}
    </Tag>
  );
}
