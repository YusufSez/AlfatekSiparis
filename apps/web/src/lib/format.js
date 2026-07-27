export function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

export function homeFor(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'kitchen') return '/kitchen';
  return '/office';
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const APP_VERSION = '1.0.0';
