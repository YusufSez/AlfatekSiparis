import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthStorage, getToken, setToken } from './api';
import { syncPushAfterLogin } from './push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    api('/auth/me', { signal: ac.signal })
      .then((data) => {
        if (cancelled || ac.signal.aborted) return;
        setUser(data.user);
        syncPushAfterLogin();
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted || err?.name === 'AbortError') return;
        clearAuthStorage();
        setUser(null);
      })
      .finally(() => {
        if (!cancelled && !ac.signal.aborted) setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  useEffect(() => {
    function onExpired() {
      clearAuthStorage();
      setUser(null);
    }
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      async login(username, password, remember = true) {
        const data = await api('/auth/login', {
          method: 'POST',
          body: { username, password, remember },
        });
        setToken(data.token, { remember });
        setUser(data.user);
        syncPushAfterLogin();
        return data.user;
      },
      async logout() {
        // Do not touch push prefs or unsubscribe — only settings opt-out does that.
        clearAuthStorage();
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
