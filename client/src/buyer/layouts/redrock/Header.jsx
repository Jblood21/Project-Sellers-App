import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { canTalkFinancing } from '../../reach.js';
import { ChevronLeft, Heart, MenuLines } from './icons.jsx';
import StickyBar from './StickyBar.jsx';

/**
 * Red Rock's sticky header: a dark bar in the theme's secondary colour, as the board draws it in desert
 * plum. The development's name sits at the left in the serif with the place under it (or its logo, the
 * version made for dark grounds), and at the right are the saved homes as a heart with their count and
 * the menu.
 *
 * It keeps everything the other headers do: the back button and where it goes on each route, the mark or
 * the name, the menu, and for a visitor who has not signed in (the public guides) the way into the app in
 * place of a menu and a heart that would only bounce them to the sign-in page.
 *
 * "Book a tour", "Talk about financing" and "My Home Plan" are in the header from 900px; on a phone they
 * are in the bar at the foot of the screen instead (see StickyBar), which this renders into the end of the
 * app shell so it follows the page in the tab order. Book a tour is left out when there is nobody to
 * reach (onTalk is null), financing when the lender's sheet would have nothing to do, and the plan link on
 * the plan itself: the same rules the menu and the other layouts follow.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features, lead } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const headRef = useRef(null);
  const [shell, setShell] = useState(null);

  // The bar is fixed to the foot of the screen, so where it sits in the markup only decides the keyboard
  // order. An effect finds the shell because the header has no other way to reach a node BuyerApp owns.
  useEffect(() => {
    setShell(headRef.current?.closest('.b-app') ?? null);
  }, []);

  const base = `/c/${communityId}`;
  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = /\/tools\/?$/.test(location.pathname);
  const onPlan = /\/plan\/?$/.test(location.pathname);
  const onSaved = /\/saved\/?$/.test(location.pathname);
  // A signed-out reader's "back" is the front door, not a tools screen they cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail ? `${base}/explore` : onGuide ? `${base}/guides` : signedIn ? `${base}/tools` : base;

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  const saved = lead?.savedHomeIds?.length ?? 0;

  return (
    <>
      <header className="rr-head" ref={headRef}>
        <div className="rr-head__in">
          {atTools ? null : (
            <button
              type="button"
              className="rr-head__icon rr-head__back"
              onClick={() => navigate(backTo)}
              // The chevron is the whole visible label, so the name says where it goes.
              aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
            >
              <ChevronLeft />
            </button>
          )}

          <div className="rr-head__id">
            {hasLogo ? (
              <CommunityMark tone="dark" height={34} className="rr-head__mark" />
            ) : (
              <span className="rr-head__name">{community?.name}</span>
            )}
            {community?.location ? <span className="rr-head__loc">{community.location}</span> : null}
          </div>

          <span className="rr-head__sp" />

          {signedIn ? (
            <>
              {onTalk ? (
                <button type="button" className="rr-head__btn rr-head__btn--tour" onClick={onTalk}>
                  Book a tour
                </button>
              ) : null}
              {financing ? (
                <button type="button" className="rr-head__btn rr-head__btn--finance" onClick={financing}>
                  Talk about financing
                </button>
              ) : null}
              {onPlan ? null : (
                <Link to={`${base}/plan`} className="rr-head__btn rr-head__btn--plan">
                  My Home Plan
                </Link>
              )}
              <Link
                to={`${base}/saved`}
                className="rr-head__saved"
                aria-current={onSaved ? 'page' : undefined}
                // The heart and the figure are the visible label; the name says what is counted, and ends with it.
                aria-label={`Homes I Like: ${saved}`}
              >
                <Heart size={20} filled={saved > 0} />
                <span className="rr-head__count">{saved}</span>
              </Link>
              <button type="button" className="rr-head__icon rr-head__menu" onClick={onOpenMenu} aria-label="Menu">
                <MenuLines />
              </button>
            </>
          ) : (
            <Link to={base} className="rr-head__btn rr-head__btn--tour rr-head__signin">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {signedIn && shell ? createPortal(<StickyBar onTalk={onTalk} onFinance={financing} />, shell) : null}
    </>
  );
}
