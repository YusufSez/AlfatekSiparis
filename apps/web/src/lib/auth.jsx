import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthStorage, getToken, setToken } from './api';
import { syncPushAfterLogin } from './push';

const AuthContext = createContext(null);

const AUTH_BC_NAME = 'alfatek-auth';

function postAuthBroadcast(type) {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(AUTH_BC_NAME);
    bc.postMessage({ type, at: Date.now() });
    bc.close();
  } catch {
    /* ignore */
  }
}

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
    function onTokenRotated() {
      postAuthBroadcast('token');
    }
    window.addEventListener('auth:expired', onExpired);
    window.addEventListener('auth:token-rotated', onTokenRotated);
    return () => {
      window.removeEventListener('auth:expired', onExpired);
      window.removeEventListener('auth:token-rotated', onTokenRotated);
    };
  }, []);

  // Multi-tab: localStorage token/remember + BroadcastChannel (sessionStorage peers)
  useEffect(() => {
    let syncGen = 0;

    async function syncFromStorage() {
      const myGen = ++syncGen;
      try {
        const token = getToken();
        if (!token) {
          if (myGen === syncGen) setUser(null);
          return;
        }
        const data = await api('/auth/me');
        if (myGen !== syncGen) return;
        setUser(data.user);
      } catch {
        if (myGen !== syncGen) return;
        // Only wipe if token still present (avoid clobbering a concurrent login)
        if (!getToken()) {
          setUser(null);
          return;
        }
        clearAuthStorage();
        setUser(null);
      }
    }

    function onStorage(e) {
      if (e.key !== 'token' && e.key !== 'remember_login' && e.key != null) return;
      if (e.key === null || (e.key === 'token' && !e.newValue && !getToken())) {
        syncGen += 1;
        setUser(null);
        return;
      }
      if (e.key === 'token' || e.key === 'remember_login') {
        void syncFromStorage();
      }
    }

    function onBroadcast(msg) {
      const type = msg?.data?.type;
      if (type === 'logout') {
        syncGen += 1;
        clearAuthStorage();
        setUser(null);
        return;
      }
      if (type === 'login' || type === 'token') {
        void syncFromStorage();
      }
    }

    let bc = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(AUTH_BC_NAME);
        bc.addEventListener('message', onBroadcast);
      }
    } catch {
      bc = null;
    }

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (bc) {
        bc.removeEventListener('message', onBroadcast);
        bc.close();
      }
    };
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
        postAuthBroadcast('login');
        return data.user;
      },
      async logout() {
        // Do not touch push prefs or unsubscribe — only settings opt-out does that.
        clearAuthStorage();
        setUser(null);
        postAuthBroadcast('logout');
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
