import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { Menu } from '../../../components/Icons.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { canTalkFinancing } from '../../reach.js';

/** The chevron on the back control: a hair thinner than the shared icon, to match the 1px rules. */
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
 * Which tab a path belongs to. `exact` is the page the tab itself links to, which gets
 * aria-current="page"; `within` is every page that sits under it (a tool under Tools, a
 * home under Explore), which is highlighted but is not "the current page" of the tab.
 * The patterns are anchored to /c/<id>/ so a community whose id happens to be "tools"
 * cannot light a tab up.
 */
const TABS = [
  { key: 'tools', label: 'Tools', slug: 'tools', within: /^\/c\/[^/]+\/(tools|tool\/[^/]+|area|map)$/ },
  { key: 'explore', label: 'Explore', slug: 'explore', within: /^\/c\/[^/]+\/(explore|homes\/[^/]+)$/ },
  { key: 'saved', label: 'Saved', slug: 'saved', within: /^\/c\/[^/]+\/saved$/ },
  { key: 'plan', label: 'Plan', slug: 'plan', within: /^\/c\/[^/]+\/plan$/ },
];

function currentOf(tab, pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (new RegExp(`^/c/[^/]+/${tab.slug}$`).test(path)) return 'page';
  return tab.within.test(path) ? 'true' : undefined;
}

/**
 * Keystone's sticky header: two rows, about 97px in all.
 *
 * Row one is the development (its mark, or its name and place), the small "Book a tour"
 * button and the menu. Row two is the tab strip: Tools, Explore, Saved and Plan are real
 * links, and "Financing" is a button that opens the same sheet "Talk about financing" opens
 * everywhere else. Between them the two actions a buyer can always want, booking a tour and
 * talking about financing, are on every screen at every width without opening the menu,
 * which is why this layout needs no bar at the foot of the phone.
 *
 * It does everything the other headers do: a back control with the same target on every
 * route, the mark or the name, the menu, and for a visitor who has not signed in (the
 * public guides) the way into the app instead of a menu that would only bounce them to the
 * sign-in page. "Book a tour" and "Financing" are left out when there is nobody to reach
 * (onTalk is null) or nothing for the sheet to do (no lender set up), the rule the menu
 * and the other layouts follow.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features } = useBuyer();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const listRef = useRef(null);
  const headRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const onHomeDetail = /\/homes\//.test(location.pathname);
  const onGuide = /\/guides\/[^/]+$/.test(location.pathname);
  const atTools = /\/tools\/?$/.test(location.pathname);
  // A signed-out reader's "back" is the front door, not a tools screen they cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? 'All Tools' : 'Back';
  const backTo = onHomeDetail
    ? `/c/${communityId}/explore`
    : onGuide
      ? `/c/${communityId}/guides`
      : signedIn
        ? `/c/${communityId}/tools`
        : `/c/${communityId}`;

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;

  // The strip scrolls sideways when the phone is too narrow for all five tabs; the fade at
  // an edge says there is more past it, and goes when there is not.
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const start = list.scrollLeft > 2;
    const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(list);
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => {
      list.removeEventListener('scroll', measure);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, signedIn, Boolean(financing)]);

  // The header is usually 97px, but a long community name wraps and makes it taller. The stylesheet keeps
  // a focused control clear of it with scroll-padding, which has to know the real height, so the header
  // says what it is on the root (the one place that rule can read it from) and takes it back when it goes.
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--ks-head-h', `${Math.ceil(head.getBoundingClientRect().height)}px`);
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(head);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--ks-head-h');
    };
  }, []);

  // The tab for this page is brought into view, so a narrow phone on the Plan screen does
  // not open with the highlighted tab off the edge of the strip.
  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-current]');
    if (!list || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left - 24);
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 24;
    measure();
  }, [location.pathname, measure]);

  return (
    <header className="ks-head" ref={headRef}>
      <div className="ks-head__top">
        {atTools ? null : (
          <button
            type="button"
            className="ks-head__back"
            onClick={() => navigate(backTo)}
            // The chevron is the whole visible label, so the name says where it goes.
            aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
          >
            <BackChevron />
          </button>
        )}

        <div className="ks-head__id">
          {hasLogo ? (
            <CommunityMark tone="light" height={28} className="ks-head__mark" />
          ) : (
            <span className="ks-head__name">{community?.name}</span>
          )}
          {community?.location ? <span className="ks-head__place">{community.location}</span> : null}
        </div>

        {signedIn ? (
          <>
            {/* The button is the 44px target; the face drawn inside it is the 36px the design wants. */}
            {onTalk ? (
              <button type="button" className="ks-head__book" onClick={onTalk}>
                <span className="ks-face">Book a tour</span>
              </button>
            ) : null}
            <button type="button" className="ks-head__menu" onClick={onOpenMenu} aria-label="Menu">
              <Menu />
            </button>
          </>
        ) : (
          <Link to={`/c/${communityId}`} className="ks-head__book">
            <span className="ks-face">Sign in</span>
          </Link>
        )}
      </div>

      {signedIn ? (
        <nav
          className={`ks-tabs${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''}`}
          aria-label="Sections"
        >
          <ul className="ks-tabs__list" ref={listRef}>
            {TABS.map((tab) => {
              const current = currentOf(tab, location.pathname);
              return (
                <li key={tab.key} className="ks-tabs__item">
                  <Link
                    to={`/c/${communityId}/${tab.slug}`}
                    className={`ks-tab${current ? ' is-active' : ''}`}
                    aria-current={current}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
            {financing ? (
              <li className="ks-tabs__item ks-tabs__item--action">
                <button
                  type="button"
                  className="ks-tab ks-tab--action"
                  onClick={financing}
                  aria-haspopup="dialog"
                  // The tab says "Financing"; the name says what it does, and contains the label.
                  aria-label="Talk about financing"
                >
                  Financing
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
