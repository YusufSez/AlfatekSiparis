import { useEffect, useState } from 'react';
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

/** CSS pixel sizes — img width/height attrs match for crisp layout. */
export const AVATAR_SIZES = {
  sm: 32,
  md: 36,
  xl: 88,
};

/**
 * Circular user avatar: photo if present, otherwise initials fallback.
 * size: 'sm' | 'md' | 'xl' (default md)
 *
 * Always a perfect circle; photo is cover-cropped (portrait/landscape/square).
 */
export function Avatar({ name = '', avatarUrl, size = 'md', className = '', title }) {
  const [broken, setBroken] = useState(false);
  const src = resolveMediaUrl(avatarUrl);
  const px = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  const sizeClass = size === 'sm' ? 'sm' : size === 'xl' ? 'xl' : '';
  const classes = ['avatar', sizeClass, className].filter(Boolean).join(' ');
  const showPhoto = Boolean(src) && !broken;

  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span className={classes} title={title || name || undefined} aria-hidden={!title}>
      {showPhoto ? (
        <img
          src={src}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="avatar-initials">{initials(name)}</span>
      )}
    </span>
  );
}
