import { useState } from 'react';

import { LAYOUTS, normalizeLayout } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';

/**
 * A rough wireframe of each layout, so the choice is not made from a name alone.
 * Decorative: the name and note beside it carry the meaning.
 */
function Wire({ layoutKey }) {
  if (layoutKey === 'saltgrass') {
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f4f6f8" />
        <rect width="160" height="14" fill="#17202e" />
        <rect y="14" width="160" height="2" fill="#c9a227" />
        <rect x="10" y="24" width="86" height="8" fill="#17202e" />
        <rect x="10" y="35" width="52" height="8" fill="#17202e" />
        <rect x="10" y="50" width="62" height="14" rx="2" fill="#c9a227" />
        <rect x="104" y="24" width="46" height="40" rx="2" fill="#fff" stroke="#17202e" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
      <rect width="160" height="72" fill="#f6f4ee" />
      <rect width="160" height="12" fill="#fff" />
      <rect x="112" y="3" width="42" height="6" rx="3" fill="#4e7758" />
      <rect x="10" y="18" width="62" height="22" rx="8" fill="#e9efe9" />
      <rect x="78" y="18" width="72" height="22" rx="8" fill="#fff" stroke="#d7d4c9" />
      <rect x="10" y="46" width="62" height="20" rx="8" fill="#fff" stroke="#d7d4c9" />
      <rect x="78" y="46" width="72" height="20" rx="8" fill="#fff" stroke="#d7d4c9" />
    </svg>
  );
}

/**
 * Picks the buyer app's layout: type, shape and where things sit. Colour is the
 * theme's job and tool behaviour is nobody's, so this saves at once the way the
 * theme picker does, and nothing about it waits on the Save settings button.
 */
export default function LayoutCard({ community, reload }) {
  const { token } = useAdmin();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const current = normalizeLayout(community.layout);

  const choose = async (layout) => {
    if (layout === current || saving) return;
    setError('');
    setSaving(layout);
    try {
      await adminApi.updateCommunity(token, community.id, { layout });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <span className="card-kicker">Buyer app layout</span>
      <div className="ax-choices">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.k}
            type="button"
            className="ax-choice"
            aria-pressed={current === layout.k}
            disabled={Boolean(saving)}
            onClick={() => choose(layout.k)}
          >
            <Wire layoutKey={layout.k} />
            <span className="ax-choice-head">
              <span className="ax-choice-name">{layout.name}</span>
              {current === layout.k ? <span className="tag tag-accent">In use</span> : null}
              {saving === layout.k ? <span className="text-muted" style={{ fontSize: 12 }}>Saving…</span> : null}
            </span>
            <span className="ax-choice-note">{layout.note}</span>
          </button>
        ))}
      </div>
      <span className="text-muted" style={{ fontSize: 12 }}>
        Changes the type, the shapes and where buttons sit, instantly. Every tool does exactly
        what it did before, and the theme below still sets the colours.
      </span>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
