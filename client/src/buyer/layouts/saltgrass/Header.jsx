import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { complianceOf } from '@shared/compliance.js';
import { ChevronLeft, Menu } from '../../../components/Icons.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import LenderLogo from '../../LenderLogo.jsx';
import StickyBar from './StickyBar.jsx';
import useMedia from './useMedia.js';

/**
 * Salt Grass header: a dark bar with an accent rule under it, the development's
 * mark first and then "Preferred Lender" and the lender's mark, never merged into
 * one lockup.
 *
 * It keeps everything BuyerHeader does: the back button and where it goes on
 * each route, the name when there is no logo, the menu button, and for a
 * visitor who has not signed in (the public guides) the way into the app in
 * place of a menu that would only bounce them to the sign-in page. What it adds
 * are the talk and plan buttons, which the stylesheet shows from 900px, where
 * the sticky bar on phones is not drawn.
 *
 * The sticky bar is rendered here but mounted at the end of the app shell (see
 * below), so that it follows the page in the tab order the way it follows it on
 * screen.
 */
export default function Header({ onOpenMenu, onTalk, signedIn = true }) {
  const { community } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const wide = useMedia('(min-width: 560px)');
  // The lender's mark needs about 210px beside the name and the buttons; below
  // this width a squeezed logo is worse than none, and the footer and the home
  // screen carry it at full size.
  const roomy = useMedia('(min-width: 700px)');
  const headRef = useRef(null);
  const [shell, setShell] = useState(null);

  // The bar is fixed to the foot of the screen, so where it sits in the markup
  // only decides the keyboard order. Mounting it as the shell's last child puts
  // it after the page and the disclosures instead of between the header and the
  // first control. An effect finds the shell because the header has no other
  // way to reach a node that BuyerApp owns.
  useEffect(() => {
    setShell(headRef.current?.closest('.b-app') ?? null);
  }, []);

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = location.pathname.endsWith('/tools');
  const onPlan = /\/plan\/?$/.test(location.pathname);
  // A signed-out reader's "back" is the front door, not a tools screen they
  // cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail
    ? `/c/${communityId}/explore`
    : onGuide
      ? `/c/${communityId}/guides`
      : signedIn
        ? `/c/${communityId}/tools`
        : `/c/${communityId}`;

  const { lender } = complianceOf(community?.settings, { community });
  const hasLogo = Boolean(community?.logo || community?.logoLight);

  return (
    <>
      <header className="sg-head" ref={headRef}>
        {atTools ? null : (
          <button type="button" className="sg-head__back" onClick={() => navigate(backTo)}>
            <ChevronLeft />
            {backLabel}
          </button>
        )}

        <div className="sg-head__brands">
          <div className="sg-head__mark">
            {hasLogo ? (
              <CommunityMark tone="dark" height={wide ? 44 : 36} />
            ) : (
              <span className="sg-head__name">{community?.name}</span>
            )}
            {community?.location ? <span className="sg-head__loc">{community.location}</span> : null}
          </div>
          {/* The lender's mark follows the place's, after its own label. Label
              and logo go together or not at all. */}
          {roomy && lender.ready ? (
            <div className="sg-head__lender">
              <span className="sg-head__by">Preferred Lender</span>
              <LenderLogo tone="dark" height={44} />
            </div>
          ) : null}
        </div>

        <span className="sg-head__sp" />

        {signedIn ? (
          <>
            <button type="button" className="sg-head__talk" onClick={onTalk}>
              Book a tour
            </button>
            {onPlan ? null : (
              <Link to={`/c/${communityId}/plan`} className="sg-head__plan">
                My Home Plan
              </Link>
            )}
            <button type="button" className="sg-head__menu" onClick={onOpenMenu} aria-label="Menu">
              <Menu />
            </button>
          </>
        ) : (
          <Link to={`/c/${communityId}`} className="sg-head__open">
            Sign in
          </Link>
        )}
      </header>
      {signedIn && shell ? createPortal(<StickyBar onTalk={onTalk} />, shell) : null}
    </>
  );
}
