/**
 * Reading the numbers people type into the admin's boxes.
 *
 * The browser and the server both call this, so a box and the route behind it can never disagree about
 * what a number is. It exists because the first version was forgiving in the worst way: `num()` in
 * domain.js turns any text it cannot read into 0, so "six and a half" became a 0% rate and a $1,111
 * payment where about $2,770 was right, "475k" became $475, and "1.2m" became $1. A box now either holds a
 * number in a range that makes sense for what it is, or says why not in words a person can act on.
 *
 * What counts as a number, typed: digits with one optional decimal point; thousands commas only where
 * they group thousands (so "1,250" is read and a European "6,5" is refused, not turned into 65); a
 * stray $ or % at either end is dropped (a rate pasted as "7.5%" is 7.5, a price pasted as "$475,000" is
 * 475000); and, for a box that takes dollars, a trailing k or m for thousands and millions ("475k",
 * "1.2m"). Anything else, words and minus signs included, is not a number.
 */

const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;
const SUFFIX = { k: 1e3, m: 1e6 };

/** The plain digits in `raw` and what they come to, or null when it is not a number. */
function parseTyped(raw, shorthand) {
  let text = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  text = text.replace(/^[$%]+|[$%]+$/g, '');
  let factor = 1;
  if (shorthand) {
    const suffixed = /^(.*[0-9.])([km])$/.exec(text);
    if (suffixed) {
      text = suffixed[1];
      factor = SUFFIX[suffixed[2]];
    }
  }
  if (text.includes(',')) {
    if (!GROUPED.test(text)) return null;
    text = text.replace(/,/g, '');
  }
  if (!PLAIN.test(text)) return null;
  // ".5" and "7." are what people type on the way to 0.5 and 7.
  const digits = text.replace(/^0+(?=\d)/, '').replace(/^\./, '0.').replace(/\.$/, '');
  const value = Number(digits) * factor;
  if (!Number.isFinite(value)) return null;
  return { digits, factor, value: factor === 1 ? value : Math.round(value) };
}

const withCommas = (n) => n.toLocaleString('en-US');
const bound = (rule, n) => (rule.unit === 'dollars' ? `$${withCommas(n)}` : withCommas(n));

/** What to tell the person, in the rule's own words when it has them and plain defaults when it does not. */
function problemWith(rule, kind) {
  const said = rule.messages?.[kind];
  if (said) return said;
  const what = rule.what ?? 'a number';
  const eg = rule.example ?? '1';
  if (kind === 'blank') return `Type ${what}, like ${eg}.`;
  if (kind === 'fraction') return `Use a whole number, like ${eg}.`;
  const min = rule.min ?? 0;
  if (rule.max === undefined || rule.max === Infinity) return `Type ${what} of ${bound(rule, min)} or more, like ${eg}.`;
  return `Type ${what} between ${bound(rule, min)} and ${bound(rule, rule.max)}, like ${eg}.`;
}

/**
 * Reads one box. `rule`:
 *   min, max    the range that makes sense for what the box is (both ends allowed)
 *   required    a blank is a problem; otherwise a blank is `{ value: null, text: '' }`, "not given"
 *   whole       only a whole number is allowed ("3 bedrooms", not "2.5")
 *   roundWhole  a fraction is rounded to a whole number rather than refused (a price typed with cents)
 *   shorthand   a trailing k or m is thousands or millions (dollar boxes only)
 *   unit        'dollars' writes the range with a $ in the message
 *   what, example, messages   the words for the message: "a rate", "6.75", and `{blank, invalid, low, high, fraction}`
 *
 * Returns `{ value, text }` (the number, and the plain digits to store or show) or `{ error }`.
 */
export function readNumber(raw, rule = {}) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return rule.required ? { error: problemWith(rule, 'blank') } : { value: null, text: '' };
  }
  // A list or an object has a string form that could pass for a number ("3" for ["3"]); only text and numbers are numbers.
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: problemWith(rule, 'invalid') };
  const parsed = parseTyped(raw, Boolean(rule.shorthand));
  if (!parsed) return { error: problemWith(rule, 'invalid') };
  let { value } = parsed;
  let text = parsed.factor === 1 ? parsed.digits : String(parsed.value);
  if (rule.whole && !Number.isInteger(value)) {
    if (!rule.roundWhole) return { error: problemWith(rule, 'fraction') };
    value = Math.round(value);
    text = String(value);
  }
  if (value < (rule.min ?? 0)) return { error: problemWith(rule, 'low') };
  if (rule.max !== undefined && value > rule.max) return { error: problemWith(rule, 'high') };
  return { value, text };
}

// ── a home ───────────────────────────────────────────────────────────────────

/**
 * The four numbers on a home. Price is the one a buyer's payment is worked out from, so it is required and
 * has a floor: a base price of $475 is a typed "475k" that lost its k, never a real home. The rest are
 * optional on purpose. A plan that is still being drawn has no square footage yet, and a made-up one is
 * worse than none, so a blank means "not given": it is stored as 0 and the buyer app shows nothing for it.
 */
export const HOME_NUMBER_RULES = {
  price: {
    name: 'the price', what: 'the price in dollars', example: '475000 or 475k', unit: 'dollars', min: 10000, max: 100000000,
    required: true, whole: true, roundWhole: true, shorthand: true,
    messages: {
      blank: 'Type the price, like 475000 or 475k.',
      invalid: 'The price must be a number, like 475000 or 475k.',
      low: 'That price looks too low. Type the whole price, like 475000 or 475k.',
      high: 'That price looks too high. Check for an extra zero.',
    },
  },
  beds: {
    name: 'beds', what: 'the number of bedrooms', example: '3', min: 0, max: 20, whole: true,
    messages: { invalid: 'Beds must be a number, like 3, or blank if you do not know yet.', fraction: 'Beds must be a whole number, like 3.', high: 'That is too many bedrooms. Check the number.', low: 'Beds cannot be less than 0.' },
  },
  baths: {
    name: 'baths', what: 'the number of bathrooms', example: '2.5', min: 0, max: 20,
    messages: { invalid: 'Baths must be a number, like 2.5, or blank if you do not know yet.', high: 'That is too many bathrooms. Check the number.', low: 'Baths cannot be less than 0.' },
  },
  sqft: {
    name: 'square feet', what: 'the square footage', example: '2400', min: 0, max: 100000, whole: true, roundWhole: true,
    messages: { invalid: 'Sq ft must be a number, like 2400, or blank if you do not know yet.', high: 'That is too many square feet. Check the number.', low: 'Sq ft cannot be less than 0.' },
  },
};

/**
 * A home's numbers from a request or a form, checked. `price` is required unless `partial` and absent;
 * the others are blank-tolerant. A blank bed, bath or square-foot count comes back as 0, which is how the
 * stores already keep "not given" and what the buyer app already hides.
 *
 * Returns `{ data }` with only the fields that were present (and all four when `partial` is false), or
 * `{ error }` with the first problem in words fit for a 400.
 */
export function readHomeNumbers(body, { partial = false } = {}) {
  const data = {};
  for (const key of Object.keys(HOME_NUMBER_RULES)) {
    const present = body?.[key] !== undefined;
    if (partial && !present) continue;
    const rule = HOME_NUMBER_RULES[key];
    const read = readNumber(present ? body[key] : null, rule);
    if (read.error) return { error: read.error };
    data[key] = read.value ?? 0;
  }
  return { data };
}

/** A price as it is shown back to the person typing it: "$475,000", or '' when it is not readable yet. */
export function priceFromTyped(raw) {
  const read = readNumber(raw, HOME_NUMBER_RULES.price);
  return read.error ? '' : `$${withCommas(read.value)}`;
}

// ── a community's rates and costs ────────────────────────────────────────────

const RATE = { what: 'a rate', example: '6.75', unit: 'percent', min: 0.5, max: 20, required: true };

/**
 * The boxes on Setup that feed the buyer's payment figures, each with the range that makes sense for how
 * the app uses it: a 30-year rate, a yearly tax as a share of the price, an insurance bill, a credit score.
 * A rate is the one most often edited, so it is required; the DPA boxes can be left blank (a community with
 * no program, or no price cap) and are only checked when something is typed.
 */
export const SETTING_NUMBER_RULES = {
  rateConv: { ...RATE, name: 'the conventional rate' },
  rateFha: { ...RATE, name: 'the FHA rate' },
  rateVa: { ...RATE, name: 'the VA rate' },
  taxPctYr: {
    name: 'the property tax', what: 'a percentage', example: '0.55', unit: 'percent', min: 0, max: 5, required: true,
    messages: { blank: 'Type the yearly property tax as a percentage of the price, like 0.55.' },
  },
  insuranceYr: {
    name: 'the yearly insurance', what: 'a dollar amount', example: '1400', unit: 'dollars', min: 0, max: 50000, required: true, shorthand: true,
  },
  hoaMo: { name: 'the monthly HOA', what: 'a dollar amount', example: '45', unit: 'dollars', min: 0, max: 5000, shorthand: true },
  dpaIncomeLimit: {
    name: 'the income limit', what: 'a dollar amount', example: '162500', unit: 'dollars', min: 10000, max: 1000000, shorthand: true,
  },
  dpaMinCredit: { name: 'the minimum credit score', what: 'a score', example: '660', min: 300, max: 850, whole: true },
  dpaPriceCap: {
    name: 'the price cap', what: 'a dollar amount', example: '450000', unit: 'dollars', min: 10000, max: 100000000, shorthand: true,
  },
  dpaAmount: {
    name: 'the assistance amount', what: 'a dollar amount', example: '20000', unit: 'dollars', min: 0, max: 1000000, shorthand: true,
  },
  dpaPct: { name: 'the assistance percentage', what: 'a percentage', example: '6', unit: 'percent', min: 0, max: 50 },
  creditExcellentMin: { name: 'the Excellent cutoff', what: 'a score', example: '740', min: 300, max: 850, whole: true, required: true },
  creditGoodMin: { name: 'the Good cutoff', what: 'a score', example: '700', min: 300, max: 850, whole: true, required: true },
  creditFairMin: { name: 'the Fair cutoff', what: 'a score', example: '660', min: 300, max: 850, whole: true, required: true },
};
export const NUMBER_SETTING_KEYS = Object.keys(SETTING_NUMBER_RULES);

/** The most a 30-year rate may be: the same ceiling for the Setup box and for the rate webhook. */
export const RATE_RANGE = { min: RATE.min, max: RATE.max };

/** Reads one of those boxes by its settings key. */
export function readSetting(key, raw) {
  return readNumber(raw, SETTING_NUMBER_RULES[key]);
}

/** Credit ranges read "Good 700-739", so each cutoff has to sit above the next: Excellent, then Good, then Fair. */
export function creditOrderProblem(settings) {
  const [excellent, good, fair] = ['creditExcellentMin', 'creditGoodMin', 'creditFairMin'].map((key) => Number(readSetting(key, settings?.[key]).value));
  if (![excellent, good, fair].every(Number.isFinite)) return '';
  return excellent > good && good > fair ? '' : 'The cutoffs must go down: Excellent above Good, and Good above Fair, like 740, 700 and 660.';
}

/** A rate or cost as the summary line writes it: without a stray % that the line adds itself. */
export const withoutPercent = (value) => String(value ?? '').trim().replace(/%+$/, '').trim();
