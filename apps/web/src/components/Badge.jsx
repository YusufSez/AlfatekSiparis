export function Badge({ tone = 'secondary', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusDot({ online }) {
  return <i className={`status-dot ${online ? 'on' : 'off'}`} aria-hidden />;
}
