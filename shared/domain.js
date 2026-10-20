import { COMPLIANCE_DEFAULTS, SAFE_EMAIL_RE, fillTokens, isSafeEmail } from './compliance.js';
import { DEFAULT_FAQ_JSON, PREVIOUS_DEFAULT_FAQ_JSONS } from './faq.js';

export {
  DEFAULT_FAQ, DEFAULT_FAQ_JSON, FAQ_ANSWER_MAX, FAQ_JSON_MAX, FAQ_MAX_ITEMS, FAQ_QUESTION_MAX, normalizeFaqJson,
  parseFaq, serializeFaq,
} from './faq.js';

export {
  COMPLIANCE_DEFAULTS, LONG_SETTING_KEYS, complianceOf, complianceText, fillTokens, incentiveRecipient,
  nmlsConsumerUrl, safeHref, settingMaxLength, telHref,
} from './compliance.js';

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
  redrock: {
    name: 'Rust & Desert Plum', note: 'Warm, grounded, Southern Utah sandstone',
    primary: '#4A2338', secondary: '#4F5A2A', accent: '#A3432A',
    background: '#F4EADB', text: '#2B1A20',
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
  { k: 'compare', name: 'Compare My Options', q: 'Which loan option fits me best?' },
  { k: 'dpa', name: 'Down Payment Help', q: 'Could I get help with my down payment?' },
  { k: 'savings', name: 'My Savings Plan', q: 'How do I save what I need in time?' },
  { k: 'movein', name: 'My Move-In Plan', q: 'When could I actually get keys?' },
];

export const TOOL_KEYS = TOOLS.map((t) => t.k);

export const PLAN_LABELS = {
  homes: 'Homes I Like',
  afford: 'My Price Range',
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
  fha: 'Easier on credit, with as little as 3.5% down. It adds monthly mortgage insurance.',
  conv: 'The standard loan. The best rates go to stronger credit, and mortgage insurance drops off once you reach 20% equity.',
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

/**
 * A link to this place on a map. Google's cross-platform URL rather than a
 * maps.google.com search: on a phone it hands off to the installed Maps app
 * and on a desktop it opens the web map, which is the whole point — a buyer
 * standing in the model home taps the school and gets directions to it.
 *
 * The address is whatever the builder typed, so it is searched rather than
 * geocoded here: Google resolves "Oakridge Elementary, Lehi UT" as readily as
 * a street address, and an address we could not parse is still a better query
 * than no link at all. Returns null when there is nothing to search, which is
 * how callers know not to render the link.
 */
export function mapsUrl(address) {
  const query = String(address ?? '').trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * A builder pastes whatever their browser's address bar had. That is a watch
 * link, a share link, a shorts link or an embed link, and only the last one
 * works in an iframe — so turn any of them into the embeddable form.
 *
 * Returns null for anything it does not recognise, which is how the caller
 * knows to say "that link did not work" instead of rendering a blank frame.
 * Only YouTube and Vimeo: an arbitrary URL in an iframe is somebody else's
 * page running inside the buyer app, and these two are what builders use.
 */
export function videoEmbed(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  // A YouTube id is letters, digits, "-" and "_"; anything else would be a path or a query of the
  // link's own, spliced into the frame address.
  const youtube = (id) => (/^[\w-]{6,20}$/.test(id ?? '') ? `https://www.youtube.com/embed/${id}` : null);
  // An unlisted Vimeo video needs the hash that comes after its id, as a path or as ?h=.
  const vimeo = (id, hash) => {
    if (!/^\d+$/.test(id ?? '')) return null;
    const key = /^[\w]{6,20}$/.test(hash ?? '') ? `?h=${hash}` : '';
    return `https://player.vimeo.com/video/${id}${key}`;
  };

  if (host === 'youtu.be') return youtube(parsed.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') return youtube(parsed.searchParams.get('v'));
    const [, kind, id] = parsed.pathname.split('/');
    return kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v' ? youtube(id) : null;
  }
  if (host === 'vimeo.com') {
    const [id, hash] = parsed.pathname.split('/').filter(Boolean);
    return vimeo(id, /^[\w]+$/.test(hash ?? '') && !/^\d+$/.test(hash) ? hash : parsed.searchParams.get('h'));
  }
  if (host === 'player.vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean)[1];
    return vimeo(id, parsed.searchParams.get('h'));
  }
  return null;
}

/** Four is a section a buyer scrolls past, not a library they have to dig through. */
export const MAX_VIDEOS = 4;

/**
 * An uploaded video is stored in the database, so the cap is a storage decision
 * rather than a technical ceiling: 25MB is only about 12 to 25 seconds of a
 * modern phone's 1080p video (roughly 8 to 17 megabits a second), and every one of
 * them is database that never shrinks. Anything longer belongs behind a link,
 * which is why the link field is still there.
 */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);

const VIDEO_EXTENSIONS = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  ogv: 'video/ogg', ogg: 'video/ogg',
};

/**
 * The type to store a picked file under, or '' when it is not one we keep.
 *
 * `File.type` is whatever the operating system's extension table says, and that
 * table is not reliable: it is '' for a .mov on a machine with nothing
 * registered for it, `video/x-m4v` for an .m4v, and anything at all on a file
 * with a custom extension. The extension is what the person actually picked, so
 * it decides whenever the reported type is empty, generic or not one of ours.
 */
export function videoTypeOf(name, type) {
  const base = String(type ?? '').split(';')[0].trim().toLowerCase();
  if (VIDEO_TYPES.has(base)) return base;
  if (base === '' || base === 'application/octet-stream' || base.startsWith('video/')) {
    const extension = String(name ?? '').split('.').pop().toLowerCase();
    return Object.prototype.hasOwnProperty.call(VIDEO_EXTENSIONS, extension) ? VIDEO_EXTENSIONS[extension] : '';
  }
  return '';
}

/**
 * How many bytes a base64 string decodes to, without decoding it: 4 characters
 * carry 3 bytes, less whatever padding ends the string. Worth computing rather
 * than materialising 30MB to find out it is too big to keep.
 */
export function base64Bytes(base64) {
  const text = String(base64 ?? '');
  if (!text) return 0;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.floor((text.length * 3) / 4) - padding;
}

/**
 * '24.3 MB', or '412 KB' for anything under a megabyte.
 *
 * Both for refusing a file and for labelling one that was accepted. The KB
 * branch exists because the MB one alone renders a 33KB clip as '0.0 MB',
 * which reads like something went wrong rather than like a small file.
 */
export function megabytes(bytes) {
  const n = Number(bytes) || 0;
  // Round a sub-kilobyte file up rather than down: '0 KB' next to a video that
  // plays is a worse lie than '1 KB'. Nothing at all is still nothing.
  if (n === 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Consent to be called and texted.
 *
 * The TCPA is why this is a paragraph and not a sentence: consent to autodialed
 * or prerecorded marketing calls has to be express, written, and specific about
 * WHO may call, HOW they may call, and that agreeing is not the price of buying
 * anything. Damages run $500–$1,500 per call or text with a private right of
 * action, so the record of what somebody agreed to is the whole defence.
 *
 * The version travels with every stored record. When this wording changes, old
 * records keep the words those people actually saw — a consent record that says
 * only `true` proves nothing a year later, because nobody can say what the
 * screen said at the time.
 */
export const CONSENT_VERSION = '2026-09-25.1';

export function consentText(who) {
  const name = String(who || '').trim() || 'this community';
  return `I agree that ${name} and its home sales team may call and text me at the mobile `
    + 'number I gave, including using an automatic telephone dialing system or a prerecorded '
    + 'or artificial voice, about homes, financing and the plan I save here. I understand '
    + 'that agreeing is not a condition of buying anything, that message and data rates may '
    + 'apply, and that I can stop at any time by replying STOP or asking the team.';
}

export const RESOURCE_KINDS = ['article', 'video'];

export const AVAILABILITY = ['Planning', 'Under Construction', 'Move-in ready'];

/**
 * How many of this home are left, as a buyer should read it.
 *
 * `unitsAvailable` is null for a one-off house on a lot — nothing to count, so
 * nothing is said. A number is a plan the builder has several of. Zero means
 * sold, whether that is the single house or the last lot of a plan, which is
 * why one field covers both and there is no separate sold flag to keep in step
 * with it.
 *
 * Returns '' when there is nothing to show, so callers can render it directly.
 */
export function unitsLabel(home) {
  const units = home?.unitsAvailable;
  if (units === null || units === undefined) return '';
  const n = Number(units);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'Sold';
  return `${n} available`;
}

/** Sold is worth saying loudly; a count is just information. */
export function isSold(home) {
  return home?.unitsAvailable === 0;
}

// ── a list of homes, narrowed and ordered the way a buyer asks ─────────────

/**
 * The orders a buyer can put a community's homes in. The first is what a list starts with: the homes
 * added most recently first, which is what "new listings" means to anyone who has used a home-search site.
 */
export const HOME_SORTS = [
  { k: 'newest', name: 'Newest' },
  { k: 'price-asc', name: 'Price (low to high)' },
  { k: 'price-desc', name: 'Price (high to low)' },
];
export const HOME_SORT_KEYS = HOME_SORTS.map((s) => s.k);

/**
 * The homes that match a buyer's filters, in the order they asked for. Never changes the list it is given.
 *
 *   minPrice, maxPrice  whole dollars, or null for no limit
 *   minBeds             the fewest bedrooms, or 0 for any
 *   sort                one of HOME_SORT_KEYS; anything else is the first
 *
 * A home with no price yet (0) cannot be said to be over or under a figure, so any price limit leaves it
 * out, and a price order puts it last whichever way it runs rather than first as "the cheapest".
 * Equal homes keep the builder's own order, so the list never shuffles between two looks at it.
 */
export function listHomes(homes = [], { minPrice = null, maxPrice = null, minBeds = 0, sort = HOME_SORTS[0].k } = {}) {
  const min = num(minPrice);
  const max = num(maxPrice);
  const beds = num(minBeds);
  const kept = homes
    .map((home, index) => ({ home, index, price: num(home.price) }))
    .filter(({ home, price }) => {
      if ((min || max) && !price) return false;
      if (min && price < min) return false;
      if (max && price > max) return false;
      return !(beds && num(home.beds) < beds);
    });
  const byOrder = (a, b) => a.index - b.index;
  const unpricedLast = (a, b) => (a.price ? 0 : 1) - (b.price ? 0 : 1);
  const compare = {
    'price-asc': (a, b) => unpricedLast(a, b) || a.price - b.price || byOrder(a, b),
    'price-desc': (a, b) => unpricedLast(a, b) || b.price - a.price || byOrder(a, b),
    // An older payload has no date on a home: the builder's order is then the only order there is.
    newest: (a, b) => String(b.home.createdAt ?? '').localeCompare(String(a.home.createdAt ?? '')) || byOrder(a, b),
  }[HOME_SORT_KEYS.includes(sort) ? sort : HOME_SORTS[0].k];
  return kept.sort(compare).map(({ home }) => home);
}

/**
 * The round figures a price filter offers for these homes: from just under the cheapest to just over the
 * dearest, on a step that gives about `count` of them ($10,000, $25,000, $50,000 ...). Built from the
 * homes rather than fixed, so a community of $350,000 townhomes is not offered "$1M+" and nothing else.
 * Empty when no home has a price.
 */
export function priceSteps(homes = [], count = 8) {
  const prices = homes.map((home) => num(home.price)).filter((price) => price > 0);
  if (!prices.length) return [];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const step = [10000, 25000, 50000, 100000, 250000, 500000].find((size) => (high - low) / size <= count) ?? 1000000;
  const steps = [];
  for (let price = Math.floor(low / step) * step; price <= Math.ceil(high / step) * step; price += step) {
    steps.push(price);
  }
  return steps;
}
// ── layouts ────────────────────────────────────────────────────────────────

/**
 * How the buyer app is LAID OUT, as distinct from how it is coloured.
 *
 * A theme is a palette. A layout is the rest of the look: the typeface, the
 * shape of things, where the buttons sit and what the home screen is built
 * from. They are independent, which is why a community picks both. What a
 * layout may NOT change is what the tools do: the same questions, the same
 * maths and the same saved answers on every one, with only the placement and
 * the appearance of the controls differing.
 *
 * Adding one is three things: an entry here, a folder under
 * client/src/buyer/layouts/, and a stylesheet scoped to `.l-<key>`.
 *
 * The key is what is stored on a community, so it never changes; the name is
 * only what the Setup tab calls it, and can be changed freely.
 */
export const LAYOUTS = [
  {
    k: 'cornerpost',
    name: 'Porch',
    note: 'One phone-width column of soft, rounded tiles. Manrope throughout, with a Book a tour button on every page.',
  },
  {
    k: 'saltgrass',
    name: 'Ridgeline',
    note: 'Condensed uppercase headlines, a dark header and footer, and big figures. Reads best with the Navy & Gold, Ice Blue & Dark Navy or Slate Blue & Soft Green themes.',
  },
  {
    k: 'foyer',
    name: 'Foyer',
    note: 'Serif headlines, thin rules and numbered lists, laid out like a magazine. Reads best with the Charcoal & Bronze, Forest Green & Cream or Warm Modern Real Estate themes.',
  },
  {
    k: 'marketplace',
    name: 'Marketplace',
    note: 'Laid out like a home-search site: a white bar, filters, and every home as a photo card with its price and an estimated monthly payment. Reads best with the Modern Blue & White, Teal & Navy or Navy & Gold themes.',
  },
  {
    k: 'redrock',
    name: 'Red Rock',
    note: 'Warm and solid: a dark header, big serif prices and payments, the buyer\'s monthly payment up top, then homes as cards. Reads best with the Rust & Desert Plum theme.',
  },
  {
    k: 'trailhead',
    name: 'Trailhead',
    note: 'A guided trail: the tools as numbered stops on one winding path, the next stop opened with a big Start button, and the homes at an overlook along the way. Reads best with the Forest Green & Cream or Slate Blue & Soft Green themes.',
  },
  {
    k: 'showcase',
    name: 'Showcase',
    note: 'Photo first, like phone stories: each home fills the screen with its price and monthly estimate over the picture, a swipe to the next, and the tools in a sheet that slides up. Reads best with Black, White & Orange or Charcoal & Bronze.',
  },
  {
    k: 'ledger',
    name: 'Ledger',
    note: 'The buyer\'s own dashboard: tiles for buying power, the monthly payment, the down payment saved, the plan, today\'s rates and the homes in budget, figures first. Reads best with Ice Blue & Dark Navy, Modern Blue & White or Teal & Navy.',
  },
];
export const LAYOUT_KEYS = LAYOUTS.map((l) => l.k);
export const DEFAULT_LAYOUT = 'cornerpost';

/**
 * Layouts that were offered once and have been taken away, each mapped to the one a community still
 * storing it is shown instead. The stored key is left alone (nothing is rewritten), so it is read
 * through here every time, the way RETIRED_THEMES works for themes. The successor is chosen for being
 * the nearest in spirit, not the default: Keystone's builders chose a layout that leads with figures and
 * the homes, and Marketplace is the one that does.
 */
const RETIRED_LAYOUTS = {
  keystone: 'marketplace', // compact, figure-led, a tab strip under the header
};

/** An unknown or missing key falls back rather than rendering a layout that is not there. */
export function normalizeLayout(key) {
  if (Object.prototype.hasOwnProperty.call(RETIRED_LAYOUTS, key)) return RETIRED_LAYOUTS[key];
  return LAYOUT_KEYS.includes(key) ? key : DEFAULT_LAYOUT;
}

/**
 * How many guides the tools home shows before sending the buyer to the full list.
 * It is shared, not the screen's own, because the structured data describes the
 * thumbnails the home shows and has to count the same ones.
 */
export const HOME_GUIDES = 3;

// ── realtors ───────────────────────────────────────────────────────────────

/** Real estate agents a community can list. The server enforces this, not just the form. */
export const MAX_AGENTS = 4;

export const AGENT_TEXT_MAX = {
  name: 80, brokerage: 120, licenseNo: 40, licenseState: 2, phone: 40, email: 120, website: 200,
};

/**
 * "UT license #12345", or '' when there is no number to print. A licence line
 * with no number says nothing a buyer can check, so it is not shown at all.
 */
export function agentLicenseLine(agent) {
  const no = String(agent?.licenseNo ?? '').trim();
  if (!no) return '';
  const state = String(agent?.licenseState ?? '').trim().toUpperCase();
  return `${state ? `${state} ` : ''}license #${no.replace(/^#/, '')}`;
}

// ── buyer guides ───────────────────────────────────────────────────────────

/** The picture the supplied guides share. Overridable per guide. */
export const DEFAULT_GUIDE_IMAGE = '/guides/blog-hero-model-home.webp';
export const DEFAULT_GUIDE_IMAGE_ALT = 'New construction townhome living, dining and kitchen';

export const GUIDE_TEXT_MAX = {
  title: 140, category: 40, byline: 200, note: 200, summary: 400, body: 60000, imageAlt: 200, slug: 100,
};

/** 'What credit score do you need?' becomes 'what-credit-score-do-you-need'. */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, GUIDE_TEXT_MAX.slug);
}

/**
 * The address a community is reached at. Its id (a name plus four random letters, like
 * `salt-grass-zoxa`) never changes: it keys every table and every printed sign. The buyer
 * link can be a cleaner name of the builder's choosing (`/c/salt-grass`) that resolves to
 * the same community, and every earlier link keeps working.
 */
export const COMMUNITY_SLUG_MIN = 3;
export const COMMUNITY_SLUG_MAX = 40;
/** Words that would only confuse in an address. */
export const RESERVED_COMMUNITY_SLUGS = ['admin', 'api', 'assets', 'c', 'guides', 'login', 'new', 'start', 'tools'];

/** The cleaned slug, or '' when what was typed cannot be one. */
export function normalizeCommunitySlug(value) {
  const slug = slugify(value);
  if (slug.length < COMMUNITY_SLUG_MIN || slug.length > COMMUNITY_SLUG_MAX) return '';
  if (RESERVED_COMMUNITY_SLUGS.includes(slug)) return '';
  return slug;
}

/** What a name suggests: 'Salt Grass' gives 'salt-grass'. Always a usable slug. */
export function suggestCommunitySlug(name) {
  const base = slugify(name).slice(0, COMMUNITY_SLUG_MAX).replace(/-+$/, '');
  return normalizeCommunitySlug(base) || 'community';
}

/** The suggestion, then the same with -2, -3, ... for when it is taken. */
export function communitySlugCandidates(name, count = 30) {
  const base = suggestCommunitySlug(name);
  const out = [base];
  for (let n = 2; n <= count; n += 1) {
    const tail = `-${n}`;
    out.push(`${base.slice(0, COMMUNITY_SLUG_MAX - tail.length).replace(/-+$/, '')}${tail}`);
  }
  return out;
}

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
  { k: 'resources', name: 'Videos & articles', q: 'Show what you have written and filmed, below the tools' },
  { k: 'guides', name: 'Buyer guides', q: 'Show the long-form guides, readable without signing in' },
  { k: 'agents', name: 'Realtors', q: 'Show the real estate agents you have added: on the home screen, under every home and on their own page' },
  { k: 'incentive', name: 'Builder incentive', q: 'Show the incentive card above Explore Homes' },
  { k: 'faq', name: 'FAQ', q: 'Show your frequently asked questions on the home screen' },
  // Switched on the Times tab, next to the times it governs, not in the list of home-screen extras.
  { k: 'booking', name: 'Booking times', q: 'Let buyers pick a day and a time to talk about financing from the times you publish. Off: they are shown the lender\u2019s phone, text and email instead.' },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.k);

export const DEFAULT_FEATURES = {
  lotNumbers: true, floorPlans: true, siteMap: true, resources: true, guides: true, agents: true,
  // Off until a builder writes an incentive: a card with nothing to say is worse than none.
  incentive: false,
  // On, but the section only appears once there is at least one question and answer.
  faq: true,
  // On: buyers can pick one of the published times to talk about financing. Off: "Talk about financing" gives
  // them the lender's phone, text and email instead, and the times are kept for when it is switched back on.
  // A tour is never booked: "Book a tour" goes to the agents.
  booking: true,
};

export const DEFAULT_TOOLS_ENABLED = {
  payment: true, afford: true, loans: true, compare: true, dpa: true, savings: true, movein: true,
};

export const DEFAULT_SETTINGS = {
  // The Mortgage News Daily index at the close on Oct 19, 2026 (30-year fixed: conventional, FHA, VA), and when.
  // A starting point for a community's own rates, not a quote; the lender's figures belong in Setup.
  rateConv: '7.40',
  rateFha: '7.02',
  rateVa: '7.04',
  ratesUpdatedAt: '2026-10-19T20:00:00.000Z',
  taxPctYr: '0.55',
  insuranceYr: '1400',
  hoaMo: '45',
  // Utah's First-Time Homebuyer Assistance Program for new construction, as of Oct 2026: up to $20,000 (a 0%
  // deferred loan) on a never-occupied home priced up to $450,000, paired with a Utah Housing Corporation first
  // mortgage. The program has no income cap of its own; the one that applies is that first mortgage's, and the
  // FHA/VA one ($162,500) is the widest. Its 620 minimum score is below the lowest credit range the screener asks
  // about (Fair, 660+), so the minimum here is 660 (Utah Housing's FirstHome floor): a buyer it shows 620+ to and
  // then screens out would be told two things. Funded until the money runs out.
  dpaIncomeLimit: '162500',
  // The help itself. dpaAmount is a flat figure on its own; set dpaPct as well
  // and it becomes the ceiling on a percentage of the loan. dpaPriceCap is the
  // program's purchase-price limit, which is the rule that decides per home
  // rather than per buyer. Blank means the program has no such limit.
  dpaAmount: '20000',
  dpaPct: '',
  dpaPriceCap: '450000',
  dpaMinCredit: '660',
  // Named and dated so the screen can say whose rules these are and when the
  // builder last checked them. Assistance limits are re-set every year and
  // funded programs run dry mid-year, so an undated figure goes stale silently.
  dpaProgram: 'Utah First-Time Homebuyer Assistance Program',
  dpaAsOf: '2026-10-20',
  creditExcellentMin: '740',
  creditGoodMin: '700',
  creditFairMin: '660',
  // The lender, the compliance copy and the links under it. See shared/compliance.js
  // for what each one is and where the words came from.
  ...COMPLIANCE_DEFAULTS,
  // Where call requests are emailed. Blank falls back to the admin account that
  // owns the dashboard, so a builder who never sets this still gets told.
  notifyEmail: '',
  // The address the lead report goes to when the builder presses "Email the report" (never on its own), and when
  // the last one went. The stamp is the server's: it is how the next report knows who is new, and a save from the
  // Setup form never changes it.
  reportEmail: '',
  reportLastSentAt: '',

  // ── the builder incentive card (shown when features.incentive is on) ───────
  // No amount or terms are assumed: those are the builder's to state, and an
  // incentive advertised with wrong terms is worse than none.
  incentiveTitle: 'Preferred lender incentive',
  incentiveBody: 'Buy a home at {community} with our preferred lender and ask what you could save.',
  incentiveFinePrint: '',
  incentiveButton: 'Find out if you qualify',
  // Who the buyer reaches. A blank phone falls back to the lender's; a blank
  // email means a desktop visitor is shown the number to call instead.
  incentivePhone: '',
  incentiveEmail: '',
  // The sales team's own phone and email: what a buyer is shown to call, text or email for "Book a tour" when
  // there is no agent to send them to. Blank when the builder has not said, so nothing is guessed.
  teamPhone: '',
  teamEmail: '',
  // The text the buyer's message starts with. {community} is the development.
  incentiveMessage: 'Contact me about the preferred lender incentive for {community}.',

  // ── the heading at the top of the buyer app's home screen, and the line under it ───────
  // Blank keeps each layout's own wording ("Hi Dana — can you buy one of these?"). {name} is the buyer's first name
  // and {community} the development's.
  homeHeadline: '',
  homeSubhead: '',

  // ── the FAQ shown on the home screen: a JSON list, edited in Setup ───────
  // Starts as the starter questions in shared/faq.js; the builder edits them.
  faqJson: DEFAULT_FAQ_JSON,
};

/**
 * Defaults that were reworded. A community that saved Setup while the old wording was the default holds
 * that wording as if it were its own choice; read back exactly, it is shown the new default instead.
 * (Typing the old wording again after the change reads as the new one, which is the price of the rule.)
 */
export const REPLACED_DEFAULTS = {
  incentiveButton: ['Find out if I qualify'],
  faqJson: PREVIOUS_DEFAULT_FAQ_JSONS,
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
/**
 * The lender's name as this community has set it, for sentences that name the
 * lender. Blank means the builder cleared it, which must not quietly revert to
 * the built-in default and name a company they did not choose.
 */
export const lenderNameOf = (community) => String(community?.settings?.lenderName ?? LENDER.name).trim() || 'the lender';

export function describeTour(tour, lenderName = LENDER.name) {
  if (!tour) return '';
  // The topic rides along in the description because this string is what the
  // admin list, the activity line and the alert email all show. A lender
  // request that reads like a model-home tour gets handled by the wrong person.
  const about = tour.topic === 'lender' ? ` · about financing (${lenderName})` : '';
  if (tour.date && tour.time) {
    const how = contactMethodLabel(tour.contact).toLowerCase();
    return `${formatSlotDate(tour.date)} at ${formatSlotTime(tour.time)} · by ${how}${about}`;
  }
  return `${tour.time || 'No time given'}${about}`;
}

/**
 * The lender, as it stood before it became a per-community setting.
 *
 * Kept for the places that have no community in hand: the appointment sheet
 * names who the buyer is booking with, and the call-request email says what the
 * request was about. Both only need a NAME, and those read this. Everything a
 * buyer is SHOWN as an advertisement (the footer, the lender card, the printed
 * plan, the structured data) comes from `complianceOf(community.settings)`, so
 * that what Setup says is what the page says.
 *
 * It is derived from the same defaults rather than typed out a second time, so
 * the two cannot disagree about who the lender is.
 */
export const LENDER = {
  name: COMPLIANCE_DEFAULTS.lenderName,
  tagline: COMPLIANCE_DEFAULTS.lenderTagline,
  nmls: COMPLIANCE_DEFAULTS.lenderNmls,
  loName: COMPLIANCE_DEFAULTS.loName,
  loNmls: COMPLIANCE_DEFAULTS.loNmls,
  phone: COMPLIANCE_DEFAULTS.lenderPhone,
  website: COMPLIANCE_DEFAULTS.lenderWebsite,
};

/**
 * The supplied marks, served from client/public/brand.
 *
 * The Summit logo is 700x355 with a transparent background, so it is sharp at
 * any size a page draws it. Pick by ground: `color` on light, `white` on dark
 * photos or fills, `black` for one-colour print. It is never recoloured to a
 * community's palette, and the supplied guidance sets a 30px minimum height.
 *
 * The Equal Housing Lender mark is required wherever the lender is advertised,
 * at 40px or more. `ink` for light grounds, `white` for dark.
 */
export const LENDER_LOGOS = {
  color: '/brand/summit-home-loans-color.png',
  black: '/brand/summit-home-loans-black.png',
  white: '/brand/summit-home-loans-white.png',
};
export const LENDER_LOGO_RATIO = 700 / 355;
export const LENDER_LOGO_MIN_HEIGHT = 30;
export const EHL_MARKS = {
  ink: '/brand/equal-housing-lender-ink.svg',
  white: '/brand/equal-housing-lender-white.svg',
};
export const EHL_MARK_RATIO = 120 / 132;
export const EHL_MARK_MIN_HEIGHT = 40;

/** Kept so the old import keeps working; the default is the full-colour logo. */
export const LENDER_LOGO = LENDER_LOGOS.color;
export const LENDER_LOGO_HEIGHT = 52;

/**
 * Whether there is enough here to advertise. Name and NMLS are the minimum: an
 * ad missing the licence number should not go out, so an unfinished block
 * simply shows nothing rather than shipping a half-built advertisement.
 */
export function lenderReady(lender = LENDER) {
  return Boolean(String(lender?.name ?? '').trim() && String(lender?.nmls ?? '').trim());
}

/**
 * What a booked appointment is about. Today only financing is booked through the calendar ("Book a tour"
 * is a call or a text to an agent), so new appointments are 'lender'; 'community' stays for the ones made
 * before that, and for an older copy of the app still open on a phone. Whoever picks the request up needs
 * to know whether they are meeting about the homes or about the money — those are different people.
 */
export const TOUR_TOPICS = ['community', 'lender'];

export function tourTopicLabel(topic, lenderName = LENDER.name) {
  return topic === 'lender' ? lenderName : 'the community team';
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
 * MI: FHA by HUD's annual MIP schedule (fhaAnnualMip); conventional under 20% down 0.50%/yr; VA and
 * 20%-down conventional none.
 */
/**
 * FHA's annual mortgage insurance on a 30-year loan, as a share of the loan a year: HUD Mortgagee Letter 2023-05
 * (case numbers endorsed from March 20, 2023, and unchanged since). 0.55% with less than 5% down (over 95% loan to
 * value), 0.50% with 5% or more; a base loan over $726,200 pays 0.75% and 0.70%.
 */
export const FHA_MIP_LARGE_LOAN = 726200;
export function fhaAnnualMip(loan, price) {
  const ltv = num(price) > 0 ? num(loan) / num(price) : 1;
  const high = ltv > 0.95;
  if (num(loan) > FHA_MIP_LARGE_LOAN) return high ? 0.0075 : 0.007;
  return high ? 0.0055 : 0.005;
}

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
      ? (loan * fhaAnnualMip(loan, p)) / 12
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
 * Debt-to-income limits. 36% is the conservative rule of thumb; 43% is a common
 * lender benchmark (no longer a federal Qualified Mortgage cap since the 2021
 * General QM rule, and automated approvals can go higher). Showing only the
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

/**
 * What the help is actually worth on one home. Real programs come in two
 * shapes and a single number cannot serve both: some pay a flat figure
 * whatever the price, others pay a percentage of the loan up to a ceiling. A
 * percentage has to be worked out per home or it is wrong at both ends — too
 * little on the big plan, too much on the small one.
 *
 * Rounded down, never up: this figure lands in a buyer's cash-to-close.
 */
export function dpaAmountFor({ price, downPayment = 0, settings }) {
  const flat = num(settings.dpaAmount);
  const pct = num(settings.dpaPct);
  if (pct <= 0) return flat;
  const loan = Math.max(0, num(price) - num(downPayment));
  const share = (loan * pct) / 100;
  return Math.floor(flat > 0 ? Math.min(share, flat) : share);
}

/** The program's purchase-price ceiling, or null when it has none. */
export function dpaCap(settings) {
  const cap = num(settings.dpaPriceCap);
  return cap > 0 ? cap : null;
}

/**
 * Which homes here sit under that ceiling. This is the half of the answer a
 * buyer cannot work out alone and the builder already knows: a program that
 * stops at a given price may cover one plan on the board and none of the
 * others, and no amount of income changes that. Homes with no price set are
 * left out of both lists rather than guessed at.
 */
export function dpaHomes(homes, settings) {
  const priced = (homes ?? []).filter((h) => num(h.price) > 0);
  const cap = dpaCap(settings);
  if (!cap) return { cap: null, within: priced, over: [] };
  return {
    cap,
    within: priced.filter((h) => num(h.price) <= cap),
    over: priced.filter((h) => num(h.price) > cap),
  };
}

/**
 * Whether the BUYER fits the program — income, credit and first-time status.
 * Deliberately says nothing about which homes qualify: those are two separate
 * failures with two separate remedies, and collapsing them would tell a buyer
 * who is perfectly eligible that they are not.
 *
 * 'likely' | 'maybe' | 'unlikely' | null (null = not enough answers yet).
 */
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
    out.push({ k: 'va', why: 'You may be eligible for a VA loan, which is usually the strongest option: $0 down and no monthly mortgage insurance.' });
  }
  if (credit === 'exc' || (credit === 'good' && num(downPct) >= 5)) {
    out.push({ k: 'conv', why: 'With your credit range, conventional rates tend to be competitive, and mortgage insurance can drop off later.' });
  }
  if (credit === 'fair' || num(downPct) < 5) {
    out.push({
      k: 'fha',
      why: `FHA is friendlier to ${credit === 'fair' ? 'fair credit' : 'smaller down payments'} — 3.5% down works.`,
    });
  }
  if (!out.length) out.push({ k: 'conv', why: 'A solid place to start. Ask the lender to show you FHA numbers too, so you can compare.' });
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
  { key: 'closing', label: 'Closing day: you get your keys', who: 'you', weeks: { loan: 6, cash: 3 } },
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

/** The tools, in the order the app nudges a buyer through them (the plan's order, without the saved homes). */
export const TOOL_ORDER = PLAN_KEYS.filter((key) => key !== 'homes');

const OPENED_TOOL = new Map(TOOLS.map((tool) => [`Opened ${tool.name}`, tool.k]));

// What each tool writes to the activity log when somebody uses it, besides opening it. The first four lines of the
// payment tool and the loan tool differ only in their ending, so the longer one is tested first.
const TOOL_ACTIVITY = [
  ['payment', [/^Opened payment for /, /^Explored .+ loan on payment tool$/, /^Tested .+ down on /]],
  ['loans', [/^Explored .+ loan$/]],
  ['compare', [new RegExp(`^Compared (${Object.values(PROGRAMS).join('|')})$`)]],
  ['dpa', [/^DPA screener: /]],
  ['movein', [/^Move-in driver: /, /^Added their own move-in step: /, /^Move-in paying: /, /^Wants to be moved in by /]],
];

/**
 * The tool an action in the activity log belongs to ('payment', 'afford', ...), or '' when it belongs to none.
 * Opening a tool, working in it and saving what it worked out all count: a tool was used when it was used,
 * not only when its answer was kept. The buyer app writes these lines; the stores tag each one with this on the way in.
 */
export function toolOfActivity(text) {
  const line = String(text ?? '');
  if (OPENED_TOOL.has(line)) return OPENED_TOOL.get(line);
  for (const [key, patterns] of TOOL_ACTIVITY) if (patterns.some((pattern) => pattern.test(line))) return key;
  return TOOL_ORDER.find((key) => line.startsWith(`${PLAN_LABELS[key]} saved: `)) ?? '';
}

/**
 * The tools this person used, in the app's order: any they opened or worked in (`lead.toolUses`, a count per tool from
 * the activity log) and any whose answer they saved (`lead.plan`), or a move-in plan they made.
 */
export function toolsUsedOf(lead) {
  return TOOL_ORDER.filter((key) => (lead?.toolUses?.[key] ?? 0) > 0 || Boolean(lead?.plan?.[key]) || (key === 'movein' && Boolean(lead?.moveIn)));
}

/**
 * The home screen's heading and the line under it, as the builder wrote them in Setup, with {name} as the buyer's
 * first name ("there" when there is none) and {community} as the development's name. Each is '' when the builder left
 * it blank, and the layout then shows its own wording.
 */
export function homeGreeting(settings, { firstName = '', community = '' } = {}) {
  const values = { name: String(firstName ?? '').trim() || 'there', community: String(community ?? '').trim() };
  const fill = (text) => fillTokens(String(text ?? '').trim(), values);
  return { headline: fill(settings?.homeHeadline), subhead: fill(settings?.homeSubhead) };
}

/** The tools this community offers its buyers, in the app's order: every one the builder has not switched off. */
export function toolsOfferedBy(community) {
  return TOOL_ORDER.filter((key) => community?.tools?.[key] !== false);
}

/**
 * What a tool worked out for this person, as one line, or '' when they kept nothing. A move-in plan is kept as a
 * plan of its own rather than a one-line answer, so one with a date is its answer (without a date it is only a
 * preview, as everywhere else).
 */
export function toolAnswerOf(lead, key) {
  const saved = String(lead?.plan?.[key] ?? '').trim();
  if (saved) return saved;
  const day = key === 'movein' ? lead?.moveIn?.targetDate : '';
  return day ? `Move-in plan saved: keys by ${formatSlotDate(day)}, ${String(day).slice(0, 4)}` : '';
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

/**
 * A buyer can add one more email (a spouse, a co-buyer) to receive the plan and be reached about
 * a time. The same strict single-address shape the incentive and loan-team emails use: no spaces,
 * no commas or semicolons (two addresses in one), nothing that would turn a mailto: into more.
 */
export { SAFE_EMAIL_RE, isSafeEmail };
export const MAX_EXTRA_EMAILS = 1;

/**
 * The extra emails to keep, from what was sent. `{ emails }`, or `{ error }` for something that is
 * not an address. Lower-cased; an address equal to the buyer's own, or repeated, is dropped rather
 * than refused (it is harmless and the buyer meant to give someone else); blank clears.
 */
export function cleanExtraEmails(input, primaryEmail = '') {
  const raw = Array.isArray(input) ? input : [input];
  const primary = String(primaryEmail ?? '').trim().toLowerCase();
  const emails = [];
  for (const item of raw) {
    if (item === undefined || item === null) continue;
    if (typeof item !== 'string') return { error: 'That email doesn’t look right.' };
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (email.length > 254 || !SAFE_EMAIL_RE.test(email)) return { error: 'That email doesn’t look right. Check it and try again.' };
    if (email === primary || emails.includes(email)) continue;
    emails.push(email);
  }
  if (emails.length > MAX_EXTRA_EMAILS) return { error: 'You can add one more email.' };
  return { emails };
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

/**
 * Somebody the team may ring who has never asked for a time: they agreed to calls and texts, gave a number, have
 * booked no call (waiting or handled) and are not closed.
 */
export function isReadyToCall(lead) {
  return Boolean(lead?.phone && lead.consent?.granted && !isArchived(lead) && !lead.tour);
}

/**
 * The orders people can be listed in, by the key the Leads tab's "Sort" pills use. The leads report is made in
 * whichever the builder had chosen, so the tab and the PDF come from one function and cannot disagree.
 */
export const LEAD_SORTS = {
  recent: { label: 'Recent', report: 'Newest first' },
  stars: { label: 'Most ★', report: 'Most saved homes first' },
};
export const DEFAULT_LEAD_SORT = 'recent';

/**
 * People in the chosen order, as a new list. `recent`: newest sign-up first. `stars`: the most saved homes first,
 * and the newest first among those with the same number. Anyone whose sign-up time cannot be read goes last.
 */
export function sortLeads(leads = [], sort = DEFAULT_LEAD_SORT) {
  const time = (lead) => {
    const t = lead?.firstVisitAt ? new Date(lead.firstVisitAt).getTime() : Number.NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  // The list as the stores give it is oldest first, so the later of two with the same time is the newer.
  const indexed = leads.map((lead, index) => ({ lead, index }));
  const newest = (a, b) => (time(b.lead) === time(a.lead) ? b.index - a.index : time(b.lead) - time(a.lead));
  const saved = (item) => (item.lead.savedHomeIds ?? []).length;
  indexed.sort(sort === 'stars' ? (a, b) => saved(b) - saved(a) || newest(a, b) : newest);
  return indexed.map((item) => item.lead);
}

export function countPendingTours(leads = []) {
  return leads.filter(isTourPending).length;
}
