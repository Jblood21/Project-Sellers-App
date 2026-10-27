import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import { complianceOf } from '@shared/compliance.js';
import { themeView } from '@shared/customTheme.js';
import { AddToPhoneDialog, BuyerHeader, MenuDrawer, Toast, TourDialog, TutorialSheet } from './Chrome.jsx';
import { BuyerProvider, useBuyer } from './BuyerContext.jsx';
import ComplianceFooter from './ComplianceFooter.jsx';
import { layoutFor } from './layouts/index.js';
import { rootSlug } from './listingNav.js';
import { canBookTour, canReachAgents } from './reach.js';
import StructuredData from './StructuredData.jsx';
import AllTools from './screens/AllTools.jsx';
import Area from './screens/Area.jsx';
import Explore from './screens/Explore.jsx';
import GuideArticle from './screens/GuideArticle.jsx';
import Guides from './screens/Guides.jsx';
import HomeDetail from './screens/HomeDetail.jsx';
import Landing from './screens/Landing.jsx';
import ListingTools from './screens/ListingTools.jsx';
import Plan from './screens/Plan.jsx';
import PlanPrint from './screens/PlanPrint.jsx';
import Preview, { PREVIEW_PATH_RE } from './screens/Preview.jsx';
import Realtors from './screens/Realtors.jsx';
import Saved from './screens/Saved.jsx';
import SiteMap from './screens/SiteMap.jsx';
import ToolScreen from './tools/index.jsx';

/** Points the document at this community's manifest so Add-to-Home-Screen works. */
function useCommunityChrome(community, communityId) {
  useEffect(() => {
    if (!community) return undefined;
    document.title = community.name;

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = `/c/${communityId}/manifest.webmanifest`;

    // The phone's bar takes the theme's main colour, the community's own when it uses its own colours.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = themeView(community.theme, community.settings).colors.primary;

    return () => {
      link?.remove();
    };
  }, [community, communityId]);
}

function Centered({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28, textAlign: 'center', color: 'var(--color-neutral-700)', fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function BuyerShell() {
  const { community, layout, loading, loadError, signedIn, track, features, agents, settings, isListing } = useBuyer();
  const { communityId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // null when closed; otherwise the topic the sheet was opened for, so the
  // booking that comes out of it says what it is about.
  const [tourTopic, setTourTopic] = useState(null);
  const [addToPhoneOpen, setAddToPhoneOpen] = useState(false);

  useCommunityChrome(community, communityId);

  // Reached by the community's id (a printed link, an installed app) or in other letter case: show the
  // clean link in the address bar. Same page, same history entry, same document, so an installed
  // app stays inside its scope and nothing reloads.
  // Not while the buyer's own record is still loading: the load belongs to the address it started at.
  useEffect(() => {
    if (loading || !community?.urlKey || community.urlKey === communityId) return;
    // A bare trailing slash is dropped; a deeper path (tools/payment/) keeps its own.
    const rest = location.pathname.replace(/^\/c\/[^/]+/, '').replace(/^\/+$/, '');
    navigate(`/c/${encodeURIComponent(community.urlKey)}${rest}${location.search}${location.hash}`, { replace: true });
  }, [community, communityId, loading, location.pathname, location.search, location.hash, navigate]);

  // Every route change starts at the top — long tool screens otherwise keep their scroll.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loading) return <Centered>Loading…</Centered>;
  if (loadError) return <Centered>{loadError}</Centered>;
  if (!community) return <Centered>This community link isn’t active anymore. Ask the team for a new one.</Centered>;

  // A trailing slash reaches the same page, so it counts as the same page here.
  const path = location.pathname.replace(/\/+$/, '');
  const isLanding = path === `/c/${communityId}`;
  // A trailing slash reaches the same route, so it has to count as print too.
  const isPrint = /\/plan\/print\/?$/.test(location.pathname);
  // Guides are the one part of the app a visitor reads before giving their
  // details, so on those pages the header offers the way in instead of a menu
  // that would only bounce them to the sign-in page.
  const isGuidePage = location.pathname.startsWith(`/c/${communityId}/guides`);
  const publicGuide = isGuidePage && !signedIn;
  // /start only redirects to the landing page; it is drawn with no header while it does.
  const isStart = path === `/c/${communityId}/start`;
  const showChrome = !isLanding && !isStart && !isPrint;
  const Header = layoutFor(layout).Header ?? BuyerHeader;

  const guard = (element) =>
    signedIn ? element : <Navigate to={`/c/${communityId}`} replace />;

  // "Book a tour" is a call, a text or an email to an agent, not a booking: it goes to the Meet the agents
  // page. With no agent to reach it opens the sheet that lists the sales team to call, text or email. The day
  // and time picker is for talking about financing.
  // Recorded like Explore's "Schedule a Tour", so the builder sees who wanted a tour: no booking is made.
  const realtorsPath = `/c/${communityId}/realtors`;
  const bookTour = () => {
    track(isListing ? 'Asked to schedule a showing' : 'Asked to schedule a tour');
    if (!canReachAgents(features, agents)) setTourTopic('community');
    // Already there: another navigation would only stack a history entry and show nothing, so bring the
    // agents back into view instead.
    else if (path === realtorsPath) window.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate(realtorsPath);
  };
  // Offered only when there is someone to send the buyer to (an agent, or the sales team's phone or email).
  // A sold listing has no showing to ask for.
  const tourPossible = canBookTour(features, agents, settings) && !(isListing && community.status === 'Sold');
  // Recorded like every other way into the lender sheet, so the builder sees who looked at financing.
  const talkFinancing = () => {
    track(`Tapped ${complianceOf(community?.settings, { community }).lender.name || 'the lender'}`);
    setTourTopic('lender');
  };
  // The theme's classes, and for a community's own colours the colour variables themselves (see themeView).
  const view = themeView(community.theme, community.settings);

  return (
    <div className={`b-app ${view.className} l-${layout}`} style={view.style}>
      <a className="b-skip" href="#b-main">Skip to the page</a>
      <StructuredData />
      {showChrome ? (
        <Header
          onOpenMenu={() => setMenuOpen(true)}
          onTalk={tourPossible ? bookTour : null}
          onFinance={talkFinancing}
          signedIn={!publicGuide}
        />
      ) : null}

      <main id="b-main" tabIndex={-1} className="b-main">
        <Routes>
          {/* The one way in: the landing page holds the sign-in. An older link to /start (a printed code, a bookmark, an old button) goes there too. */}
          <Route index element={<Landing onEntered={(result) => !result.returning && !isListing && setTutorialOpen(true)} />} />
          <Route path="start" element={<Navigate to={signedIn ? `/c/${communityId}/${rootSlug(isListing)}` : `/c/${communityId}`} replace />} />
          {isListing ? (
            <>
              {/* A listing is one home: its page is the home screen, and the pages that browse many homes lead back to it. */}
              <Route path="home" element={guard(<HomeDetail onOpenLender={() => setTourTopic('lender')} onRequestShowing={tourPossible ? bookTour : null} />)} />
              <Route path="tools" element={guard(<ListingTools onOpenLender={() => setTourTopic('lender')} />)} />
              <Route path="explore" element={<Navigate to={`/c/${communityId}/home`} replace />} />
              <Route path="saved" element={<Navigate to={`/c/${communityId}/home`} replace />} />
              <Route path="map" element={<Navigate to={`/c/${communityId}/home`} replace />} />
              <Route path="area" element={community.highlights?.length ? guard(<Area />) : <Navigate to={`/c/${communityId}/home`} replace />} />
              <Route path="homes/:homeId" element={guard(<HomeDetail onOpenLender={() => setTourTopic('lender')} onRequestShowing={tourPossible ? bookTour : null} />)} />
            </>
          ) : (
            <>
              <Route path="tools" element={guard(<AllTools onOpenLender={() => setTourTopic('lender')} />)} />
              <Route path="explore" element={guard(<Explore onOpenTour={() => setTourTopic('community')} onOpenLender={() => setTourTopic('lender')} />)} />
              <Route path="area" element={guard(<Area />)} />
              <Route path="map" element={guard(<SiteMap />)} />
              <Route path="homes/:homeId" element={guard(<HomeDetail onOpenLender={() => setTourTopic('lender')} />)} />
              <Route path="saved" element={guard(<Saved />)} />
            </>
          )}
          <Route path="tool/:toolKey" element={guard(<ToolScreen />)} />
          <Route path="plan" element={guard(<Plan onOpenTour={tourPossible ? bookTour : null} onOpenLender={talkFinancing} />)} />
          <Route path="plan/print" element={guard(<PlanPrint />)} />
          <Route path="guides" element={<Guides />} />
          <Route path="guides/:slug" element={<GuideArticle />} />
          <Route path="realtors" element={guard(<Realtors />)} />
          <Route path="*" element={<Navigate to={isListing ? `/c/${communityId}/home` : `/c/${communityId}`} replace />} />
        </Routes>
      </main>

      {/*
        Once, here, so it is on every route: the landing page (which holds the sign-in) and
        every screen behind it. The printed plan is the one exception, and only
        in where it is drawn: PlanPrint puts the same footer inside its document,
        because print CSS shows nothing outside it.
      */}
      {isPrint ? null : <ComplianceFooter />}

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onShowTutorial={() => setTutorialOpen(true)}
        onAddToPhone={() => setAddToPhoneOpen(true)}
        onFinance={talkFinancing}
      />
      <TutorialSheet open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <TourDialog topic={tourTopic} onClose={() => setTourTopic(null)} />
      <AddToPhoneDialog open={addToPhoneOpen} onClose={() => setAddToPhoneOpen(false)} />
      <Toast />
    </div>
  );
}

export default function BuyerApp() {
  const { communityId } = useParams();
  const { pathname } = useLocation();
  // Setup's theme preview: the home screen drawn for the builder, with nobody signed in and nothing recorded.
  if (PREVIEW_PATH_RE.test(pathname)) return <Preview />;
  return (
    <BuyerProvider communityId={communityId}>
      <BuyerShell />
    </BuyerProvider>
  );
}
