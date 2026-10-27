import { isListing, readOpenHouses } from '@shared/listing.js';
import { comingOpenHouses, localNow } from '../buyer/openHouse.js';

import { adminApi } from '../lib/api.js';

export { isListing };

/** Today's date in the viewer's own calendar as 'YYYY-MM-DD' (open houses are literal dates at the home). */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat Nov 14" from '2026-11-14', read as the calendar day it names and never as a moment in time. */
export function sessionDate(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${DAYS[new Date(y, m - 1, d).getDay()]} ${MONTHS[m - 1]} ${d}`;
}

function clock(time) {
  const [h, m] = String(time).split(':').map(Number);
  return { text: m ? `${h % 12 || 12}:${String(m).padStart(2, '0')}` : String(h % 12 || 12), meridiem: h >= 12 ? 'PM' : 'AM' };
}

/** "1–3 PM", "11 AM–1 PM", or "1 PM" for a session with no end. */
export function sessionTimes(session) {
  if (!session?.start) return '';
  const from = clock(session.start);
  // A no-break space before AM/PM, so a time never splits across two lines of a narrow card.
  const nb = '\u00a0';
  if (!session.end) return `${from.text}${nb}${from.meridiem}`;
  const to = clock(session.end);
  return from.meridiem === to.meridiem
    ? `${from.text}–${to.text}${nb}${to.meridiem}`
    : `${from.text}${nb}${from.meridiem}–${to.text}${nb}${to.meridiem}`;
}

/** "Sat Nov 14, 1–3 PM". */
export const sessionLabel = (session) => `${sessionDate(session.date)}, ${sessionTimes(session)}`;

/** The sessions of a listing (the community, or a Today card with its settings) that are still to come. */
export function upcomingOf(listing, today = localToday(), time = localNow().time) {
  // The same rule the buyer app follows: today's session that has already finished is over.
  return comingOpenHouses(readOpenHouses(listing?.settings?.openHousesJson), today, time);
}

/** The next one: the first whose date is today or later. */
export const nextOpenHouse = (listing, today) => upcomingOf(listing, today)[0] ?? null;

/** The word for a mix of places: "listing", "community" or "listing or community". */
export function placeNoun(listings, communities) {
  if (listings && communities) return 'listing or community';
  return listings ? 'listing' : 'community';
}

/**
 * A listing's address is its name and its one home's name. Both are changed together, home first: if the second
 * request fails, asking again repeats the same two (each is the same change), so the two never stay different.
 */
export async function renameListing(token, community, address, fields = {}) {
  const home = community.homes?.[0];
  if (home && home.name !== address) await adminApi.updateHome(token, home.id, { name: address });
  return adminApi.updateCommunity(token, community.id, { name: address, ...fields });
}
