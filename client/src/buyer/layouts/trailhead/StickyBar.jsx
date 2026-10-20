import { Link, useLocation, useParams } from 'react-router-dom';

import { ArrowRight, Calendar } from './icons.jsx';
import { stopLink } from './trail.js';

/**
 * The bar pinned to the foot of a phone, on the page's own light ground as the board draws it.
 *
 * On the home screen it carries the one thing to do next: "Continue:" and the current stop's name, which
 * opens that stop, with Book a tour beside it. Once every stop is done the big button is My Home Plan, where
 * what the buyer worked out is kept. On every other page it is Red Rock's bar: Book a tour, Talk about
 * financing and My Home Plan.
 *
 * It keeps the rules every bar follows. Book a tour is there only when there is someone to send the buyer to
 * (onTalk), Talk about financing only when the lender's sheet has something to do (onFinance), and the plan
 * link is left out on the plan itself, where it would only reload the page. With nothing left to show the
 * bar is not drawn at all, so no empty landmark is left behind.
 *
 * The header renders it into the end of the app shell, so it follows the page in the tab order the way it
 * follows it on screen. The stylesheet hides it from 900px, where the header carries the same actions, and
 * gives the footer room under it while it shows so it never covers the last line.
 */
export default function StickyBar({ onTalk, onFinance, trail, model }) {
  const { communityId } = useParams();
  const { pathname } = useLocation();
  const base = `/c/${communityId}`;
  const atHome = /\/tools\/?$/.test(pathname);
  const onPlan = /\/plan\/?$/.test(pathname);

  if (atHome && trail.total) {
    const stop = trail.current;
    const go = stop ? stopLink(stop, model) : null;
    return (
      <nav className="th-stick th-stick--home" aria-label="Quick actions">
        {stop ? (
          <Link to={go.to} state={go.state} onClick={go.onClick} className="th-stick__btn th-stick__btn--go">
            <span className="th-stick__words">
              <span className="th-stick__small">Continue:</span>
              <span className="th-stick__big">{stop.name}</span>
            </span>
            <ArrowRight />
          </Link>
        ) : (
          <Link to={`${base}/plan`} className="th-stick__btn th-stick__btn--go">
            <span className="th-stick__words">
              <span className="th-stick__small">Every stop is done</span>
              <span className="th-stick__big">My Home Plan</span>
            </span>
            <ArrowRight />
          </Link>
        )}
        {onTalk ? (
          <button type="button" className="th-stick__btn th-stick__btn--tour" onClick={onTalk}>
            <Calendar />
            Book a tour
          </button>
        ) : null}
      </nav>
    );
  }

  if (!onTalk && !onFinance && onPlan) return null;
  return (
    <nav className="th-stick" aria-label="Quick actions">
      {onTalk ? (
        <button type="button" className="th-stick__btn th-stick__btn--go" onClick={onTalk}>
          Book a tour
        </button>
      ) : null}
      {onFinance ? (
        <button type="button" className="th-stick__btn th-stick__btn--line" onClick={onFinance}>
          Talk about financing
        </button>
      ) : null}
      {onPlan ? null : (
        <Link className="th-stick__btn th-stick__btn--line" to={`${base}/plan`}>
          My Home Plan
        </Link>
      )}
    </nav>
  );
}
