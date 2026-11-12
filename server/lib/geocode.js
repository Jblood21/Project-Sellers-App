/**
 * Turning an address into a point on the map, with OpenStreetMap's Nominatim (free, no key). Used for the home's
 * own pin and for the places on the Neighborhood screen.
 *
 * Nominatim's rules: one request a second, a User-Agent that says who is asking, results that are not stored in bulk.
 * One address per click of an admin is well within them; requests are also spaced a second apart here, and a failure
 * (slow, down, nothing found) is never an error for the caller: it just means no pin yet.
 */

export const hooks = { fetch: (...args) => fetch(...args) };

const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 6000;
let last = 0;
let line = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** { lat, lng, label } for the best match of `query`, or null. Never throws. */
export function geocode(query, { country = 'us' } = {}) {
  const text = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return Promise.resolve(null);
  const run = line.then(async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ format: 'jsonv2', limit: '1', q: text, ...(country ? { countrycodes: country } : {}) }).toString();
      const res = await hooks.fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Touradoor/1.0 (+https://www.touradoor.com)', 'Accept-Language': 'en', Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const [first] = await res.json();
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: String(first.display_name ?? '').slice(0, 200) };
    } catch {
      return null;
    }
  });
  line = run.catch(() => {});
  return run;
}
