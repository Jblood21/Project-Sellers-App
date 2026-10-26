import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  NEXT_STEPS, PROGRAMS, TOOLS, calcAffordability, calcPayment, dpaCap, incentiveWritten, isSold, listHomes, money, num,
  ratesOf, videoEmbed,
} from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { fullDate } from '../../../lib/format.js';
import AgentsBlock from '../../AgentsBlock.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { GuideCard } from '../../screens/Guides.jsx';
import { TOOLS_ANCHOR } from './anchor.js';
import { ChevronRight, DoneGlyph, Heart, HouseGlyph, MapGlyph, OpenGlyph, PinGlyph } from './icons.jsx';

/** How many homes the homes tile lists before "See all": a tile's worth, not the whole list. */
const HOME_ROWS = 5;
/** How many homes the buying-power gauge marks, lettered A to E. More would crowd a half circle. */
const GAUGE_MARKS = 5;

/** The tool a layout reaches for by key, but only while the builder has it switched on. */
function toolOf(community, key) {
  return community?.tools?.[key] ? TOOLS.find((tool) => tool.k === key) ?? null : null;
}

/**
 * The home the payment tile is worked out for: the one the buyer last picked in the Payment tool, while it is
 * still for sale and priced, or else the lowest-priced home still for sale. None when no home is both, which is
 * when the tile is not drawn.
 */
function paymentHome(homes, pickedId) {
  const open = homes.filter((home) => !isSold(home) && num(home.price) > 0);
  const picked = open.find((home) => home.id === pickedId);
  if (picked) return picked;
  return open.reduce((low, home) => (!low || num(home.price) < num(low.price) ? home : low), null);
}

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

/**
 * The homes as the homes tile lists them: cheapest first, a home with no price yet after the priced ones, and
 * the sold ones last, so a buyer reads down from what they could reach to what is gone.
 */
function homesByPrice(homes) {
  const listed = listHomes(homes, { sort: 'price-asc' });
  return [...listed.filter((home) => !isSold(home)), ...listed.filter(isSold)];
}

/**
 * How a home sits against the buyer's reach, in the See What I Can Afford tool's own two figures: under the
 * comfortable end it is in budget, under what a lender will often approve it is worth asking about, and
 * above that it is above the buyer's range. Nothing is said before the buyer has given an income.
 */
function fitOf(home, reach) {
  const price = num(home.price);
  if (!reach || isSold(home) || !price) return null;
  if (price <= reach.comfortable.price) return 'in';
  if (price <= reach.lenderMax.price) return 'ask';
  return 'over';
}

const FIT_WORDS = { in: 'In budget', ask: 'Worth asking', over: 'Above your range' };

/**
 * The tiles are laid into rows without holes, in the order they come, for a grid `cols` wide. Each tile asks
 * for a width; a row that cannot fit the next tile is closed by widening the tiles already in it, the last
 * first, so a missing tile (a tool switched off, a lender not set up) leaves no gap. The order on screen is
 * the order in the page, so a screen reader and a keyboard meet the tiles as the eye does.
 */
function pack(tiles, cols) {
  const spans = {};
  let row = [];
  let used = 0;
  const close = () => {
    for (let i = row.length - 1; used < cols && row.length; i = (i - 1 + row.length) % row.length) {
      spans[row[i]] += 1;
      used += 1;
    }
    row = [];
    used = 0;
  };
  for (const { key, want } of tiles) {
    const width = Math.min(want[cols] ?? cols, cols);
    if (used + width > cols) close();
    spans[key] = width;
    row.push(key);
    used += width;
    if (used === cols) close();
  }
  close();
  return spans;
}

/** Text a screen reader hears that the eye does not need, such as "a month" after "/mo". */
function Hidden({ children }) {
  return <span className="lg-vh">{children}</span>;
}

/** The board's small "est." tag on a figure. Said in full to a screen reader. */
function Est({ dark = false }) {
  return (
    <span className={`lg-est${dark ? ' lg-est--dark' : ''}`}>
      <span aria-hidden="true">est.</span>
      <Hidden>Estimate</Hidden>
    </span>
  );
}

/** The mark a tool carries once its answer is in the plan. The words are there too, so colour is not the only sign. */
function InPlan() {
  return <span className="lg-inplan">In your plan</span>;
}

/**
 * A tile's one way in, along its foot. `stretch` spreads it over the whole tile, so a tap anywhere on the
 * tile opens it while a screen reader still hears one control named for what it does. A tile with other
 * controls in it (a list of homes) keeps the link to its own line.
 */
function Go({ children, onClick, to, stretch = false, className = '' }) {
  const cls = `lg-go${stretch ? ' lg-go--stretch' : ''} ${className}`.trim();
  const inner = (
    <>
      <span>{children}</span>
      <ChevronRight />
    </>
  );
  if (to) {
    return (
      <Link className={cls} to={to} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

/** A tile's heading row: its name, and the estimate tag when its figure is one. */
function TileHead({ id, title, est = false, dark = false, aside = null }) {
  return (
    <div className="lg-tile__head">
      <h2 id={id} className="lg-tile__title">{title}</h2>
      {est ? <Est dark={dark} /> : null}
      {aside}
    </div>
  );
}

/**
 * The half circle the board draws on the dark tile: the buyer's buying power as the filled part, and each of
 * the cheapest homes as a lettered mark on the same scale, so a buyer sees at a glance which ones it reaches.
 * The scale runs from a little under the lowest figure to a little over the highest, which is what makes the
 * difference between homes visible; nothing is read off it, so it has no numbers of its own. The words on the
 * tile say the same thing, and so does the gauge's name.
 */
function Gauge({ power, marks, label }) {
  const cx = 75;
  const cy = 86;
  const r = 58;
  const values = [power, ...marks.map((mark) => mark.price)];
  const lo = Math.min(...values) * 0.7;
  const hi = Math.max(...values) * 1.08;
  const frac = (value) => Math.min(1, Math.max(0, (value - lo) / (hi - lo || 1)));
  const at = (f, radius) => {
    const angle = Math.PI * (1 - f);
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
  };
  const fix = (n) => Number(n.toFixed(2));
  const [ex, ey] = at(frac(power), r);
  // The letters sit outside the arc and are nudged apart when two homes are close in price; the marks on the
  // arc stay where the prices put them.
  let last = -1;
  const letters = marks.map((mark) => {
    const f = Math.min(0.95, Math.max(0.05, Math.max(frac(mark.price), last + 0.08)));
    last = f;
    return f;
  });

  return (
    <svg className="lg-gauge" viewBox="0 0 150 96" role="img" aria-label={label}>
      <path className="lg-gauge__track" d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} />
      <path className="lg-gauge__fill" d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${fix(ex)} ${fix(ey)}`} />
      {marks.map((mark) => {
        const f = frac(mark.price);
        const [x1, y1] = at(f, r - 8);
        const [x2, y2] = at(f, r + 8);
        return <path key={mark.id} className="lg-gauge__tick" d={`M${fix(x1)} ${fix(y1)} L${fix(x2)} ${fix(y2)}`} />;
      })}
      <circle className="lg-gauge__dot" cx={fix(ex)} cy={fix(ey)} r="5" />
      {marks.map((mark, index) => {
        const [x, y] = at(letters[index], r + 17);
        return (
          <text key={mark.id} className="lg-gauge__letter" x={fix(x)} y={fix(y + 4)} textAnchor="middle">
            {mark.letter}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * The one dark tile: what the buyer could spend, from See What I Can Afford with the answers they gave it
 * (the same sum, calcAffordability, on the same income, debts, credit and down payment, so the figure is the
 * tool's own "comfortable" end). Under it, the cheapest homes as lettered buttons: the ones it reaches are
 * filled and say "In budget" under their price, so the fill is never the only sign. A name wraps rather than
 * being cut short. Before the buyer has given an income there is no figure to show, so the tile says so and
 * offers the tool.
 */
function PowerTile({ cls, tool, reach, homes, onOpenTool, onOpenHome }) {
  const priced = homesByPrice(homes).filter((home) => !isSold(home) && num(home.price) > 0);
  const marks = priced.slice(0, GAUGE_MARKS).map((home, index) => ({
    id: home.id,
    home,
    letter: String.fromCharCode(65 + index),
    price: num(home.price),
  }));

  if (!reach) {
    return (
      <section className={`lg-tile lg-tile--dark lg-power ${cls}`} aria-labelledby="lg-power">
        <TileHead id="lg-power" title="Your buying power" dark />
        <p className="lg-power__none">Not worked out yet.</p>
        <p className="lg-power__line">Add your income and we’ll show which homes here it reaches.</p>
        {priced.length ? (
          <p className="lg-power__line">
            {priced.length > 1 ? (
              <>
                Homes here run from <span className="lg-num">{money(priced[0].price)}</span> to{' '}
                <span className="lg-num">{money(priced[priced.length - 1].price)}</span>.
              </>
            ) : (
              <>
                {priced[0].name} is <span className="lg-num">{money(priced[0].price)}</span>.
              </>
            )}
          </p>
        ) : null}
        <button type="button" className="lg-btn lg-btn--hi lg-power__start" onClick={() => onOpenTool(tool)}>
          {tool.name}
        </button>
      </section>
    );
  }

  const power = reach.comfortable.price;
  const under = priced.filter((home) => num(home.price) <= power);
  const over = priced.filter((home) => num(home.price) > power);
  let words = '';
  if (priced.length) {
    if (!under.length) words = 'No home here is under it yet.';
    else if (!over.length) words = priced.length === 1 ? `${under[0].name} is under it.` : 'Every home here is under it.';
    else if (under.length === 1) words = `Only ${under[0].name} is under it.`;
    else words = `${under.length} of ${priced.length} homes are under it.`;
  }
  const names = (list) => list.map((home) => home.name).join(', ');
  const label = marks.length
    ? `Gauge: your ${money(power)} against the homes.${under.length ? ` Under it: ${names(under)}.` : ''}${over.length ? ` Over it: ${names(over)}.` : ''}`
    : `Gauge: your ${money(power)}.`;

  return (
    <section className={`lg-tile lg-tile--dark lg-power ${cls}`} aria-labelledby="lg-power">
      <TileHead id="lg-power" title="Your buying power" est dark />
      <div className="lg-power__main">
        <div className="lg-power__text">
          <p className="lg-power__fig">{money(power)}</p>
          {words ? <p className="lg-power__line">{words}</p> : null}
        </div>
        {marks.length ? <Gauge power={power} marks={marks} label={label} /> : null}
      </div>
      {marks.length ? (
        <ul className="lg-chips" role="list">
          {marks.map((mark) => {
            const fits = mark.price <= power;
            return (
              <li key={mark.id}>
                <button
                  type="button"
                  className={`lg-chip${fits ? ' lg-chip--in' : ''}`}
                  onClick={() => onOpenHome(mark.home)}
                >
                  <span className="lg-chip__name">
                    <span className="lg-chip__letter" aria-hidden="true">{mark.letter}</span>
                    <span className="lg-chip__words">{mark.home.name}</span>
                  </span>
                  <span className="lg-chip__foot">
                    <span className="lg-chip__price">{money(mark.price)}</span>
                    {fits ? (
                      <span className="lg-chip__fit">
                        <DoneGlyph size={14} />
                        In budget
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Go className="lg-go--dark" onClick={() => onOpenTool(tool)}>Change my numbers</Go>
    </section>
  );
}

/**
 * What one of the homes could cost the buyer each month: the Payment tool's own sum (calcPayment) at the loan
 * and down payment the buyer last chose there, or its starting ones, with the community's rates, taxes,
 * insurance and HOA, so it matches what the tool says for the same home. The five parts of the sum are a thin
 * stacked bar with a key under it, each part in words and figures, so the bar is never the only way to read it.
 *
 * Opening it hands the tile's home to the tool first, the way a home's own page does before it opens the
 * payment: the tool otherwise opens on the first home listed, which need not be the one this tile chose.
 */
function PaymentTile({ cls, home, tool, onOpenTool }) {
  const { tools, settings, setTool } = useBuyer();
  const { program, downPct } = tools.pay;
  const result = calcPayment({ price: home.price, program, downPct, settings });
  const rate = ratesOf(settings)[program] ?? 0;
  const parts = [
    { k: 'pi', name: 'Principal & interest', value: result.pi },
    { k: 'tax', name: 'Taxes', value: result.tax },
    { k: 'ins', name: 'Insurance', value: result.insurance },
    { k: 'mi', name: 'Mortgage insurance', value: result.mi },
    { k: 'hoa', name: 'HOA', value: result.hoa },
  ];
  const shown = parts.filter((part) => part.value > 0);
  const open = () => {
    if (tools.pay.homeId !== home.id) setTool('pay', { homeId: home.id });
    onOpenTool(tool);
  };

  return (
    <section className={`lg-tile lg-pay ${cls}`} aria-labelledby="lg-pay">
      <TileHead id="lg-pay" title="Monthly payment" est />
      <p className="lg-pay__fig">
        <span className="lg-fig">{money(result.total)}</span>
        <span className="lg-per" aria-hidden="true">/mo</span>
        <Hidden> a month</Hidden>
        <span className="lg-pay__for">for {home.name}</span>
      </p>
      <div
        className="lg-stack"
        role="img"
        aria-label={`The ${shown.length} parts of the payment: ${shown.map((part) => `${part.name} ${money(part.value)}`).join(', ')}.`}
      >
        {shown.map((part) => (
          <span key={part.k} className={`lg-stack__part lg-part--${part.k}`} style={{ flexGrow: part.value }} />
        ))}
      </div>
      <ul className="lg-key" role="list">
        {parts.map((part) => (
          <li key={part.k} className="lg-key__row">
            <span className={`lg-key__swatch lg-part--${part.k}`} aria-hidden="true" />
            <span className="lg-key__name">{part.name}</span>
            <span className="lg-key__value">{part.k === 'mi' && !part.value ? 'None' : money(part.value)}</span>
          </li>
        ))}
      </ul>
      <p className="lg-terms">
        For a <span className="lg-num">{money(home.price)}</span> home, {downPct}% down on {loanWords(program)} at{' '}
        <span className="lg-num">{rate.toFixed(2)}%</span> fixed for 30 years{inTheSum(result)}. An estimate, not a
        loan offer.
      </p>
      <Go stretch onClick={open}>See the breakdown</Go>
    </section>
  );
}

/**
 * Saved so far against what is needed, as a ring: the Savings Plan tool's own figures. The target is the cash
 * the buyer typed there or, until they type one, the tool's own starting figure (the cash to close on the home
 * picked in the Payment tool, or the first home listed); "saved" is their current savings. Before they have
 * said what they have saved there is nothing to fill the ring with, so the tile says so and offers the tool.
 */
function DownTile({ cls, tool, onOpenTool }) {
  const { homes, settings, tools } = useBuyer();
  const state = tools.savings;
  // The tool's own working, line for line, so the tile always says what the tool would.
  const scenarioHome = homes.find((h) => h.id === tools.pay.homeId) ?? homes[0];
  const scenarioCash = scenarioHome
    ? calcPayment({ price: scenarioHome.price, program: tools.pay.program, downPct: tools.pay.downPct, settings }).cashToClose
    : 0;
  const cash = num(state.cash === '' ? String(Math.round(scenarioCash)) : state.cash);
  const current = num(state.current);
  const percent = cash ? Math.min(100, Math.round((current / cash) * 100)) : 0;
  const given = String(state.current ?? '').trim() !== '' && cash > 0;
  const circle = 2 * Math.PI * 27;

  return (
    <section className={`lg-tile lg-down ${cls}`} aria-labelledby="lg-down">
      <TileHead id="lg-down" title="Down payment" est={given} />
      {given ? (
        <>
          <div className="lg-down__main">
            <span className="lg-ring">
              <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
                <circle className="lg-ring__track" cx="32" cy="32" r="27" />
                <circle
                  className="lg-ring__fill"
                  cx="32"
                  cy="32"
                  r="27"
                  strokeDasharray={`${Number(((percent / 100) * circle).toFixed(2))} ${Number(circle.toFixed(2))}`}
                  transform="rotate(-90 32 32)"
                />
              </svg>
              <span className="lg-ring__pct">{percent}%</span>
            </span>
            <span className="lg-down__figs">
              <span className="lg-down__have">{money(current)}</span>
              <span className="lg-down__of">
                of <span className="lg-num">{money(cash)}</span> saved
              </span>
            </span>
          </div>
          <p className="lg-small">
            {state.cash === '' && scenarioHome ? `Down and closing on ${scenarioHome.name}` : 'Down and closing, your own figure'}
          </p>
        </>
      ) : (
        <p className="lg-small lg-down__none">
          {cash > 0
            ? 'Not given yet. Add what you\u2019ve saved and see how far it goes.'
            : 'Not worked out yet. Add the cash you\u2019ll need and see how far your savings go.'}
        </p>
      )}
      {/* "Start" alone would not say what starts, so a screen reader hears the tool's name after it. */}
      <Go stretch onClick={() => onOpenTool(tool)}>
        {given ? (
          tool.name
        ) : (
          <>
            Start
            <Hidden> {tool.name}</Hidden>
          </>
        )}
      </Go>
    </section>
  );
}

/** How far the plan has come: the tools with an answer in it, as a row of dots with the count in words. */
function PlanTile({ cls, done, total, to }) {
  return (
    <section className={`lg-tile lg-plan ${cls}`} aria-labelledby="lg-plan">
      <TileHead id="lg-plan" title="Plan" />
      <p className="lg-plan__fig">
        <span className="lg-fig">
          {done} of {total}
        </span>{' '}
        <span className="lg-plan__words">in your plan</span>
      </p>
      <span className="lg-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={`lg-dot${index < done ? ' lg-dot--done' : ''}`} />
        ))}
      </span>
      <Go stretch to={to}>My Home Plan</Go>
    </section>
  );
}

/**
 * The community's three rates and the day they were set, as the Payment tool shows them: two places, and the
 * date with its year, so last year's rates cannot pass for this year's. It opens the loan tool that explains
 * them, or the next one that shows them.
 */
function RatesTile({ cls, tool, onOpenTool }) {
  const { settings } = useBuyer();
  const rates = ratesOf(settings);
  const date = fullDate(settings.ratesUpdatedAt);
  return (
    <section className={`lg-tile lg-rates ${cls}`} aria-labelledby="lg-rates">
      <TileHead id="lg-rates" title="Rates today" est aside={date ? <span className="lg-rates__date">{date}</span> : null} />
      <dl className="lg-rates__list">
        {Object.entries(PROGRAMS).map(([key, name]) => (
          <div key={key} className="lg-rates__item">
            <dt>{name}</dt>
            <dd className="lg-fig">{rates[key].toFixed(2)}%</dd>
          </div>
        ))}
      </dl>
      <p className="lg-small">30-year fixed</p>
      <Go stretch onClick={() => onOpenTool(tool)}>{tool.name}</Go>
    </section>
  );
}

/**
 * Every home as a row: its price and, while the Payment tool is on, what it could cost a month on the same loan
 * and down payment as the payment tile. Once the buyer's buying power is known each row says how it sits
 * against it, in the Afford tool's words. A row opens the home's page; the heart after it saves the home to
 * Homes I Like, as it does on every other home screen. The heart is its own button beside the row, so the two
 * are never one control inside another.
 */
function HomesTile({ cls, homes, reach, monthlyOf, terms, isSaved, onSave, onOpenHome, onOpenExplore, exploreTo }) {
  const listed = homesByPrice(homes);
  const shown = listed.slice(0, HOME_ROWS);
  const anyMonthly = shown.some((home) => monthlyOf(home) > 0);
  // "See all" is a link, so it can be opened in a new tab; an ordinary click goes through the model, which
  // records the visit the way every other way into Explore Homes does.
  const seeAll = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpenExplore();
  };

  return (
    <section className={`lg-tile lg-homes ${cls}`} aria-labelledby="lg-homes">
      <TileHead id="lg-homes" title={reach ? 'Homes in your budget' : 'The homes'} est={anyMonthly} />
      {shown.length ? (
        <ul className="lg-rows" role="list">
          {shown.map((home) => {
            const monthly = monthlyOf(home);
            const fit = fitOf(home, reach);
            const price = num(home.price);
            const saved = isSaved(home.id);
            return (
              <li key={home.id} className="lg-rows__item">
                <button type="button" className="lg-row" onClick={() => onOpenHome(home)}>
                  <span className="lg-row__photo">
                    {home.photos.length ? (
                      <Photo photo={home.photos[0]} alt="" label="" quiet sizes="75px" />
                    ) : (
                      <HouseGlyph size={20} />
                    )}
                  </span>
                  <span className="lg-row__name">
                    <span className="lg-row__title">{home.name}</span>
                    <span className="lg-row__price">{price ? money(price) : 'Price coming soon'}</span>
                  </span>
                  <span className="lg-row__end">
                    {isSold(home) ? <span className="lg-row__fit">Sold</span> : null}
                    {monthly ? (
                      <span className="lg-row__mo">
                        {money(monthly)}
                        <span aria-hidden="true">/mo</span>
                        <Hidden> a month</Hidden>
                      </span>
                    ) : null}
                    {fit ? <span className={`lg-row__fit${fit === 'in' ? ' lg-row__fit--in' : ''}`}>{FIT_WORDS[fit]}</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="lg-row__save"
                  aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
                  aria-pressed={saved}
                  onClick={() => onSave(home)}
                >
                  <Heart size={20} filled={saved} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="lg-empty">
          <HouseGlyph size={28} />
          <p className="lg-empty__title">No homes listed yet</p>
          <p className="lg-small">We’re still adding homes to this community. Check back soon.</p>
        </div>
      )}
      {anyMonthly && terms ? <p className="lg-terms">Each a month: {terms} An estimate, not a loan offer.</p> : null}
      {listed.length ? (
        <Go to={exploreTo} onClick={seeAll}>
          {listed.length > shown.length ? `See all ${listed.length} homes` : 'Explore Homes'}
        </Go>
      ) : null}
    </section>
  );
}

/** The first tool not yet in the plan, in the order the plan nudges a buyer through them, with Start. */
function NextTile({ cls, next, planTo, onOpenTool }) {
  return (
    <section className={`lg-tile lg-next ${cls}`} aria-labelledby="lg-next">
      <h2 id="lg-next" className="lg-tile__kicker">Next step</h2>
      {next ? (
        <>
          <p className="lg-next__name">{next.name}</p>
          <p className="lg-small">{next.q}</p>
          <button type="button" className="lg-btn lg-btn--acc lg-next__go lg-go--stretch" onClick={() => onOpenTool(next)}>
            Start
            <Hidden> {next.name}</Hidden>
          </button>
        </>
      ) : (
        <>
          <p className="lg-next__name">Every tool is in your plan</p>
          <p className="lg-small">Download it or send it to the team when you’re ready.</p>
          <Go stretch to={planTo}>My Home Plan</Go>
        </>
      )}
    </section>
  );
}

/**
 * The community's own down payment help, from Setup, said the way the tool says it: a flat figure is what the
 * program is worth ("$20,000 toward your down payment"), a share of the loan may be capped ("up to"), and the
 * price the program stops at. The tool works out whether the buyer fits. A builder who has cleared every
 * figure still gets a tile that says something: what the tool says before it has an answer.
 */
function DpaTile({ cls, tool, done, onOpenTool }) {
  const { settings } = useBuyer();
  const flat = num(settings.dpaAmount);
  const pct = num(settings.dpaPct);
  const cap = dpaCap(settings);
  const program = String(settings.dpaProgram ?? '').trim();
  const blank = !pct && !flat && !program && !cap;
  return (
    <section className={`lg-tile lg-dpa ${cls}`} aria-labelledby="lg-dpa">
      <TileHead id="lg-dpa" title={tool.name} />
      {pct > 0 ? (
        <p className="lg-dpa__fig">
          <span className="lg-fig">{pct}%</span> <span className="lg-dpa__unit">of your loan{flat > 0 ? ',' : ''}</span>
          {flat > 0 ? (
            <>
              {' '}
              <span className="lg-dpa__unit">up to</span> <span className="lg-num">{money(flat)}</span>
            </>
          ) : null}
        </p>
      ) : flat > 0 ? (
        <p className="lg-dpa__fig">
          <span className="lg-fig">{money(flat)}</span> <span className="lg-dpa__unit">toward your down payment</span>
        </p>
      ) : null}
      {blank ? (
        <p className="lg-small">Add your household income and we’ll check your answers against this community’s program.</p>
      ) : null}
      {program || cap ? (
        <p className="lg-small">
          {program || 'The program'}
          {cap ? (
            <>
              , for homes up to <span className="lg-num">{money(cap)}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {done ? <InPlan /> : null}
      <Go stretch onClick={() => onOpenTool(tool)}>Could I get help?</Go>
    </section>
  );
}

/** Every tool, as a checklist: done or not in a circle and in words, the question it answers under its name. */
function ToolsTile({ cls, tools, inPlan, onOpenTool }) {
  const done = tools.filter((tool) => inPlan(tool.k)).length;
  return (
    <section className={`lg-tile lg-tools ${cls}`} aria-labelledby={TOOLS_ANCHOR} id={`${TOOLS_ANCHOR}-tile`}>
      <div className="lg-tile__head">
        {/* The heading takes the focus when the rail's Tools item brings a keyboard here. */}
        <h2 id={TOOLS_ANCHOR} className="lg-tile__title" tabIndex={-1}>Tools</h2>
        <span className="lg-tools__count">
          <span className="lg-num">
            {done} of {tools.length}
          </span>{' '}
          in your plan
        </span>
      </div>
      <ul className="lg-checks" role="list">
        {tools.map((tool) => {
          const ok = inPlan(tool.k);
          return (
            <li key={tool.k}>
              <button type="button" className={`lg-check${ok ? ' lg-check--done' : ''}`} onClick={() => onOpenTool(tool)}>
                <span className="lg-check__icon">{ok ? <DoneGlyph /> : <OpenGlyph />}</span>
                <span className="lg-check__text">
                  <span className="lg-check__name">{tool.name}</span>
                  <span className="lg-check__q">{tool.q}</span>
                </span>
                {ok ? <InPlan /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The lender, built from the community's own compliance settings so what Setup says is what the tile says.
 *
 * Renders nothing until the lender has a name and an NMLS ID: a half-filled block is a non-compliant mortgage
 * ad, and showing nothing is the safe way for this to fail. The licence line and the Equal Housing mark stay
 * inside the tile because they are part of the advertisement, not decoration under it.
 */
function LenderTile({ cls, onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section className={`lg-tile lg-lender ${cls}`} aria-labelledby="home-financing">
      <TileHead id="home-financing" title="Your lender" />
      <LenderLogo tone="light" height={40} className="lg-lender__logo" />
      {lender.tagline ? <p className="lg-lender__line">{lender.tagline}</p> : null}
      <div className="lg-pair">
        <button type="button" className="lg-btn lg-btn--dark" onClick={onOpen}>
          Talk about financing
        </button>
        <LoanProcessLink className="lg-btn lg-btn--line" />
      </div>
      <div className="lg-lender__legal">
        <EhlMark tone="light" height={40} />
        <span className="lg-lender__id b-lender-card__text">
          <span>
            {lender.name} · NMLS #<span className="lg-num">{lender.nmls}</span>
            {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
          </span>
          {lender.phone ? (
            phoneHref ? <a className="lg-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
          ) : null}
        </span>
      </div>
    </section>
  );
}

/** A tile for a place near the community: an icon, a title and what is there. */
function PlaceTile({ cls, id, icon, title, sub, onOpen }) {
  return (
    <section className={`lg-tile lg-place ${cls}`} aria-labelledby={id}>
      <span className="lg-place__icon" aria-hidden="true">{icon}</span>
      <h2 id={id} className="lg-tile__title">{title}</h2>
      <p className="lg-small">{sub}</p>
      <Go stretch onClick={onOpen}>Open {title}</Go>
    </section>
  );
}

/**
 * The Worth Knowing items: a video or an article, each under its own title.
 * Videos are lazy so a section nobody scrolls to costs nobody anything.
 */
function Resource({ item }) {
  // An uploaded file plays in the page; a link plays in its frame. A video row with neither is a builder's
  // half-finished edit, and an empty black box is worse than nothing.
  const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
  if (item.kind === 'video' && !embed && !item.videoUrl) return null;
  const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
  // A title the builder never wrote a body under would be an empty box, so the title stands on its own.
  const boxed = Boolean(item.videoUrl || embed || body);

  return (
    <div className="lg-res__item">
      <h3 className="lg-res__title">{item.title}</h3>
      {boxed ? (
        <article className="lg-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch, and a
              // buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="lg-res__video"
            />
          ) : embed ? (
            <div className="lg-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="lg-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * Ledger's home screen: the buyer's own dashboard, a bento of tiles of different sizes with the figures first.
 *
 * Every figure is the one the tool behind it would give, worked out by the same shared sum from the same
 * answers: buying power (calcAffordability on the See What I Can Afford answers), the monthly payment
 * (calcPayment on the Payment tool's loan and down payment), the down payment saved (the Savings Plan's own
 * working), the plan, the community's rates, the homes against the buyer's reach, the next tool to try and
 * the community's down payment help. A figure the buyer has not given yet is said to be missing, with the tool
 * offered in its place, never guessed. A tool that is switched off has no tile, and the payment figures are
 * shown only while the Payment tool is on: a builder who turned it off chose not to show payments.
 *
 * Under the figures, the sections every home screen has, as tiles in the same grid, in Marketplace's order and
 * on its conditions: the builder incentive (above the homes, where every layout puts it), the tools, the
 * lender, what is around the community, the agents to tour with, the guides, the FAQ, and last the builder's
 * own videos and articles. Every handler is the model's and does what it does in every other layout.
 *
 * The grid is two columns on a phone and four on a wide screen; `pack` gives each tile its width at both so a
 * row never has a hole in it, whichever tiles a community has.
 */
export default function Home({ model }) {
  const {
    community, paths, homes, leadTools, otherTools, resources, inPlan, isSaved, openTool, openExplore, openArea,
    openMap, openLender, openHome, toggleSave,
  } = model;
  const { tools, settings, features } = useBuyer();
  const faq = useFaq();
  const location = useLocation();

  // The rail's Tools item lands here with the tools tile's name as the hash. The shell scrolls every new screen
  // to the top after this screen has drawn, so the tile is brought into view a moment later, and its heading
  // takes the focus so a keyboard carries on from the tools.
  useEffect(() => {
    if (location.hash !== `#${TOOLS_ANCHOR}`) return undefined;
    const timer = window.setTimeout(() => {
      const heading = document.getElementById(TOOLS_ANCHOR);
      if (!heading) return;
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      heading.closest('.lg-tile')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      heading.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.key]);

  const allTools = [...leadTools, ...otherTools];
  const done = allTools.filter((tool) => inPlan(tool.k)).length;

  const affordTool = toolOf(community, 'afford');
  const paymentTool = toolOf(community, 'payment');
  const savingsTool = toolOf(community, 'savings');
  const dpaTool = toolOf(community, 'dpa');
  // The rates are explained by the loan options, compared by Compare My Options and used by the payment; the
  // tile opens the first of those that is switched on, and with none of them on it is not drawn.
  const ratesTool = toolOf(community, 'loans') ?? toolOf(community, 'compare') ?? paymentTool;

  // Buying power, as See What I Can Afford works it out from the same answers. Nothing until there is an income.
  const aff = tools.aff;
  const hasCash = String(aff.downPayment).trim() !== '';
  const reach = affordTool && num(aff.income) > 0
    ? calcAffordability({
      income: aff.income, debts: aff.debts, credit: aff.credit, settings, downPayment: hasCash ? aff.downPayment : null,
    })
    : null;

  const { program, downPct } = tools.pay;
  const monthlyOf = (home) => {
    if (!paymentTool || isSold(home) || !num(home.price)) return 0;
    return calcPayment({ price: home.price, program, downPct, settings }).total;
  };
  const payHome = paymentTool ? paymentHome(homes, tools.pay.homeId) : null;
  const rate = ratesOf(settings)[program] ?? 0;
  const terms = payHome
    ? `${downPct}% down on ${loanWords(program)} at ${rate.toFixed(2)}% fixed for 30 years${inTheSum(
      calcPayment({ price: payHome.price, program, downPct, settings }),
    )}.`
    : '';

  // The next tool, in the order the plan nudges a buyer through them (the saved homes are not a tool).
  const next = NEXT_STEPS.map(([key]) => allTools.find((tool) => tool.k === key))
    .filter(Boolean)
    .find((tool) => !inPlan(tool.k)) ?? null;

  const lenderReady = complianceOf(community?.settings, { community }).lender.ready;
  // The incentive card draws nothing until the builder has written a headline and the details; it is given a place only then.
  const incentive = Boolean(features.incentive && incentiveWritten(settings));

  // The tiles in the order they read, each with the width it asks for on the phone's two columns and the wide
  // screen's four. Only the ones this community draws are listed, so the packing sees no gaps.
  const tiles = [
    affordTool ? { key: 'power', want: { 2: 2, 4: 2 } } : null,
    payHome ? { key: 'payment', want: { 2: 2, 4: 2 } } : null,
    savingsTool ? { key: 'down', want: { 2: 1, 4: 1 } } : null,
    allTools.length ? { key: 'plan', want: { 2: 1, 4: 1 } } : null,
    ratesTool ? { key: 'rates', want: { 2: 2, 4: 2 } } : null,
    incentive ? { key: 'incentive', want: { 2: 2, 4: 2 } } : null,
    { key: 'homes', want: { 2: 2, 4: 2 } },
    allTools.length ? { key: 'next', want: { 2: 1, 4: 1 } } : null,
    dpaTool ? { key: 'dpa', want: { 2: 1, 4: 1 } } : null,
    { key: 'tools', want: { 2: 2, 4: 2 } },
    lenderReady ? { key: 'lender', want: { 2: 2, 4: 2 } } : null,
    model.hasSpots ? { key: 'spots', want: { 2: 1, 4: 1 } } : null,
    model.hasMap ? { key: 'map', want: { 2: 1, 4: 1 } } : null,
    model.showAgents ? { key: 'agents', want: { 2: 2, 4: 4 } } : null,
    model.showGuides ? { key: 'guides', want: { 2: 2, 4: 4 } } : null,
    faq.length ? { key: 'faq', want: { 2: 2, 4: 2 } } : null,
    resources.length ? { key: 'res', want: { 2: 2, 4: 2 } } : null,
  ].filter(Boolean);
  const two = pack(tiles, 2);
  const four = pack(tiles, 4);
  const cls = (key) => `lg-s2-${two[key]} lg-s4-${four[key]}`;

  // The greeting: the builder's own words from Setup when there are some, otherwise the dashboard's.
  const first = model.firstName;
  const headline = model.greeting.headline || (first ? `Hi ${first}. Here’s where you stand.` : 'Here’s where you stand.');
  const subhead =
    model.greeting.subhead ||
    (allTools.length
      ? 'Your numbers from each tool, side by side. Tap a tile to open it.'
      : homes.length
        ? 'The homes here and your plan, side by side. Tap a tile to open it.'
        : 'Have a look around while we add the homes.');

  return (
    <div className="b-shell lg-home">
      <div className="lg-intro">
        <h1 className="lg-h1">{headline}</h1>
        <p className="lg-lede">{subhead}</p>
        <p className="lg-meta">Estimates, not a loan offer.</p>
      </div>

      <div className="lg-grid">
        {affordTool ? (
          <PowerTile cls={cls('power')} tool={affordTool} reach={reach} homes={homes} onOpenTool={openTool} onOpenHome={openHome} />
        ) : null}
        {payHome ? <PaymentTile cls={cls('payment')} home={payHome} tool={paymentTool} onOpenTool={openTool} /> : null}
        {savingsTool ? <DownTile cls={cls('down')} tool={savingsTool} onOpenTool={openTool} /> : null}
        {allTools.length ? <PlanTile cls={cls('plan')} done={done} total={allTools.length} to={paths.plan} /> : null}
        {ratesTool ? <RatesTile cls={cls('rates')} tool={ratesTool} onOpenTool={openTool} /> : null}
        {incentive ? <IncentiveCard className={`lg-tile lg-incentive ${cls('incentive')}`} /> : null}
        <HomesTile
          cls={cls('homes')}
          homes={homes}
          reach={reach}
          monthlyOf={monthlyOf}
          terms={terms}
          isSaved={isSaved}
          onSave={toggleSave}
          onOpenHome={openHome}
          onOpenExplore={openExplore}
          exploreTo={paths.explore}
        />
        {allTools.length ? <NextTile cls={cls('next')} next={next} planTo={paths.plan} onOpenTool={openTool} /> : null}
        {dpaTool ? <DpaTile cls={cls('dpa')} tool={dpaTool} done={inPlan('dpa')} onOpenTool={openTool} /> : null}

        {allTools.length ? (
          <ToolsTile cls={cls('tools')} tools={allTools} inPlan={inPlan} onOpenTool={openTool} />
        ) : (
          <section className={`lg-tile lg-notools ${cls('tools')}`} aria-labelledby="lg-notools">
            <TileHead id="lg-notools" title="More is on the way" />
            <p className="lg-small">For now, save the homes you like and keep them in My Home Plan.</p>
            <Go stretch to={paths.plan}>My Home Plan</Go>
          </section>
        )}

        {lenderReady ? <LenderTile cls={cls('lender')} onOpen={openLender} /> : null}
        {model.hasSpots ? (
          <PlaceTile
            cls={cls('spots')}
            id="lg-spots"
            icon={<PinGlyph />}
            title="Local Spots"
            sub={`Schools, parks and everyday places near ${community?.name ?? 'the community'}`}
            onOpen={openArea}
          />
        ) : null}
        {model.hasMap ? (
          <PlaceTile cls={cls('map')} id="lg-map" icon={<MapGlyph />} title="Site Map" sub="View the community layout" onOpen={openMap} />
        ) : null}

        {/* The agent, listed in full, ahead of the guides: a buyer who is ready to see a home should not have to
            scroll past reading to do it. */}
        {model.showAgents ? (
          <section className={`lg-tile lg-agents ${cls('agents')}`} aria-labelledby="home-agents">
            <TileHead id="home-agents" title="Schedule your tour" />
            <AgentsBlock />
          </section>
        ) : null}

        {/* Three, with the way to the rest, so the screen stays a dashboard and not a reading list. */}
        {model.showGuides ? (
          <section className={`lg-tile lg-guides ${cls('guides')}`} aria-labelledby="home-guides">
            <TileHead id="home-guides" title="Learn" />
            <div className="b-glist lg-guides__list">
              {model.featuredGuides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
            {model.guides.length > model.featuredGuides.length ? (
              <Go to={paths.guides}>All {model.guides.length} buyer guides</Go>
            ) : null}
          </section>
        ) : null}

        {faq.length ? (
          <section className={`lg-tile lg-faq ${cls('faq')}`} aria-labelledby="home-faq">
            <TileHead id="home-faq" title="FAQ" />
            <FaqList items={faq} />
          </section>
        ) : null}

        {resources.length ? (
          <section className={`lg-tile lg-res ${cls('res')}`} aria-labelledby="home-worth-knowing">
            <TileHead id="home-worth-knowing" title="Worth knowing" />
            <div className="lg-res__list">
              {resources.map((item) => (
                <Resource key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
