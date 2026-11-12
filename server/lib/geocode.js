/**
 * Turning an address into a point on the map. Two free services, no key:
 *   - the US Census geocoder, which is the better one for a street address ("1234 Maple St, Lehi, UT"), and
 *   - OpenStreetMap's Nominatim, which also knows places by name ("Lehi Elementary") and is the fallback.
 * Used for the home's own pin and for the places on the Neighborhood screen.
 *
 * Nominatim's rules: one request a second, a User-Agent that says who is asking. Requests are spaced a second
 * apart here. A failure (slow, down, nothing found) is never an error for the caller: it just means no pin yet.
 * What failed is logged (the service and the reason, never the address) so a wrong answer can be traced.
 */

export const hooks = { fetch: (...args) => fetch(...args) };

const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 8000;
let last = 0;
let line = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const UA = 'Touradoor/1.0 (+https://www.touradoor.com)';
const round = (n) => Math.round(n * 1e6) / 1e6;

/** What a street address looks like to the Census service: it starts with a number. */
const looksLikeStreet = (text) => /^\s*\d/.test(text);

async function getJson(url, service) {
  try {
    const res = await hooks.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': UA, 'Accept-Language': 'en', Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`Geocode (${service}): answered ${res.status}.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`Geocode (${service}): ${err?.name === 'TimeoutError' ? 'timed out' : `failed (${err?.message ?? 'error'})`}.`);
    return null;
  }
}

async function census(text) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search = new URLSearchParams({ address: text, benchmark: 'Public_AR_Current', format: 'json' }).toString();
  const body = await getJson(url, 'census');
  const match = body?.result?.addressMatches?.[0];
  const lng = Number(match?.coordinates?.x);
  const lat = Number(match?.coordinates?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round(lat), lng: round(lng), label: String(match.matchedAddress ?? '').slice(0, 200), source: 'census' };
}

async function nominatim(text, country) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '1', q: text, ...(country ? { countrycodes: country } : {}) }).toString();
  const body = await getJson(url, 'nominatim');
  const first = Array.isArray(body) ? body[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round(lat), lng: round(lng), label: String(first.display_name ?? '').slice(0, 200), source: 'nominatim' };
}

/** The same address without a unit or suite, which a street search often trips on. */
const withoutUnit = (text) => text.replace(/\s*(?:,\s*)?(?:#|apt\.?|unit|suite|ste\.?)\s*[\w-]+/i, '').trim();

/** { lat, lng, label, source } for the best match of `query`, or null. Never throws. */
export function geocode(query, { country = 'us' } = {}) {
  const text = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return Promise.resolve(null);
  const run = line.then(async () => {
    const pause = async () => {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    };
    const plain = withoutUnit(text);
    if (looksLikeStreet(text)) {
      await pause();
      const found = await census(plain);
      if (found) return found;
    }
    await pause();
    const found = await nominatim(text, country);
    if (found) return found;
    if (plain !== text) {
      await pause();
      return nominatim(plain, country);
    }
    return null;
  });
  line = run.catch(() => {});
  return run;
}
