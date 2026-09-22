/**
 * Domain constants and calculators shared by the Express server and the React client.
 * Every number in here traces back to the design handoff — keep the two in step.
 */

/**
 * Buyer app themes. Each one carries the five colours its palette is defined by;
 * the CSS in base.css derives the rest (muted ink, tints, on-accent text) and is
 * contrast-checked against them. These five are the source of truth for the
 * admin swatches and the PWA chrome, so there is one list to keep in step
 * rather than three.
 */
export const THEMES = {
  navy: {
    name: 'Navy & Gold', note: 'Trustworthy, premium, financial',
    primary: '#102A43', secondary: '#243B53', accent: '#D4A72C',
    background: '#F7F9FC', text: '#172B4D',
  },
  forest: {
    name: 'Forest Green & Cream', note: 'Wealth, stability, natural, sophisticated',
    primary: '#1F4D3A', secondary: '#356859', accent: '#D8B56A',
    background: '#F8F5ED', text: '#26352E',
  },
  azure: {
    name: 'Modern Blue & White', note: 'Clean, modern, trustworthy, tech-oriented',
    primary: '#2563EB', secondary: '#1E40AF', accent: '#38BDF8',
    background: '#F8FAFC', text: '#172033',
  },
  ember: {
    name: 'Black, White & Orange', note: 'Bold, modern, energetic',
    primary: '#111111', secondary: '#262626', accent: '#F97316',
    background: '#F5F5F5', text: '#171717',
  },
  violet: {
    name: 'Deep Purple & Lavender', note: 'Modern startup, technology, innovative',
    primary: '#4C1D95', secondary: '#6D28D9', accent: '#A78BFA',
    background: '#F7F5FF', text: '#211A2E',
  },
  teal: {
    name: 'Teal & Navy', note: 'Professional but less traditional than financial blue',
    primary: '#0F766E', secondary: '#164E63', accent: '#2DD4BF',
    background: '#F0FDFA', text: '#183B43',
  },
  bronze: {
    name: 'Charcoal & Bronze', note: 'Luxury, established, high-end real estate',
    primary: '#242224', secondary: '#3A3A3A', accent: '#B68A52',
    background: '#FAF8F5', text: '#292929',
  },
  sage: {
    name: 'Slate Blue & Soft Green', note: 'Friendly, approachable, professional',
    primary: '#475569', secondary: '#64748B', accent: '#65A30D',
    background: '#F8FAFC', text: '#1E293B',
  },
  ice: {
    name: 'Ice Blue & Dark Navy', note: 'Fintech / SaaS, clean, modern',
    primary: '#0F172A', secondary: '#1E293B', accent: '#06B6D4',
    background: '#F1F5F9', text: '#0F172A',
  },
  clay: {
    name: 'Warm Modern Real Estate', note: 'Modern homes, real estate, approachable, upscale',
    primary: '#3F3A34', secondary: '#6B6258', accent: '#C48A5A',
    background: '#F4EFE8', text: '#292621',
  },
};

export const DEFAULT_THEME = 'navy';

/**
 * The palette that shipped before this set is still on live communities, and a
 * theme key that resolves to nothing renders the buyer app with no colour
 * variables at all — white text on white. Each retired key maps to its nearest
 * survivor rather than being dropped.
 *
 * 'forest' is deliberately reused: it was Deep Forest (dark evergreen) and is
 * now Forest Green & Cream. Same family, lighter surface.
 */
const RETIRED_THEMES = {
  classic: 'forest',   // cream and brown, retired before this set
  modern: 'teal',      // Modern Green — bright green on white
  lux: 'forest',       // Emerald & Gold — green with a gold accent
  blueprint: 'azure',  // Blueprint Blue
  slate: 'ice',        // Midnight Blue
  estate: 'clay',      // Warm Umber
};

export function normalizeTheme(theme) {
  if (RETIRED_THEMES[theme]) return RETIRED_THEMES[theme];
  return THEMES[theme] ? theme : DEFAULT_THEME;
}

/** Swatch stops for the admin theme picker: brand, accent, page. */
export const THEME_CHIPS = Object.fromEntries(
  Object.entries(THEMES).map(([key, t]) => [key, [t.primary, t.accent, t.background]]),
);

/**
 * The colour the phone paints its status bar with. The primary is the darkest
 * of the five, which is what the chrome should match — these are light themes,
 * so the background would wash the bar out.
 */
export const THEME_COLORS = Object.fromEntries(
  Object.entries(THEMES).map(([key, t]) => [key, t.primary]),
);

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

/**
 * Display features a builder turns on per community. Unlike TOOLS these are not
 * screens of their own — they add detail to homes the buyer is already looking at.
 * Each is also hidden when there is nothing to show, so "on" never means "empty".
 */
export const FEATURES = [
  { k: 'lotNumbers', name: 'Lot numbers', q: 'Show which lot each home sits on' },
  { k: 'floorPlans', name: 'Floor plans', q: 'Let buyers open the plan drawing for a home' },
  { k: 'siteMap', name: 'Site map', q: 'Show the community plat so buyers can place a home' },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.k);

export const DEFAULT_FEATURES = { lotNumbers: true, floorPlans: true, siteMap: true };

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
  // Where call requests are emailed. Blank falls back to the admin account that
  // owns the dashboard, so a builder who never sets this still gets told.
  notifyEmail: '',
};

/**
 * Appointment slots.
 *
 * Dates and times are stored and shown as literal values — '2026-09-20' and
 * '14:00' — never as timestamps. A builder who publishes 2:00 PM means 2pm at
 * the community. A timestamp would be re-rendered in the viewer's timezone, so
 * the admin dashboard, the buyer's phone and the alert email could each show a
 * different hour for the same appointment. Literal values cannot drift.
 */
export const SLOT_TIMES = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00',
];

export const CONTACT_METHODS = [
  { k: 'phone', label: 'Give me a call', short: 'Phone' },
  { k: 'email', label: 'Send me an email', short: 'Email' },
];
export const CONTACT_METHOD_KEYS = CONTACT_METHODS.map((m) => m.k);

export function contactMethodLabel(key) {
  return CONTACT_METHODS.find((m) => m.k === key)?.short ?? 'Phone';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' for a Date, in the viewer's own calendar rather than UTC. */
export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** '2026-09-20' -> 'Sat, Sep 20'. Parsed by parts, so no UTC shift. */
export function formatSlotDate(value) {
  const [y, m, d] = String(value ?? '').split('-').map(Number);
  if (!y || !m || !d) return String(value ?? '');
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

/** '14:00' -> '2:00 PM'. */
export function formatSlotTime(value) {
  const [h, min] = String(value ?? '').split(':').map(Number);
  if (Number.isNaN(h)) return String(value ?? '');
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(min ?? 0).padStart(2, '0')} ${suffix}`;
}

/**
 * One line describing a request, for the admin list and the alert email.
 * Handles requests made before slots existed, which carry free text instead.
 */
export function describeTour(tour) {
  if (!tour) return '';
  if (tour.date && tour.time) {
    const how = contactMethodLabel(tour.contact).toLowerCase();
    return `${formatSlotDate(tour.date)} at ${formatSlotTime(tour.time)} · by ${how}`;
  }
  return tour.time || 'No time given';
}

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

// ── the move-in plan ───────────────────────────────────────────────────────

/**
 * How the buyer is paying decides the shape of the timeline. Cash and a loan
 * are genuinely different: no appraisal, no underwriting, and keys weeks
 * sooner. The three loan programs are not — conventional, FHA and VA all run
 * the same sequence, so asking which one here would imply a difference the
 * dates do not actually make.
 */
export const PAY_METHODS = [
  { k: 'loan', label: 'With a loan' },
  { k: 'cash', label: 'Paying cash' },
];
export const PAY_METHOD_KEYS = PAY_METHODS.map((m) => m.k);

/**
 * Every step of the purchase, offset in weeks from the offer. A null week means
 * the method skips that step entirely. `who` answers the question buyers are
 * really sitting with — "is this one mine?" — because most of the waiting is
 * somebody else's work and nobody tells them that.
 */
export const MOVE_IN_STEPS = [
  { key: 'preapproval', label: 'Get pre-approved', who: 'you', weeks: { loan: -3, cash: null } },
  { key: 'proof', label: 'Gather proof of funds', who: 'you', weeks: { loan: null, cash: -1 } },
  { key: 'offer', label: 'Offer accepted & earnest money', who: 'you', weeks: { loan: 0, cash: 0 } },
  { key: 'inspection', label: 'Home inspection', who: 'you', weeks: { loan: 1, cash: 1 } },
  { key: 'appraisal', label: 'Appraisal ordered', who: 'lender', weeks: { loan: 2, cash: null } },
  { key: 'underwriting', label: 'Loan underwriting & approval', who: 'lender', weeks: { loan: 4, cash: null } },
  { key: 'walkthrough', label: 'Final walkthrough', who: 'you', weeks: { loan: 5, cash: 2 } },
  { key: 'closing', label: 'Closing day — keys', who: 'you', weeks: { loan: 6, cash: 3 } },
];

export const MOVE_IN_STEP_KEYS = MOVE_IN_STEPS.map((s) => s.key);
export const WHO_LABELS = { you: 'You', lender: 'Your lender', builder: 'The builder' };

/** Optional prompts for what is driving the date, each adding steps of its own. */
export const MOVE_IN_DRIVERS = [
  {
    k: 'lease',
    label: 'My lease is ending',
    steps: [{ key: 'notice', label: 'Give notice to your landlord', who: 'you', beforeKeys: 60 }],
  },
  {
    k: 'selling',
    label: 'I need to sell first',
    steps: [{ key: 'list', label: 'List your current home', who: 'you', beforeKeys: 120 }],
  },
  {
    k: 'school',
    label: 'Before the school year',
    steps: [{ key: 'school', label: 'Register for school', who: 'you', beforeKeys: 30 }],
  },
  {
    k: 'movers',
    label: 'I need to book movers',
    steps: [{ key: 'movers', label: 'Book movers', who: 'you', beforeKeys: 21 }],
  },
];
export const MOVE_IN_DRIVER_KEYS = MOVE_IN_DRIVERS.map((d) => d.k);
export const MOVE_IN_DRIVER_STEP_KEYS = MOVE_IN_DRIVERS.flatMap((d) => d.steps.map((s) => s.key));

/** Weeks from offer to keys, by method. */
export const closingWeeks = (payMethod) =>
  MOVE_IN_STEPS.find((s) => s.key === 'closing')?.weeks[payMethod] ?? 6;

/**
 * When a home could hand over keys. A finished home is limited only by the
 * paperwork. Anything still being built is limited by the build, and we do not
 * guess at that: either the builder set a date or the buyer is told plainly
 * that nobody has. Inventing a date here would have someone giving notice on
 * their lease around a number we made up.
 */
export function homeReadiness(home) {
  if (!home || home.availability === 'Move-in ready') return { built: true, on: '' };
  return { built: false, on: home.readyOn || '' };
}

/** Literal date arithmetic: 'YYYY-MM-DD' shifted by whole days, no timezone in the way. */
export function shiftDate(value, days) {
  const [y, m, d] = String(value ?? '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Whole days from `from` to `to`. Negative when `to` is the earlier date. */
export function daysBetween(from, to) {
  const parse = (value) => {
    const [y, m, d] = String(value ?? '').split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * The buyer's timeline, worked backwards from the date they want to be living
 * there — the question they have an answer to, unlike "when would you make an
 * offer?". Everything else falls out of it, including the date they would have
 * to start.
 */
export function moveInSchedule({ target, payMethod = 'loan', home = null, drivers = [], today = isoDate(new Date()) }) {
  const method = PAY_METHOD_KEYS.includes(payMethod) ? payMethod : 'loan';
  const span = closingWeeks(method) * 7;
  const ready = homeReadiness(home);

  // Keys can come no sooner than the paperwork allows, and never before the
  // home itself is finished.
  const soonestPaperwork = shiftDate(today, span);
  const unknownReady = !ready.built && !ready.on;
  const earliest = unknownReady
    ? ''
    : !ready.built && ready.on > soonestPaperwork
      ? ready.on
      : soonestPaperwork;

  const keys = target || earliest;
  const feasible = Boolean(keys) && (!earliest || keys >= earliest);
  const offerBy = keys ? shiftDate(keys, -span) : '';

  const steps = MOVE_IN_STEPS.filter((step) => step.weeks[method] !== null).map((step) => ({
    key: step.key,
    label: step.label,
    who: step.who,
    date: offerBy ? shiftDate(offerBy, step.weeks[method] * 7) : '',
  }));

  // A driver's steps hang off the keys date, not the offer — "give notice 60
  // days before you move" is about the move, not the paperwork.
  const driverSteps = MOVE_IN_DRIVERS.filter((d) => drivers.includes(d.k)).flatMap((d) =>
    d.steps.map((step) => ({
      key: step.key,
      label: step.label,
      who: step.who,
      date: keys ? shiftDate(keys, -step.beforeKeys) : '',
    })),
  );

  return { payMethod: method, span, keys, offerBy, earliest, feasible, unknownReady, steps: [...steps, ...driverSteps] };
}

/**
 * The gap a renter actually loses sleep over. Positive days mean the lease runs
 * past the keys — paying for two places. Negative means it ends first, with
 * nowhere to live in between.
 */
export function leaseOverlap(leaseEnd, keys) {
  const days = daysBetween(keys, leaseEnd);
  if (days === null) return null;
  return { days, kind: days > 0 ? 'overlap' : days < 0 ? 'gap' : 'same' };
}

/** Everything the buyer built, ordered by date, with their own items folded in. */
export function moveInTimeline(plan, { home = null, today } = {}) {
  const schedule = moveInSchedule({
    target: plan?.targetDate || '',
    payMethod: plan?.payMethod || 'loan',
    drivers: plan?.drivers || [],
    home,
    ...(today ? { today } : {}),
  });
  const own = (plan?.ownSteps || []).map((step) => ({
    key: `own:${step.id}`,
    label: step.label,
    who: 'you',
    date: step.date || '',
    own: true,
  }));
  const done = new Set(plan?.done || []);
  const items = [...schedule.steps, ...own]
    .map((step) => ({ ...step, done: done.has(step.key) }))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return { ...schedule, items };
}

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
/**
 * Identity for the entry gate. All three have to match for a returning buyer to
 * be signed back into their own record; anything different is somebody else.
 *
 * Matching compares the INFORMATION, not the keystrokes. "(801) 555-0111" and
 * "8015550111" are one phone number, and "Sam  Rivera" is "sam rivera" — a buyer
 * who comes back and types their number without brackets must not be handed a
 * duplicate, since avoiding duplicates is the entire point.
 */
const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '');
const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function leadIdentity(input) {
  return {
    email: normalizeEmail(input?.email),
    phone: normalizePhone(input?.phone),
    name: normalizeName(input?.name),
  };
}

/** True when this lead is the same person as the details just typed in. */
export function isSameLead(lead, input) {
  const a = leadIdentity(lead);
  const b = leadIdentity(input);
  return a.email === b.email && a.phone === b.phone && a.name === b.name;
}

export function isTourPending(lead) {
  // An archived lead is one the builder is done with, so it must stop counting
  // against the queue even if its request was never marked handled.
  return Boolean(lead?.tour && !lead.tour.handledAt && !lead.archivedAt);
}

/** Never opened by an admin. This is what "new" should have meant all along. */
export function isUnread(lead) {
  return !lead?.openedAt;
}

export function isArchived(lead) {
  return Boolean(lead?.archivedAt);
}

export function countPendingTours(leads = []) {
  return leads.filter(isTourPending).length;
}
