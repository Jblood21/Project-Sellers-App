import { useState } from 'react';

import { normalizeAgentTop } from '@shared/listing.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';

import AgentEditor from './AgentEditor.jsx';

/**
 * A listing's agent card: the person who made the listing, and the one buyers call, text or email. It edits the one
 * agent row (no team, no Add, no Remove). If the listing has no agent row yet, the same form makes it.
 */
export default function ListingAgentCard({ community, reload }) {
  const agent = community.agents?.[0] ?? null;
  const { token } = useAdmin();
  const [notice, setNotice] = useState('');
  const current = normalizeAgentTop(community.settings?.agentTop);
  const [style, setStyle] = useState(current);
  const [styleError, setStyleError] = useState('');
  // Saved the moment it is picked, like the layout and theme: the same request every other Setup choice sends.
  const choose = async (next) => {
    if (next === style) return;
    const before = style;
    setStyle(next);
    setStyleError('');
    try {
      await adminApi.updateCommunity(token, community.id, { settings: { agentTop: next } });
      await reload?.();
    } catch (err) {
      setStyle(before);
      setStyleError(err.message || 'Not saved. Check your connection.');
    }
  };
  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <span className="card-kicker">Listing agent</span>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        This is you. Visitors see these details under &ldquo;Meet your agent&rdquo; and &ldquo;Want a showing?&rdquo;, and
        they can call, text or email you from there. Changes here save on their own, not with the Save settings button.
      </p>
      <AgentEditor
        key={agent?.id ?? 'new'} single agent={agent} index={0} community={community} reload={reload}
        onCreated={setNotice}
      />
      <fieldset className="ax-fieldset" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="card-kicker" style={{ padding: 0 }}>How you show above the photos</legend>
        <p className="text-muted" style={{ fontSize: 14, margin: '4px 0 8px' }}>
          Visitors see your face, name and brokerage before the home&apos;s pictures. Add a clear photo of your face below.
        </p>
        <div className="ax-choices" role="radiogroup" aria-label="How you show above the photos">
          {[
            ['compact', 'Compact', 'One slim row: your face, name and brokerage, with Call and Text.'],
            ['featured', 'Featured', 'A card with a big portrait, your licence and contact details, and Call, Text and Email.'],
          ].map(([key, name, note]) => (
            <button
              key={key} type="button" className="ax-choice" role="radio" aria-checked={style === key} aria-pressed={style === key}
              onClick={() => choose(key)}
            >
              <span className="ax-choice-head">
                <span className="ax-choice-name">{name}</span>
                {style === key ? <span className="tag tag-accent">In use</span> : null}
              </span>
              <span className="ax-choice-note">{note}</span>
            </button>
          ))}
        </div>
        {styleError ? <p role="alert" className="text-danger" style={{ fontSize: 14, margin: '6px 0 0' }}>{styleError}</p> : null}
      </fieldset>
      {notice ? <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14 }}>{notice}</p> : null}
    </div>
  );
}
