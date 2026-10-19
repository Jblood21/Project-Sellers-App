import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AdminProvider, useAdmin } from './AdminContext.jsx';
import CommunityDetail from './screens/CommunityDetail.jsx';
import Login from './screens/Login.jsx';
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
  if (!token) return <Login />;

  return (
    <Routes>
      <Route index element={<Today />} />
      <Route path="communities/:communityId/*" element={<KeyedCommunity />} />
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
