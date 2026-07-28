import { getUserFriendlyError } from './errors';

/**
 * Resolve API base URL for fetch + Socket.io.
 * - DEV: always page hostname + :4000 (LAN / phone safe). Ignores VITE_API_URL
 *   so a leftover localhost override cannot break mobile testing.
 * - Production: VITE_API_URL, else same-origin (empty).
 */
export function resolveApiBaseUrl() {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.hostname) {
    const port = String(import.meta.env.VITE_API_PORT || '4000').trim() || '4000';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }

  const configured = String(import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (configured) return configured;

  return '';
}

const API_URL = resolveApiBaseUrl();

const TOKEN_KEY = 'token';
const REMEMBER_KEY = 'remember_login';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token, { remember = true } = {}) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
}

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

function throwFriendly(errorLike) {
  const message = getUserFriendlyError(errorLike);
  const err = new Error(message);
  err.status = errorLike?.status ?? errorLike?.statusCode ?? null;
  err.data = errorLike?.data ?? null;
  err.cause = errorLike;
  throw err;
}

export async function api(path, options = {}) {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = resolveApiBaseUrl();
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      body: isFormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
    });
  } catch (networkErr) {
    if (import.meta.env.DEV) {
      console.warn('[api] network error', path, networkErr);
    }
    throwFriendly(networkErr);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearAuthStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    if (import.meta.env.DEV && data?.error) {
      console.warn('[api] http error', res.status, path, data.error);
    }
    throwFriendly({
      message: data?.error || `HTTP ${res.status}`,
      status: res.status,
      data,
    });
  }
  return data;
}

export { API_URL, getUserFriendlyError };
