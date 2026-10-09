import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { Menu } from '../../../components/Icons.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';

/** The chevron on the back button: 2.2px stroke, round caps, as the design draws it. */
function BackChevron() {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

/**
 * Cornerpost's sticky top bar.
 *
 * It does everything the default header does and nothing else: the same back
 * target on every route, the community's mark or its name, the menu drawer. What
 * changes is where they sit and how they look, plus the small "Book a tour"
 * pill the design puts at the right of every page. That pill opens the same
 * community sheet the rest of the app opens, so it adds a way in and removes
 * none: the menu button stays beside it.
 *
 * Signed out, on a public guide page, the tools menu would only bounce the
 * visitor to the contact gate and the tour sheet needs a buyer to book for, so
 * the right-hand side is the one useful thing there, the way into the app.
 */
export default function Header({ onOpenMenu, onTalk, signedIn = true }) {
  const { community } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const [scrolled, setScrolled] = useState(false);

  // The bar's only shadow: it appears once content is passing underneath it, so
  // the border alone carries the bar at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = location.pathname.endsWith('/tools');
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

  const hasLogo = Boolean(community?.logo || community?.logoLight);

  return (
    <header className={`cp-topbar${scrolled ? ' is-scrolled' : ''}`}>
      <div className="cp-topbar__inner">
        {atTools ? null : (
          <button
            type="button"
            className="cp-topbar__back"
            onClick={() => navigate(backTo)}
            // The chevron is the whole visible label, so the name says where it goes.
            aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
          >
            <BackChevron />
          </button>
        )}

        <div className="cp-topbar__id">
          {hasLogo ? (
            // 32px is the tallest the 56px bar holds with the place line under it; smaller
            // and a square logo or a wordmark with a tagline is unreadable.
            <CommunityMark tone="light" height={32} className="cp-topbar__mark" />
          ) : (
            <span className="cp-topbar__name">{community?.name}</span>
          )}
          <span className="cp-topbar__place">{community?.location}</span>
        </div>

        {signedIn ? (
          <>
            {/*
              The button is the 44px target; the pill drawn inside it is the
              34px the design specifies. A bare 34px button would be a harder
              tap than the rest of the app asks of a thumb.
            */}
            <button type="button" className="cp-topbar__cta" onClick={onTalk} aria-label="Book a tour">
              <span className="cp-btn cp-btn--primary cp-btn--sm">
                Book<span className="cp-topbar__long"> a tour</span>
              </span>
            </button>
            <button type="button" className="cp-topbar__menu" onClick={onOpenMenu} aria-label="Menu">
              <Menu />
            </button>
          </>
        ) : (
          <Link to={`/c/${communityId}/start`} className="cp-topbar__cta">
            <span className="cp-btn cp-btn--primary cp-btn--sm">Open the app</span>
          </Link>
        )}
      </div>
    </header>
  );
}
