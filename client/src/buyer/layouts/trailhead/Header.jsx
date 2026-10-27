import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useBuyer } from '../../BuyerContext.jsx';
import CommunityMark from '../../CommunityMark.jsx';
import { rootLabel, rootPath, talkLabel } from '../../listingNav.js';
import { canTalkFinancing } from '../../reach.js';
import { useHomeModel } from '../../screens/AllTools.jsx';
import { ArrowLeft, ArrowRight, Calendar, Check, ChevronLeft, Heart, Key, MenuLines, TrailGlyph } from './icons.jsx';
import { Hidden } from './Overlook.jsx';
import StickyBar from './StickyBar.jsx';
import { OVERLOOK, TOUR_EVENT, stopLink, trailOf } from './trail.js';

/**
 * Where the open screen sits on the trail, under the header on a stop's own page: the stop before it, this
 * one, and the next, as the board's "stop opened" screen draws them, with "Stop 2 of 8" in words (and, once
 * it is done, that it is in the plan). The line between them is solid up to this stop and dotted after it.
 * The first stop has the trailhead before it and the last has the keys after it; neither is a link, as
 * neither is a stop.
 */
function TrailStrip({ stop, trail, model }) {
  const before = trail.before(stop);
  const after = trail.after(stop);
  const link = (target) => stopLink(target, model);
  const doneWords = stop.done ? (stop.key === OVERLOOK ? 'Home saved' : 'In your plan') : '';
  return (
    <nav className="th-strip" aria-label="Where this stop sits on your trail">
      <div className="th-strip__in">
        {before ? (
          <Link
            {...link(before)}
            className="th-strip__slot th-strip__slot--before"
            aria-label={before.done ? `Done: stop ${before.n}, ${before.name}` : `Stop ${before.n}: ${before.name}`}
          >
            <span className={`th-mark th-mark--sm th-mark--${before.done ? 'done' : 'later'}`} aria-hidden="true">
              {before.done ? <Check size={13} /> : before.n}
            </span>
            <span className="th-strip__word">{before.done ? 'Done' : `Stop ${before.n}`}</span>
          </Link>
        ) : (
          <span className="th-strip__slot th-strip__slot--before th-strip__slot--start" aria-hidden="true">
            <span className="th-strip__flag" />
            <span className="th-strip__word">Start</span>
          </span>
        )}
        <span className="th-strip__slot th-strip__slot--this" aria-current="step">
          <span className="th-mark th-mark--here" aria-hidden="true">{stop.n}</span>
          {/* Drawn as one or two short lines, said as one sentence. A hidden piece tucked between the lines
              would be read as a piece of its own, with a pause and a stray space before its colon. */}
          <span className="th-strip__word th-strip__word--this" aria-hidden="true">
            Stop {stop.n} of {trail.total}
            {doneWords ? <span className="th-strip__done">{doneWords}</span> : null}
          </span>
          <Hidden>{`Stop ${stop.n} of ${trail.total}: ${stop.name}${doneWords ? `, ${doneWords.toLowerCase()}` : ''}`}</Hidden>
        </span>
        {after ? (
          <Link
            {...link(after)}
            className="th-strip__slot th-strip__slot--after"
            aria-label={`Next: stop ${after.n}, ${after.name}${after.done ? ', in your plan' : ''}`}
          >
            <span className={`th-mark th-mark--sm th-mark--${after.done ? 'done' : 'later'}`} aria-hidden="true">
              {after.done ? <Check size={13} /> : after.n}
            </span>
            <span className="th-strip__word">Next</span>
          </Link>
        ) : (
          <span className="th-strip__slot th-strip__slot--after th-strip__slot--end" aria-hidden="true">
            <span className="th-strip__key"><Key size={14} /></span>
            <span className="th-strip__word">Keys</span>
          </span>
        )}
      </div>
    </nav>
  );
}

/**
 * At the foot of a stop's page: the next stop, as the board's "Next stop: Find My Loan Options", and the way
 * back to the trail. The tool screens are shared and say nothing about a trail, so the header draws this
 * into the end of the page (see useEndOfMain) rather than the screen drawing it.
 */
function NextStop({ stop, trail, model }) {
  const after = trail.after(stop);
  const go = after ? stopLink(after, model) : null;
  return (
    <nav className="th-next" aria-label="Next stop">
      {after ? (
        <Link to={go.to} state={go.state} onClick={go.onClick} className="th-next__go">
          <span className="th-next__words">
            <span className="th-next__small">Next stop:</span>
            <span className="th-next__big">{after.name}</span>
          </span>
          <ArrowRight />
        </Link>
      ) : (
        <p className="th-next__end">
          <span className="th-next__key" aria-hidden="true"><Key size={18} /></span>
          This is the last stop. Keys in hand are next.
        </p>
      )}
      <Link to={model.paths.tools} className="th-next__back">
        <ArrowLeft />
        Back to the trail
      </Link>
    </nav>
  );
}

/**
 * A place at the very end of the page's main content for NextStop. The main element and the screens in it are
 * BuyerApp's, so this adds one empty element of its own at its end and renders into that. React puts a new
 * screen after it when the route changes, so a watch on the main element moves it back to the end whenever
 * its children change; the watch answers before the page is painted, so the next stop always follows the
 * tool on screen and in the tab order, never precedes it.
 */
function useEndOfMain(anchorRef) {
  const [slot, setSlot] = useState(null);
  useLayoutEffect(() => {
    const main = anchorRef.current?.closest('.b-app')?.querySelector(':scope > main');
    if (!main) return undefined;
    const node = document.createElement('div');
    node.className = 'th-mainend';
    main.appendChild(node);
    const keepLast = () => {
      if (node.parentNode === main && main.lastChild !== node) main.appendChild(node);
    };
    const watch = new MutationObserver(keepLast);
    watch.observe(main, { childList: true });
    setSlot(node);
    return () => {
      watch.disconnect();
      node.remove();
      setSlot(null);
    };
  }, [anchorRef]);
  return slot;
}

/**
 * Trailhead's sticky header: a slim bar on the theme's dark colour, its foot cut in a soft wave as the
 * board draws it. The development's mark (the version made for dark grounds) or, without one, a small trail
 * glyph, the name and the place; then Homes I Like as a heart with the count, and the menu.
 *
 * It keeps everything the other headers do: the back button and where it goes on each route, the mark or the
 * name, the menu, and for a visitor who has not signed in (the public guides) the way into the app in place
 * of a menu and a heart that would only bounce them to the sign-in page.
 *
 * "Book a tour", "Talk about financing" and "My Home Plan" are in the header from 900px; on a phone they are
 * in the bar at the foot of the screen instead (see StickyBar), which this renders into the end of the app
 * shell so it follows the page in the tab order. Book a tour is left out when there is nobody to reach
 * (onTalk is null), financing when the lender's sheet would have nothing to do, and the plan link on the plan
 * itself: the same rules the menu and the other layouts follow.
 *
 * On a stop's own page (a tool, or Explore Homes for the overlook) it also draws where the stop sits on the
 * trail under the bar, and the next stop at the foot of the page. The trail is the home screen's own
 * (useHomeModel, trailOf), so the numbers here and there always agree.
 */
export default function Header({ onOpenMenu, onTalk, onFinance, signedIn = true }) {
  const { community, features, lead, isListing } = useBuyer();
  const model = useHomeModel();
  const navigate = useNavigate();
  const location = useLocation();
  const { communityId } = useParams();
  const headRef = useRef(null);
  const [shell, setShell] = useState(null);
  const endOfMain = useEndOfMain(headRef);

  // The bar is fixed to the foot of the screen, so where it sits in the markup only decides the keyboard
  // order. An effect finds the shell because the header has no other way to reach a node BuyerApp owns.
  useEffect(() => {
    setShell(headRef.current?.closest('.b-app') ?? null);
  }, []);

  // The home screen's "Book a tour" (once every stop is done) asks for the tour through this, so it is the
  // same call every other Book a tour makes. The latest onTalk is read at the moment of asking.
  const talkRef = useRef(onTalk);
  talkRef.current = onTalk;
  useEffect(() => {
    if (!shell) return undefined;
    const ask = () => talkRef.current?.();
    shell.addEventListener(TOUR_EVENT, ask);
    return () => shell.removeEventListener(TOUR_EVENT, ask);
  }, [shell]);

  const base = `/c/${communityId}`;
  const { pathname } = location;
  const onHomeDetail = !isListing && /\/homes\//.test(pathname);
  const onGuide = /\/guides\/[^/]+$/.test(pathname);
  const atTools = (isListing ? /\/home\/?$/ : /\/tools\/?$/).test(pathname);
  const onPlan = /\/plan\/?$/.test(pathname);
  const onSaved = /\/saved\/?$/.test(pathname);
  // A signed-out reader's "back" is the front door, not a trail they cannot open.
  const backLabel = onHomeDetail ? 'Homes' : onGuide ? 'Guides' : signedIn ? (isListing ? rootLabel(isListing) : 'your trail') : 'Back';
  const backTo = onHomeDetail ? `${base}/explore` : onGuide ? `${base}/guides` : signedIn ? rootPath(base, isListing) : base;

  const hasLogo = Boolean(community?.logo || community?.logoLight);
  // "Talk about financing" is offered only when there is a lender and something to do in the sheet it opens.
  const financing = onFinance && canTalkFinancing(community, features) ? onFinance : null;
  const saved = lead?.savedHomeIds?.length ?? 0;

  // The stop this page is, if it is one: a tool's own screen, or Explore Homes for the overlook.
  const trail = trailOf(model);
  const toolKey = pathname.match(/\/tool\/([^/]+)\/?$/)?.[1];
  const onExplore = /\/explore\/?$/.test(pathname);
  const stop = !signedIn || isListing ? null : toolKey ? trail.find(toolKey) : onExplore ? trail.find(OVERLOOK) : null;

  return (
    <>
      <header className="th-head" ref={headRef}>
        <div className="th-head__in">
          {atTools ? null : (
            <button
              type="button"
              className="th-head__icon th-head__back"
              onClick={() => navigate(backTo)}
              // The chevron is the whole visible label, so the name says where it goes.
              aria-label={backLabel === 'Back' ? 'Back' : `Back to ${backLabel}`}
            >
              <ChevronLeft />
            </button>
          )}

          <div className="th-head__id">
            {hasLogo ? (
              <CommunityMark tone="dark" height={32} className="th-head__mark" />
            ) : (
              <span className="th-head__brand">
                <span className="th-head__glyph"><TrailGlyph /></span>
                <span className="th-head__name">{community?.name}</span>
              </span>
            )}
            {community?.location ? <span className="th-head__loc">{community.location}</span> : null}
          </div>

          <span className="th-head__sp" />

          {signedIn ? (
            <>
              {onTalk ? (
                <button type="button" className="th-head__btn th-head__btn--tour" onClick={onTalk}>
                  <Calendar size={16} />
                  {talkLabel(isListing)}
                </button>
              ) : null}
              {financing ? (
                <button type="button" className="th-head__btn th-head__btn--line" onClick={financing}>
                  Talk about financing
                </button>
              ) : null}
              {onPlan || isListing ? null : (
                <Link to={`${base}/plan`} className="th-head__btn th-head__btn--line">
                  My Home Plan
                </Link>
              )}
              {isListing ? null : (
                <Link
                  to={`${base}/saved`}
                  className="th-head__saved"
                  aria-current={onSaved ? 'page' : undefined}
                  // The heart and the figure are the visible label; the name says what is counted, and ends with it.
                  aria-label={`Homes I Like: ${saved}`}
                >
                  <Heart size={21} filled={saved > 0} />
                  <span className="th-head__savedword" aria-hidden="true">Homes I Like</span>
                  <span className="th-head__count">{saved}</span>
                </Link>
              )}
              <button type="button" className="th-head__icon th-head__menu" onClick={onOpenMenu} aria-label="Menu">
                <MenuLines />
              </button>
            </>
          ) : (
            <Link to={base} className="th-head__btn th-head__btn--tour th-head__signin">
              Sign in
            </Link>
          )}
        </div>
        {/* The board's soft wave along the foot of the bar: the dark ground, nothing more. */}
        <svg className="th-head__wave" viewBox="0 0 390 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 0H390V3C370 8 352 2 330 5C306 9 290 2 262 5C236 8 214 1 188 4C160 8 138 2 112 5C86 9 66 2 40 5C24 7 10 4 0 6Z" />
        </svg>
      </header>
      {stop ? <TrailStrip stop={stop} trail={trail} model={model} /> : null}
      {stop && endOfMain ? createPortal(<NextStop stop={stop} trail={trail} model={model} />, endOfMain) : null}
      {signedIn && shell
        ? createPortal(<StickyBar onTalk={onTalk} onFinance={financing} trail={trail} model={model} />, shell)
        : null}
    </>
  );
}
