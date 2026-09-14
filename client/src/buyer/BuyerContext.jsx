import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { buyerApi } from '../lib/api.js';
import { readJson, remove, writeJson } from '../lib/storage.js';

const BuyerContext = createContext(null);

export const DEFAULT_TOOL_STATE = {
  pay: { homeId: null, program: 'conv', downPct: 5, dpaOn: false },
  aff: { income: '', debts: '', credit: 'good' },
  loans: { path: 'know', picked: null, veteran: 'no', downPct: 5, credit: 'good' },
  compare: { aProgram: 'fha', aDown: 3.5, bProgram: 'conv', bDown: 5 },
  dpa: { income: '', savings: '', firstTime: 'yes', military: 'no', credit: 'good' },
  savings: { cash: '', current: '', months: 12 },
  movein: { startMonths: 0 },
};

const sessionKey = (communityId) => `psa:session:${communityId}`;
const toolsKey = (communityId) => `psa:tools:${communityId}`;
const tutorialKey = (communityId) => `psa:tutorial:${communityId}`;

export function BuyerProvider({ communityId, children }) {
  const [community, setCommunity] = useState(null);
  const [lead, setLead] = useState(null);
  const [token, setToken] = useState(() => readJson(sessionKey(communityId))?.token ?? null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToastText] = useState('');
  const [tools, setTools] = useState(() => ({
    ...DEFAULT_TOOL_STATE,
    ...(readJson(toolsKey(communityId)) || {}),
  }));
  const toastTimer = useRef(null);

  // Load the community, and the buyer's own record when we already hold a token.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buyerApi
      .community(communityId)
      .then(async (data) => {
        if (cancelled) return;
        setCommunity(data);
        const stored = readJson(sessionKey(communityId));
        if (stored?.token) {
          try {
            const me = await buyerApi.me(stored.token);
            if (!cancelled) {
              setLead(me);
              setToken(stored.token);
            }
          } catch {
            // Token expired or the lead was removed — fall back to the gate.
            remove(sessionKey(communityId));
            if (!cancelled) setToken(null);
          }
        }
      })
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  useEffect(() => {
    writeJson(toolsKey(communityId), tools);
  }, [communityId, tools]);

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToastText(message);
    toastTimer.current = window.setTimeout(() => setToastText(''), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setTool = useCallback((key, patch) => {
    setTools((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  /** Fire-and-forget behavioral logging — never blocks the UI. */
  const track = useCallback(
    (text) => {
      if (!token) return;
      buyerApi.track(token, text).catch(() => {});
    },
    [token],
  );

  const enter = useCallback(
    async (contact) => {
      const result = await buyerApi.enter(communityId, contact);
      writeJson(sessionKey(communityId), { token: result.token });
      setToken(result.token);
      setLead(result.lead);
      return result;
    },
    [communityId],
  );

  const toggleSave = useCallback(
    async (home) => {
      if (!token || !lead) return;
      const wasSaved = lead.savedHomeIds.includes(home.id);
      // Optimistic — the star should never feel laggy.
      setLead((prev) => ({
        ...prev,
        savedHomeIds: wasSaved
          ? prev.savedHomeIds.filter((id) => id !== home.id)
          : [...prev.savedHomeIds, home.id],
      }));
      showToast(wasSaved ? 'Removed from Homes I Like' : 'Saved — the team can follow up');
      try {
        const result = await buyerApi.toggleSave(token, home.id);
        setLead((prev) => ({ ...prev, savedHomeIds: result.savedHomeIds }));
      } catch (err) {
        setLead((prev) => ({
          ...prev,
          savedHomeIds: wasSaved
            ? [...prev.savedHomeIds, home.id]
            : prev.savedHomeIds.filter((id) => id !== home.id),
        }));
        showToast(err.message);
      }
    },
    [lead, showToast, token],
  );

  const savePlan = useCallback(
    async (key, summary, toastMessage = 'Added to your home plan') => {
      if (!token) return;
      try {
        const updated = await buyerApi.savePlan(token, key, summary);
        setLead(updated);
        showToast(toastMessage);
      } catch (err) {
        showToast(err.message);
      }
    },
    [showToast, token],
  );

  const requestTour = useCallback(
    async (time) => {
      if (!token) return;
      try {
        const updated = await buyerApi.requestTour(token, time);
        setLead(updated);
        showToast('Request sent — the team will text you');
      } catch (err) {
        showToast(err.message);
      }
    },
    [showToast, token],
  );

  const value = useMemo(
    () => ({
      communityId,
      community,
      homes: community?.homes ?? [],
      settings: community?.settings ?? {},
      lead,
      token,
      loading,
      loadError,
      toast,
      tools,
      setTool,
      showToast,
      track,
      enter,
      toggleSave,
      savePlan,
      requestTour,
      tutorialSeen: () => Boolean(readJson(tutorialKey(communityId))),
      markTutorialSeen: () => writeJson(tutorialKey(communityId), true),
    }),
    [
      community, communityId, enter, lead, loadError, loading, requestTour, savePlan,
      setTool, showToast, toast, toggleSave, token, tools, track,
    ],
  );

  return <BuyerContext.Provider value={value}>{children}</BuyerContext.Provider>;
}

export function useBuyer() {
  const ctx = useContext(BuyerContext);
  if (!ctx) throw new Error('useBuyer must be used inside a BuyerProvider');
  return ctx;
}
