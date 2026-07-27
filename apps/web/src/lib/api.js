const API_URL = import.meta.env.VITE_API_URL || '';

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

  const res = await fetch(`${API_URL}${path}`, {
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
