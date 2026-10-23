import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { adminApi, onSessionRefused } from '../lib/api.js';
import { readJson, remove, writeJson } from '../lib/storage.js';

const AdminContext = createContext(null);
const TOKEN_KEY = 'psa:admin';

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => readJson(TOKEN_KEY)?.token ?? null);
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(Boolean(readJson(TOKEN_KEY)?.token));
  // Why the sign-in form is showing, when the app put it there: the server refused the session this
  // tab held (the password changed, or two weeks passed). The next sign-in or sign-out clears it.
  const [sessionEnded, setSessionEnded] = useState(false);

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

  // A session the server just issued ({ token, admin }): after signing in, after a reset link, after a
  // password change. The last two replace a token this tab may still hold, which the server now refuses.
  const adoptSession = useCallback((result) => {
    writeJson(TOKEN_KEY, { token: result.token });
    setToken(result.token);
    setAdmin(result.admin);
    setSessionEnded(false);
  }, []);

  const signIn = useCallback(async (email, password) => {
    adoptSession(await adminApi.login(email, password));
  }, [adoptSession]);

  const signOut = useCallback(() => {
    remove(TOKEN_KEY);
    setToken(null);
    setAdmin(null);
    setSessionEnded(false);
  }, []);

  // A request the server answered "not signed in" ends the session here too, so the page that could not
  // load gives way to the sign-in form, which says why. Only this tab's current token counts: an answer
  // to a request sent with an earlier one, or with a buyer's, says nothing about this session.
  useEffect(() => onSessionRefused((refused) => {
    if (refused !== token) return;
    remove(TOKEN_KEY);
    setToken(null);
    setAdmin(null);
    setSessionEnded(true);
  }), [token]);

  const value = useMemo(
    () => ({ token, admin, checking, sessionEnded, signIn, signOut, adoptSession }),
    [admin, checking, sessionEnded, signIn, signOut, adoptSession, token],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside an AdminProvider');
  return ctx;
}
