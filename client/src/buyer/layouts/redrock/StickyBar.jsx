import { Link, useLocation, useParams } from 'react-router-dom';

/**
 * The bar pinned to the foot of a phone: book a tour, talk about financing, and the buyer's plan, as the
 * board's two buttons (rust, then the light one) with the plan beside them.
 *
 * It is Ridgeline's bar in Red Rock's clothes and keeps its rules. "Book a tour" goes to the Meet the
 * agents page (it books no time) and is there only when there is someone to send the buyer to. "Talk
 * about financing" is there only when the community has a lender set up and its sheet has something to
 * do. On the plan itself the plan link would only reload the page, so it is left out there; and with
 * nothing left to show the bar is not drawn at all, so no empty landmark is left behind.
 *
 * The header renders it into the end of the app shell, so it follows the page in the tab order the way
 * it follows it on screen. The stylesheet hides it from 900px, where the header carries the same
 * actions, and gives the footer room under it while it shows so it never covers the last line.
 */
export default function StickyBar({ onTalk, onFinance }) {
  const { communityId } = useParams();
  const { pathname } = useLocation();
  const onPlan = /\/plan\/?$/.test(pathname);
  if (!onTalk && !onFinance && onPlan) return null;

  return (
    <nav className="rr-stick" aria-label="Quick actions">
      {onTalk ? (
        <button type="button" className="rr-stick__btn rr-stick__btn--tour" onClick={onTalk}>
          Book a tour
        </button>
      ) : null}
      {onFinance ? (
        <button type="button" className="rr-stick__btn rr-stick__btn--finance" onClick={onFinance}>
          Talk about financing
        </button>
      ) : null}
      {onPlan ? null : (
        <Link className="rr-stick__btn rr-stick__btn--plan" to={`/c/${communityId}/plan`}>
          My Home Plan
        </Link>
      )}
    </nav>
  );
}
