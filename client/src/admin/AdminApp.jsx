import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AdminProvider, useAdmin } from './AdminContext.jsx';
import CommunityDetail from './screens/CommunityDetail.jsx';
import ForgotPassword from './screens/ForgotPassword.jsx';
import Login from './screens/Login.jsx';
import ResetPassword from './screens/ResetPassword.jsx';
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

function AdminRoutes() {
  const { token, checking } = useAdmin();

  if (checking) return <div className="a-shell"><Spinner /></div>;
  // The reset link from the email has to work whoever is signed in on this browser (the owner may well
  // be, on a phone whose session has not ended yet), so it and the form that asks for a new one are
  // routed on both sides of the sign-in.
  if (!token) {
    return (
      <Routes>
        <Route path="forgot" element={<ForgotPassword />} />
        <Route path="reset" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route index element={<Today />} />
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
