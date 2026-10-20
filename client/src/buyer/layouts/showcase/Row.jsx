import { ChevronRight } from './icons.jsx';

/** The mark a tool carries once its answer is in the plan. The words are there too, so colour is not the only sign. */
function InPlan() {
  return (
    <span className="sc-inplan">
      <span aria-hidden="true">✓ </span>In your plan
    </span>
  );
}

/** One tool, or one place near the community, as a row: its name, what it answers, and a chevron. */
export default function Row({ title, sub, done, icon, onOpen }) {
  return (
    <li>
      <button type="button" className="sc-row" onClick={onOpen}>
        {icon ? <span className="sc-row__icon">{icon}</span> : null}
        <span className="sc-row__text">
          <span className="sc-row__title">
            {title}
            {done ? <InPlan /> : null}
          </span>
          <span className="sc-row__sub">{sub}</span>
        </span>
        <span className="sc-row__go"><ChevronRight /></span>
      </button>
    </li>
  );
}
