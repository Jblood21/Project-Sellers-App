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
    theme: 'classic',
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
};

export async function seedIfEmpty(store) {
  const existing = await store.listCommunities();
  if (existing.length) return null;

  const community = await store.createCommunity(DEMO.community);
  await store.updateCommunity(community.id, {
    settings: { ...DEFAULT_SETTINGS, ratesUpdatedAt: new Date().toISOString() },
  });
  for (const home of DEMO.homes) await store.createHome(community.id, home);
  return community;
}
