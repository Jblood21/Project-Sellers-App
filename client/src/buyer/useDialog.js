import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Props for the dimmed backdrop of a sheet (the element that has `role="dialog"` and covers the screen):
 * a tap on the backdrop itself closes the sheet, a tap on the sheet does not. A press that starts inside the
 * sheet and ends on the backdrop (selecting text in a field and letting go outside it, say) is not a tap on
 * the backdrop, so it closes nothing.
 */
export const closeOnBackdrop = (onClose) => ({
  onPointerDown: (event) => { event.currentTarget.dataset.pressedOn = event.target === event.currentTarget ? 'backdrop' : 'sheet'; },
  onClick: (event) => {
    const startedOnBackdrop = event.currentTarget.dataset.pressedOn === 'backdrop';
    event.currentTarget.dataset.pressedOn = '';
    if (event.target === event.currentTarget && startedOnBackdrop) onClose();
  },
});

/**
 * Makes a modal behave like one for a keyboard or screen-reader user.
 *
 * When it opens, focus moves into it; Tab and Shift+Tab stay inside it instead of
 * walking the page behind the overlay; Escape closes it; and when it closes,
 * focus goes back to the control that opened it. Pass the ref of the element
 * that has `role="dialog"`, and `open` as the dialog's own open state: the
 * dialogs return null while closed, so this has to be called above that return.
 */
export default function useDialog(open, onClose, ref) {
  // The latest close handler, without re-running the effect (and so without
  // re-focusing) every time the parent re-renders with a new function.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const root = ref.current;
    const focusables = () => (root ? [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null) : []);

    if (root) {
      // A dialog with nothing to focus still takes focus itself, so Tab does not escape.
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      (focusables()[0] ?? root).focus({ preventScroll: true });
    }

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
