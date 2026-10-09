import { readFile } from 'node:fs/promises';

import { pageJsonLd, pageMeta, serializeJsonLd } from '../../shared/schema.js';
import { loadPublicCommunity } from '../routes/public.js';

/**
 * Server-rendered page heads for the public buyer pages.
 *
 * The buyer app is a client-side SPA, so a crawler or a link-preview bot that
 * fetches /c/:id would see the stock index.html ("Homebuyer App") and none of
 * the community's own title, description or structured data. For the three pages
 * that are meant to be found (the landing page, the guide list and each guide)
 * the server therefore injects the head into the built index.html before it
 * leaves. The React app then boots as usual and StructuredData.jsx takes the
 * injected tags over, so there is one set of tags at every moment, not two.
 *
 * Everything here is derived from the same two inputs the browser uses: the
 * public community payload (the exact thing /api/c/:id serves) and
 * shared/schema.js. Nothing is cached, because every byte depends on the
 * community and on the host the request arrived on.
 */

/**
 * Marks the tags this module adds (every one but <title>, which the browser
 * itself owns once the page is open), so the client can recognise and take
 * them over, and so a document is never injected into twice.
 */
const MARK = 'data-cornerpost';

/** Text or an attribute value, made safe for either position. */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * The first value of a header a proxy may have appended to. Every hop in a chain
 * adds its own ("a.example, b.example"), and the one the browser actually used is
 * the first; taking the whole string would make the origin unparseable, and SSR
 * would silently switch itself off behind any proxy chain.
 */
const firstOf = (value) => String(value ?? '').split(',')[0].trim();

/**
 * PUBLIC_ORIGIN as a bare origin, or '' when it is unset or is not an http(s)
 * address. A misconfigured value is ignored rather than trusted, because it ends
 * up in every canonical and every JSON-LD @id.
 */
export function pinnedOrigin(value = process.env.PUBLIC_ORIGIN) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

/**
 * The origin the request came in on, the way public.js builds links for emails:
 * the forwarded host and protocol when a proxy set them, else the socket's.
 * Returns '' when there is no host. schema.js refuses anything that is not a
 * clean http(s) origin, so a forged Host header cannot reach a tag as markup.
 */
export function originOfRequest(req) {
  // A deployment answers on every name it has (Render's own and a custom domain),
  // and a canonical that follows the Host header is a different canonical on each
  // of them, which defeats the point of having one. When PUBLIC_ORIGIN is set it
  // is the one answer. Unset (development), a page behind a proxy is addressed as the
  // browser addressed it, which is what the forwarded headers carry. The links in
  // emails do not take that road: they are written for a third party to click, so they
  // never follow a header the caller chose (see linkOriginOf).
  const pinned = pinnedOrigin();
  if (pinned) return pinned;
  const host = firstOf(req.get('x-forwarded-host')) || firstOf(req.get('host'));
  if (!host) return '';
  const forwarded = firstOf(req.get('x-forwarded-proto')).toLowerCase();
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : req.protocol || 'https';
  return `${proto}://${host}`;
}

/**
 * The address a link in an EMAIL points at. PUBLIC_ORIGIN when it is set; otherwise
 * the Host header alone, and never X-Forwarded-Host: that header is whatever the
 * caller sent, and a buyer who can pick the host in the builder's "Open the lead"
 * link has been handed a way to send the builder to a page of their own choosing.
 * (The platform routes on Host, so only the site's own names reach this server.)
 * Returns '' when nothing trustworthy is known, and the email then carries no link.
 */
export function linkOriginOf(req) {
  const pinned = pinnedOrigin();
  if (pinned) return pinned;
  const host = String(req.get('host') ?? '').trim();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host)) return '';
  // X-Forwarded-Proto is a header like any other. A production site is https, whatever it says.
  const plain = process.env.NODE_ENV !== 'production' && req.protocol === 'http';
  return `${plain ? 'http' : 'https'}://${host}`;
}

/**
 * The placeholder the admin API stores for a community created with no location.
 * It is a note to the builder in the admin screens, not a place, so it must not
 * be published as one in a title, a description or a Place address.
 */
const LOCATION_PLACEHOLDER = 'Location TBD';

/** The community as a search engine should read it: no placeholder location. */
export function publishable(community) {
  if (String(community?.location ?? '').trim().toLowerCase() !== LOCATION_PLACEHOLDER.toLowerCase()) return community;
  return { ...community, location: '' };
}

const metaTag = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" ${MARK}>`;

/**
 * The tags for one page, as a block of HTML. `page` and the data it needs
 * (`guide` for a guide) go straight to shared/schema.js, so the robots rule,
 * title and description are exactly what the browser will compute later.
 */
export function renderHead({ page, community: stored, origin, guide }) {
  const community = publishable(stored);
  const meta = pageMeta({ page, community, origin, guide });
  if (!meta.canonical) return '';
  const nodes = pageJsonLd({ page, community, origin, guide });
  const siteName = String(community?.name ?? '').replace(/\s+/g, ' ').trim();

  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    metaTag('name', 'description', meta.description),
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" ${MARK}>`,
    metaTag('name', 'robots', meta.robots),
    metaTag('property', 'og:type', meta.type),
    metaTag('property', 'og:site_name', siteName),
    metaTag('property', 'og:title', meta.title),
    metaTag('property', 'og:description', meta.description),
    metaTag('property', 'og:url', meta.canonical),
    meta.image ? metaTag('property', 'og:image', meta.image) : '',
    metaTag('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary'),
    metaTag('name', 'twitter:title', meta.title),
    metaTag('name', 'twitter:description', meta.description),
    meta.image ? metaTag('name', 'twitter:image', meta.image) : '',
    // serializeJsonLd already escapes < > & and the line separators as \uXXXX,
    // which is what makes this safe inside a script element. Escaping it again
    // as HTML would corrupt the JSON, so it goes in as is.
    nodes.length ? `<script type="application/ld+json" ${MARK}>${serializeJsonLd(nodes)}</script>` : '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

// Tags the stock index.html carries that the injected ones replace. Each pattern
// reads one whole element, with quoted or bare attribute values.
const REPLACED = [
  /<title\b[^>]*>[\s\S]*?<\/title\s*>/gi,
  /<meta\b[^>]*\bname\s*=\s*["']?(?:description|robots)["']?[^>]*>/gi,
  /<link\b[^>]*\brel\s*=\s*["']?canonical["']?[^>]*>/gi,
];

/**
 * Puts `head` into a built index.html. Replaces the stock title and description
 * rather than adding a second one (two titles or two descriptions is what a
 * crawler picks between at random). A document that already carries our marker
 * is returned untouched, so nothing is ever injected twice, and one with no
 * <title> or no </head> degrades sensibly: the first still gets the tags, the
 * second is returned as it was.
 */
export function injectHead(html, head) {
  const source = String(html ?? '');
  if (!head || source.includes(MARK)) return source;
  const close = /<\/head\s*>/i.exec(source);
  if (!close) return source;

  let stripped = source;
  for (const pattern of REPLACED) stripped = stripped.replace(pattern, '');
  // Stripping can only shorten the document before </head>, so find it again.
  const at = /<\/head\s*>/i.exec(stripped).index;
  return `${stripped.slice(0, at)}  ${head}\n  ${stripped.slice(at)}`;
}

/**
 * The finished HTML for one public page, or null when the plain SPA shell is
 * the right answer: no client build, no such community, a feature that is
 * switched off, a guide that does not exist or is a draft, or no usable origin.
 * Null always means "behave exactly as if this route did not exist".
 */
export async function renderBuyerPage({ indexPath, store, communityId, page, slug, origin }) {
  // A NUL byte in an address would make the Postgres driver throw; it is a
  // community that cannot exist, which is the same answer without the error.
  // eslint-disable-next-line no-control-regex
  if (!communityId || /[\0-\x1f]/.test(communityId) || !origin) return null;
  const community = await loadPublicCommunity(store, communityId);
  if (!community) return null;

  let guide;
  if (page === 'guides' || page === 'guide') {
    if (!community.features?.guides) return null;
    if (page === 'guide') {
      // The public payload lists published guides only, so finding the slug in
      // it is also the proof that it is published.
      guide = community.guides.find((g) => g.slug === slug);
      if (!guide) return null;
    }
  }

  const head = renderHead({ page, community, origin, guide });
  if (!head) return null;
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    return null;
  }
  const injected = injectHead(html, head);
  return injected === html ? null : injected;
}

/**
 * True when the community exists but the guide page asked for does not: a guide
 * that is unpublished, deleted or switched off. An unknown community stays the
 * plain shell it always was, and so does any other reason for having no head
 * (no usable origin, an unreadable build). Guarded against control characters
 * for the same reason renderBuyerPage is.
 */
export async function unavailablePage({ store, communityId, page, slug }) {
  // eslint-disable-next-line no-control-regex
  if (!communityId || /[\0-\x1f]/.test(communityId)) return false;
  if (page !== 'guides' && page !== 'guide') return false;
  const community = await loadPublicCommunity(store, communityId);
  if (!community) return false;
  if (!community.features?.guides) return true;
  return page === 'guide' && !community.guides.some((g) => g.slug === slug);
}
