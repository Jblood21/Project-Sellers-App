import { useSyncExternalStore } from 'react';

import { PROGRAMS, TOOLS, calcPayment, isSold, listHomes, money, num, ratesOf } from '@shared/domain.js';

/**
 * What the home screen and the header both need to know about the buyer's numbers, worked out once here
 * so the slide and the "My numbers" sheet can never say two different things about the same home.
 */

/** The tool a layout reaches for by key, but only while the builder has it switched on. */
export function toolOf(community, key) {
  return community?.tools?.[key] ? TOOLS.find((tool) => tool.k === key) ?? null : null;
}

/**
 * The homes in the order the carousel shows them: the order Explore Homes starts in, with the ones still for
 * sale ahead of the sold ones (each group keeps its own order), so the first slide is a home a buyer can tour.
 */
export function slideOrder(homes) {
  const listed = listHomes(homes);
  return [...listed.filter((home) => !isSold(home)), ...listed.filter(isSold)];
}

/**
 * The monthly payment for one home at the loan and down payment the buyer last chose in the Payment tool (or
 * its starting ones): the tool's own sum, calcPayment, with the community's rates, taxes, insurance and HOA.
 * Null when there is nothing honest to show: the Payment tool is off (a builder who turned it off chose not
 * to show payments), the home is sold, or it has no price yet.
 */
export function paymentFor(home, { community, tools, settings }) {
  if (!home || !toolOf(community, 'payment') || isSold(home) || !num(home.price)) return null;
  const { program, downPct } = tools.pay;
  const result = calcPayment({ price: home.price, program, downPct, settings });
  return { ...result, program, downPct, rate: ratesOf(settings)[program] ?? 0 };
}

/**
 * What the sum holds besides the loan, read as words: "taxes, insurance and HOA". Each part is named only
 * when it is in the sum, so a community with no HOA is not told it pays one; with nothing besides the loan
 * it says so rather than leaving the reader to guess.
 */
export function inTheSum(result) {
  const parts = [];
  if (result.tax > 0) parts.push('taxes');
  if (result.insurance > 0) parts.push('insurance');
  if (result.mi > 0) parts.push('mortgage insurance');
  if (result.hoa > 0) parts.push('HOA');
  if (!parts.length) return 'nothing added for taxes, insurance or HOA';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The loan's name as it is said aloud: "Conventional", "FHA", "VA". */
export function loanName(program) {
  return PROGRAMS[program] ?? program;
}

/**
 * The terms of a monthly figure in one short line: "5% down, Conventional at 7.40% fixed for 30 years, with
 * taxes, insurance and HOA." The price is beside it wherever it is shown, so it is not said twice.
 */
export function termsLine(result) {
  return `${result.downPct}% down, ${loanName(result.program)} at ${result.rate.toFixed(2)}% fixed for 30 years, with ${inTheSum(result)}.`;
}

/**
 * The loan as it is said aloud: "an FHA loan", "a VA loan", "a Conventional loan". The article follows the
 * sound, not the letter, so FHA ("eff") takes "an" and VA ("vee") takes "a".
 */
export function loanWords(program) {
  const name = loanName(program);
  return `${/^(FHA|[AEIO])/i.test(name) ? 'an' : 'a'} ${name} loan`;
}

/**
 * The same terms said in full, for the sheet where the figure stands alone: "5% down ($29,900) on a
 * $598,000 home, a Conventional loan at 7.40% fixed for 30 years, with taxes, insurance and HOA."
 */
export function fullTerms(result) {
  return `${result.downPct}% down (${money(result.down)}) on a ${money(result.price)} home, ${loanWords(result.program)} at ${result.rate.toFixed(2)}% fixed for 30 years, with ${inTheSum(result)}.`;
}

/**
 * The home "My numbers" is worked out for when no home is on screen: the one the buyer last picked in the
 * Payment tool, while it is still for sale and priced, or else the lowest-priced home still for sale, or
 * else the first one listed. Null only when there are no homes.
 */
export function fallbackHome(homes, pickedId) {
  const open = homes.filter((home) => !isSold(home) && num(home.price) > 0);
  const picked = open.find((home) => home.id === pickedId);
  if (picked) return picked;
  const low = open.reduce((best, home) => (!best || num(home.price) < num(best.price) ? home : best), null);
  return low ?? slideOrder(homes)[0] ?? null;
}

// ── the home on screen ─────────────────────────────────────────────────────
// The carousel is drawn by the home screen and the "My numbers" sheet by the header (so it opens from every
// screen), and the two are siblings that share no props. This one value is how the sheet knows which home
// the buyer is looking at: the carousel says so as it moves, and clears it when the home screen goes.

let onScreen = null;
// The last home the carousel showed, kept when the home screen goes, so a buyer who opens a home and comes
// back finds the carousel where they left it rather than at the first home again.
let lastSeen = null;
const listeners = new Set();

export function setHomeOnScreen(id) {
  if (id) lastSeen = id;
  if (id === onScreen) return;
  onScreen = id;
  listeners.forEach((notify) => notify());
}

export function lastHomeSeen() {
  return lastSeen;
}

export function useHomeOnScreen() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => onScreen,
    () => null,
  );
}
