import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { TOOLS } from '@shared/domain.js';
import { firstName } from '../../../lib/format.js';
import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { rootPath, talkLabel } from '../../listingNav.js';
import { canTalkFinancing } from '../../reach.js';
import {
  BookGlyph, ChevronLeft, DashGlyph, Heart, HouseGlyph, ListGlyph, MenuLines, SliderGlyph,
} from './icons.jsx';
import { TOOLS_ANCHOR } from './anchor.js';
import StickyBar from './StickyBar.jsx';

/**
 * Ledger's header: slim, on the theme's dark colour, the way a dashboard's top bar is. The development's
 * name (or its logo, the version made for dark grounds) is the small line, and the big one says whose
 * dashboard this is: "Dana's dashboard", or "Your dashboard" before a name is known. At the right are the
 * saved homes as a heart with their count, and the menu.
 *
 * From 1024px the board's computer view takes over: a narrow dark rail down the left (Dashboard, Homes,
 * Tools, Learn and My Home Plan, each an icon over its own word, then the menu) and the bar beside it turns
 * light, with Talk about financing and Book a tour at its right. The rail is part of this header so the
 * page keeps one banner; the stylesheet moves the page and the footer over to make room for it.
 *
 * It keeps everything the other headers do: the back button and where it goes on each route, the mark or
 * the name, the menu, and for a visitor who has not signed in (the public guides) the way into the app in
 * place of a menu, a heart and a rail that would only bounce them to the sign-in page.
 *
 * "Book a tour", "Talk about financing" and "My Home Plan" are in the header from 900px (the plan moves
 * into the rail once there is one); on a phone they are in the bar at the foot of the screen instead (see
 * StickyBar), which this renders into the end of the app shell so it follows the page in the tab order.
 * Book a tour is left out when there is nobody to reach (onTalk is null), financing when the lender's sheet
 * would have nothing to do, and the plan link on the plan itself: the same rules the menu and the other
 * layouts follow.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features, guides, lead, isListing } = useBuyer();
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
  const { pathname } = location;
  const onHomeDetail = !isListing && /\/homes\//.test(pathname);
  const onGuide = /\/guides\/[^/]+$/.test(pathname);
  const atTools = (isListing ? /\/home\/?$/ : /\/tools\/?$/).test(pathname);
  const onPlan = /\/plan\/?$/.test(pathname);
  const onSaved = /\/saved\/?$/.test(pathname);
  // A signed-out reader's "back" is the front door, not a tools screen they cannot open. The home screen is
  // called the Dashboard here, as the rail and the title call it, so the back button uses the same name for it.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? (isListing ? 'The home' : 'Dashboard') : 'Back';
  const backTo = onHomeDetail ? `${base}/explore` : onGuide ? `${base}/guides` : signedIn ? rootPath(base, isListing) : base;

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  const saved = lead?.savedHomeIds?.length ?? 0;
  const first = firstName(lead?.name);
  // A visitor reading the public guides is not on a dashboard of their own, so the line says where they are.
  const title = signedIn
    ? (isListing ? 'The home' : first ? `${first}’s dashboard` : 'Your dashboard')
    : 'Buyer guides';
  const hasTools = TOOLS.some((tool) => community?.tools?.[tool.k]);
  const hasGuides = Boolean(features.guides && guides.length);

  // The rail's places, each with the routes it counts as. Tools and Learn are left out when there are none.
  const rail = [
    isListing
      ? { label: 'The home', to: `${base}/home`, icon: <HouseGlyph />, here: atTools }
      : { label: 'Dashboard', to: `${base}/tools`, icon: <DashGlyph />, here: atTools },
    isListing ? null : { label: 'Homes', to: `${base}/explore`, icon: <HouseGlyph />, here: /\/(explore|homes)(\/|$)/.test(pathname) },
    hasTools
      ? {
        label: isListing ? 'Payment' : 'Tools',
        to: isListing ? `${base}/tools` : { pathname: `${base}/tools`, hash: `#${TOOLS_ANCHOR}` },
        icon: <SliderGlyph />,
        here: isListing ? /\/tools?(\/|$)/.test(pathname) : /\/tool\//.test(pathname),
      }
      : null,
    hasGuides ? { label: 'Learn', to: `${base}/guides`, icon: <BookGlyph />, here: /\/guides(\/|$)/.test(pathname) } : null,
    isListing ? null : { label: 'My Home Plan', to: `${base}/plan`, icon: <ListGlyph />, here: onPlan },
  ].filter(Boolean);

  return (
    <>
      <header className={`lg-head${signedIn ? ' lg-head--rail' : ''}`} ref={headRef}>
        {signedIn ? (
          <nav className="lg-rail" aria-label="Main">
            <ul className="lg-rail__list" role="list">
              {rail.map((item) => (
                <li key={item.label}>
                  {/* The word under the icon is the visible label and the accessible name, so nothing is hidden. */}
                  <Link className="lg-rail__item" to={item.to} aria-current={item.here ? 'page' : undefined}>
                    {item.icon}
                    <span className="lg-rail__word">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className="lg-rail__item lg-rail__menu" onClick={onOpenMenu}>
              <MenuLines size={20} />
              <span className="lg-rail__word">Menu</span>
            </button>
          </nav>
        ) : null}

        <div className="lg-head__in">
          {atTools ? null : (
            <button
              type="button"
              className="lg-head__icon lg-head__back"
              onClick={() => navigate(backTo)}
              // The chevron is the whole visible label, so the name says where it goes.
              aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
            >
              <ChevronLeft />
            </button>
          )}

          <div className="lg-head__id">
            <span className="lg-head__kicker">
              {hasLogo ? (
                <>
                  {/* Both versions are in the page; the stylesheet shows the one made for the ground under it. */}
                  <CommunityMark tone="dark" height={22} className="lg-head__mark lg-head__mark--dark" />
                  <CommunityMark tone="light" height={22} className="lg-head__mark lg-head__mark--light" />
                </>
              ) : (
                <span className="lg-head__name">{community?.name}</span>
              )}
              {community?.location ? <span className="lg-head__loc"> · {community.location}</span> : null}
            </span>
            <span className="lg-head__title">{title}</span>
          </div>

          <span className="lg-head__sp" />

          {signedIn ? (
            <>
              {isListing ? null : (
                <Link
                  to={`${base}/saved`}
                  className="lg-head__saved"
                  aria-current={onSaved ? 'page' : undefined}
                  // The heart and the figure are the visible label; the name says what is counted.
                  aria-label={`Homes I Like, ${saved} saved`}
                >
                  <Heart size={20} filled={saved > 0} />
                  <span className="lg-head__count">{saved}</span>
                </Link>
              )}
              {financing ? (
                <button type="button" className="lg-head__btn lg-head__btn--finance" onClick={financing}>
                  Talk about financing
                </button>
              ) : null}
              {onTalk ? (
                <button type="button" className="lg-head__btn lg-head__btn--tour" onClick={onTalk}>
                  {talkLabel(isListing)}
                </button>
              ) : null}
              {onPlan || isListing ? null : (
                <Link to={`${base}/plan`} className="lg-head__btn lg-head__btn--plan">
                  My Home Plan
                </Link>
              )}
              <button type="button" className="lg-head__icon lg-head__menu" onClick={onOpenMenu} aria-label="Menu">
                <MenuLines />
              </button>
            </>
          ) : (
            <Link to={base} className="lg-head__btn lg-head__btn--tour lg-head__signin">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {signedIn && shell ? createPortal(<StickyBar onTalk={onTalk} onFinance={financing} />, shell) : null}
    </>
  );
}
