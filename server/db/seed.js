import { DEFAULT_SETTINGS } from '../../shared/domain.js';

/**
 * Demo content so a fresh deploy has something to scan into. Runs only when the
 * database has no communities at all, so it never overwrites real data.
 */
const DEMO = {
  community: {
    name: 'Willow Creek',
    location: 'Lehi, Utah',
    status: 'Now selling',
    theme: 'forest',
    builder: 'Hearthside Homes',
  },
  homes: [
    {
      name: 'The Aspen', price: 429000, beds: 3, baths: 2, sqft: 1850, availability: 'Move-in ready',
      description: 'Single-level rambler with an open great room and a covered back patio.',
    },
    {
      name: 'The Birch', price: 512000, beds: 4, baths: 2.5, sqft: 2400, availability: 'Move-in ready',
      description: 'Two-story with a main-floor office and a three-car garage option.',
    },
    {
      name: 'The Cedar', price: 598000, beds: 5, baths: 3, sqft: 3100, availability: 'Under Construction',
      description: 'Family plan with a finished basement and a vaulted primary suite.',
    },
  ],
  highlights: [
    {
      category: 'schools', name: 'Willow Creek Elementary', detail: '4 min drive',
      description: 'K–6, and the district bus stops at the front of the development.',
    },
    {
      category: 'parks', name: 'Dry Creek Trailhead', detail: 'Walkable',
      description: 'Eleven miles of paved trail, a splash pad and two ball fields.',
    },
    {
      category: 'shopping', name: 'Traverse Mountain Outlets', detail: '9 min drive',
      description: 'Groceries, a pharmacy and the usual weeknight dinner options.',
    },
    {
      category: 'commute', name: 'I-15 at Timpanogos Hwy', detail: '6 min drive',
      description: 'About 35 minutes to downtown Salt Lake outside of rush hour.',
    },
  ],
};

export async function seedIfEmpty(store) {
  const existing = await store.listCommunities();
  if (existing.length) return null;

  const community = await store.createCommunity(DEMO.community);
  await store.updateCommunity(community.id, {
    settings: { ...DEFAULT_SETTINGS, ratesUpdatedAt: new Date().toISOString() },
  });
  for (const home of DEMO.homes) await store.createHome(community.id, home);
  for (const highlight of DEMO.highlights) await store.createHighlight(community.id, highlight);
  return community;
}
