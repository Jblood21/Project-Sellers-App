import { Component, Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import BuyerApp from './buyer/BuyerApp.jsx';

const RELOADED = 'psa-chunk-reloaded';

/**
 * lazy(), but a chunk that cannot be fetched is retried once by reloading the page.
 *
 * A deploy renames every chunk. A tab that was open before it still holds the old
 * index, so the first time it asks for the admin it asks for a file that is gone.
 * Reloading fetches the new index and the new name; a second failure is a real
 * outage and is shown, not looped on.
 */
function lazyWithReload(load) {
  return lazy(() => load().then(
    (module) => {
      try { window.sessionStorage.removeItem(RELOADED); } catch { /* storage can be blocked */ }
      return module;
    },
    (error) => {
      try {
        if (!window.sessionStorage.getItem(RELOADED)) {
          window.sessionStorage.setItem(RELOADED, '1');
          window.location.reload();
          // Never settles: the page is about to be replaced, so nothing renders in between.
          return new Promise(() => {});
        }
      } catch { /* storage can be blocked: fall through to the message */ }
      throw error;
    },
  ));
}

// The admin is loaded only for the people who open it. A buyer on a phone never
// needs it, and it is a large share of the code the app ships.
const AdminApp = lazyWithReload(() => import('./admin/AdminApp.jsx'));

/** Shows a message instead of a blank page when a part of the app cannot load. */
class LoadFailure extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <p>This part of the app could not load. Check your connection and reload the page.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 18px' }}>
          Reload
        </button>
      </div>
    );
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/c/:communityId/*" element={<BuyerApp />} />
      <Route
        path="/admin/*"
        element={(
          <LoadFailure>
            <Suspense fallback={<p role="status" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Loading…</p>}>
              <AdminApp />
            </Suspense>
          </LoadFailure>
        )}
      />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
