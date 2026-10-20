import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { canTalkFinancing } from '../../reach.js';
import { ChevronLeft, Heart, MenuLines } from './icons.jsx';
import NumbersSheet from './NumbersSheet.jsx';
import { fallbackHome, useHomeOnScreen } from './numbers.js';
import Sections from './Sections.jsx';

/** True when the buyer has asked for less motion: the jump back to the homes is then instant. */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Showcase's header: a slim dark bar, so the photos below it get the screen. The development's mark (the
 * version made for dark grounds) or its name sits at the left with the place under it; at the right are
 * the saved homes as a heart with their count, the menu, and "Book a tour" as the one accent button, which
 * keeps it within a thumb's reach on every screen of a phone.
 *
 * It keeps everything the other headers do: the back button and where it goes on each route, the mark or
 * the name, the menu, and for a visitor who has not signed in (the public guides) the way into the app in
 * place of a menu and a heart that would only bounce them to the sign-in page. Book a tour is left out
 * when there is nobody to reach (onTalk is null), the rule the menu and the other layouts follow.
 *
 * The board's four places (Homes, My numbers, My plan, Learn; see Sections) are a text nav in this bar
 * from 900px, and on a phone a pill-shaped tab bar floating at the foot of the screen, which this renders
 * into the end of the app shell so it follows the page in the tab order. "My numbers" opens a sheet over
 * whatever is on screen (see NumbersSheet), and Talk about financing is at its foot, with the lender's
 * name, whenever the lender's sheet has something to do; the menu offers it too, as in every layout.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features, guides, homes, lead, tools } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const headRef = useRef(null);
  const [shell, setShell] = useState(null);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const onScreen = useHomeOnScreen();

  // The tab bar is fixed to the foot of the screen, so where it sits in the markup only decides the keyboard
  // order. An effect finds the shell because the header has no other way to reach a node BuyerApp owns.
  useEffect(() => {
    setShell(headRef.current?.closest('.b-app') ?? null);
  }, []);

  // A sheet left open by the browser's back button would be about a page the buyer has left.
  useEffect(() => {
    setNumbersOpen(false);
  }, [location.pathname]);

  const base = `/c/${communityId}`;
  // A trailing slash reaches the same page, so it counts as the same page here.
  const path = location.pathname.replace(/\/+$/, '');
  const onHomeDetail = /\/homes\//.test(path);
  const onGuide = /\/guides\/[^/]+$/.test(path);
  const atTools = path === `${base}/tools`;
  const onSaved = path === `${base}/saved`;
  // A signed-out reader's "back" is the front door, not a tools screen they cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail ? `${base}/explore` : onGuide ? `${base}/guides` : signedIn ? `${base}/tools` : base;

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  // The same condition the menu uses, so Learn is never offered where the menu would not offer the guides.
  const hasGuides = Boolean(features.guides && guides.length);
  const saved = lead?.savedHomeIds?.length ?? 0;

  // Which home "My numbers" is about: the one on screen (the carousel's, or the home's own page), and on any
  // other screen the one the buyer last priced (see fallbackHome).
  const routeHome = path.match(/\/homes\/([^/]+)$/)?.[1];
  const pick = atTools ? onScreen : routeHome;
  const numbersHome = homes.find((home) => home.id === pick) ?? fallbackHome(homes, tools.pay.homeId);

  // Homes, tapped on the home screen: back up to the carousel, with the keyboard on it so the arrow keys work.
  const toHomes = () => {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    document.getElementById('sc-track')?.focus({ preventScroll: true });
  };
  const sections = (variant) => (
    <Sections
      variant={variant}
      base={base}
      path={path}
      hasGuides={hasGuides}
      onHomes={toHomes}
      onNumbers={() => setNumbersOpen(true)}
    />
  );

  return (
    <>
      <header className="sc-head" ref={headRef}>
        <div className="sc-head__in">
          {atTools ? null : (
            <button
              type="button"
              className="sc-head__icon sc-head__back"
              onClick={() => navigate(backTo)}
              // The chevron is the whole visible label, so the name says where it goes.
              aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
            >
              <ChevronLeft />
            </button>
          )}

          <div className="sc-head__id">
            {hasLogo ? (
              <CommunityMark tone="dark" height={30} className="sc-head__mark" />
            ) : (
              <span className="sc-head__name">{community?.name}</span>
            )}
            {community?.location ? <span className="sc-head__loc">{community.location}</span> : null}
          </div>

          {signedIn ? (
            <nav className="sc-nav" aria-label="Sections">
              {sections('nav')}
            </nav>
          ) : null}

          <span className="sc-head__sp" />

          {signedIn ? (
            <>
              <Link
                to={`${base}/saved`}
                className="sc-head__icon sc-head__saved"
                aria-current={onSaved ? 'page' : undefined}
                // The heart and the figure are the visible label; the name says what is counted, and ends with it.
                aria-label={`Homes I Like: ${saved}`}
              >
                <Heart size={20} filled={saved > 0} />
                <span className="sc-head__count">{saved}</span>
              </Link>
              <button type="button" className="sc-head__icon sc-head__menu" onClick={onOpenMenu} aria-label="Menu">
                <MenuLines />
              </button>
              {onTalk ? (
                <button type="button" className="sc-head__tour" onClick={onTalk}>
                  Book a tour
                </button>
              ) : null}
            </>
          ) : (
            <Link to={base} className="sc-head__tour">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {signedIn && shell
        ? createPortal(
            <>
              <nav className="sc-tabs" aria-label="Sections">
                {sections('tabs')}
              </nav>
              <NumbersSheet
                open={numbersOpen}
                onClose={() => setNumbersOpen(false)}
                home={numbersHome}
                onFinance={financing}
                onPlan={path === `${base}/plan`}
              />
            </>,
            shell,
          )
        : null}
    </>
  );
}
