import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { isSold, money, num } from '@shared/domain.js';
import { complianceOf } from '@shared/compliance.js';
import { useBuyer } from '../../BuyerContext.jsx';
import { SheetDisclosure } from '../../ComplianceFooter.jsx';
import { useHomeModel } from '../../screens/AllTools.jsx';
import useDialog, { closeOnBackdrop } from '../../useDialog.js';
import { Cross } from './icons.jsx';
import { fullTerms, paymentFor } from './numbers.js';
import Row from './Row.jsx';

/**
 * The five parts of the monthly sum, in the order the Payment tool lists them, each with the words a buyer
 * reads in its legend. A part of $0 keeps its place in the legend (said as "None") but takes no room in the bar.
 */
const PARTS = [
  ['pi', 'Principal & interest'],
  ['tax', 'Taxes'],
  ['insurance', 'Insurance'],
  ['mi', 'Mortgage insurance'],
  ['hoa', 'HOA'],
];

/**
 * "My numbers": the sheet that slides up over any screen from the tab bar, as the board draws it.
 *
 * It asks the board's question about the home on screen ("Can you buy The Aspen?"), or on a screen with no
 * one home on it, about the home the buyer last priced in the Payment tool (see fallbackHome). Then the
 * monthly payment as one big figure, a bar of its five parts each with its amount, and what the figure
 * assumes, said in words with "An estimate, not a loan offer." Then the tools as rows, each saying in words
 * whether it is in the plan, and at the foot the lender to talk to. On the plan page itself it does not
 * offer the plan again: that would be a link to the page underneath it.
 *
 * Every figure is the Payment tool's own (calcPayment, through paymentFor), at the loan and down payment the
 * buyer last chose there, and none is shown while that tool is switched off. The tools, what is in the plan
 * and the way into a tool are the home screen's own (useHomeModel), so the sheet and the home screen can never
 * list them differently; the payment one is first pointed at this home, the way a home's own page does, so
 * the buyer lands on the figure they just read.
 *
 * It is the app's own sheet (b-sheet-backdrop, b-sheet, useDialog, closeOnBackdrop): focus moves in and
 * back, Tab stays inside, Escape, Close and a tap outside it close it. It covers the page footer, so the
 * shared disclosure a tool sheet carries (SheetDisclosure) rides along at its foot.
 */
export default function NumbersSheet({ open, onClose, home, onFinance, onPlan = false }) {
  const { community, tools, settings, setTool } = useBuyer();
  const model = useHomeModel();
  const dialogRef = useRef(null);
  useDialog(open, onClose, dialogRef);

  // The page behind stays where it is while the sheet is up, as a tool sheet's does.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const { inPlan, paths } = model;
  const allTools = [...model.leadTools, ...model.otherTools];
  const done = allTools.filter((tool) => inPlan(tool.k)).length;
  const first = model.firstName;
  const result = paymentFor(home, { community, tools, settings });
  const { lender } = complianceOf(community?.settings, { community });

  // The home screen's own way into a tool, after the sheet has closed. The payment tool is first pointed at
  // this home.
  const openTool = (tool) => {
    if (tool.k === 'payment' && home && tools.pay.homeId !== home.id) setTool('pay', { homeId: home.id });
    onClose();
    model.openTool(tool);
  };
  const paymentTool = allTools.find((tool) => tool.k === 'payment');

  return (
    <div
      ref={dialogRef}
      className="b-sheet-backdrop sc-numbers"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sc-numbers-title"
      {...closeOnBackdrop(onClose)}
    >
      <div className="b-sheet sc-numbers__sheet">
        <span className="sc-numbers__grip" aria-hidden="true" />
        <button type="button" className="sc-numbers__close" onClick={onClose} aria-label="Close">
          <Cross />
        </button>

        <h2 id="sc-numbers-title" className="sc-numbers__title">
          {home ? (
            <>
              Can you buy <em>{home.name}</em>?
            </>
          ) : (
            'My numbers'
          )}
        </h2>

        {result ? (
          <section className="sc-numbers__pay" aria-label={`Estimated monthly payment for ${home.name}`}>
            <p className="sc-numbers__fig">
              {money(result.total)}
              <span className="sc-numbers__per"> est. per month</span>
            </p>
            <p className="sc-numbers__terms">{fullTerms(result)}</p>
            <div className="sc-bar" aria-hidden="true">
              {PARTS.map(([key]) =>
                result[key] > 0 ? (
                  <span key={key} className={`sc-bar__part sc-bar__part--${key}`} style={{ flexGrow: result[key] }} />
                ) : null,
              )}
            </div>
            <ul className="sc-legend" role="list">
              {PARTS.map(([key, label]) => (
                <li key={key} className="sc-legend__item">
                  <span className={`sc-legend__dot sc-bar__part--${key}`} aria-hidden="true" />
                  {label} <b>{result[key] > 0 ? money(result[key]) : 'None'}</b>
                </li>
              ))}
            </ul>
            <p className="sc-numbers__note">An estimate, not a loan offer.</p>
            {paymentTool ? (
              <button type="button" className="sc-numbers__link" onClick={() => openTool(paymentTool)}>
                Change my numbers
              </button>
            ) : null}
          </section>
        ) : home ? (
          // No figure to show (the Payment tool is off, or this home is sold or not priced yet): its price, as it is.
          <p className="sc-numbers__terms sc-numbers__terms--plain">
            {isSold(home)
              ? `${home.name} is sold.`
              : num(home.price)
                ? `${home.name} is ${money(home.price)}.`
                : `The price of ${home.name} is coming soon.`}
          </p>
        ) : (
          <p className="sc-numbers__terms sc-numbers__terms--plain">
            {allTools.length ? 'Homes are coming soon. Your tools are ready now.' : 'Homes are coming soon.'}
          </p>
        )}

        <div className="sc-numbers__plan">
          <div className="sc-numbers__planhead">
            <h3 className="sc-numbers__h3">My Home Plan</h3>
            {allTools.length ? (
              <span className="sc-numbers__done">
                {first ? `${first} · ` : ''}
                {done} of {allTools.length} done
              </span>
            ) : null}
          </div>
          {allTools.length ? (
            <>
              <span className="sc-steps" aria-hidden="true">
                {allTools.map((tool) => (
                  <span key={tool.k} className={inPlan(tool.k) ? 'sc-steps__on' : ''} />
                ))}
              </span>
              <ul className="sc-rows" role="list">
                {allTools.map((tool) => (
                  <Row key={tool.k} title={tool.name} sub={tool.q} done={inPlan(tool.k)} onOpen={() => openTool(tool)} />
                ))}
              </ul>
            </>
          ) : (
            <p className="sc-numbers__terms sc-numbers__terms--plain">
              More is on the way. For now, save the homes you like and keep them in My Home Plan.
            </p>
          )}
          {onPlan ? null : (
            <Link to={paths.plan} className="sc-numbers__link" onClick={onClose}>
              Open My Home Plan
            </Link>
          )}
        </div>

        {onFinance ? (
          <div className="sc-numbers__lender">
            <span className="sc-numbers__who">
              <span className="sc-numbers__whokick">Your lender</span>
              <span className="sc-numbers__whoname">{lender.name}</span>
            </span>
            <button
              type="button"
              className="sc-btn sc-btn--fill"
              onClick={() => {
                onClose();
                onFinance();
              }}
            >
              Talk about financing
            </button>
          </div>
        ) : null}

        {/* The sheet covers the page footer, so the figures above carry their disclosure with them: the one a
            tool sheet carries, on a plate of the light page, since it draws the Equal Housing mark for one. */}
        <div className="sc-numbers__legal">
          <SheetDisclosure />
        </div>
      </div>
    </div>
  );
}
