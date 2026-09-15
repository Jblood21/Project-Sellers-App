import { Navigate, Route, Routes } from 'react-router-dom';

import AdminApp from './admin/AdminApp.jsx';
import BuyerApp from './buyer/BuyerApp.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/c/:communityId/*" element={<BuyerApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
