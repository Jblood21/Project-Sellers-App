/**
 * The facts about a home that a buyer weighs besides beds, baths and price: when it was built, the size of the lot,
 * what the HOA costs, the property tax, and the features an agent picks out ("What's special"). Shared so the server's
 * checks, the admin's boxes and the buyer's page all read them the same way.
 *
 * Every one is optional. A blank is "not given" (null), never a made-up number, and the buyer app leaves it out.
 * HOA keeps two blanks apart on purpose: null is "not given", 0 is "none".
 */

export const MAX_FEATURES = 40;

/** The picks, grouped the way a buyer thinks about a home. `k` is stored; `label` is shown. */
export const FEATURE_GROUPS = [
  {
    key: 'interior', label: 'Inside',
    items: [
      ['updated-kitchen', 'Updated kitchen'], ['quartz-counters', 'Quartz counters'], ['granite-counters', 'Granite counters'],
      ['stainless-appliances', 'Stainless steel appliances'], ['gas-range', 'Gas range'], ['double-oven', 'Double oven'],
      ['kitchen-island', 'Kitchen island'], ['walk-in-pantry', 'Walk-in pantry'], ['open-floor-plan', 'Open floor plan'],
      ['vaulted-ceilings', 'Vaulted ceilings'], ['hardwood-floors', 'Hardwood floors'], ['lvp-floors', 'Luxury vinyl plank floors'],
      ['new-carpet', 'New carpet'], ['fresh-paint', 'Fresh paint'], ['fireplace', 'Fireplace'], ['gas-fireplace', 'Gas fireplace'],
      ['built-ins', 'Built-in shelving'], ['bonus-room', 'Bonus room'], ['loft', 'Loft'], ['office', 'Office or den'],
      ['main-floor-primary', 'Main-floor primary suite'], ['walk-in-closet', 'Walk-in closet'], ['soaking-tub', 'Soaking tub'],
      ['double-vanity', 'Double vanity'], ['walk-in-shower', 'Walk-in shower'], ['main-floor-laundry', 'Main-floor laundry'],
      ['mudroom', 'Mudroom'], ['large-windows', 'Large windows'], ['natural-light', 'Lots of natural light'],
      ['smart-home', 'Smart home features'], ['recessed-lighting', 'Recessed lighting'], ['crown-molding', 'Crown molding'],
      ['plantation-shutters', 'Plantation shutters'], ['ceiling-fans', 'Ceiling fans'],
    ],
  },
  {
    key: 'space', label: 'Extra space',
    items: [
      ['finished-basement', 'Finished basement'], ['walkout-basement', 'Walk-out basement'], ['basement-apartment', 'Basement apartment'],
      ['adu', 'Accessory dwelling unit'], ['in-law-suite', 'In-law suite'], ['theater-room', 'Theater room'], ['game-room', 'Game room'],
      ['storage', 'Extra storage'], ['cold-storage', 'Cold storage room'], ['workshop', 'Workshop'],
    ],
  },
  {
    key: 'outdoor', label: 'Outside',
    items: [
      ['fenced-yard', 'Fenced yard'], ['landscaped', 'Professionally landscaped'], ['covered-patio', 'Covered patio'], ['deck', 'Deck'],
      ['hot-tub', 'Hot tub'], ['pool', 'Pool'], ['sprinklers', 'Sprinkler system'], ['mature-trees', 'Mature trees'],
      ['fruit-trees', 'Fruit trees'], ['garden-beds', 'Garden beds'], ['fire-pit', 'Fire pit'], ['outdoor-kitchen', 'Outdoor kitchen'],
      ['sport-court', 'Sport court'], ['pergola', 'Pergola'], ['playset', 'Playset'], ['shed', 'Storage shed'],
      ['large-lot', 'Large lot'], ['corner-lot', 'Corner lot'], ['cul-de-sac', 'Cul-de-sac'], ['backs-open-space', 'Backs to open space'],
      ['backs-trail', 'Backs to a trail'], ['horse-property', 'Horse property'], ['irrigation-water', 'Irrigation water'],
    ],
  },
  {
    key: 'views', label: 'Views',
    items: [
      ['mountain-view', 'Mountain view'], ['valley-view', 'Valley view'], ['lake-view', 'Lake view'], ['city-view', 'City view'],
      ['sunset-view', 'Sunset view'], ['golf-view', 'Golf course view'], ['open-space-view', 'Open space view'],
    ],
  },
  {
    key: 'parking', label: 'Parking',
    items: [
      ['garage-2', '2-car garage'], ['garage-3', '3-car garage'], ['garage-oversized', 'Oversized garage'],
      ['garage-attached', 'Attached garage'], ['ev-charger', 'EV charger'], ['rv-parking', 'RV parking'],
      ['extra-parking', 'Extra parking'], ['carport', 'Carport'],
    ],
  },
  {
    key: 'systems', label: 'Systems and savings',
    items: [
      ['new-roof', 'New roof'], ['new-furnace', 'New furnace'], ['new-ac', 'New A/C'], ['central-air', 'Central air'],
      ['tankless-heater', 'Tankless water heater'], ['water-softener', 'Water softener'], ['solar', 'Solar panels'],
      ['efficient-windows', 'Energy-efficient windows'], ['energy-star', 'Energy Star'], ['new-electrical', 'Updated electrical'],
      ['radon-mitigation', 'Radon mitigation'], ['fiber-internet', 'Fiber internet'], ['low-utility', 'Low utility costs'],
    ],
  },
  {
    key: 'location', label: 'Location and community',
    items: [
      ['near-schools', 'Near schools'], ['near-trails', 'Near trails'], ['near-ski', 'Near ski resorts'], ['commuter-access', 'Easy commuter access'],
      ['near-shopping', 'Near shopping'], ['near-parks', 'Near parks'], ['quiet-street', 'Quiet street'], ['walkable', 'Walkable'],
      ['community-pool', 'Community pool'], ['clubhouse', 'Clubhouse'], ['playground', 'Playground'], ['pickleball', 'Pickleball courts'],
      ['fitness-center', 'Fitness center'], ['low-hoa', 'Low HOA'], ['no-hoa', 'No HOA'], ['gated-community', 'Gated community'],
      ['lake-access', 'Lake access'], ['golf-community', 'Golf community'],
    ],
  },
  {
    key: 'condition', label: 'Style and condition',
    items: [
      ['new-construction', 'New construction'], ['move-in-ready', 'Move-in ready'], ['recently-remodeled', 'Recently remodeled'],
      ['original-owner', 'Original owner'], ['rambler', 'Single level (rambler)'], ['two-story', 'Two story'],
      ['townhome', 'Townhome'], ['corner-unit', 'Corner unit'], ['main-level-living', 'Main-level living'],
      ['step-free-entry', 'Step-free entry'], ['wide-doorways', 'Wide doorways'],
    ],
  },
];

export const FEATURES = FEATURE_GROUPS.flatMap((group) => group.items.map(([k, label]) => ({ k, label, group: group.key })));
const LABELS = new Map(FEATURES.map((f) => [f.k, f.label]));

export const FEATURE_KEYS = FEATURES.map((f) => f.k);

export function featureLabel(key) {
  return LABELS.get(key) ?? '';
}

/** The labels of the picks that are still real (an old key that left the list is dropped), in the order picked. */
export function featureLabels(keys) {
  return (Array.isArray(keys) ? keys : []).map(featureLabel).filter(Boolean);
}

const thisYear = () => new Date().getFullYear();

/** A blank (or only spaces) is "not given". */
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

function readNumberOrNull(raw, { min, max, decimals = 0, name }) {
  if (blank(raw)) return { value: null };
  const text = String(raw).replace(/[$,%\s]/g, '').replace(/,/g, '');
  const n = Number(text);
  if (!Number.isFinite(n)) return { error: `${name} must be a number.` };
  if (n < min || n > max) return { error: `${name} must be between ${min} and ${max}.` };
  const factor = 10 ** decimals;
  return { value: Math.round(n * factor) / factor };
}

/**
 * Reads the fact boxes of a request body: `{ data }` with what was sent (nothing is touched that was not sent when
 * `partial`), or `{ error }` in words. `hoa` may be 'none', or a monthly dollar amount; tax is a percent of the
 * price (`taxPct`) or a dollar amount a year (`taxAnnual`), one at a time: sending one clears the other.
 */
export function readHomeFacts(body, { partial = false } = {}) {
  const data = {};
  const sent = (key) => body?.[key] !== undefined;

  if (!partial || sent('yearBuilt')) {
    const r = readNumberOrNull(body?.yearBuilt, { min: 1800, max: thisYear() + 2, name: 'Year built' });
    if (r.error) return r;
    data.yearBuilt = r.value;
  }
  if (!partial || sent('lotAcres')) {
    const r = readNumberOrNull(body?.lotAcres, { min: 0, max: 10000, decimals: 3, name: 'Lot size' });
    if (r.error) return r;
    data.lotAcres = r.value;
  }
  if (!partial || sent('hoaMonthly')) {
    const raw = body?.hoaMonthly;
    if (String(raw ?? '').trim().toLowerCase() === 'none') data.hoaMonthly = 0;
    else {
      const r = readNumberOrNull(raw, { min: 0, max: 10000, decimals: 2, name: 'HOA' });
      if (r.error) return r;
      data.hoaMonthly = r.value;
    }
  }
  if (!partial || sent('taxPct') || sent('taxAnnual')) {
    const pct = readNumberOrNull(body?.taxPct, { min: 0, max: 5, decimals: 3, name: 'Property tax percent' });
    if (pct.error) return pct;
    const amount = readNumberOrNull(body?.taxAnnual, { min: 0, max: 500000, decimals: 0, name: 'Property tax' });
    if (amount.error) return amount;
    // One at a time: whichever has a figure wins (the percent when both do, so it follows a changed price).
    data.taxPct = pct.value;
    data.taxAnnual = pct.value === null ? amount.value : null;
  }
  if (!partial || sent('features')) {
    const list = body?.features ?? [];
    if (!Array.isArray(list)) return { error: 'Pick the features from the list.' };
    const keys = [];
    for (const key of list) {
      if (!LABELS.has(key)) return { error: 'One of the features is not on the list.' };
      if (!keys.includes(key)) keys.push(key);
    }
    if (keys.length > MAX_FEATURES) return { error: `Pick up to ${MAX_FEATURES} features.` };
    data.features = keys;
  }
  return { data };
}

// ── what a buyer sees ───────────────────────────────────────────────────────────────────────────────────────────

/** Price per square foot, or null when either is not known. */
export function pricePerSqft(home) {
  const price = Number(home?.price);
  const sqft = Number(home?.sqft);
  return price > 0 && sqft > 0 ? Math.round(price / sqft) : null;
}

/** The yearly property tax for this home, from its own figure, or null when it has none. */
export function homeTaxAnnual(home, price = home?.price) {
  if (Number(home?.taxAnnual) > 0) return Math.round(Number(home.taxAnnual));
  if (Number(home?.taxPct) > 0 && Number(price) > 0) return Math.round((Number(price) * Number(home.taxPct)) / 100);
  return null;
}

/** "0.25 acres" / "1 acre" / "" when not given. */
export function lotLabel(acres) {
  const n = Number(acres);
  if (!(n > 0)) return '';
  const text = String(Math.round(n * 1000) / 1000);
  return `${text} ${n === 1 ? 'acre' : 'acres'}`;
}

/** "None" for 0, "$45 / month" for a figure, '' when not given. */
export function hoaLabel(monthly) {
  if (monthly === null || monthly === undefined || monthly === '') return '';
  const n = Number(monthly);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'None';
  return `$${Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)} / month`;
}
