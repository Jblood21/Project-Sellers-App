/**
 * Domain constants and calculators shared by the Express server and the React client.
 * Every number in here traces back to the design handoff — keep the two in step.
 */

export const THEMES = {
  modern: 'Modern Green',
  forest: 'Deep Forest',
  lux: 'Emerald & Gold',
  blueprint: 'Blueprint Blue',
  slate: 'Midnight Blue',
  estate: 'Warm Umber',
};

/**
 * 'classic' (cream and brown) was retired in favour of 'forest'. Communities
 * created before that still carry the old value, so every read normalizes —
 * an unknown theme would render with no colour variables at all.
 */
export function normalizeTheme(theme) {
  if (theme === 'classic') return 'forest';
  return THEMES[theme] ? theme : 'modern';
}

/** [accent, background] swatch pairs for the admin theme picker. */
export const THEME_CHIPS = {
  modern: ['#147a4a', '#ffffff'],
  forest: ['#5fbf82', '#0b1d13'],
  lux: ['#cdb37e', '#0f231b'],
  blueprint: ['#1553b5', '#eef3f8'],
  slate: ['#4f8fde', '#171c23'],
  estate: ['#b3762e', '#1c1916'],
};

export const TOOLS = [
  { k: 'payment', name: 'See My Payment', q: 'What would a home cost me each month?' },
  { k: 'afford', name: 'See What I Can Afford', q: 'What price range fits my income?' },
  { k: 'loans', name: 'Find My Loan Options', q: 'What financing could work for me?' },
  { k: 'compare', name: 'Compare My Options', q: 'Which loan or down payment is smarter?' },
  { k: 'dpa', name: 'Down Payment Help', q: 'Could I get help with my down payment?' },
  { k: 'savings', name: 'My Savings Plan', q: 'How do I save what I need in time?' },
  { k: 'movein', name: 'My Move-In Plan', q: 'When could I actually get keys?' },
];

export const TOOL_KEYS = TOOLS.map((t) => t.k);

export const PLAN_LABELS = {
  homes: 'Homes I Like',
  afford: 'My Buying Power',
  payment: 'My Payment',
  loans: 'My Loan Options',
  compare: 'Compare My Options',
  dpa: 'Down Payment Help',
  savings: 'My Savings Plan',
  movein: 'My Move-In Plan',
};

/** Plan keys in the order the buyer is nudged through them: [key, label, screen]. */
export const NEXT_STEPS = [
  ['homes', 'Save a home you like', 'explore'],
  ['afford', 'See What I Can Afford', 'afford'],
  ['payment', 'See My Payment', 'payment'],
  ['loans', 'Find My Loan Options', 'loans'],
  ['compare', 'Compare My Options', 'compare'],
  ['dpa', 'See if down payment help is available', 'dpa'],
  ['savings', 'Build My Savings Plan', 'savings'],
  ['movein', 'Set My Move-In Plan', 'movein'],
];

export const PLAN_KEYS = Object.keys(PLAN_LABELS);

export const PROGRAMS = { conv: 'Conventional', fha: 'FHA', va: 'VA' };

export const PROGRAM_DESCRIPTIONS = {
  va: 'For veterans and active military — no down payment required, no monthly mortgage insurance.',
  fha: 'Easier credit requirements and as little as 3.5% down. Adds monthly mortgage insurance.',
  conv: 'The standard loan — best rates with stronger credit; mortgage insurance drops off at 20% equity.',
};

/**
 * What a builder can pin about the area around a community. Ordered the way a
 * buyer tends to ask: where do my kids go, what is there to do, where do I shop.
 */
export const HIGHLIGHT_CATEGORIES = [
  { k: 'schools', label: 'Schools' },
  { k: 'parks', label: 'Parks & Recreation' },
  { k: 'shopping', label: 'Shopping & Dining' },
  { k: 'health', label: 'Healthcare' },
  { k: 'commute', label: 'Getting Around' },
  { k: 'other', label: 'Good to Know' },
];

export const HIGHLIGHT_CATEGORY_KEYS = HIGHLIGHT_CATEGORIES.map((c) => c.k);

export function highlightCategoryLabel(key) {
  return HIGHLIGHT_CATEGORIES.find((c) => c.k === key)?.label ?? 'Good to Know';
}

export const AVAILABILITY = ['Planning', 'Under Construction', 'Move-in ready'];
export const COMMUNITY_STATUSES = ['Pre-sale', 'Now selling', 'Sold out'];

export const DEFAULT_TOOLS_ENABLED = {
  payment: true, afford: true, loans: true, compare: true, dpa: true, savings: true, movein: true,
};

export const DEFAULT_SETTINGS = {
  rateConv: '6.45',
  rateFha: '6.10',
  rateVa: '5.90',
  ratesUpdatedAt: null,
  taxPctYr: '0.55',
  insuranceYr: '1400',
  hoaMo: '45',
  dpaIncomeLimit: '110000',
  dpaAmount: '15000',
  dpaMinCredit: '660',
  creditExcellentMin: '740',
  creditGoodMin: '700',
  creditFairMin: '660',
};

export const MAX_PHOTOS_PER_HOME = 8;

// ── numbers ────────────────────────────────────────────────────────────────

export function num(v) {
  const parsed = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(n) {
  return '$' + Math.round(num(n)).toLocaleString('en-US');
}

/** Monthly principal & interest on a 30-year fixed loan. */
export function pay30(amount, ratePct) {
  const r = num(ratePct) / 1200;
  if (!r) return num(amount) / 360;
  return (num(amount) * r) / (1 - Math.pow(1 + r, -360));
}

/** Inverse of pay30 — the 30-year loan amount a given monthly payment supports. */
export function amountFor(payment, ratePct) {
  const r = num(ratePct) / 1200;
  if (!r) return num(payment) * 360;
  return (num(payment) * (1 - Math.pow(1 + r, -360))) / r;
}

export function ratesOf(settings) {
  return {
    conv: num(settings.rateConv),
    fha: num(settings.rateFha),
    va: num(settings.rateVa),
  };
}

/**
 * Full monthly cost breakdown for one home / program / down-payment combination.
 * MI: FHA always 0.55%/yr of the loan; conventional under 20% down 0.50%/yr; VA and
 * 20%-down conventional none.
 */
export function calcPayment({ price, program, downPct, settings }) {
  const p = num(price);
  const down = (p * num(downPct)) / 100;
  const loan = p - down;
  const rate = ratesOf(settings)[program] ?? 0;
  const pi = pay30(loan, rate);
  const tax = (p * num(settings.taxPctYr)) / 100 / 12;
  const insurance = num(settings.insuranceYr) / 12;
  const mi =
    program === 'fha'
      ? (loan * 0.0055) / 12
      : program === 'conv' && num(downPct) < 20
        ? (loan * 0.005) / 12
        : 0;
  const hoa = num(settings.hoaMo);
  return {
    price: p, down, loan, rate, pi, tax, insurance, mi, hoa,
    total: pi + tax + insurance + mi + hoa,
    cashToClose: down + p * 0.025,
  };
}

/** Credit-range adjustment applied to the conventional rate, per the handoff. */
export function creditRateAdjustment(credit) {
  if (credit === 'exc') return -0.15;
  if (credit === 'fair') return 0.35;
  return 0;
}

/**
 * Debt-to-income limits. 36% is the conservative rule of thumb; 43% is the
 * Qualified Mortgage threshold lenders commonly underwrite to. Showing only the
 * first told buyers they could afford less than a lender would actually lend
 * them, which reads as "no" when the real answer is "it depends".
 */
export const DTI_COMFORTABLE = 0.36;
export const DTI_LENDER_MAX = 0.43;

/** Share of the housing budget that goes to principal and interest. */
const HOUSING_SHARE = 0.82;

/**
 * Buying power across the range a lender would actually work in.
 *
 * `buyingPower` stays the conservative figure so nothing downstream silently
 * starts quoting the top of the range as if it were a recommendation.
 */
export function calcAffordability({
  income, debts, credit, settings, downPct = 5, downPayment = null,
}) {
  const rate = ratesOf(settings).conv + creditRateAdjustment(credit);
  const monthlyIncome = num(income) / 12;
  const debtLoad = num(debts);

  // A buyer who knows what they have saved gets the honest version: the price
  // they can reach is what they can borrow plus what they put in. Without a
  // figure we fall back to assuming a percentage.
  const hasCash = downPayment !== null && downPayment !== '' && num(downPayment) >= 0;
  const downShare = 1 - num(downPct) / 100;

  const at = (dti) => {
    const maxPayment = Math.max(0, monthlyIncome * dti - debtLoad);
    const loan = amountFor(maxPayment * HOUSING_SHARE, rate);
    const price = hasCash
      ? loan + num(downPayment)
      : downShare > 0
        ? loan / downShare
        : loan;
    return { maxPayment, loan, price, down: hasCash ? num(downPayment) : price - loan };
  };

  const comfortable = at(DTI_COMFORTABLE);
  const lenderMax = at(DTI_LENDER_MAX);

  return {
    rate,
    maxPayment: comfortable.maxPayment,
    loan: comfortable.loan,
    buyingPower: comfortable.price,
    comfortable,
    lenderMax,
  };
}

/**
 * Concrete, computed things that move the number — so a buyer who comes up
 * short sees what to do about it rather than just a figure below every price
 * on the board. Each delta is the real difference this calculator produces,
 * not a motivational guess.
 */
export function affordabilityLevers({
  income, debts, credit, settings, dpaAmount = 0, downPayment = null,
}) {
  const shared = { income, credit, settings, downPayment };
  const base = calcAffordability({ ...shared, debts });
  if (!num(income)) return [];
  const levers = [];

  if (num(debts) > 0) {
    const cleared = calcAffordability({ ...shared, debts: 0 });
    levers.push({
      key: 'debt',
      label: `Paying off your ${money(debts)}/mo of other debts`,
      delta: cleared.buyingPower - base.buyingPower,
    });
  }

  // Deliberately no "put less down" lever: a smaller down payment means less
  // cash at closing, not a bigger house. For a fixed monthly payment the loan
  // is the same, so less down buys slightly LESS. That belongs in the savings
  // and payment tools, not here.

  if (num(dpaAmount) > 0) {
    levers.push({
      key: 'dpa',
      label: `Down payment help (${money(dpaAmount)})`,
      delta: num(dpaAmount),
    });
  }

  if (credit !== 'exc') {
    const better = calcAffordability({
      ...shared, debts, credit: credit === 'fair' ? 'good' : 'exc',
    });
    const delta = better.buyingPower - base.buyingPower;
    if (delta > 0) {
      levers.push({
        key: 'credit',
        label: credit === 'fair' ? 'Moving up one credit range' : 'Reaching the top credit range',
        delta,
      });
    }
  }

  return levers.filter((l) => l.delta > 500).sort((a, b) => b.delta - a.delta);
}

export function creditRanges(settings) {
  const exc = num(settings.creditExcellentMin);
  const good = num(settings.creditGoodMin);
  const fair = num(settings.creditFairMin);
  return [
    { k: 'exc', min: exc, label: `Excellent ${exc}+` },
    { k: 'good', min: good, label: `Good ${good}–${exc - 1}` },
    { k: 'fair', min: fair, label: `Fair ${fair}–${good - 1}` },
  ];
}

/** 'likely' | 'maybe' | 'unlikely' | null (null = not enough answers yet). */
export function screenDpa({ income, credit, firstTime, military, settings }) {
  const inc = num(income);
  if (!inc) return null;
  const ranges = creditRanges(settings);
  const creditMin = ranges.find((r) => r.k === credit)?.min ?? 0;
  const limit = num(settings.dpaIncomeLimit);
  const minCredit = num(settings.dpaMinCredit);
  if (inc <= limit && creditMin >= minCredit && (firstTime === 'yes' || military === 'yes')) return 'likely';
  if (inc <= limit * 1.15 && creditMin >= minCredit) return 'maybe';
  return 'unlikely';
}

/** Loan programs that may fit, with the reason shown to the buyer. Max 2. */
export function suggestPrograms({ veteran, downPct, credit }) {
  const out = [];
  if (veteran === 'yes') {
    out.push({ k: 'va', why: 'You may have VA eligibility — usually the strongest option: $0 down and no monthly mortgage insurance.' });
  }
  if (credit === 'exc' || (credit === 'good' && num(downPct) >= 5)) {
    out.push({ k: 'conv', why: 'Your credit range gets competitive conventional pricing, and insurance can drop off later.' });
  }
  if (credit === 'fair' || num(downPct) < 5) {
    out.push({
      k: 'fha',
      why: `FHA is friendlier to ${credit === 'fair' ? 'fair credit' : 'smaller down payments'} — 3.5% down works.`,
    });
  }
  if (!out.length) out.push({ k: 'conv', why: 'A solid default — ask the lender to price FHA alongside it.' });
  return out.slice(0, 2);
}

/** The six move-in phases, offset in weeks from the offer date. */
export const MOVE_IN_PHASES = [
  ['Offer accepted & earnest money', 0],
  ['Home inspection', 1],
  ['Appraisal ordered', 2],
  ['Loan underwriting & approval', 4],
  ['Final walkthrough', 5],
  ['Closing day — keys', 6],
];

/** Percent of the 8-item home plan a lead has completed. */
export function planProgress(lead) {
  if (!lead) return 0;
  const done = PLAN_KEYS.filter((k) =>
    k === 'homes' ? (lead.savedHomeIds || []).length > 0 : Boolean(lead.plan?.[k]),
  );
  return Math.round((done.length / PLAN_KEYS.length) * 100);
}

/**
 * A call request the builder still owes someone. Requests stay on the lead
 * forever, so without the handled stamp every badge would eventually be stale
 * and the signal worthless.
 */
export function isTourPending(lead) {
  return Boolean(lead?.tour && !lead.tour.handledAt);
}

export function countPendingTours(leads = []) {
  return leads.filter(isTourPending).length;
}
