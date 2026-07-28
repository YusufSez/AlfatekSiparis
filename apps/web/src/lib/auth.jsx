import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthStorage, getToken, setToken } from './api';
import { syncPushAfterLogin, unsubscribePush } from './push';

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
    api('/auth/me')
      .then((data) => {
        setUser(data.user);
        syncPushAfterLogin();
      })
      .catch(() => {
        clearAuthStorage();
        setUser(null);
      })
      .finally(() => setLoading(false));
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
        try {
          await unsubscribePush();
        } catch {
          /* ignore */
        }
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
