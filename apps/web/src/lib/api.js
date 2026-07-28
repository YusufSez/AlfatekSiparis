/**
 * Resolve API base URL for fetch + Socket.io.
 * - Explicit VITE_API_URL wins (production builds / overrides).
 * - In Vite DEV, use the page hostname + API port so phones on LAN work
 *   (http://192.168.x.x:5173 → http://192.168.x.x:4000).
 * - Otherwise empty string (same-origin / Vite proxy).
 */
export function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (configured) return configured;

  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.hostname) {
    const port = String(import.meta.env.VITE_API_PORT || '4000').trim() || '4000';
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${port}`;
  }

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

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = resolveApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
    const err = new Error(data?.error || 'İstek başarısız');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export { API_URL };
