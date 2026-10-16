import { Link, useLocation, useParams } from 'react-router-dom';

/**
 * The bar pinned to the foot of a phone: book a tour, talk about financing, and
 * the buyer's plan. The financing button is there only when the community has a
 * lender set up (the same test the Financing section on the home screen uses),
 * and it opens the same day-and-time sheet as "Book a tour", for the lender.
 *
 * It is rendered by the layout's header because BuyerApp mounts the header on
 * every route that has chrome, and the contact gate, the landing page and the
 * printed plan are exactly the routes that do not, so the bar never appears on
 * them. The stylesheet hides it from 900px, where the header carries the same
 * actions, and gives the footer room underneath it while it shows so it cannot
 * cover the last control or the disclosures.
 *
 * On the plan itself the plan button would only reload the page the buyer is
 * on, so it is left out there. The buttons share the width equally, however
 * many there are.
 */
export default function StickyBar({ onTalk, onFinance }) {
  const { communityId } = useParams();
  const { pathname } = useLocation();
  const onPlan = /\/plan\/?$/.test(pathname);
  return (
    <nav className="sg-stick" aria-label="Quick actions">
      <button type="button" className="sg-stick__talk" onClick={onTalk}>
        Book a tour
      </button>
      {onFinance ? (
        <button type="button" className="sg-stick__finance" onClick={onFinance}>
          Talk about financing
        </button>
      ) : null}
      {onPlan ? null : (
        <Link className="sg-stick__plan" to={`/c/${communityId}/plan`}>
          My Home Plan
        </Link>
      )}
    </nav>
  );
}
