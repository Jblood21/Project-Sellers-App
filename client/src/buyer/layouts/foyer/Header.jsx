import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { canTalkFinancing } from '../../reach.js';

/**
 * Foyer's top of the page, in two parts that share one job.
 *
 * The first is a slim sticky bar: "‹ Back" at the left as text, the development's
 * mark (or its name, set in the serif) in the middle, and "Menu" at the right, over
 * a hairline. The second is a centred line of small-caps text links directly under
 * it: Book a tour, Talk about financing, My Home Plan. That line scrolls away with
 * the page; the bar does not, so the buyer can always leave a tool.
 *
 * It keeps everything the other headers do and nothing else is new: the same back
 * target on every route, the mark or the name, the menu drawer, and for a visitor
 * who has not signed in (the public guides) the way into the app in place of a menu
 * that would only bounce them to the sign-in page. "Book a tour" and "Talk about
 * financing" are in the second part and not behind the menu, at every width,
 * because this layout has no bar at the foot of the screen to carry them.
 *
 * Both controls are left out when there is nothing for them to do (onTalk is null
 * when there is no one to send a buyer to; the financing sheet is offered only when
 * there is a lender and something to do in it, the rule the menu already follows).
 * On the plan itself the plan link would only reload the page, so it is left out.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();

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

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // Offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  const showLinks = signedIn && Boolean(onTalk || financing || !onPlan);

  return (
    <>
      <header className="fy-bar">
        <div className="fy-bar__in">
          <div className="fy-bar__side">
            {atTools ? null : (
              <button
                type="button"
                className="fy-bar__text"
                onClick={() => navigate(backTo)}
                // The visible word is "Back"; the name says where it goes and still begins with it.
                aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
              >
                <span className="fy-bar__chev" aria-hidden="true">‹</span>
                Back
              </button>
            )}
          </div>

          <div className="fy-bar__id">
            {hasLogo ? (
              <CommunityMark tone="light" height={28} className="fy-bar__mark" />
            ) : (
              <span className="fy-bar__name">{community?.name}</span>
            )}
            {/* The place sits under the name on the tools home, where the buyer lands. */}
            {atTools && community?.location ? <span className="fy-bar__place">{community.location}</span> : null}
          </div>

          <div className="fy-bar__side fy-bar__side--end">
            {signedIn ? (
              <button type="button" className="fy-bar__text" onClick={onOpenMenu} aria-label="Menu">
                Menu
              </button>
            ) : (
              <Link to={`/c/${communityId}`} className="fy-bar__text">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {showLinks ? (
        <nav className="fy-links" aria-label="Quick actions">
          {onTalk ? (
            <button type="button" className="fy-links__a" onClick={onTalk}>
              Book a tour
            </button>
          ) : null}
          {financing ? (
            <button type="button" className="fy-links__a" onClick={financing}>
              Talk about financing
            </button>
          ) : null}
          {onPlan ? null : (
            <Link to={`/c/${communityId}/plan`} className="fy-links__a">
              My Home Plan
            </Link>
          )}
        </nav>
      ) : null}
    </>
  );
}
