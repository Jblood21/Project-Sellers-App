import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { adminApi, onSessionRefused } from '../lib/api.js';
import { readJson, remove, writeJson } from '../lib/storage.js';

const AdminContext = createContext(null);
const TOKEN_KEY = 'psa:admin';

// How long to wait before asking again after the Nth failure in a row: quick at first, since most dropped signals
// come back in seconds, then easing off to every half minute so a phone left on a dead one is not asking all day.
const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];
const retryDelay = (failures) => RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length) - 1];

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => readJson(TOKEN_KEY)?.token ?? null);
  // { id, email, role } from /me. `role` is 'owner' for the account ADMIN_EMAIL names and 'member' for everyone
  // invited from the Team page. A session answer (sign-in, a reset link, a password change) may carry it too, and
  // /me is read again whenever the token changes, so a missing role is only ever a beat long.
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(Boolean(readJson(TOKEN_KEY)?.token));
  // Why the sign-in form is showing, when the app put it there: the server refused the session this
  // tab held (the password changed, or two weeks passed). The next sign-in or sign-out clears it.
  const [sessionEnded, setSessionEnded] = useState(false);
  // The server could not be reached to ask who this is (no signal, a restart during an update, a 5xx). The token
  // is kept: only the server saying "not signed in" ends a session, never a weak signal. `attempt` is how the
  // check is asked again, by the Retry button, by the browser coming back online or by the backoff timer.
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  // The effects below read these without being remade when they change.
  const known = useRef(false);
  known.current = Boolean(admin);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setUnreachable(false);
      return undefined;
    }
    let cancelled = false;
    let timer = 0;
    // Each ask shows as one in flight (the Retry button reads "Trying…"), unless the page is already up.
    if (!known.current) setChecking(true);
    adminApi
      .me(token)
      .then((me) => {
        if (cancelled) return;
        // A captive portal or a proxy in the way can answer 200 with a page of its own: that is not "who".
        if (!me?.id) throw Object.assign(new Error('The site did not answer properly.'), { offline: true });
        failures.current = 0;
        setUnreachable(false);
        setAdmin(me);
      })
      .catch((err) => {
        if (cancelled) return;
        // The server said this sign-in is no longer valid (request() has already told the app, which is what puts
        // the reason on the sign-in form). Anything else is the signal, not the session.
        if (err.status === 401) {
          remove(TOKEN_KEY);
          setToken(null);
          return;
        }
        // Somebody already signed in (the answer to a sign-in carried who they are) is not held up by a re-check
        // that could not get through; the page only waits for this when it does not know who is here yet.
        if (known.current) return;
        failures.current += 1;
        setUnreachable(true);
        timer = window.setTimeout(() => setAttempt((n) => n + 1), retryDelay(failures.current));
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, attempt]);

  // The signal comes back: ask at once rather than wait out the backoff.
  useEffect(() => {
    const back = () => {
      if (unreachable) setAttempt((n) => n + 1);
    };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [unreachable]);

  // Asked for by the Retry button: now, and a fresh run of the backoff from the start.
  const retryCheck = useCallback(() => {
    failures.current = 0;
    setAttempt((n) => n + 1);
  }, []);

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

  // The owner's parts of the app (Team, Activity, New community) key off this. Unknown counts as not the owner,
  // so a member never sees them even for a beat; the owner sees them as soon as /me has answered.
  const isOwner = admin?.role === 'owner';
  const value = useMemo(
    () => ({ token, admin, isOwner, checking, unreachable, retryCheck, sessionEnded, signIn, signOut, adoptSession }),
    [admin, isOwner, checking, unreachable, retryCheck, sessionEnded, signIn, signOut, adoptSession, token],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside an AdminProvider');
  return ctx;
}
