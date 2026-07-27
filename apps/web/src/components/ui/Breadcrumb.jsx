import { Link } from 'react-router-dom';

export default function Breadcrumb({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`}>
              {!last && item.to ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              )}
              {!last && <span className="crumb-sep" aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
