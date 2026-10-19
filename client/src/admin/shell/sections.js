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

export const sectionOf = (key) => SECTIONS.find((section) => section.key === key);

/** The Setup page is split into parts, each its own address. */
export const SETUP_PARTS = [
  { key: 'look', label: 'Look & feel' },
  { key: 'team', label: 'Agents & alerts' },
  { key: 'home', label: 'Home screen' },
  { key: 'rules', label: 'Rates & rules' },
];
export const DEFAULT_SETUP_PART = SETUP_PARTS[0].key;
