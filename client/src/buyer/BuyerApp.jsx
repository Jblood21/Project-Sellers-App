import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { DEFAULT_THEME, THEME_COLORS } from '@shared/domain.js';
import { AddToPhoneDialog, BuyerHeader, MenuDrawer, Toast, TourDialog, TutorialSheet } from './Chrome.jsx';
import { BuyerProvider, useBuyer } from './BuyerContext.jsx';
import AllTools from './screens/AllTools.jsx';
import Area from './screens/Area.jsx';
import Explore from './screens/Explore.jsx';
import Gate from './screens/Gate.jsx';
import HomeDetail from './screens/HomeDetail.jsx';
import Landing from './screens/Landing.jsx';
import Plan from './screens/Plan.jsx';
import PlanPrint from './screens/PlanPrint.jsx';
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
  const { community, lead, loading, loadError, token } = useBuyer();
  const { communityId } = useParams();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // null when closed; otherwise the topic the sheet was opened for, so the
  // booking that comes out of it says what it is about.
  const [tourTopic, setTourTopic] = useState(null);
  const [addToPhoneOpen, setAddToPhoneOpen] = useState(false);

  useCommunityChrome(community, communityId);

  // Every route change starts at the top — long tool screens otherwise keep their scroll.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loading) return <Centered>Loading…</Centered>;
  if (loadError) return <Centered>{loadError}</Centered>;
  if (!community) return <Centered>That community link is no longer active.</Centered>;

  const isLanding = location.pathname === `/c/${communityId}`;
  const isGate = location.pathname === `/c/${communityId}/start`;
  const isPrint = location.pathname.endsWith('/plan/print');
  const signedIn = Boolean(token && lead);
  const showChrome = !isLanding && !isGate && !isPrint;

  const guard = (element) =>
    signedIn ? element : <Navigate to={`/c/${communityId}/start`} replace />;

  return (
    <div className={`b-app t-${community.theme}`}>
      {showChrome ? <BuyerHeader onOpenMenu={() => setMenuOpen(true)} /> : null}

      <Routes>
        <Route index element={<Landing onAddToPhone={() => setAddToPhoneOpen(true)} />} />
        <Route
          path="start"
          element={
            signedIn ? (
              <Navigate to={`/c/${communityId}/tools`} replace />
            ) : (
              <Gate onEntered={(result) => !result.returning && setTutorialOpen(true)} />
            )
          }
        />
        <Route path="tools" element={guard(<AllTools onOpenLender={() => setTourTopic('lender')} />)} />
        <Route path="explore" element={guard(<Explore />)} />
        <Route path="area" element={guard(<Area />)} />
        <Route path="map" element={guard(<SiteMap />)} />
        <Route path="homes/:homeId" element={guard(<HomeDetail onOpenTour={() => setTourTopic('community')} />)} />
        <Route path="tool/:toolKey" element={guard(<ToolScreen />)} />
        <Route path="saved" element={guard(<Saved />)} />
        <Route path="plan" element={guard(<Plan onOpenTour={() => setTourTopic('community')} />)} />
        <Route path="plan/print" element={guard(<PlanPrint />)} />
        <Route path="*" element={<Navigate to={`/c/${communityId}`} replace />} />
      </Routes>

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
