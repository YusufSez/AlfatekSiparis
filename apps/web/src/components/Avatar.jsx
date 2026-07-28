import { resolveApiBaseUrl } from '../lib/api';
import { initials } from '../lib/format';

/** Build absolute URL for uploaded media served by the API. */
export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const base = resolveApiBaseUrl().replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

/**
 * Circular user avatar: photo if present, otherwise initials fallback.
 * size: 'sm' | undefined | 'xl'
 */
export function Avatar({ name = '', avatarUrl, size, className = '', title }) {
  const src = resolveMediaUrl(avatarUrl);
  const sizeClass = size === 'sm' ? 'sm' : size === 'xl' ? 'xl' : '';
  const classes = ['avatar', sizeClass, className].filter(Boolean).join(' ');

  return (
    <span className={classes} title={title || name || undefined} aria-hidden={!title}>
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
