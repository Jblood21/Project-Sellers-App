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
  if (layoutKey === 'foyer') {
    // Centred serif title over thin rules, then a numbered list: a printed page.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f8f4ec" />
        <rect x="8" y="9" width="22" height="3" fill="#6b625a" />
        <rect x="62" y="6" width="36" height="7" fill="#2b2622" />
        <rect x="130" y="9" width="22" height="3" fill="#6b625a" />
        <rect x="8" y="17" width="144" height="1" fill="#cfc6b8" />
        <rect x="46" y="23" width="68" height="3" fill="#a8864b" />
        <rect x="30" y="29" width="100" height="1" fill="#cfc6b8" />
        <g fill="#2b2622">
          <rect x="12" y="36" width="8" height="4" /><rect x="26" y="36" width="70" height="4" />
          <rect x="12" y="47" width="8" height="4" /><rect x="26" y="47" width="58" height="4" />
          <rect x="12" y="58" width="8" height="4" /><rect x="26" y="58" width="66" height="4" />
        </g>
        <g fill="#cfc6b8">
          <rect x="12" y="43" width="136" height="1" /><rect x="12" y="54" width="136" height="1" /><rect x="12" y="65" width="136" height="1" />
        </g>
      </svg>
    );
  }
  if (layoutKey === 'marketplace') {
    // A white search bar, a row of filters, then photo-first listing cards three across.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f3f5f7" />
        <rect width="160" height="12" fill="#fff" />
        <rect x="8" y="4" width="24" height="4" fill="#1d2733" />
        <g fill="#5b6675"><rect x="42" y="5" width="12" height="2" /><rect x="58" y="5" width="10" height="2" /><rect x="72" y="5" width="14" height="2" /></g>
        <rect x="124" y="3" width="28" height="6" rx="1.5" fill="#1d4ed8" />
        <g fill="#fff" stroke="#c4ccd6"><rect x="8" y="16" width="26" height="6" rx="1.5" /><rect x="38" y="16" width="20" height="6" rx="1.5" /><rect x="62" y="16" width="24" height="6" rx="1.5" /></g>
        <g fill="#fff" stroke="#d5dbe2">
          <rect x="8" y="27" width="44" height="40" rx="3" /><rect x="58" y="27" width="44" height="40" rx="3" /><rect x="108" y="27" width="44" height="40" rx="3" />
        </g>
        <g fill="#a9c1d9"><rect x="8.5" y="27.5" width="43" height="22" rx="2.5" /><rect x="58.5" y="27.5" width="43" height="22" rx="2.5" /><rect x="108.5" y="27.5" width="43" height="22" rx="2.5" /></g>
        <g fill="#1d2733"><rect x="12" y="53" width="22" height="4" /><rect x="62" y="53" width="22" height="4" /><rect x="112" y="53" width="22" height="4" /></g>
        <g fill="#8794a3"><rect x="12" y="60" width="32" height="2" /><rect x="62" y="60" width="32" height="2" /><rect x="112" y="60" width="32" height="2" /></g>
      </svg>
    );
  }
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
