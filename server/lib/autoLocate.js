import { pointOf } from '../../shared/neighborhood.js';
import { geocode } from './geocode.js';

/**
 * Puts a community or listing on the map without anybody pressing "Find it on the map": when it is made, the first
 * time somebody opens it, and once for everything already there when the server starts. Best effort and never in the
 * way: it runs in the background, a failed look-up is simply tried again later (not sooner than the cool-down), and
 * a point somebody already set (by hand or by the admin's Find button) is never replaced.
 *
 * What is looked up: a listing's address and city; a community's name and location. A community whose location is
 * still "Location TBD" is left alone, because the name alone would find the wrong place.
 *
 * Off in the tests (AUTO_LOCATE=off in the test script), where nothing may reach the network.
 */
export const options = { cooldownMs: 6 * 60 * 60 * 1000 };
const tried = new Map(); // community id -> when it was last tried
const enabled = () => process.env.AUTO_LOCATE !== 'off';

/** The text to look up, or '' when there is not enough to go on. */
export function queryFor(community) {
  const name = String(community?.name ?? '').trim();
  const location = String(community?.location ?? '').trim();
  const isListing = community?.settings?.siteKind === 'listing';
  if (!name) return '';
  if (isListing) return [name, location].filter(Boolean).join(', ');
  if (!location || /^location tbd$/i.test(location)) return '';
  return `${name}, ${location}`;
}

/** Tries once for one community; answers true when a point was saved. Never throws. */
export async function autoLocate(store, community, { force = false } = {}) {
  try {
    if (!enabled() || !community?.id) return false;
    if (pointOf({ lat: community.settings?.mapLat, lng: community.settings?.mapLng })) return false;
    const last = tried.get(community.id) ?? 0;
    if (!force && Date.now() - last < options.cooldownMs) return false;
    const query = queryFor(community);
    if (!query) return false;
    tried.set(community.id, Date.now());
    const found = await geocode(query);
    if (!found) return false;
    // Read it again: somebody may have set a point, or changed other settings, while the look-up ran.
    const fresh = await store.getCommunity(community.id);
    if (!fresh || pointOf({ lat: fresh.settings?.mapLat, lng: fresh.settings?.mapLng })) return false;
    await store.updateCommunity(fresh.id, { settings: { ...fresh.settings, mapLat: String(found.lat), mapLng: String(found.lng) } });
    return true;
  } catch (err) {
    console.warn(`Auto-locate failed: ${err?.message ?? err}`);
    return false;
  }
}

/** Fire and forget, for a request that must not wait on a map service. */
export function autoLocateInBackground(store, community) {
  autoLocate(store, community).catch(() => {});
}

/** Everything already there that has no point yet, one at a time (the geocoder spaces its own requests). */
export async function autoLocateAll(store) {
  if (!enabled()) return 0;
  let placed = 0;
  try {
    for (const community of await store.listCommunities()) {
      if (await autoLocate(store, community)) placed += 1;
    }
  } catch (err) {
    console.warn(`Auto-locate sweep failed: ${err?.message ?? err}`);
  }
  return placed;
}
