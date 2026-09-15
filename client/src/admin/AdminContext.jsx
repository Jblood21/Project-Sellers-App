import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { adminApi } from '../lib/api.js';
import { readJson, remove, writeJson } from '../lib/storage.js';

const AdminContext = createContext(null);
const TOKEN_KEY = 'psa:admin';

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => readJson(TOKEN_KEY)?.token ?? null);
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(Boolean(readJson(TOKEN_KEY)?.token));

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    adminApi
      .me(token)
      .then((me) => !cancelled && setAdmin(me))
      .catch(() => {
        if (cancelled) return;
        remove(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback(async (email, password) => {
    const result = await adminApi.login(email, password);
    writeJson(TOKEN_KEY, { token: result.token });
    setToken(result.token);
    setAdmin(result.admin);
  }, []);

  const signOut = useCallback(() => {
    remove(TOKEN_KEY);
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ token, admin, checking, signIn, signOut }), [admin, checking, signIn, signOut, token]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside an AdminProvider');
  return ctx;
}
