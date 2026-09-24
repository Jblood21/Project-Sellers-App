import { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../BuyerContext.jsx';
import Afford from './Afford.jsx';
import Compare from './Compare.jsx';
import Dpa from './Dpa.jsx';
import Loans from './Loans.jsx';
import MoveIn from './MoveIn.jsx';
import Payment from './Payment.jsx';
import Savings from './Savings.jsx';

const SCREENS = {
  payment: Payment,
  afford: Afford,
  loans: Loans,
  compare: Compare,
  dpa: Dpa,
  savings: Savings,
  movein: MoveIn,
};

/** Routes /c/:communityId/tool/:toolKey, respecting the admin's per-tool toggles. */
export default function ToolScreen() {
  const { communityId, toolKey } = useParams();
  const { community, planSaves } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Adding something to the plan ends the errand, so it takes the buyer back to
   * the screen that sent them here rather than leaving them on a tool they are
   * finished with — they came from the home list or the tool list, and that is
   * where the next thing they want to do lives. Whoever linked here says where
   * "back" is; anything that did not say falls back to the tool list.
   */
  const returnTo = location.state?.from ?? `/c/${communityId}/tools`;
  const savesAtOpen = useRef(planSaves);

  useEffect(() => {
    if (planSaves > savesAtOpen.current) navigate(returnTo);
  }, [navigate, planSaves, returnTo]);

  const Screen = SCREENS[toolKey];
  if (!Screen || !community?.tools?.[toolKey]) return <Navigate to={`/c/${communityId}/tools`} replace />;
  return <Screen />;
}

/**
 * The same tool in a sheet rather than a screen.
 *
 * A buyer looking at a home who asks what it would cost has not left the home —
 * they are still deciding about it. Sending them to a separate screen and back
 * loses their place in the list; a sheet keeps the home behind it and closes
 * when they are done.
 */
export function ToolSheet({ open, toolKey, onClose, label }) {
  const { community, planSaves } = useBuyer();
  const savesAtOpen = useRef(planSaves);

  useEffect(() => {
    if (open) savesAtOpen.current = planSaves;
    // planSaves is deliberately not a dependency: this records the count at the
    // moment the sheet opens, and re-running it on every save would reset the
    // baseline and the sheet would never close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && planSaves > savesAtOpen.current) onClose();
  }, [onClose, open, planSaves]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  const Screen = SCREENS[toolKey];
  if (!open || !Screen || !community?.tools?.[toolKey]) return null;

  return (
    <div
      className="b-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? 'Tool'}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="b-sheet b-sheet-tall">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'sticky', top: 0, alignSelf: 'flex-end', zIndex: 1, width: 36, height: 36,
            borderRadius: '50%', border: '1px solid var(--t-line)', background: 'var(--t-bg)',
            color: 'var(--t-ink)', cursor: 'pointer', fontSize: 17, lineHeight: 1,
          }}
        >
          ×
        </button>
        <Screen />
      </div>
    </div>
  );
}
