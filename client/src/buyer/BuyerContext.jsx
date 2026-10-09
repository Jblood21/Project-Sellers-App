import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { normalizeLayout } from '@shared/domain.js';
import { buyerApi } from '../lib/api.js';
import { readJson, remove, writeJson } from '../lib/storage.js';

const BuyerContext = createContext(null);

export const DEFAULT_TOOL_STATE = {
  pay: { homeId: null, program: 'conv', downPct: 5, dpaOn: false },
  aff: { income: '', debts: '', credit: 'good', downPayment: '' },
  loans: { path: 'know', picked: null, veteran: 'no', downPct: 5, credit: 'good' },
  compare: { aProgram: 'fha', aDown: 3.5, bProgram: 'conv', bDown: 5 },
  dpa: { income: '', savings: '', firstTime: 'yes', military: 'no', credit: 'good' },
  savings: { cash: '', current: '', months: 12 },
};

const sessionKey = (communityId) => `psa:session:${communityId}`;
const toolsKey = (communityId) => `psa:tools:${communityId}`;
const tutorialKey = (communityId) => `psa:tutorial:${communityId}`;

/**
 * A community can be reached by its id or by its clean link, and what a buyer saved on this device
 * (their sign-in, their tool figures, whether they saw the tour) is stored under whichever they
 * used. Opened by the other one, it would look like a stranger: so whatever is stored under the
 * community's other addresses is copied under this one first, when this one has nothing of its own.
 */
function adoptSavedState(communityId, community) {
  const others = [community.id, community.urlKey].filter((key) => key && key !== communityId);
  const adopted = {};
  for (const [name, keyOf] of [['session', sessionKey], ['tools', toolsKey], ['tutorial', tutorialKey]]) {
    if (readJson(keyOf(communityId)) != null) continue;
    for (const other of others) {
      const saved = readJson(keyOf(other));
      if (saved == null) continue;
      writeJson(keyOf(communityId), saved);
      adopted[name] = saved;
      break;
    }
  }
  return adopted;
}

export function BuyerProvider({ communityId, children }) {
  const [community, setCommunity] = useState(null);
  // Which community is already on screen, so that swapping the address bar from its id to its clean
  // link does not read as a different community and load the whole thing a second time.
  const loaded = useRef(null);
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
    const known = loaded.current;
    if (known && (communityId === known.urlKey || communityId === known.id)) return undefined;
    let cancelled = false;
    setLoading(true);
    buyerApi
      .community(communityId)
      .then(async (data) => {
        if (cancelled) return;
        loaded.current = { id: data.id, urlKey: data.urlKey };
        const adopted = adoptSavedState(communityId, data);
        if (adopted.tools) setTools((prev) => ({ ...prev, ...adopted.tools }));
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

  /**
   * Counts successful plan saves. Whatever opened the tool watches this and
   * takes the buyer back where they came from — a screen navigates, a sheet
   * closes. Doing it here rather than in each of the seven tools means every
   * tool behaves the same way without seven copies of the same navigation,
   * and the tools stay unaware of how they were opened.
   */
  const [planSaves, setPlanSaves] = useState(0);

  const savePlan = useCallback(
    async (key, summary, toastMessage = 'Added to your home plan') => {
      if (!token) return;
      try {
        const updated = await buyerApi.savePlan(token, key, summary);
        setLead(updated);
        showToast(toastMessage);
        setPlanSaves((n) => n + 1);
      } catch (err) {
        showToast(err.message);
      }
    },
    [showToast, token],
  );

  /**
   * The move-in plan saves to the lead, not localStorage: a plan the buyer built
   * themselves should still be there when they come back on another phone.
   * Silent on failure -- this fires as they type, and a toast per keystroke
   * would be worse than a save that retries on the next edit.
   */
  const saveMoveIn = useCallback(
    async (plan) => {
      if (!token) return;
      try {
        setLead(await buyerApi.saveMoveIn(token, plan));
      } catch (err) {
        // Their edits stay on screen and the next change tries again. A refusal worth knowing about
        // (slow down, or the server is unwell) is said once, because otherwise the screen looks saved
        // and a reload quietly loses it.
        if (err?.status === 429 || err?.status >= 500) showToast(err.message);
      }
    },
    [showToast, token],
  );

  /** Emails the buyer's plan to them (and to the second address, if they added one). */
  const emailPlan = useCallback(
    async (also) => {
      const result = await buyerApi.emailPlan(token, also);
      if (result?.lead) setLead(result.lead);
      return result;
    },
    [token],
  );

  /** Returns true when the booking took, so the dialog knows whether to close. */
  const requestTour = useCallback(
    async (slotId, contact, topic = 'community', extra = {}) => {
      if (!token) return false;
      try {
        const updated = await buyerApi.requestTour(token, slotId, contact, topic, extra);
        setLead(updated);
        showToast(contact === 'email' ? 'Booked — the team will email you' : 'Booked — the team will call you');
        return true;
      } catch (err) {
        // A clash is the interesting case: the dialog stays open so they can
        // pick again rather than being dropped back with nothing booked.
        showToast(err.message);
        return false;
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
      // Resolved here so every screen and every layout reads the same answer:
      // an unknown key from an older payload falls back to the default layout.
      layout: normalizeLayout(community?.layout),
      features: community?.features ?? {},
      // The server sends [] when the builder has the feature switched off, so a
      // screen only has to ask whether the list is empty.
      agents: community?.agents ?? [],
      guides: community?.guides ?? [],
      // Guides are readable without the contact gate, so "is there a community"
      // and "is this person known" are different questions for the chrome.
      signedIn: Boolean(token && lead),
      lead,
      token,
      loading,
      loadError,
      toast,
      tools,
      setTool,
      showToast,
      planSaves,
      track,
      enter,
      toggleSave,
      savePlan,
      saveMoveIn,
      requestTour,
      emailPlan,
      tutorialSeen: () => Boolean(readJson(tutorialKey(communityId))),
      markTutorialSeen: () => writeJson(tutorialKey(communityId), true),
    }),
    [
      community, communityId, emailPlan, enter, lead, loadError, loading, requestTour, savePlan,
      planSaves, saveMoveIn, setTool, showToast, toast, toggleSave, token, tools, track,
    ],
  );

  return <BuyerContext.Provider value={value}>{children}</BuyerContext.Provider>;
}

export function useBuyer() {
  const ctx = useContext(BuyerContext);
  if (!ctx) throw new Error('useBuyer must be used inside a BuyerProvider');
  return ctx;
}
