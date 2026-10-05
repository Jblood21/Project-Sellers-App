import { useSyncExternalStore } from 'react';

/**
 * True while the media query matches, and re-renders when it changes.
 *
 * The header's logos are sized by an inline height (the shared logo components
 * take a pixel number), so a size that depends on the screen width has to be
 * decided in script rather than in the stylesheet.
 */
export default function useMedia(query) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
