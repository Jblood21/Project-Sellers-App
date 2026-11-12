import dns from 'node:dns/promises';
import net from 'node:net';

import sharp from 'sharp';

/**
 * Pulling a listing's details and photos from its MLS page, for an agent who pastes the link of a home they list.
 *
 * Two jobs, kept apart:
 *   - readListingPage(html, link): finds what a page says about the home. It only reads text it is given, so it is
 *     tested against saved pages and never touches the network. It trusts nothing: every value is checked again by
 *     the same rules as a typed one before it is stored.
 *   - fetchPage / fetchPhoto: get a page or a picture from a public https address. The page's host must be on the
 *     allow-list below (a pasted link is never fetched from anywhere else); a picture may come from the page's
 *     picture host, which differs, so a picture is held to the weaker rule that it is https and public (no
 *     address inside this server's network, and the file must really be an image).
 *
 * Private remarks and showing instructions are never read: only what the public page shows.
 */

/** Hosts a listing page may be fetched from (the host itself and its subdomains). */
export const IMPORT_HOSTS = ['utahrealestate.com'];

const PAGE_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 15000;
const PHOTO_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 4;
export const MAX_IMPORT_PHOTOS = 30;
/** What a stored photo may weigh (the same limit an uploaded one has). */
const STORED_PHOTO_BYTES = 3 * 1024 * 1024;
const LONGEST_EDGE = 2560;

/** The address a link is fetched from: https, an allowed host, no query or fragment (those name the sharer). */
export function cleanListingLink(text) {
  let raw = String(text ?? '').trim();
  if (!raw) return { error: 'Paste the link to the listing.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'That does not look like a link. Paste the full address of the listing page.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'The link has to start with https://' };
  const host = url.hostname.toLowerCase();
  if (!IMPORT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return { error: 'This works with Utah MLS listing links (utahrealestate.com) for now. Type the home in by hand, or paste one of those links.' };
  }
  url.protocol = 'https:';
  url.username = '';
  url.password = '';
  url.port = '';
  url.search = '';
  url.hash = '';
  return { url: url.toString(), mls: /\/(\d{6,9})\/?$/.exec(url.pathname)?.[1] ?? '' };
}

// ── safe fetching ──────────────────────────────────────────────────────────

/** Whether an IP address is one only this server's own network can reach (loopback, private, link-local, ...). */
export function isPrivateAddress(ip) {
  const text = String(ip ?? '').toLowerCase().replace(/%.*$/, '');
  if (net.isIPv4(text)) {
    const [a, b] = text.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(text)) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
    if (mapped) return isPrivateAddress(mapped[1]);
    return text === '::' || text === '::1' || /^f[cd]/.test(text) || /^fe[89ab]/.test(text) || /^ff/.test(text);
  }
  return true;
}

/** Swappable by tests: how a host name is turned into addresses. */
export const hooks = {
  lookup: async (host) => (await dns.lookup(host, { all: true })).map((entry) => entry.address),
  fetch: (...args) => fetch(...args),
};

async function assertPublic(host) {
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('That address is not a public website.');
    return;
  }
  let addresses;
  try {
    addresses = await hooks.lookup(host);
  } catch {
    throw new Error('That website could not be found.');
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('That address is not a public website.');
}

/** Reads a response body up to `max` bytes; throws when it is longer. */
async function readBody(res, max) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) throw new Error('That file is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > max) throw new Error('That file is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * GET a public https address, following up to MAX_REDIRECTS redirects and checking each hop (https, a public
 * address, and `hostOk` when given) before it is asked. Returns { url, type, body }.
 */
async function safeGet(start, { max, timeoutMs, accept, hostOk }) {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== 'https:') throw new Error('Only https links can be used.');
    if (hostOk && !hostOk(url.hostname.toLowerCase())) throw new Error('That link goes somewhere this cannot read.');
    await assertPublic(url.hostname);
    const res = await hooks.fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: accept, 'User-Agent': 'Mozilla/5.0 (compatible; TouradoorImport/1.0)', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new Error(`The site answered ${res.status}.`);
    return { url: url.toString(), type: String(res.headers.get('content-type') ?? ''), body: await readBody(res, max) };
  }
  throw new Error('The link redirected too many times.');
}

const hostAllowed = (host) => IMPORT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));

/** The page's HTML, or throws a message an agent can act on. */
export async function fetchPage(link) {
  try {
    const got = await safeGet(link, { max: PAGE_MAX_BYTES, timeoutMs: PAGE_TIMEOUT_MS, accept: 'text/html,application/xhtml+xml', hostOk: hostAllowed });
    return { url: got.url, html: got.body.toString('utf8') };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('The site took too long to answer. Try again in a minute.');
    throw err;
  }
}

/**
 * One picture, made ready to store: upright, no more than LONGEST_EDGE on its long side, as WebP, under the stored
 * photo limit. Throws when the file is not a picture a browser can show.
 */
export async function fetchPhoto(link) {
  const url = new URL(link);
  let got;
  try {
    got = await safeGet(url, { max: PHOTO_MAX_BYTES, timeoutMs: PHOTO_TIMEOUT_MS, accept: 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5' });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('The picture took too long to download.');
    throw err;
  }
  if (!/^image\//i.test(got.type)) throw new Error('That link is not a picture.');
  for (const quality of [84, 74, 62]) {
    // Decoding is checked as a whole: a page labelled image/jpeg that is not one fails here.
    const data = await sharp(got.body, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: LONGEST_EDGE, height: LONGEST_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (data.length <= STORED_PHOTO_BYTES) return { contentType: 'image/webp', data: data.toString('base64') };
  }
  throw new Error('That picture is too large to keep.');
}

// ── reading a page ─────────────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) => String(text ?? '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);

/** The page as plain text, one line per block, for the labelled facts ("Year Built 1998"). */
function pageText(html) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h\d|section|dt|dd|td|th|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n');
}

const number = (text) => {
  const clean = String(text ?? '').replace(/[$,\s]/g, '');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
};

function jsonLdObjects(html) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    out.push(node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  for (const match of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1].trim())); } catch { /* a block that is not JSON says nothing */ }
  }
  return out;
}

const metaContent = (html, key) => {
  const found = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const body = tag[0];
    const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(body);
    if (name && name.toLowerCase() === key && content) found.push(decode(content[1] ?? content[2]));
  }
  return found;
};

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

/** "5.7 acres" / "10,454 sq ft" / "0.24" → acres. A bare number is taken as acres when small, square feet when large. */
function acresOf(value, unit) {
  const n = number(value);
  if (n === null || n <= 0) return null;
  const u = String(unit ?? '').toLowerCase();
  if (/^ac/.test(u)) return n;
  if (/sq|ft/.test(u)) return n / 43560;
  return n > 500 ? n / 43560 : n;
}

const IMAGE_URL = /https?:\/\/[^\s"'<>\\()]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>\\()]*)?/gi;
const SKIP_IMAGE = /logo|icon|sprite|avatar|headshot|agent|broker|placeholder|spacer|pixel|badge|flag|banner|favicon|static-map|staticmap|\/maps?\/|_thumb|thumbnail|\/profile|profile[-_]/i;

/**
 * Every picture of the home the page mentions, in the order it mentions them, once each. The page's own picture
 * list (JSON-LD, then the share image) comes first; after that anything on the page that looks like a photo.
 */
function photosOf(html, objects, base) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    let url;
    try { url = new URL(decode(raw).replace(/\\\//g, '/'), base); } catch { return; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    url.protocol = 'https:';
    if (SKIP_IMAGE.test(url.pathname)) return;
    // The same picture is often listed at several sizes: size words and numbers in the file name are ignored.
    const key = `${url.hostname}${url.pathname.replace(/[-_.](?:\d{2,4}x\d{2,4}|small|medium|large|thumb|lg|md|sm|xl)(?=\.)/gi, '')}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url.toString());
  };
  for (const obj of objects) {
    const image = obj.image ?? obj.photo ?? obj.associatedMedia;
    for (const item of [].concat(image ?? [])) add(typeof item === 'string' ? item : item?.contentUrl ?? item?.url ?? '');
  }
  for (const url of metaContent(html, 'og:image')) add(url);
  for (const match of html.matchAll(/(?:src|data-src|data-original|data-lazy|data-full|href)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) add(match[1]);
  for (const match of html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
    // The largest of the sizes listed.
    const best = match[1].split(',').map((part) => part.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0];
    if (best?.[0] && /\.(?:jpe?g|png|webp)/i.test(best[0])) add(best[0]);
  }
  // Addresses inside a script are written with escaped slashes (https:\/\/host\/a.jpg).
  for (const match of html.replace(/\\\//g, '/').matchAll(IMAGE_URL)) add(match[0]);
  return out.slice(0, MAX_IMPORT_PHOTOS);
}

/**
 * What a listing page says about the home.
 * Returns { fields, photos, found } where `fields` holds only what was found (address, city, price, beds, baths,
 * sqft, yearBuilt, lotAcres, hoaMonthly, taxAnnual, description, mlsNumber) and `found` is how many of the
 * facts that matter (address, price, beds, baths, sqft) were read, so a caller can tell a real listing page from a
 * sign-in or error page.
 */
export function readListingPage(html, link) {
  const base = String(link ?? 'https://www.utahrealestate.com/');
  const objects = jsonLdObjects(html);
  const listing = objects.find((o) => o.address && (o.offers || o.price || o.numberOfRooms || o.numberOfBedrooms || o.floorSize))
    ?? objects.find((o) => o.address) ?? {};
  const text = pageText(html);
  const labelled = (label, shape = '([\\d,.]+)') => {
    const match = new RegExp(`(?:^|\\n|\\s)${label}\\s*:?\\s*\\$?\\s*${shape}`, 'i').exec(text);
    return match;
  };
  const fields = {};

  // Address: the JSON-LD address, else the page title ("123 Maple St, Lehi, UT 84043 | ...").
  const address = listing.address;
  if (address && typeof address === 'object') {
    if (address.streetAddress) fields.address = decode(address.streetAddress).trim();
    const city = [address.addressLocality, address.addressRegion].filter(Boolean).join(', ');
    if (city) fields.city = decode(city).trim();
  } else if (typeof address === 'string') {
    const [street, ...rest] = decode(address).split(',').map((s) => s.trim());
    if (street) fields.address = street;
    if (rest.length) fields.city = rest.join(', ').replace(/\s+\d{5}(-\d{4})?$/, '');
  }
  if (!fields.address) {
    const title = first(metaContent(html, 'og:title')[0], /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
    const match = /^\s*(\d[^,|]{2,60}?)\s*,\s*([A-Za-z .'-]+?)\s*,?\s*(UT|Utah)\b/i.exec(decode(title ?? ''));
    if (match) { fields.address = match[1].trim(); fields.city = `${match[2].trim()}, UT`; }
  }

  const offerPrice = [].concat(listing.offers ?? [])[0]?.price;
  const price = number(first(offerPrice, listing.price, labelled('(?:List(?:ing)?\\s*)?Price')?.[1]));
  if (price && price >= 1000) fields.price = Math.round(price);
  const beds = number(first(listing.numberOfBedrooms, listing.numberOfRooms, labelled('(?:Beds?|Bedrooms?)', '(\\d+)')?.[1]));
  if (beds !== null && beds >= 0 && beds <= 50) fields.beds = Math.round(beds);
  const baths = number(first(listing.numberOfBathroomsTotal, listing.numberOfFullBathrooms, labelled('(?:Baths?|Bathrooms?)(?:\\s*Total)?', '(\\d+(?:\\.\\d+)?)')?.[1]));
  if (baths !== null && baths >= 0 && baths <= 50) fields.baths = baths;
  const sqftSource = listing.floorSize?.value ?? listing.floorSize;
  const sqft = number(first(typeof sqftSource === 'object' ? null : sqftSource, labelled('(?:Total\\s*)?(?:Sq\\.?\\s*Ft\\.?|Square\\s*Feet|Sqft)(?:\\s*Total)?')?.[1]));
  if (sqft && sqft >= 100 && sqft <= 100000) fields.sqft = Math.round(sqft);

  const year = number(first(listing.yearBuilt, labelled('Year\\s*Built', '(\\d{4})')?.[1]));
  if (year && year >= 1800) fields.yearBuilt = Math.round(year);
  const lot = labelled('Lot\\s*(?:Size|Acres?|Area)', '([\\d,.]+)\\s*(acres?|ac|sq\\.?\\s*ft\\.?|sqft)?');
  const lotAcres = lot ? acresOf(lot[1], lot[2]) : null;
  if (lotAcres) fields.lotAcres = Math.round(lotAcres * 1000) / 1000;
  const hoa = labelled('HOA(?:\\s*(?:Fee|Dues|Amount))?', '([\\d,]+(?:\\.\\d+)?)\\s*(?:/|per)?\\s*(mo(?:nth)?|yr|year|annual(?:ly)?|quarter(?:ly)?)?');
  if (hoa) {
    const amount = number(hoa[1]);
    const period = String(hoa[2] ?? 'mo').toLowerCase();
    if (amount !== null) fields.hoaMonthly = Math.round(period.startsWith('y') || period.startsWith('a') ? amount / 12 : period.startsWith('q') ? amount / 3 : amount);
  } else if (/\bHOA\s*:?\s*(?:none|no)\b/i.test(text)) {
    fields.hoaMonthly = 0;
  }
  const tax = labelled('(?:Annual\\s*)?(?:Property\\s*)?Tax(?:es)?(?:\\s*(?:Amount|Annual))?', '([\\d,]+(?:\\.\\d+)?)');
  if (tax) {
    const amount = number(tax[1]);
    // A tax rate printed as a percent is not an annual amount.
    if (amount && amount >= 100) fields.taxAnnual = Math.round(amount);
  }

  const description = first(listing.description, metaContent(html, 'og:description')[0], metaContent(html, 'description')[0]);
  if (description) fields.description = decode(description).replace(/\s+/g, ' ').trim().slice(0, 4000);
  const mls = first(
    labelled('MLS\\s*(?:#|No\\.?|Number)?', '(\\d{6,9})')?.[1],
    /\/(\d{6,9})\/?(?:[?#]|$)/.exec(base)?.[1],
  );
  if (mls) fields.mlsNumber = String(mls);

  const found = ['address', 'price', 'beds', 'baths', 'sqft'].filter((key) => fields[key] !== undefined).length;
  return { fields, photos: photosOf(html, objects, base), found };
}
