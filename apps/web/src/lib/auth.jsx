import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthStorage, getToken, setToken } from './api';

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
      .then((data) => setUser(data.user))
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
      async login(username, password, remember = true) {
        const data = await api('/auth/login', {
          method: 'POST',
          body: { username, password, remember },
        });
        setToken(data.token, { remember });
        setUser(data.user);
        return data.user;
      },
      logout() {
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
