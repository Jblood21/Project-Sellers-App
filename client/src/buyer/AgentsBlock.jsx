import AgentCard from './AgentCard.jsx';
import { useBuyer } from './BuyerContext.jsx';

/**
 * The agent, listed on the page: "Meet the agent." and then everything a buyer
 * needs to reach them, with a button that starts a tour request. It is the body
 * of the home screen's "Schedule your tour." section; the layout supplies the
 * section's own heading so it looks like its neighbours.
 *
 * One agent reads "Meet the agent." and several read "Meet the agents.", because
 * a heading that says one person over four cards is wrong on its face. The
 * cards are full cards, listed here rather than behind a link, so nothing a buyer
 * needs is a tap away.
 */
export default function AgentsBlock({ homeName }) {
  const { agents } = useBuyer();
  if (!agents.length) return null;
  return (
    <div className="b-tour">
      <h3 className="b-tour__meet b-head">{agents.length > 1 ? 'Meet the agents.' : 'Meet the agent.'}</h3>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} headingLevel={4} homeName={homeName} />
      ))}
    </div>
  );
}
