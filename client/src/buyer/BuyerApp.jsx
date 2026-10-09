import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import { DEFAULT_THEME, THEME_COLORS } from '@shared/domain.js';
import { AddToPhoneDialog, BuyerHeader, MenuDrawer, Toast, TourDialog, TutorialSheet } from './Chrome.jsx';
import { BuyerProvider, useBuyer } from './BuyerContext.jsx';
import ComplianceFooter from './ComplianceFooter.jsx';
import { layoutFor } from './layouts/index.js';
import StructuredData from './StructuredData.jsx';
import AllTools from './screens/AllTools.jsx';
import Area from './screens/Area.jsx';
import Explore from './screens/Explore.jsx';
import GuideArticle from './screens/GuideArticle.jsx';
import Guides from './screens/Guides.jsx';
import HomeDetail from './screens/HomeDetail.jsx';
import Landing from './screens/Landing.jsx';
import Plan from './screens/Plan.jsx';
import PlanPrint from './screens/PlanPrint.jsx';
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

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[community.theme] ?? THEME_COLORS[DEFAULT_THEME];

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
  const { community, layout, loading, loadError, signedIn } = useBuyer();
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
  useEffect(() => {
    if (!community?.urlKey || community.urlKey === communityId) return;
    const rest = location.pathname.replace(/^\/c\/[^/]+/, '');
    navigate(`/c/${encodeURIComponent(community.urlKey)}${rest}${location.search}${location.hash}`, { replace: true });
  }, [community, communityId, location.pathname, location.search, location.hash, navigate]);

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
  const isGate = path === `/c/${communityId}/start`;
  // A trailing slash reaches the same route, so it has to count as print too.
  const isPrint = /\/plan\/print\/?$/.test(location.pathname);
  // Guides are the one part of the app a visitor reads before giving their
  // details, so on those pages the header offers the way in instead of a menu
  // that would only bounce them to the contact gate.
  const isGuidePage = location.pathname.startsWith(`/c/${communityId}/guides`);
  const publicGuide = isGuidePage && !signedIn;
  const showChrome = !isLanding && !isGate && !isPrint;
  const Header = layoutFor(layout).Header ?? BuyerHeader;

  const guard = (element) =>
    signedIn ? element : <Navigate to={`/c/${communityId}/start`} replace />;

  return (
    <div className={`b-app t-${community.theme} l-${layout}`}>
      <a className="b-skip" href="#b-main">Skip to the page</a>
      <StructuredData />
      {showChrome ? (
        <Header
          onOpenMenu={() => setMenuOpen(true)}
          onTalk={() => setTourTopic('community')}
          signedIn={!publicGuide}
        />
      ) : null}

      <main id="b-main" tabIndex={-1} className="b-main">
        <Routes>
          <Route index element={<Landing onEntered={(result) => !result.returning && setTutorialOpen(true)} />} />
          <Route
            path="start"
            element={
              signedIn ? (
                <Navigate to={`/c/${communityId}/tools`} replace />
              ) : (
                <Landing onEntered={(result) => !result.returning && setTutorialOpen(true)} />
              )
            }
          />
          <Route path="tools" element={guard(<AllTools onOpenLender={() => setTourTopic('lender')} />)} />
          <Route path="explore" element={guard(<Explore />)} />
          <Route path="area" element={guard(<Area />)} />
          <Route path="map" element={guard(<SiteMap />)} />
          <Route path="homes/:homeId" element={guard(<HomeDetail onOpenLender={() => setTourTopic('lender')} />)} />
          <Route path="tool/:toolKey" element={guard(<ToolScreen />)} />
          <Route path="saved" element={guard(<Saved />)} />
          <Route path="plan" element={guard(<Plan onOpenTour={() => setTourTopic('community')} />)} />
          <Route path="plan/print" element={guard(<PlanPrint />)} />
          <Route path="guides" element={<Guides />} />
          <Route path="guides/:slug" element={<GuideArticle />} />
          <Route path="realtors" element={guard(<Realtors />)} />
          <Route path="*" element={<Navigate to={`/c/${communityId}`} replace />} />
        </Routes>
      </main>

      {/*
        Once, here, so it is on every route: the landing page, the gate and
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
  return (
    <BuyerProvider communityId={communityId}>
      <BuyerShell />
    </BuyerProvider>
  );
}
