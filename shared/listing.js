/**
 * A listing: one home that a real estate agent is selling, shown in the same buyer app and admin as a builder's
 * community, with the parts that only make sense for many homes left out and the wording and starting figures
 * pointed at a single purchase.
 *
 * It is a community underneath (same tables, same leads, same themes and layouts) marked by the setting
 * `siteKind: 'listing'`. The mark is server-owned: it is set when the listing is made and no later save changes
 * it, so a community can never turn into a listing (or back) by a stale form. A listing has exactly one home.
 *
 * Nothing here imports from domain.js: domain.js imports THIS, to fold the starting values into DEFAULT_SETTINGS.
 */

import { DEFAULT_LISTING_FAQ_JSON } from './faq.js';

export const SITE_KINDS = ['community', 'listing'];

/** Where a listing stands. Stored in the same column a community's status uses. */
export const LISTING_STATUSES = ['Coming soon', 'Active', 'Under contract', 'Sold'];

/** Whether this community (as the buyer app or the admin holds it, with `settings`) is a single-home listing. */
export function isListing(community) {
  return community?.settings?.siteKind === 'listing';
}

/**
 * What a new listing starts with on top of the community defaults. The builder-era figures are left out:
 * no new-construction down payment program and its price cap, no monthly HOA (blank reads as none; the agent
 * types the home's real one). The money tools that compare many homes or plan a build are off.
 */
export const LISTING_SETTINGS = {
  siteKind: 'listing',
  hoaMo: '',
  dpaAmount: '',
  dpaPct: '',
  dpaPriceCap: '',
  dpaProgram: '',
  dpaAsOf: '',
  // An agent's listing does not carry a lender's name, licence or disclosures: those are the lender's, and a
  // lender the agent works with is theirs to add in Setup (Preferred lender). Blank hides "Talk about financing", the
  // loan links and the lender block in the footer, and leaves the footer to the listing's own disclosure.
  lenderName: '',
  lenderNmls: '',
  lenderAddress: '',
  lenderPhone: '',
  lenderWebsite: '',
  lenderEmail: '',
  lenderTagline: '',
  lenderLicense: '',
  lenderNmlsUrl: '',
  loanApplicationUrl: '',
  complianceEhl: '',
  complianceNotOffer: '',
  complianceNotAgent: '',
  complianceDisclaimer: '',
  complianceRates: '',
  complianceAba: '',
  // The questions on the home screen: about one home, its open houses and its agent.
  faqJson: DEFAULT_LISTING_FAQ_JSON,
};
export const LISTING_TOOLS = { compare: false, dpa: false, movein: false };
// No booking times: those are a lender's call times. A listing's showing is asked of its agent.
export const LISTING_FEATURES = { lotNumbers: false, siteMap: false, resources: false, incentive: false, booking: false };

/** The layout a new listing starts on: the one built like a listing page. The agent can pick another. */
export const LISTING_LAYOUT = 'marketplace';

/** The settings a listing adds to the community's, and their starting values (folded into DEFAULT_SETTINGS). */
export const LISTING_DEFAULTS = {
  // 'community' or 'listing'. Server-owned (see above).
  siteKind: 'community',
  // The sessions people can come to see the home: a JSON list, edited in Setup (normalizeOpenHouses).
  openHousesJson: '[]',
  // The listing agent's licence line and the MLS number, printed under the home and in the footer. Blank hides each.
  agentLicense: '',
  mlsNumber: '',
  // Printed above the lender block in the footer of a listing. Editable; clearing it removes the line.
  listingDisclosure:
    'Equal Housing Opportunity. Square footage, room counts and other facts are provided by the seller or '
    + 'taken from public records and are not guaranteed. Buyers should verify everything that matters to them. '
    + 'Payment figures on this page are estimates for illustration only, not a loan offer or a pre-approval.',
};

export const OPEN_HOUSE_MAX = 8;
export const OPEN_HOUSE_NOTE_MAX = 120;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(text) {
  const m = DATE_RE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * The open house list as the admin sends it (a JSON string of {date, start, end, note}), checked and tidied:
 * dates as literal 'YYYY-MM-DD' and times as literal 'HH:MM' (never timestamps, for the reason slots are literal:
 * 1pm means 1pm at the home, whoever reads it), an end after its start, the same session never twice, oldest
 * first. Returns { value } (the JSON string to store) or { error } in words the agent can act on.
 */
export function normalizeOpenHouses(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: '[]' };
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    return { error: 'The open houses could not be read. Send a list of dates and times.' };
  }
  if (!Array.isArray(list)) return { error: 'The open houses could not be read. Send a list of dates and times.' };
  if (list.length > OPEN_HOUSE_MAX) return { error: `A listing can show up to ${OPEN_HOUSE_MAX} open houses at a time. Remove one that has passed.` };
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const date = String(item?.date ?? '').trim();
    const start = String(item?.start ?? '').trim();
    const end = String(item?.end ?? '').trim();
    const note = String(item?.note ?? '').trim().slice(0, OPEN_HOUSE_NOTE_MAX);
    if (!validDate(date)) return { error: 'Each open house needs a date.' };
    if (!TIME_RE.test(start)) return { error: 'Each open house needs a start time.' };
    if (end && !TIME_RE.test(end)) return { error: 'An end time must be a time of day, like 3:00 PM.' };
    if (end && end <= start) return { error: 'An open house has to end after it starts.' };
    const key = `${date} ${start}`;
    if (seen.has(key)) return { error: 'That day and start time is already on the list.' };
    seen.add(key);
    out.push(end ? { date, start, end, note } : { date, start, note });
  }
  out.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  return { value: JSON.stringify(out) };
}

/** The list a buyer or the admin reads, from what is stored: never throws, drops anything unreadable. */
export function readOpenHouses(raw) {
  const normalized = normalizeOpenHouses(raw);
  if (normalized.error) {
    // A stored list that no longer passes (a limit that was lowered, say) still shows what can be read.
    try {
      const list = JSON.parse(String(raw));
      if (!Array.isArray(list)) return [];
      return list
        .filter((i) => validDate(String(i?.date ?? '')) && TIME_RE.test(String(i?.start ?? '')))
        .map((i) => ({ date: i.date, start: i.start, end: TIME_RE.test(String(i?.end ?? '')) ? i.end : '', note: String(i?.note ?? '').slice(0, OPEN_HOUSE_NOTE_MAX) }))
        .sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
    } catch {
      return [];
    }
  }
  return JSON.parse(normalized.value).map((i) => ({ end: '', ...i }));
}

/** The sessions still to come: today's, and later ones. `today` is the viewer's own 'YYYY-MM-DD'. */
export function upcomingOpenHouses(list, today) {
  return (list ?? []).filter((session) => session.date >= today);
}

/**
 * What each buyer-app layout does for a listing (one home), in place of the community descriptions in LAYOUTS, which
 * talk about many homes. Keyed by the layout's key; a layout not listed falls back to its own note.
 */
export const LISTING_LAYOUT_NOTES = {
  cornerpost: 'One phone-width column of soft, rounded tiles: the photo, the price and facts, the open houses and a Request a showing button. Manrope throughout.',
  saltgrass: 'Condensed uppercase headlines, a dark header and footer, and a big price. Reads best with the Navy & Gold, Ice Blue & Dark Navy or Slate Blue & Soft Green themes.',
  foyer: 'Serif headlines and thin rules, laid out like a magazine feature for the home. Reads best with the Charcoal & Bronze, Forest Green & Cream or Warm Modern Real Estate themes.',
  marketplace: 'Laid out like a home-search listing page: a white bar, the photos, the price and a payment estimate, and your details. Reads best with the Modern Blue & White, Teal & Navy or Navy & Gold themes.',
  redrock: 'Warm and solid: a dark header, a big serif price, the open houses and your contact. Reads best with the Rust & Desert Plum theme.',
  trailhead: 'A guided walk through the home: photos, open houses, the payment tools and your contact, one after another with a big button for the next step. Reads best with the Forest Green & Cream or Slate Blue & Soft Green themes.',
  showcase: 'Photo first, like phone stories: the home fills the screen with its price over the picture, with the tools in a sheet that slides up. Reads best with Black, White & Orange or Charcoal & Bronze.',
  ledger: 'Figures first: tiles for the price, the monthly payment, what a buyer needs down and the open houses. Reads best with Ice Blue & Dark Navy, Modern Blue & White or Teal & Navy.',
};
