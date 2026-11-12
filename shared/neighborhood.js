/**
 * What the Neighborhood screen adds to a place (a "highlight"): how far it is, a link for more, and where it is on the
 * map. Leaf module: nothing here imports from domain.js.
 */

/** Where a buyer looks up how a Utah public school is doing (the state's own report card). */
export const UTAH_SCHOOL_REPORT_URL = 'https://reportcard.schools.utah.gov/';

export const PLACE_LINK_MAX = 500;
export const MAX_PLACE_MILES = 500;
export const MAX_PLACE_MINUTES = 600;

const number = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  const clean = String(raw).replace(/[,\s]/g, '').replace(/(mi|miles?|min|minutes?)$/i, '');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * A place's distance, link and position as an admin sent them. Only what was sent is read (`partial`), a blank
 * clears, and anything wrong is refused in words: { data } or { error }.
 */
export function readPlaceExtras(body) {
  const data = {};
  const sent = (key) => body?.[key] !== undefined;

  if (sent('miles')) {
    const n = number(body.miles);
    if (n === null) data.miles = null;
    else if (Number.isNaN(n) || n < 0 || n > MAX_PLACE_MILES) return { error: `Miles away must be a number from 0 to ${MAX_PLACE_MILES}.` };
    else data.miles = Math.round(n * 10) / 10;
  }
  if (sent('minutes')) {
    const n = number(body.minutes);
    if (n === null) data.minutes = null;
    else if (Number.isNaN(n) || n < 0 || n > MAX_PLACE_MINUTES) return { error: `Minutes to drive must be a number from 0 to ${MAX_PLACE_MINUTES}.` };
    else data.minutes = Math.round(n);
  }
  if (sent('link')) {
    const text = String(body.link ?? '').trim();
    if (!text) data.link = '';
    else {
      let url;
      try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { return { error: 'That link does not look right. Paste the full web address.' }; }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'The link has to be a web address (https://).' };
      if (url.username || url.password) return { error: 'The link cannot hold a sign-in.' };
      const full = url.toString();
      if (full.length > PLACE_LINK_MAX) return { error: 'That link is too long.' };
      data.link = full;
    }
  }
  for (const [key, limit, name] of [['lat', 90, 'Latitude'], ['lng', 180, 'Longitude']]) {
    if (!sent(key)) continue;
    const n = number(body[key]);
    if (n === null) data[key] = null;
    else if (Number.isNaN(n) || Math.abs(n) > limit) return { error: `${name} must be a number between -${limit} and ${limit}.` };
    else data[key] = Math.round(n * 1e6) / 1e6;
  }
  // A position is a pair: one half alone points nowhere.
  if (('lat' in data) !== ('lng' in data)) return { error: 'Send both the latitude and the longitude.' };
  if (('lat' in data) && (data.lat === null) !== (data.lng === null)) return { error: 'Send both the latitude and the longitude.' };
  return { data };
}

/** "1.2 mi · 4 min drive", from whichever of the two is known; '' when neither is. */
export function driveLabel(miles, minutes) {
  const parts = [];
  if (miles !== null && miles !== undefined && Number(miles) >= 0 && miles !== '') parts.push(`${Number(miles).toFixed(1).replace(/\.0$/, '')} mi`);
  if (minutes !== null && minutes !== undefined && Number(minutes) > 0 && minutes !== '') parts.push(`${Math.round(Number(minutes))} min drive`);
  return parts.join(' · ');
}

/** A usable pair of coordinates (both numbers, in range), or null. */
export function pointOf(item) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  if (item?.lat === null || item?.lat === undefined || item?.lat === '' || item?.lng === null || item?.lng === undefined || item?.lng === '') return null;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * Where "Get directions" goes. With a position the destination is exact; with only an address it is searched. Apple
 * devices open Apple Maps (which starts from where the person is), everything else Google Maps, which does too.
 * Returns null when there is nothing to point at.
 */
export function directionsUrl({ lat, lng, address = '', apple = false } = {}) {
  const point = pointOf({ lat, lng });
  const query = point ? `${point.lat},${point.lng}` : String(address ?? '').trim();
  if (!query) return null;
  if (apple) return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`;
}
