import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { canTalkFinancing } from '../../reach.js';
import { ChevronLeft, Heart, MenuLines } from './icons.jsx';

/**
 * Which nav entry a path belongs to. `exact` is the page the entry links to, which gets
 * aria-current="page"; `within` is every page under it (a home under Homes, a guide under Learn), which
 * is underlined but is not "the current page". Anchored to /c/<id>/ so a community whose id happens to
 * be "explore" cannot light an entry up.
 */
function currentOf(slug, within, pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (new RegExp(`^/c/[^/]+/${slug}$`).test(path)) return 'page';
  return within.test(path) ? 'true' : undefined;
}

/**
 * Marketplace's sticky header: a white bar, as a home-search site has.
 *
 * The development's mark sits on the left and takes the buyer back to the home screen, the way a
 * site's logo does. On a wide screen a text nav follows it: Homes, Map (when the community shows its
 * site map), Financing (the same sheet "Talk about financing" opens everywhere else) and Learn (when
 * the guides are on). At the right are Saved with its count, the one solid button, "Book a tour", and
 * the menu, which keeps everything the nav has no room for. On a phone the nav goes and the rest stays,
 * with Saved as its heart and count alone.
 *
 * It does everything the other headers do: a back control with the same target on every route, the
 * mark or the name, the menu, and for a visitor who has not signed in (the public guides) the way into
 * the app instead of a menu and a nav that would only bounce them to the sign-in page. Book a tour and
 * Financing are left out when there is nobody to reach (onTalk is null) or nothing for the sheet to do
 * (no lender set up), the rule the menu and the other layouts follow.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features, guides, lead } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const base = `/c/${communityId}`;

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = /\/tools\/?$/.test(location.pathname);
  // A signed-out reader's "back" is the front door, not a tools screen they cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail ? `${base}/explore` : onGuide ? `${base}/guides` : signedIn ? `${base}/tools` : base;

  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  // The same two conditions the menu uses, so the nav never offers a page the menu would not.
  const hasMap = Boolean(community?.features?.siteMap && community?.siteMap);
  const hasGuides = Boolean(features.guides && guides.length);
  const saved = lead?.savedHomeIds?.length ?? 0;
  const path = location.pathname;

  return (
    <header className="mk-bar">
      <div className="mk-bar__in">
        {atTools ? null : (
          <button
            type="button"
            className="mk-bar__icon mk-bar__back"
            onClick={() => navigate(backTo)}
            // The chevron is the whole visible label, so the name says where it goes.
            aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
          >
            <ChevronLeft />
          </button>
        )}

        <Link
          to={signedIn ? `${base}/tools` : base}
          className="mk-bar__id"
          aria-current={atTools ? 'page' : undefined}
          // The logo's own alt says whose it is; the link says where it goes.
          aria-label={`${community?.name ?? 'Home'}: home`}
        >
          <CommunityMark tone="light" height={30} className="mk-bar__mark" />
        </Link>

        {signedIn || hasGuides ? (
          <nav className="mk-nav" aria-label="Sections">
            <ul className="mk-nav__list">
              {signedIn ? (
                <li>
                  <Link
                    to={`${base}/explore`}
                    className="mk-nav__a"
                    aria-current={currentOf('explore', /^\/c\/[^/]+\/homes\/[^/]+$/, path)}
                  >
                    Homes
                  </Link>
                </li>
              ) : null}
              {signedIn && hasMap ? (
                <li>
                  <Link to={`${base}/map`} className="mk-nav__a" aria-current={currentOf('map', /^$/, path)}>
                    Map
                  </Link>
                </li>
              ) : null}
              {signedIn && financing ? (
                <li>
                  <button
                    type="button"
                    className="mk-nav__a"
                    onClick={financing}
                    aria-haspopup="dialog"
                    // The nav says "Financing"; the name says what it does, and starts with the label.
                    aria-label="Financing: talk about financing"
                  >
                    Financing
                  </button>
                </li>
              ) : null}
              {/* The guides are the one part of the app a visitor can read before signing in. */}
              {hasGuides ? (
                <li>
                  <Link
                    to={`${base}/guides`}
                    className="mk-nav__a"
                    aria-current={currentOf('guides', /^\/c\/[^/]+\/guides\/[^/]+$/, path)}
                  >
                    Learn
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}

        <span className="mk-bar__sp" />

        {signedIn ? (
          <>
            <Link
              to={`${base}/saved`}
              className="mk-bar__saved"
              aria-current={currentOf('saved', /^$/, path)}
              aria-label={`Saved homes: ${saved}`}
            >
              <Heart size={20} filled={saved > 0} />
              <span className="mk-bar__saved-word">Saved</span>
              <span className="mk-bar__count">{saved}</span>
            </Link>
            {onTalk ? (
              <button type="button" className="mk-bar__tour" onClick={onTalk}>
                Book a tour
              </button>
            ) : null}
            <button type="button" className="mk-bar__icon mk-bar__menu" onClick={onOpenMenu} aria-label="Menu">
              <MenuLines />
            </button>
          </>
        ) : (
          <Link to={base} className="mk-bar__tour">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
