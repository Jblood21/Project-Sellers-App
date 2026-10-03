import { Link, useLocation, useParams } from 'react-router-dom';

/**
 * The two-button bar pinned to the foot of a phone: talk to the team, and the
 * buyer's plan.
 *
 * It is rendered by the layout's header because BuyerApp mounts the header on
 * every route that has chrome, and the contact gate, the landing page and the
 * printed plan are exactly the routes that do not, so the bar never appears on
 * them. The stylesheet hides it from 900px, where the header carries the same
 * two actions, and gives the footer room underneath it while it shows so it
 * cannot cover the last control or the disclosures.
 *
 * On the plan itself the second button would only reload the page the buyer is
 * on, so the bar is the talk button alone there.
 */
export default function StickyBar({ onTalk }) {
  const { communityId } = useParams();
  const { pathname } = useLocation();
  const onPlan = /\/plan\/?$/.test(pathname);
  return (
    <nav className={`sg-stick${onPlan ? ' sg-stick--solo' : ''}`} aria-label="Quick actions">
      <button type="button" className="sg-stick__talk" onClick={onTalk}>
        Talk to the team
      </button>
      {onPlan ? null : (
        <Link className="sg-stick__plan" to={`/c/${communityId}/plan`}>
          My Home Plan
        </Link>
      )}
    </nav>
  );
}
