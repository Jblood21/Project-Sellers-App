import { Link } from 'react-router-dom';

import { BookGlyph, CalcGlyph, HouseGlyph, ListGlyph } from './icons.jsx';

/**
 * Showcase's four places, drawn twice from this one list so the two can never disagree: as the floating tab
 * bar at the foot of a phone, and as the text nav in the slim top bar on a wide screen (the stylesheet shows
 * one or the other). Homes, My numbers, My plan, and Learn while the guides are on (the same condition the
 * menu uses, so neither offers a page the other would not).
 *
 * Where the buyer is, is said in the markup as well as the colour: the page an entry leads to is
 * aria-current="page", and a page under it (a home under Homes, a guide under Learn) is aria-current="true".
 * On its own page an entry is not a link at all (a link to the page you are on only reloads it), with one
 * exception: Homes on the home screen scrolls back up to the carousel, which is what a buyer tapping it
 * there wants. My numbers is a button, because it opens a sheet over the page rather than going anywhere.
 */
export default function Sections({ variant, base, path, hasGuides, onHomes, onNumbers }) {
  const tabs = variant === 'tabs';
  const cls = tabs ? 'sc-tab' : 'sc-nav__a';
  const atHome = path === `${base}/tools`;
  const underHomes = path === `${base}/explore` || path.startsWith(`${base}/homes/`);
  const onPlan = path === `${base}/plan`;
  const onGuides = path === `${base}/guides`;
  const underGuides = path.startsWith(`${base}/guides/`);
  const icon = (glyph) => (tabs ? <span className="sc-tab__icon">{glyph}</span> : null);

  // An ordinary click on Homes, on the home screen, goes back up to the homes; anything else (a new tab, a
  // modified click) is left to the link.
  const homes = (event) => {
    if (!atHome || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onHomes();
  };

  return (
    <ul className={tabs ? 'sc-tabs__list' : 'sc-nav__list'} role="list">
      <li>
        <Link
          to={`${base}/tools`}
          className={cls}
          aria-current={atHome ? 'page' : underHomes ? 'true' : undefined}
          onClick={homes}
        >
          {icon(<HouseGlyph />)}
          <span className="sc-tab__word">Homes</span>
        </Link>
      </li>
      <li>
        <button type="button" className={cls} aria-haspopup="dialog" onClick={onNumbers}>
          {icon(<CalcGlyph />)}
          <span className="sc-tab__word">My numbers</span>
        </button>
      </li>
      <li>
        {onPlan ? (
          <span className={cls} aria-current="page">
            {icon(<ListGlyph />)}
            <span className="sc-tab__word">My plan</span>
          </span>
        ) : (
          <Link to={`${base}/plan`} className={cls}>
            {icon(<ListGlyph />)}
            <span className="sc-tab__word">My plan</span>
          </Link>
        )}
      </li>
      {hasGuides ? (
        <li>
          {onGuides ? (
            <span className={cls} aria-current="page">
              {icon(<BookGlyph />)}
              <span className="sc-tab__word">Learn</span>
            </span>
          ) : (
            <Link to={`${base}/guides`} className={cls} aria-current={underGuides ? 'true' : undefined}>
              {icon(<BookGlyph />)}
              <span className="sc-tab__word">Learn</span>
            </Link>
          )}
        </li>
      ) : null}
    </ul>
  );
}
