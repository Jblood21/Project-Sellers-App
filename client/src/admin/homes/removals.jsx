import { useCallback, useEffect, useRef, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';

/**
 * Taking a photo or a floor plan off a home with a way back.
 *
 * One tap used to delete a picture for good, on a button the size of a fingertip sitting on a strip that is swiped
 * sideways. Now the picture leaves the strip at once, a note says "Photo removed. Undo" for UNDO_MS, and the delete
 * is only SENT when that time is up. Until then nothing has happened on the server, so Undo is not a restore, it is
 * simply not sending the request, and a picture cannot be lost by a slow connection or a crashed tab: the worst case
 * for a tab that dies in the window is that the picture is still there afterwards.
 *
 * Why not delete first and bring it back on Undo: a photo is a stored file with its own address and its place in a
 * home's order, so a restore would need new server code in both stores and every list of photos taught to skip a
 * hidden one. Waiting needs none of that.
 *
 * The waiting list lives out here, not in a component, because the window must not be cut short by the screen it
 * began on going away. Three things end the wait early, each of them the person having moved on:
 *   - they leave the Homes page (the hook's cleanup sends what is waiting),
 *   - they close or leave the site (`pagehide` sends it with `keepalive`, which lets a request outlive the page),
 *   - or 6 seconds go by, which is the normal way.
 */
export const UNDO_MS = 6000;

// Kept on `window` as well, so a copy of this module loaded again (a hot reload while developing) still sees the
// pictures the first copy left waiting, and the one `pagehide` listener below still sends them.
const waiting = typeof window === 'undefined' ? new Map() : (window.__psaPhotoWaiting ??= new Map()); // photo id -> { timer, token }

const sendLeaving = (token, id) => {
  try {
    // keepalive is what lets this finish after the page is gone (with a service worker controlling the page, the
    // worker forwards it: see public/sw.js). It cannot be read, so it cannot be retried: if it never arrives the
    // picture is simply still there next time, which is the safe way to be wrong.
    fetch(`/api/admin/photos/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, keepalive: true,
    }).catch(() => {});
  } catch {
    // A browser without keepalive support throws here; there is nothing more to try as the page closes.
  }
};

// One listener for the whole site, however many times this module is loaded (a hot reload while developing).
if (typeof window !== 'undefined' && !window.__psaPhotoRemovals) {
  window.__psaPhotoRemovals = true;
  window.addEventListener('pagehide', () => {
    for (const [id, entry] of waiting) {
      window.clearTimeout(entry.timer);
      sendLeaving(entry.token, id);
    }
    waiting.clear();
  });
}

/**
 * The state behind the notes. `hidden` is the set of picture ids to leave out of the strips; `start` takes a
 * picture off ({ id, label }, label being "Photo" or "Floor plan"); `undo` puts it back while the wait lasts; `items`
 * is what the notes list (`sending` once the request has gone and Undo is over); `failures` are removals that were
 * sent and did not go through (the picture is back in the strip).
 */
export function useRemovals(reload) {
  const { token } = useAdmin();
  const [items, setItems] = useState([]);
  const [failures, setFailures] = useState([]);
  const alive = useRef(true);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const forget = useCallback((id) => {
    if (alive.current) setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // The wait is over (or the person moved on): make it real, then bring the page up to date.
  const settle = useCallback(async (id, label) => {
    const entry = waiting.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    waiting.delete(id);
    // From here the request is on its way and there is no taking it back: the note stops offering Undo.
    if (alive.current) setItems((prev) => prev.map((item) => (item.id === id ? { ...item, sending: true } : item)));
    try {
      await adminApi.deletePhoto(entry.token, id);
    } catch (err) {
      // Already gone (another tab, another admin) is the result that was wanted. Anything else leaves the picture
      // where it is, and it comes back into the strip, with the reason, rather than looking deleted when it is not.
      if (err.status !== 404) {
        forget(id);
        if (alive.current) {
          setFailures((prev) => [...prev, {
            id,
            label,
            text: err.status && err.status < 500 ? err.message : `${label} not removed. Check your connection.`,
          }]);
        }
        return;
      }
    }
    try {
      await reloadRef.current?.();
    } catch {
      // The picture is gone from the server; the page catches up the next time it loads.
    }
    forget(id);
  }, [forget]);

  const start = useCallback((item) => {
    if (waiting.has(item.id)) return;
    setFailures((prev) => prev.filter((failure) => failure.id !== item.id));
    // The service worker, if there is one, is what carries the request out of a closing page (see public/sw.js), and
    // the browser stops an idle one. Waking it now has it running for the whole wait.
    try {
      navigator.serviceWorker?.controller?.postMessage('keep-alive');
    } catch {
      // Not every browser lets a page message its worker; the wait works the same without it.
    }
    waiting.set(item.id, {
      token: tokenRef.current,
      timer: window.setTimeout(() => settle(item.id, item.label), UNDO_MS),
    });
    setItems((prev) => [...prev, { id: item.id, label: item.label }]);
  }, [settle]);

  const undo = useCallback((id) => {
    const entry = waiting.get(id);
    // Not waiting any more means the request has gone: it is too late, and putting the picture back in the strip
    // would show one that is about to disappear.
    if (!entry) return;
    window.clearTimeout(entry.timer);
    waiting.delete(id);
    forget(id);
  }, [forget]);

  // Leaving the Homes page is the person moving on: send what is waiting now instead of dropping it.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const [id] of [...waiting]) settle(id, 'Photo');
    };
  }, [settle]);

  return {
    hidden: new Set(items.map((item) => item.id)),
    items,
    failures,
    start,
    undo,
    dismiss: (id) => setFailures((prev) => prev.filter((failure) => failure.id !== id)),
  };
}

const bar = {
  position: 'fixed', left: 16, right: 16, bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))', zIndex: 40,
  display: 'flex', flexDirection: 'column', gap: 8, margin: '0 auto', maxWidth: 440, pointerEvents: 'none',
};
const note = {
  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: '4px 6px 4px 16px',
  borderRadius: 14, background: '#0e2228', color: '#fff', fontSize: 15, lineHeight: 1.35,
  boxShadow: '0 6px 20px rgba(14,34,40,.35)', pointerEvents: 'auto',
};
const button = {
  minHeight: 44, minWidth: 64, padding: '0 14px', border: 'none', borderRadius: 10, background: 'transparent',
  color: '#9fe3d6', fontWeight: 700, fontSize: 15, cursor: 'pointer', textDecoration: 'underline',
};

/** The notes: "Photo removed. Undo" for each picture still in its window, and a line for any that would not go. */
export function RemovalNotes({ removals }) {
  const { items, failures, undo, dismiss } = removals;
  if (!items.length && !failures.length) return null;
  return (
    <div style={bar}>
      {items.map((item) => (
        <div key={item.id} style={note} role="status">
          <span>{item.sending ? `Removing the ${item.label.toLowerCase()}…` : `${item.label} removed.`}</span>
          {item.sending ? null : <button type="button" style={button} onClick={() => undo(item.id)}>Undo</button>}
        </div>
      ))}
      {failures.map((failure) => (
        <div key={failure.id} style={{ ...note, background: '#7a1f17' }} role="alert">
          <span>{failure.text}</span>
          <button type="button" style={{ ...button, color: '#fff' }} onClick={() => dismiss(failure.id)}>OK</button>
        </div>
      ))}
    </div>
  );
}
