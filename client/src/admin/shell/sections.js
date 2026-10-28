/**
 * Every part of a community's admin, in one list the side menu, the bottom bar and the
 * page headers all read, so a section can never be in one and missing from another.
 *
 * `path` is the address under /admin/communities/:id; `old` is the ?tab= value the same
 * section answered to before the menu existed, so a saved link or a bookmark still lands
 * on the right page.
 */
export const SECTIONS = [
  { key: 'leads', label: 'Leads', group: 'Sales', blurb: 'Everyone who entered the app, newest first.', width: 'wide' },
  { key: 'stats', label: 'Stats', group: 'Sales', blurb: 'What buyers are doing in the app.', width: 'narrow' },
  { key: 'homes', label: 'Homes', group: 'Content', blurb: 'The homes buyers can browse and save.', width: 'normal' },
  { key: 'area', label: 'Area', group: 'Content', blurb: 'The neighborhood buyers can explore.', width: 'normal' },
  { key: 'learn', label: 'Learn', group: 'Content', blurb: 'The guides and videos buyers can read.', width: 'normal' },
  { key: 'times', label: 'Times', group: 'Buyer app', blurb: 'When buyers can book a call or a tour.', width: 'narrow' },
  { key: 'tools', label: 'Tools', group: 'Buyer app', blurb: 'Which calculators and planners buyers see.', width: 'narrow' },
  { key: 'setup', label: 'Setup', group: 'Buyer app', blurb: 'Look, agents, home screen, rates and rules.', width: 'narrow' },
];

export const GROUPS = ['Sales', 'Content', 'Buyer app'];

/** What the phone's bottom bar shows; everything else is under More. */
export const BOTTOM_KEYS = ['leads', 'homes', 'times', 'stats'];

/**
 * The same sections for a listing (one home an agent is selling): the same addresses, so no route changes, with
 * words that suit one home and its visitors. `learn` keeps only the guides (a listing has no videos and articles of
 * its own, see LearnTab). Everything not named here reads as it does for a community.
 */
const LISTING_WORDS = {
  leads: { label: 'Visitors', blurb: 'Everyone who scanned the sign and signed in, newest first.' },
  stats: { blurb: 'What visitors are doing on the home\u2019s page.' },
  homes: { label: 'The home', blurb: 'The photos, floor plan, video and facts visitors see.' },
  area: { label: 'Neighborhood', blurb: 'What is nearby that visitors can explore.' },
  learn: { blurb: 'The guides visitors can read.' },
  times: { blurb: 'When visitors can book a call about financing.' },
  tools: { blurb: 'Which calculators visitors see.' },
  setup: { blurb: 'Listing details, open houses, look, your details, lender and costs.' },
};

// A lender's financing call times: a listing has none (the agent is asked for a showing instead), so no Times section.
export const LISTING_SECTIONS = SECTIONS.filter((section) => section.key !== 'times')
  .map((section) => ({ ...section, ...(LISTING_WORDS[section.key] ?? {}) }));

/** The phone's bottom bar for a listing: it has no Times. */
export const LISTING_BOTTOM_KEYS = ['leads', 'homes', 'stats'];
export const bottomKeysFor = (listing) => (listing ? LISTING_BOTTOM_KEYS : BOTTOM_KEYS);

/** The sections of a community, or of a listing when `listing` is true. */
export const sectionsFor = (listing) => (listing ? LISTING_SECTIONS : SECTIONS);

export const sectionOf = (key, listing = false) => sectionsFor(listing).find((section) => section.key === key);

/** The Setup page is split into parts, each its own address. */
export const SETUP_PARTS = [
  { key: 'look', label: 'Look & feel' },
  { key: 'team', label: 'Agents & alerts' },
  { key: 'home', label: 'Home screen' },
  { key: 'rules', label: 'Rates & rules' },
];
export const DEFAULT_SETUP_PART = SETUP_PARTS[0].key;

/** A listing's Setup opens on its own part (the details and the open houses) and then has the same four. */
const LISTING_PART_LABELS = { team: 'You & alerts', rules: 'Lender & costs' };
export const LISTING_SETUP_PARTS = [
  { key: 'listing', label: 'Listing' },
  ...SETUP_PARTS.map((part) => ({ ...part, label: LISTING_PART_LABELS[part.key] ?? part.label })),
];
export const DEFAULT_LISTING_SETUP_PART = LISTING_SETUP_PARTS[0].key;
