import { useState } from 'react';


import AgentEditor from './AgentEditor.jsx';

/**
 * A listing's agent card: the person who made the listing, and the one buyers call, text or email. It edits the one
 * agent row (no team, no Add, no Remove). If the listing has no agent row yet, the same form makes it.
 */
export default function ListingAgentCard({ community, reload }) {
  const agent = community.agents?.[0] ?? null;
  const [notice, setNotice] = useState('');
  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <span className="card-kicker">Listing agent</span>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        This is you. Visitors see your face, name and brokerage above the home&apos;s pictures, and these details under
        &ldquo;Meet your agent&rdquo; and &ldquo;Want a showing?&rdquo;, where they can call, text or email you. Add a clear photo of your face below. Changes here save on their own, not with the Save settings button.
      </p>
      <AgentEditor
        key={agent?.id ?? 'new'} single agent={agent} index={0} community={community} reload={reload}
        onCreated={setNotice}
      />
      {notice ? <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 14 }}>{notice}</p> : null}
    </div>
  );
}
