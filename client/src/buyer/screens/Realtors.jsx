import { Navigate, useParams } from 'react-router-dom';

import AgentCard from '../AgentCard.jsx';
import { useBuyer } from '../BuyerContext.jsx';

/**
 * The real estate agents the builder lists for this community, up to four.
 *
 * The server sends an empty list when the builder has agents switched off, and
 * the menu does not link here then; someone arriving by an old link is sent to
 * the tools rather than shown an empty page.
 */
export default function Realtors() {
  const { community, agents, features } = useBuyer();
  const { communityId } = useParams();

  if (!features.agents) return <Navigate to={`/c/${communityId}/tools`} replace />;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>
        {agents.length > 1 ? 'Meet the agents' : 'Meet the agent'}
      </h1>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        {agents.length
          ? `Call, text or email to schedule your tour of ${community?.name}.`
          : 'No agents have been listed yet — ask the team who to talk to.'}
      </p>

      <div className="b-stack" style={{ gap: 12 }}>
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} headingLevel={2} />
        ))}
      </div>
    </div>
  );
}
