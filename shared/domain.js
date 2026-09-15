/**
 * Domain constants and calculators shared by the Express server and the React client.
 * Every number in here traces back to the design handoff — keep the two in step.
 */

export const THEMES = {
  classic: 'Classic',
  modern: 'Modern',
  lux: 'Soft Luxury',
  blueprint: 'Blueprint',
  slate: 'Slate Dark',
  estate: 'Estate Dark',
};

/** [accent, background] swatch pairs for the admin theme picker. */
export const THEME_CHIPS = {
  classic: ['#8a5230', '#f4eee3'],
  modern: ['#1d63e0', '#ffffff'],
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

/** Buying power: 36% DTI, 82% of that toward housing, 5% down. */
export function calcAffordability({ income, debts, credit, settings }) {
  const rate = ratesOf(settings).conv + creditRateAdjustment(credit);
  const maxPayment = Math.max(0, num(income) / 12 * 0.36 - num(debts));
  const loan = amountFor(maxPayment * 0.82, rate);
  return { rate, maxPayment, loan, buyingPower: loan / 0.95 };
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
