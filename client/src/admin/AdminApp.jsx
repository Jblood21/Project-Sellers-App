import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AdminProvider, useAdmin } from './AdminContext.jsx';
import Activity from './screens/Activity.jsx';
import Branches from './screens/Branches.jsx';
import CommunityDetail from './screens/CommunityDetail.jsx';
import ForgotPassword from './screens/ForgotPassword.jsx';
import Login from './screens/Login.jsx';
import Profile from './screens/Profile.jsx';
import AgentSignup from './screens/AgentSignup.jsx';
import AuthCard from './screens/AuthCard.jsx';
import ResetPassword from './screens/ResetPassword.jsx';
import Team from './screens/Team.jsx';
import Today from './screens/Today.jsx';
import { Spinner } from './ui.jsx';

/**
 * One CommunityDetail per community, remade when the address changes community. Without the key, an answer still on
 * its way from the community you just left could land on the one you opened, and the page would show the wrong one.
 */
function KeyedCommunity() {
  const { communityId } = useParams();
  return <CommunityDetail key={communityId} />;
}

/**
 * The pages only the owner has (Team, Branches, Activity). A member who types the address is sent to Today instead. Until
 * /me has said who this is (a beat after signing in) the page is left to load; the server refuses it anyway.
 */
function OwnerOnly({ children }) {
  const { admin } = useAdmin();
  if (admin?.role && admin.role !== 'owner') return <Navigate to="/admin" replace />;
  return children;
}

/**
 * What shows while the app asks the server who is signed in. When the server cannot be reached (no signal, a restart
 * during an update) the person is not signed out and the sign-in form does not appear: this says so and offers Retry,
 * and the app also asks again by itself when the browser comes back online and on a short backoff.
 */
function SessionCheck() {
  const { checking, unreachable, retryCheck } = useAdmin();
  if (!unreachable) return <div className="a-shell"><Spinner label="Checking your sign-in…" /></div>;
  return (
    <AuthCard
      title="Can't reach the site."
      blurb="You are still signed in. This page tries again by itself when your signal is back."
      focusTitle
    >
      <button
        type="button" className="btn btn-primary btn-block" onClick={() => !checking && retryCheck()}
        aria-disabled={checking || undefined} style={{ minHeight: 46 }}
      >
        {checking ? 'Trying…' : 'Retry'}
      </button>
    </AuthCard>
  );
}

function AdminRoutes() {
  const { token, checking, unreachable } = useAdmin();

  if (checking || unreachable) return <SessionCheck />;
  // The reset link from the email has to work whoever is signed in on this browser (the owner may well
  // be, on a phone whose session has not ended yet), so it and the form that asks for a new one are
  // routed on both sides of the sign-in.
  if (!token) {
    return (
      <Routes>
        <Route path="signup" element={<AgentSignup />} />
        <Route path="forgot" element={<ForgotPassword />} />
        <Route path="reset" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route index element={<Today />} />
      <Route path="profile" element={<Profile />} />
      <Route path="team" element={<OwnerOnly><Team /></OwnerOnly>} />
      <Route path="branches" element={<OwnerOnly><Branches /></OwnerOnly>} />
      <Route path="activity" element={<OwnerOnly><Activity /></OwnerOnly>} />
      <Route path="communities/:communityId/*" element={<KeyedCommunity />} />
      <Route path="forgot" element={<ForgotPassword />} />
      <Route path="reset" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default function AdminApp() {
  return (
    <AdminProvider>
      <AdminRoutes />
    </AdminProvider>
  );
}
