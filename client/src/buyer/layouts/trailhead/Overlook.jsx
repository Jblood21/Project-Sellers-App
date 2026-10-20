import { Link } from 'react-router-dom';

import { PROGRAMS, calcPayment, isSold, listHomes, money, num, ratesOf } from '@shared/domain.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import { Heart, HouseGlyph } from './icons.jsx';

/** How many homes the overlook shows before "See all": a small row, not the whole list. */
const OVERLOOK_HOMES = 6;

/**
 * How many homes sit side by side in the row; with more, it scrolls sideways (the stylesheet's :nth-child(4)
 * rule). A row that scrolls is followed by "See all", as a mouse with no sideways wheel cannot reach the rest.
 */
const ROW_FITS = 3;

/**
 * What the sum holds besides the loan, read as words: ", with taxes, insurance and HOA". Each part is named only
 * when it is in the sum, so a community with no HOA, or no insurance figure set, is not told it pays one. With
 * nothing besides the loan it says so, rather than leaving the reader to guess.
 */
function inTheSum(result) {
  const parts = [];
  if (result.tax > 0) parts.push('taxes');
  if (result.insurance > 0) parts.push('insurance');
  if (result.mi > 0) parts.push('mortgage insurance');
  if (result.hoa > 0) parts.push('HOA');
  if (!parts.length) return ', with nothing added for taxes, insurance or HOA';
  if (parts.length === 1) return `, with ${parts[0]}`;
  return `, with ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The loan as it is said aloud: "an FHA loan", "a VA loan", "a Conventional loan". The article follows the
 * sound, not the letter, so FHA ("eff") takes "an" and VA ("vee") takes "a".
 */
function loanWords(program) {
  const name = PROGRAMS[program] ?? program;
  return `${/^(FHA|[AEIO])/i.test(name) ? 'an' : 'a'} ${name} loan`;
}

/** Text a screen reader hears that the eye does not need, such as "a month" after "/mo". */
export function Hidden({ children }) {
  return <span className="th-vh">{children}</span>;
}

/**
 * The monthly estimate for one home: the Payment tool's own sum (calcPayment) at the loan and down payment the
 * buyer last chose there, or its starting ones, with the community's rates, taxes, insurance and HOA, so it
 * matches what the tool says for the same home. None for a sold or unpriced home, and none at all while the
 * Payment tool is off: a builder who turned it off chose not to show payments.
 */
export function useMonthly() {
  const { community, tools, settings } = useBuyer();
  const on = Boolean(community?.tools?.payment);
  const { program, downPct } = tools.pay;
  const resultOf = (home) => {
    if (!on || isSold(home) || !num(home.price)) return null;
    return calcPayment({ price: home.price, program, downPct, settings });
  };
  return { on, program, downPct, rate: ratesOf(settings)[program] ?? 0, resultOf };
}

/**
 * The homes the overlook shows: the order Explore Homes starts in, with the ones still for sale ahead of the
 * sold ones (the sort keeps each group's own order), so a buyer meets a home they can tour first.
 */
function homesToShow(homes) {
  const listed = listHomes(homes);
  return [...listed.filter((home) => !isSold(home)), ...listed.filter(isSold)].slice(0, OVERLOOK_HOMES);
}

/**
 * One home as a small photo card: the picture, the name, the price and, while the Payment tool is on, what it
 * could cost a month. The card opens the home's page; the heart is its own button after it, so the two are
 * never one control inside another.
 */
function HomeThumb({ home, saved, monthly, onOpen, onSave }) {
  const price = num(home.price);
  return (
    <li className={`th-thumb${isSold(home) ? ' th-thumb--sold' : ''}`}>
      <button type="button" className="th-thumb__open" onClick={() => onOpen(home)}>
        <span className="th-thumb__photo">
          {home.photos.length ? (
            <Photo photo={home.photos[0]} alt="" label="" quiet />
          ) : (
            <span className="th-thumb__nophoto">
              <HouseGlyph size={22} />
              <span>Photo soon</span>
            </span>
          )}
        </span>
        <span className="th-thumb__name">{home.name}</span>
        <span className="th-thumb__price">
          {isSold(home) ? 'Sold' : price ? money(price) : 'Price coming soon'}
        </span>
        {monthly ? (
          <span className="th-thumb__est">
            est. {money(monthly)}
            <span aria-hidden="true">/mo</span>
            <Hidden> a month</Hidden>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="th-thumb__save"
        aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
        aria-pressed={saved}
        onClick={() => onSave(home)}
      >
        <span className="th-thumb__heart">
          <Heart size={18} filled={saved} />
        </span>
      </button>
    </li>
  );
}

/**
 * The overlook's row of homes, and the line that says what each monthly figure assumes. The terms are said
 * once under the row rather than on each small card: the price is each card's own, and the loan, the down
 * payment, the rate and what is in the sum are the same for all of them. Inside the current stop's card the
 * card's own button already says "See all the homes", so the row leaves its link out there (more={false}).
 */
export default function HomeRow({ model, more = true }) {
  const { homes, isSaved, openHome, toggleSave, paths } = model;
  const monthly = useMonthly();
  const shown = homesToShow(homes);
  const first = shown.map(monthly.resultOf).find(Boolean);

  // "See all" is a link, so it can be opened in a new tab; an ordinary click goes through the model, which
  // records the visit the way every other way into Explore Homes does.
  const seeAll = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    model.openExplore();
  };

  return (
    <div className="th-homes">
      <ul className="th-homes__row" role="list" aria-label="Homes to pick from">
        {shown.map((home) => (
          <HomeThumb
            key={home.id}
            home={home}
            saved={isSaved(home.id)}
            monthly={monthly.resultOf(home)?.total ?? 0}
            onOpen={openHome}
            onSave={toggleSave}
          />
        ))}
      </ul>
      {more && homes.length > ROW_FITS ? (
        <Link to={paths.explore} className="th-more" onClick={seeAll}>
          See all {homes.length} homes
        </Link>
      ) : null}
      {first ? (
        <p className="th-note">
          Each monthly figure is for that home’s price with {monthly.downPct}% down on {loanWords(monthly.program)} at{' '}
          {monthly.rate.toFixed(2)}% fixed for 30 years{inTheSum(first)}. An estimate, not a loan offer.
        </p>
      ) : null}
    </div>
  );
}
