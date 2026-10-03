import { useState } from 'react';

import { MAX_AGENTS } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';
import AgentEditor from './AgentEditor.jsx';

/**
 * The community's realtors, up to MAX_AGENTS. The server enforces that limit
 * too; the button here only stops a builder reaching a refusal they could have
 * been told about in advance.
 */
export default function RealtorsCard({ community, reload }) {
  const { token } = useAdmin();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const agents = community.agents ?? [];
  const full = agents.length >= MAX_AGENTS;
  const shown = Boolean(community.features?.agents);

  const show = async () => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { agents: true } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Realtors</span>
        <span className="tag tag-neutral" aria-live="polite">{agents.length} of {MAX_AGENTS} added</span>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        Agents buyers can contact about homes here. They appear under every home and on a Realtors page.
        Changes here save on their own, not with the Save settings button.
      </p>

      {agents.length && !shown ? (
        <div className="ax-callout">
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            Buyers are not seeing these realtors. <strong>Realtors</strong> is switched off under Tools.
          </span>
          <button type="button" className="btn btn-secondary" onClick={show} style={{ alignSelf: 'flex-start', minHeight: 44 }}>
            Show them
          </button>
        </div>
      ) : null}

      {agents.map((agent, index) => (
        <AgentEditor key={agent.id} agent={agent} index={index} community={community} reload={reload} />
      ))}

      {adding ? (
        <AgentEditor
          agent={null} community={community} reload={reload}
          onClose={() => setAdding(false)}
          onCreated={(message) => {
            setAdding(false);
            setNotice(message);
          }}
        />
      ) : null}

      {notice ? <p className="ax-callout" role="status" style={{ margin: 0, fontSize: 13 }}>{notice}</p> : null}

      {!adding ? (
        <>
          <button
            type="button" className="btn btn-primary" disabled={full}
            aria-describedby={full ? 'ax-agents-full' : undefined}
            onClick={() => {
              setNotice('');
              setAdding(true);
            }}
            style={{ minHeight: 46 }}
          >
            ＋ Add a realtor
          </button>
          {full ? (
            <span id="ax-agents-full" className="text-muted" style={{ fontSize: 12.5 }}>
              {MAX_AGENTS} is the most a community can list. Remove one to add another.
            </span>
          ) : null}
        </>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
