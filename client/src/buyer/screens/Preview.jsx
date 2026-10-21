import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';

import { themeView } from '@shared/customTheme.js';
import { normalizeLayout, normalizeTheme } from '@shared/domain.js';
import { PREVIEW_MESSAGE } from '../../lib/themePreview.js';
import { BuyerProvider, useBuyer } from '../BuyerContext.jsx';
import { BuyerHeader } from '../Chrome.jsx';
import ComplianceFooter from '../ComplianceFooter.jsx';
import { layoutFor } from '../layouts/index.js';
import { canBookTour } from '../reach.js';
import AllTools from './AllTools.jsx';

/**
 * The address of the preview, /c/<id>/preview. BuyerApp sends it here instead of to the buyer app's own
 * routes; nothing in the buyer app links to it, so a buyer (or a builder tapping round their own app) only
 * ever reaches it by typing it. Matched without regard to letter case, as the server and the router match it.
 */
export const PREVIEW_PATH_RE = /^\/c\/[^/]+\/preview\/*$/i;

const nothing = () => {};

/** The look named in the address, for the first paint: each part checked, and left out to keep the community's own. */
function lookFromQuery(search) {
  const query = new URLSearchParams(search);
  return {
    theme: query.get('theme') ? normalizeTheme(query.get('theme')) : undefined,
    layout: query.get('layout') ? normalizeLayout(query.get('layout')) : undefined,
    settings: {},
  };
}

/**
 * What Setup says to wear, from a message (see lib/themePreview.js). Only Setup can say it: the page that holds
 * this one in a frame, at this same origin. Anything else posted to the page (another window, another site, an
 * extension) is ignored. A theme or layout the message leaves out stays as it is; the colours are always the
 * message's own, so colours from an earlier message never linger.
 */
function useLookFromSetup(search) {
  const [look, setLook] = useState(() => lookFromQuery(search));
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== PREVIEW_MESSAGE || data.ready) return;
      setLook((prev) => ({
        theme: typeof data.theme === 'string' && data.theme ? normalizeTheme(data.theme) : prev.theme,
        layout: typeof data.layout === 'string' && data.layout ? normalizeLayout(data.layout) : prev.layout,
        settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
      }));
    };
    window.addEventListener('message', onMessage);
    // A message posted before this page was listening is lost, so the page says when it is: { type, ready: true }
    // to the frame's parent, at this origin only. Setup answers it by posting the look again.
    if (window.parent !== window) window.parent.postMessage({ type: PREVIEW_MESSAGE, ready: true }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return look;
}

/**
 * The tab's title, and a robots tag: this page is the buyer app drawn for the builder, never a page for a search
 * engine to list (the server says the same in a header, for a crawler that does not run the app).
 */
function usePreviewHead(name) {
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);
  useEffect(() => {
    document.title = name ? `Preview of ${name}` : 'Preview';
  }, [name]);
}

/**
 * Read-only. The whole app is made inert, so nothing in it can be tapped, clicked or reached with the keyboard,
 * while the page itself still scrolls. For a browser that does not know `inert` (Safari before 15.5), clicks,
 * submits and Enter or Space on a control are stopped before the app sees them, so no link can take the frame
 * somewhere else and no button can open a sheet, a new tab or a phone call.
 */
function useReadOnly(rootRef) {
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = true;
  });
  useEffect(() => {
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const keys = (event) => {
      const onPage = event.target === document.body || event.target === document.documentElement;
      if (!onPage && (event.key === 'Enter' || event.key === ' ')) stop(event);
    };
    const types = [['click', stop], ['auxclick', stop], ['submit', stop], ['keydown', keys]];
    for (const [type, handler] of types) window.addEventListener(type, handler, true);
    return () => {
      for (const [type, handler] of types) window.removeEventListener(type, handler, true);
    };
  }, []);
}

function Status({ children }) {
  return (
    <p role="status" style={{ margin: 0, padding: 28, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14, color: '#3D5159' }}>
      {children}
    </p>
  );
}

/**
 * The buyer app's own frame around the home screen, as BuyerApp draws it for a signed-in buyer: the layout's
 * header, the layout's home screen, the lender's footer. The header is given the same buttons a buyer's would
 * have (Book a tour only when there is someone to book with), but none of them does anything here.
 */
function PreviewShell() {
  const { community, layout, loading, loadError, features, agents, settings } = useBuyer();
  const rootRef = useRef(null);
  usePreviewHead(community?.name);
  useReadOnly(rootRef);

  if (loading) return <Status>Loading the preview…</Status>;
  if (loadError) return <Status>{loadError}</Status>;
  if (!community) return <Status>This community link isn’t active anymore.</Status>;

  const view = themeView(community.theme, community.settings);
  const Header = layoutFor(layout).Header ?? BuyerHeader;

  return (
    <div ref={rootRef} className={`b-app ${view.className} l-${layout}`} style={view.style}>
      <a className="b-skip" href="#b-main">Skip to the page</a>
      <Header onOpenMenu={nothing} onTalk={canBookTour(features, agents, settings) ? nothing : null} onFinance={nothing} signedIn />
      <main id="b-main" tabIndex={-1} className="b-main">
        <AllTools onOpenLender={nothing} />
      </main>
      <ComplianceFooter />
    </div>
  );
}

/**
 * Setup's live theme preview: the community's real home screen, in its real layout and with its real homes,
 * tools and lender, exactly as a signed-in buyer named Dana with nothing in her plan would see it. Setup shows
 * it in a frame and repaints it with a message each time a theme, a layout or a colour is tried on, so the
 * builder sees the change on their own app at once, without a reload.
 *
 * Nobody signs in, and nothing is recorded: the provider's preview mode stands in a demo buyer and makes every
 * call that would track, save, book or email do nothing (see BuyerContext). The screens are drawn at the home
 * screen's own address (a Routes with its own location), so every header and home screen that asks "am I on
 * the home screen?" answers yes, as it does for a buyer.
 */
export default function Preview() {
  const { communityId } = useParams();
  const location = useLocation();
  const look = useLookFromSetup(location.search);
  const home = location.pathname.replace(/\/preview\/*$/i, '/tools');

  return (
    <BuyerProvider communityId={communityId} preview={look}>
      <Routes location={home}>
        <Route path="tools" element={<PreviewShell />} />
      </Routes>
    </BuyerProvider>
  );
}
