import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminProvider, useAdmin } from './AdminContext.jsx';
import Communities from './screens/Communities.jsx';
import CommunityDetail from './screens/CommunityDetail.jsx';
import Login from './screens/Login.jsx';
import { Spinner } from './ui.jsx';

function AdminRoutes() {
  const { token, checking } = useAdmin();

  if (checking) return <div className="a-shell"><Spinner /></div>;
  if (!token) return <Login />;

  return (
    <Routes>
      <Route index element={<Communities />} />
      <Route path="communities/:communityId/*" element={<CommunityDetail />} />
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
