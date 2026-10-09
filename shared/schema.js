/**
 * schema.org structured data (JSON-LD) and page metadata for the buyer app.
 *
 * Pure functions with no dependencies beyond domain.js, so the Express server
 * (which injects the head into /c/:id, /c/:id/guides and /c/:id/guides/:slug
 * before the SPA boots) and the browser (which keeps the head in step as the
 * buyer navigates) produce exactly the same answer from the same community.
 *
 * Three rules shape everything below:
 *
 *   1. Only public facts go in. The community payload a buyer receives is the
 *      only input, and even so nothing is read from it that a buyer could not
 *      already see on the page: never `settings.notifyEmail`, never a lead,
 *      never a slot, never a saved home. Gated pages describe THE PAGE, not
 *      the visitor.
 *   2. Every URL is absolute and either on this origin or https. A relative
 *      path in JSON-LD means nothing to a crawler that is not on our site.
 *   3. An empty value is omitted, never printed. `""`, `undefined`, `NaN` and
 *      empty arrays and objects are pruned on the way out, so a community with
 *      no logo simply has no logo property rather than `"logo": ""`.
 *
 * The output is one `@graph`: entities refer to one another by stable `@id`
 * (`<origin>/c/<id>#organization` and so on) so a crawler reading two pages of
 * the same community merges them into one organisation and one place instead
 * of finding a new one on every page.
 */
import { parseFaq } from './faq.js';
import {
  EHL_MARKS, HIGHLIGHT_CATEGORIES, LENDER_LOGOS, PLAN_LABELS, TOOLS, complianceOf, isSold, mapsUrl,
} from './domain.js';

const CONTEXT = 'https://schema.org';
const LANGUAGE = 'en-US';
const DESCRIPTION_MAX = 160;
const TITLE_MAX = 70;

/**
 * The only pages a search engine may index. Everything else behind the contact
 * gate (start, tools, explore, area, map, home, tool, saved, plan, realtors), and
 * any page type this file has not heard of, is noindex: a new page must be opted
 * IN to the index, never in by accident.
 */
const INDEXABLE_PAGES = new Set(['landing', 'guides', 'guide']);

const AVAILABILITY_URL = {
  soldOut: 'https://schema.org/SoldOut',
  inStock: 'https://schema.org/InStock',
  preOrder: 'https://schema.org/PreOrder',
};

// ── small helpers ───────────────────────────────────────────────────────────

const list = (value) => (Array.isArray(value) ? value : []);

/** Control characters other than whitespace have no business in a string we publish. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** A single-line string: control characters gone, runs of whitespace collapsed. */
const text = (value) => String(value ?? '').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();

/**
 * The most text any one meta field reads. A description or title is cut to 160
 * or 70 characters anyway, so nothing past this can matter, and capping first
 * keeps every regex below working on a bounded string no matter what a builder
 * typed into a community name (the admin API does not limit those).
 */
const META_INPUT_MAX = 2000;

/**
 * Plain text for a <meta> description or <title>: markup removed, not merely
 * escaped. The injector will escape it for the attribute, but a description
 * that reads "<b>Sold</b>" in a search result is wrong even when it is safe.
 *
 * Only well-formed tags are removed, so "Priced < $500k and > 3 beds" keeps its
 * words. The tag pattern excludes `<` from its body: with `[^>]*` a string of
 * many `<` and no `>` was quadratic, and this runs synchronously on the server
 * for every request. Any `<` or `>` left over is turned into a space, so the
 * result can never carry markup characters.
 */
const plain = (value) => text(
  String(value ?? '').slice(0, META_INPUT_MAX)
    .replace(/<\/?[a-z!][^<>]*>/gi, ' ')
    .replace(/[<>]/g, ' '),
);

/** Whichever of a url string or a `{ url }` object the caller has (public vs admin payloads). */
const urlOf = (value) => (typeof value === 'string' ? value : value?.url ?? '');

/** A usable quantity: finite and above zero, else 0 (which every caller reads as "not stated"). */
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const money = (n) => `$${Math.round(Number(n)).toLocaleString('en-US')}`;

/** Drops a high surrogate left dangling by a cut, so an emoji is kept whole or not at all. */
const whole = (value) => value.replace(/[\uD800-\uDBFF]$/, '');

/**
 * Shortens to `max` characters without ever stopping mid-word. Prefers the end
 * of a sentence if that keeps at least half the room; otherwise cuts at the last
 * space and adds an ellipsis so the reader can tell it was cut.
 */
function fit(value, max) {
  const s = plain(value);
  if (s.length <= max) return s;
  const room = whole(s.slice(0, max));
  const sentence = Math.max(room.lastIndexOf('. '), room.lastIndexOf('! '), room.lastIndexOf('? '));
  if (sentence >= max / 2) return room.slice(0, sentence + 1);
  const cut = whole(s.slice(0, max - 1));
  const space = cut.lastIndexOf(' ');
  const base = (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—(]+$/, '');
  return `${base}…`;
}

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim());

/** An ISO 8601 timestamp, or '' when the value is not a date at all. */
function isoOf(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** `https://example.com` from whatever the caller passed; '' for anything that is not http(s). */
function originOf(origin) {
  try {
    const parsed = new URL(String(origin ?? '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (parsed.username || parsed.password) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * An absolute URL for `path`, or '' when there is no safe one (including when `path` is empty).
 *
 * A site path (`/c/willow/guides`, `/api/photos/p_1`) is resolved against the
 * origin. An absolute http(s) address is passed through, tidied. Everything else
 * is refused: `javascript:` and `data:` for the obvious reason, protocol-relative
 * `//host` and backslash tricks because browsers read them as another host, and
 * addresses with credentials in them because they would be published.
 */
export function absoluteUrl(origin, path) {
  // Nothing is not the site root: a missing logo must not become a link to the home page.
  const raw = text(path);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.username || parsed.password) return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }
  const base = originOf(origin);
  if (!base || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '';
  try {
    const resolved = new URL(raw, base);
    return resolved.origin === base ? resolved.toString() : '';
  } catch {
    return '';
  }
}

/** Removes everything that must not be published, recursively. */
function prune(value) {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const kept = prune(child);
      if (kept !== undefined) out[key] = kept;
    }
    // A node that is nothing but its type says nothing, so it is dropped.
    return Object.keys(out).some((key) => key !== '@type') ? out : undefined;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(CONTROL_CHARS, '').trim();
    return cleaned || undefined;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/**
 * JSON for a <script type="application/ld+json"> element. `JSON.stringify` alone
 * is not enough: a community called `</script><script>alert(1)</script>` would
 * close the element and run. `<`, `>` and `&` are written as \uXXXX escapes, which
 * every JSON parser reads back as the original character, and so are U+2028 and
 * U+2029, which were line terminators in JavaScript source for years.
 *
 * Nodes are wrapped in a single `@graph` so the `@id` references between them
 * resolve inside one document; a node's own `@context` is dropped to avoid
 * repeating it.
 */
export function serializeJsonLd(nodes) {
  const graph = list(nodes).map((node) => {
    if (!node || typeof node !== 'object') return null;
    const { '@context': ignored, ...rest } = node;
    return rest;
  }).filter(Boolean);
  const json = JSON.stringify({ '@context': CONTEXT, '@graph': graph });
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── context ─────────────────────────────────────────────────────────────────

/** What a community's public address is written with: its clean slug when it has one, else its id. */
const keyOf = (community) => text(community?.urlKey) || text(community?.id);


/** Everything the builders share about one community on one origin. */
function makeContext(origin, community) {
  const base = originOf(origin);
  const id = keyOf(community);
  if (!base || !id) return null;
  const root = `${base}/c/${encodeURIComponent(id)}`;
  return {
    origin: base,
    community,
    root,
    name: text(community.name) || 'Community',
    builder: text(community.builder),
    location: text(community.location),
    ids: {
      organization: `${root}#organization`,
      website: `${root}#website`,
      community: `${root}#community`,
      lender: `${root}#lender`,
    },
    abs: (path) => absoluteUrl(base, path),
    // Settings carry the lender; only compliance copy is read, never notifyEmail.
    compliance: complianceOf(community.settings, { community }),
  };
}

const ref = (id) => ({ '@id': id });

/**
 * An ImageObject, or undefined when the address is not publishable. `name` is
 * the alt text the page shows; `caption` says a little more. No `@id` on
 * purpose: the same picture is described differently on different pages (the
 * shared guide image carries each guide's title), and two descriptions sharing
 * one `@id` would merge into a contradiction.
 */
function imageObject(ctx, source, { name, caption, description } = {}) {
  const url = ctx.abs(urlOf(source));
  const label = text(name);
  if (!url || !label) return undefined;
  return {
    '@type': 'ImageObject',
    contentUrl: url,
    url,
    name: label,
    caption: text(caption) || label,
    description: text(description) || undefined,
  };
}

/** `Lehi, UT 84043` becomes a PostalAddress; anything we cannot read stays the text it was. */
function addressOf(value) {
  const full = text(value);
  if (!full) return undefined;
  const parts = full.split(',').map((part) => part.trim()).filter(Boolean);
  const tail = parts.length >= 2 ? parts[parts.length - 1].match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/) : null;
  if (!tail) return full;
  const street = parts.slice(0, -2).join(', ');
  return {
    '@type': 'PostalAddress',
    streetAddress: street,
    addressLocality: parts[parts.length - 2],
    addressRegion: tail[1].toUpperCase(),
    postalCode: tail[2],
    addressCountry: 'US',
  };
}

/**
 * An E.164 number when the field is unmistakably one number, else exactly what
 * was typed. Guessing wrong publishes somebody else's phone number, so the
 * rule is narrow: ten digits (US), eleven starting with 1 (US), or an explicit
 * leading + with a plausible international length, and nothing in the field
 * but digits and the usual punctuation. An extension ("x23", "ext. 12"), two
 * numbers in one field, or a seven-digit local number are all passed through as
 * typed, which schema.org accepts for `telephone` and which stays truthful.
 */
function phoneOf(value) {
  const typed = text(value);
  if (!/^\+?[\d\s().-]+$/.test(typed)) return typed;
  const digits = typed.replace(/\D/g, '');
  if (typed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : typed;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return typed;
}

const emailOf = (value) => {
  const typed = text(value);
  return /^[^\s@]+@[^\s@]+$/.test(typed) ? typed : '';
};

// ── what each page is ───────────────────────────────────────────────────────

const PAGE_PARENT = { home: 'explore', guide: 'guides', tool: 'tools' };

/** A guide a buyer may read: the public API never sends a draft, and a draft that arrives anyway is treated as absent. */
const isPublished = (guide) => guide.published !== false;

/**
 * The page a request really is. A home, guide or tool that was not supplied (or
 * is not in the community, or is an unpublished draft) degrades to its list page
 * instead of describing a thing that is not there, and is marked `degraded` so
 * the list page's indexing rules do not carry over to a URL that has no content.
 * `page` has no default: a missing one is an unknown page, which is noindex.
 */
function resolveView({ page, home, guide, tool }) {
  let view = { page: text(page), home: null, guide: null, tool: null, degraded: false };
  if (view.page === 'home') view.home = home && home.id ? home : null;
  if (view.page === 'guide') view.guide = guide && guide.slug && isPublished(guide) ? guide : null;
  if (view.page === 'tool') {
    const key = typeof tool === 'string' ? tool : tool?.k;
    const known = TOOLS.find((t) => t.k === key);
    view.tool = known ?? null;
  }
  if (!view[view.page] && PAGE_PARENT[view.page]) view = { ...view, page: PAGE_PARENT[view.page], degraded: true };
  return view;
}

/** The path of a page relative to the origin. */
function pathOf(ctx, view) {
  const id = encodeURIComponent(keyOf(ctx.community));
  const base = `/c/${id}`;
  switch (view.page) {
    case 'landing': return base;
    case 'home': return `${base}/homes/${encodeURIComponent(view.home.id)}`;
    case 'tool': return `${base}/tool/${encodeURIComponent(view.tool.k)}`;
    case 'guide': return `${base}/guides/${encodeURIComponent(view.guide.slug)}`;
    case 'start': case 'tools': case 'explore': case 'area': case 'map':
    case 'saved': case 'plan': case 'guides': case 'realtors':
      return `${base}/${view.page}`;
    default: return base;
  }
}

/**
 * The canonical URL, always derived from the community and the page and never
 * from the request. A caller's `path` (which may carry a query string, a
 * trailing slash, or in a hostile case another community's route or an API
 * path on this origin) cannot decide what a page claims to be, so it is not an
 * input here.
 */
function canonicalOf(ctx, view) {
  const url = new URL(ctx.abs(pathOf(ctx, view)));
  const out = url.toString();
  return out.length > ctx.origin.length + 1 ? out.replace(/\/$/, '') : out;
}

const homesOf = (community) => list(community.homes).filter((h) => h && h.id);
const guidesOf = (community) => list(community.guides).filter((g) => g && g.slug && text(g.title) && isPublished(g));
const agentsOf = (community) => list(community.agents).filter((a) => a && a.id && text(a.name));
const highlightsOf = (community) => list(community.highlights).filter((h) => h && text(h.name));
const toolsOf = (community) => TOOLS.filter((t) => community.tools?.[t.k] !== false);

/** The label a page carries in the breadcrumb trail, matching the menu. */
const CRUMB_LABEL = {
  start: 'Get started',
  tools: 'Homebuyer tools',
  explore: 'Explore Homes',
  area: 'Local Spots',
  map: 'Site Map',
  saved: PLAN_LABELS.homes,
  plan: 'My Home Plan',
  guides: 'Buyer Guides',
  realtors: 'Meet the agent',
};

// ── page metadata ───────────────────────────────────────────────────────────

/** The home's price range as words, over the homes still for sale. */
function priceFrom(community) {
  const prices = homesOf(community).filter((h) => !isSold(h)).map((h) => positive(h.price)).filter(Boolean);
  return prices.length ? Math.min(...prices) : 0;
}

function describeLanding(ctx) {
  const { community } = ctx;
  const homes = homesOf(community);
  const forSale = homes.filter((h) => !isSold(h));
  const from = priceFrom(community);
  const extras = [];
  if (homes.some((h) => list(h.floorPlans).length)) extras.push('floor plans');
  if (toolsOf(community).length) extras.push('free payment and affordability tools');
  if (guidesOf(community).length) extras.push('buyer guides');
  const lead = `${ctx.name}${ctx.builder ? ` by ${ctx.builder}` : ''}${ctx.location ? ` in ${ctx.location}` : ''}.`;
  const count = forSale.length
    ? ` ${forSale.length} new ${forSale.length === 1 ? 'home' : 'homes'}${from ? ` from ${money(from)}` : ''}.`
    : '';
  const joined = extras.length > 1
    ? `${extras.slice(0, -1).join(', ')} and ${extras[extras.length - 1]}`
    : extras[0];
  const more = joined ? ` Explore ${joined}.` : '';
  return `${lead}${count}${more}`;
}

function describeHome(ctx, home) {
  const own = plain(home.description);
  if (own) return own;
  const facts = [
    positive(home.beds) ? `${positive(home.beds)} bed` : '',
    positive(home.baths) ? `${positive(home.baths)} bath` : '',
    positive(home.sqft) ? `${positive(home.sqft).toLocaleString('en-US')} sq ft` : '',
  ].filter(Boolean).join(', ');
  const price = positive(home.price) && !isSold(home) ? ` from ${money(home.price)}` : '';
  return `${home.name}${facts ? `: ${facts}` : ''} at ${ctx.name}${price}.`;
}

/** The title and description a page presents, plus what a search engine may do with it. */
function metaOf(ctx, view, canonical, primaryImage) {
  const { community } = ctx;
  const name = ctx.name;
  const where = ctx.location ? ` in ${ctx.location}` : '';
  let title;
  let description;
  let type = 'website';

  switch (view.page) {
    case 'landing':
      title = ctx.location ? `${name} | New homes${where}` : `${name}${ctx.builder ? ` | ${ctx.builder}` : ''}`;
      description = describeLanding(ctx);
      break;
    case 'start':
      title = `Get started | ${name}`;
      description = `Share your name and email to open the free homebuyer tools for ${name}.`;
      break;
    case 'tools':
      title = `Homebuyer tools | ${name}`;
      description = `Payment, affordability and loan tools for buyers at ${name}${where}.`;
      break;
    case 'tool':
      title = `${view.tool.name} | ${name}`;
      description = `${view.tool.q} A free tool from ${name}.`;
      break;
    case 'explore':
      title = `Explore homes | ${name}`;
      description = `Browse the homes at ${name}${where}: photos, prices and details for each one.`;
      break;
    case 'home':
      title = `${view.home.name} | ${name}`;
      description = describeHome(ctx, view.home);
      break;
    case 'area':
      title = `Local spots near ${name}`;
      description = `Schools, parks, shopping and more near ${name}${where}, picked by the team that builds here.`;
      break;
    case 'map':
      title = `Site map | ${name}`;
      description = `The ${name} site map: see where each lot sits in the community.`;
      break;
    case 'saved':
      title = `Homes I like | ${name}`;
      description = `The homes you have saved at ${name}.`;
      break;
    case 'plan':
      title = `My Home Plan | ${name}`;
      description = `Your saved payment, loan and move-in answers for ${name}, in one plan you can download.`;
      break;
    case 'guides': {
      const topics = [...new Set(guidesOf(community).map((g) => text(g.category)).filter(Boolean))];
      title = `Buyer guides | ${name}`;
      description = `Plain-English guides for homebuyers at ${name}${where}${topics.length ? `: ${topics.slice(0, 4).join(', ').toLowerCase()} and more` : ''}.`;
      break;
    }
    case 'guide':
      type = 'article';
      title = `${view.guide.title} | ${name}`;
      description = view.guide.summary || `${view.guide.title}, a buyer guide from ${name}.`;
      if (plain(title).length > TITLE_MAX) title = view.guide.title;
      break;
    case 'realtors': {
      const names = agentsOf(community).map((a) => text(a.name));
      title = `${names.length > 1 ? 'Meet the agents' : 'Meet the agent'} | ${name}`;
      description = names.length
        ? `Real estate agents working with buyers at ${name}: ${names.join(', ')}.`
        : `Real estate agents working with buyers at ${name}.`;
      break;
    }
    default:
      title = name;
      description = `${name}${where}.`;
  }

  return {
    title: fit(title, TITLE_MAX),
    description: fit(description, DESCRIPTION_MAX),
    canonical,
    image: primaryImage || '',
    type,
    robots: INDEXABLE_PAGES.has(view.page) && !view.degraded ? 'index, follow' : 'noindex, nofollow',
  };
}

// ── images the page shows ──────────────────────────────────────────────────

function heroImage(ctx) {
  return imageObject(ctx, ctx.community.heroPhoto, {
    name: `${ctx.name} community photo`,
    caption: `${ctx.name}, a new-home community${ctx.builder ? ` by ${ctx.builder}` : ''}${ctx.location ? ` in ${ctx.location}` : ''}`,
  });
}

/** The development's regular logo: the mark that is the community's, drawn for a light ground. */
function logoImage(ctx) {
  return imageObject(ctx, ctx.community.logo, {
    name: `${ctx.name} logo`, caption: `The ${ctx.name} logo`,
  });
}

/**
 * The reversed (light-on-dark) variant of the development logo. It is only
 * ever described as a picture on its own, never as a `logo` property: a crawler
 * that prefers it would show a pale mark on a white results card, and Google's
 * logo guidance assumes the logo reads on white.
 */
function logoLightImage(ctx) {
  return imageObject(ctx, ctx.community.logoLight, {
    name: `${ctx.name} logo for dark backgrounds`,
    caption: `The ${ctx.name} logo, light version for dark backgrounds`,
  });
}

/**
 * The logo that belongs to the Organization node. That node is the builder, so
 * the development's mark is only its logo when there is no separate builder (the
 * Organization is then the community itself); otherwise the builder's own logo is
 * not something this app holds, and it is left out rather than guessed.
 */
const organizationLogo = (ctx) => (ctx.builder ? undefined : logoImage(ctx));

function siteMapImage(ctx) {
  return imageObject(ctx, ctx.community.siteMap, {
    name: `${ctx.name} site map`,
    caption: `The ${ctx.name} site map, showing where each lot sits`,
  });
}

/** Photo N of M of a home, with alt text matching what the page prints. */
function homePhotos(ctx, home) {
  const photos = list(home.photos);
  return photos.map((photo, i) => imageObject(ctx, photo, {
    name: `${home.name} photo ${i + 1} of ${photos.length}`,
    caption: `${home.name} at ${ctx.name}, photo ${i + 1} of ${photos.length}`,
  })).filter(Boolean);
}

function floorPlanImages(ctx, home) {
  const plans = list(home.floorPlans);
  return plans.map((plan, i) => imageObject(ctx, plan, {
    name: plans.length > 1 ? `${home.name} floor plan ${i + 1} of ${plans.length}` : `${home.name} floor plan`,
    caption: `Floor plan drawing for ${home.name} at ${ctx.name}`,
  })).filter(Boolean);
}

/** The first photo of a home, as the Explore card shows it: alt text is the home's name. */
const homeCover = (ctx, home) => imageObject(ctx, list(home.photos)[0], {
  name: home.name, caption: `${home.name} at ${ctx.name}`,
});

function agentPhoto(ctx, agent) {
  const brokerage = text(agent.brokerage);
  return imageObject(ctx, agent.photo, {
    name: brokerage ? `${text(agent.name)}, ${brokerage}` : text(agent.name),
    caption: `${text(agent.name)}, real estate agent${brokerage ? ` with ${brokerage}` : ''}`,
    // Name and brokerage only: an agent's phone and email are contact details,
    // not a description of a picture.
    description: `Portrait of ${text(agent.name)}, a real estate agent${brokerage ? ` with ${brokerage}` : ''}`,
  });
}

function agentLogo(ctx, agent) {
  const label = text(agent.brokerage) || text(agent.name);
  return imageObject(ctx, agent.logo, {
    name: `${label} logo`,
    caption: `The ${label} logo`,
  });
}

/** The image a page leads with: used for primaryImageOfPage and, as a url, for Open Graph. */
function primaryImage(ctx, view) {
  const { community } = ctx;
  switch (view.page) {
    case 'landing': case 'start': return heroImage(ctx);
    case 'explore': {
      const first = homesOf(community).find((h) => list(h.photos).length);
      return (first && homeCover(ctx, first)) || heroImage(ctx);
    }
    case 'home': return homePhotos(ctx, view.home)[0] || heroImage(ctx);
    case 'area': {
      const first = highlightsOf(community).find((h) => urlOf(h.photo));
      return (first && highlightImage(ctx, first)) || heroImage(ctx);
    }
    case 'map': return siteMapImage(ctx) || heroImage(ctx);
    // Guides carry no pictures of their own, so their pages share the community's.
    case 'guides': return heroImage(ctx);
    case 'guide': return heroImage(ctx);
    case 'realtors': {
      const first = agentsOf(community).find((a) => urlOf(a.photo));
      return (first && agentPhoto(ctx, first)) || heroImage(ctx);
    }
    default: return undefined;
  }
}

function highlightImage(ctx, highlight) {
  return imageObject(ctx, highlight.photo, {
    name: text(highlight.name),
    caption: `${text(highlight.name)}, ${HIGHLIGHT_CATEGORIES.find((c) => c.k === highlight.category)?.label ?? 'Good to Know'} near ${ctx.name}`,
  });
}

// ── entities ────────────────────────────────────────────────────────────────

function websiteNode(ctx) {
  return {
    '@type': 'WebSite',
    '@id': ctx.ids.website,
    url: ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}`),
    name: ctx.name,
    inLanguage: LANGUAGE,
    publisher: ref(ctx.ids.organization),
  };
}

/** The builder. Falls back to the community's own name when no builder is set. */
function organizationNode(ctx) {
  const site = ctx.abs(text(ctx.community.websiteUrl));
  return {
    '@type': 'Organization',
    '@id': ctx.ids.organization,
    name: ctx.builder || ctx.name,
    url: site || ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}`),
    logo: organizationLogo(ctx),
  };
}

function placeNode(ctx, { full }) {
  const { community } = ctx;
  const base = {
    '@type': 'Place',
    '@id': ctx.ids.community,
    name: ctx.name,
    url: ctx.abs(`/c/${encodeURIComponent(keyOf(community))}`),
    address: addressOf(ctx.location),
    // The development's own mark belongs to the development on every page that shows it.
    logo: logoImage(ctx),
  };
  if (!full) return base;
  return {
    ...base,
    description: describeLanding(ctx),
    image: [heroImage(ctx)].filter(Boolean),
    hasMap: ctx.abs(urlOf(community.siteMap)),
  };
}

/** The lender, from the same compliance block the footer prints. Omitted until it can be advertised. */
function lenderNode(ctx) {
  const { lender, lo, nmlsHref } = ctx.compliance;
  if (!lender.ready) return undefined;
  const custom = ctx.community.lenderLogo;
  return {
    '@type': 'FinancialService',
    '@id': ctx.ids.lender,
    name: lender.name,
    description: lender.tagline,
    url: lender.websiteHref ? ctx.abs(lender.websiteHref) : undefined,
    telephone: phoneOf(lender.phone),
    address: addressOf(lender.address),
    identifier: { '@type': 'PropertyValue', propertyID: 'NMLS', value: lender.nmls },
    sameAs: nmlsHref ? ctx.abs(nmlsHref) : undefined,
    logo: imageObject(ctx, custom || LENDER_LOGOS.color, {
      name: `${lender.name} logo`, caption: `The ${lender.name} logo`,
    }),
    employee: lo ? {
      '@type': 'Person',
      name: lo.name,
      jobTitle: 'Loan officer',
      identifier: { '@type': 'PropertyValue', propertyID: 'NMLS', value: lo.nmls },
    } : undefined,
  };
}

/**
 * The Equal Housing Lender mark printed in every page's footer. Described as a
 * picture of its own because it is one: it is a regulatory mark, not part of the
 * lender's brand, and the footer only shows it alongside the lender, so it is
 * left out whenever the lender node is.
 */
function equalHousingImage(ctx) {
  if (!ctx.compliance.lender.ready) return undefined;
  return imageObject(ctx, EHL_MARKS.ink, {
    name: 'Equal Housing Lender',
    caption: 'The Equal Housing Lender logo',
  });
}

function breadcrumbNode(ctx, view, url) {
  const home = ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}`);
  const trail = [{ name: ctx.name, item: home }];
  const at = (page) => ctx.abs(pathOf(ctx, { page }));
  switch (view.page) {
    case 'home': trail.push({ name: CRUMB_LABEL.explore, item: at('explore') }, { name: text(view.home.name), item: url }); break;
    case 'tool': trail.push({ name: CRUMB_LABEL.tools, item: at('tools') }, { name: view.tool.name, item: url }); break;
    case 'guide': trail.push({ name: CRUMB_LABEL.guides, item: at('guides') }, { name: text(view.guide.title), item: url }); break;
    default: trail.push({ name: CRUMB_LABEL[view.page] ?? ctx.name, item: url });
  }
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem', position: i + 1, name: crumb.name, item: crumb.item,
    })),
  };
}

/** What the builder is asking, and what it is: Offer availability from the home's own state. */
function availabilityOf(home) {
  if (isSold(home)) return AVAILABILITY_URL.soldOut;
  if (home.availability === 'Move-in ready') return AVAILABILITY_URL.inStock;
  if (home.availability === 'Under Construction' || home.availability === 'Planning') return AVAILABILITY_URL.preOrder;
  return undefined;
}

function offerNode(ctx, home, homeUrl) {
  const price = positive(home.price);
  if (!price) return undefined;
  const units = Number(home.unitsAvailable);
  return {
    '@type': 'Offer',
    url: homeUrl,
    price,
    priceCurrency: 'USD',
    availability: availabilityOf(home),
    itemCondition: 'https://schema.org/NewCondition',
    availabilityStarts: !isSold(home) && home.availability !== 'Move-in ready' && isIsoDate(home.readyOn)
      ? text(home.readyOn) : undefined,
    inventoryLevel: Number.isFinite(units) && units > 0
      ? { '@type': 'QuantitativeValue', value: units } : undefined,
    seller: { '@type': 'Organization', '@id': ctx.ids.organization, name: ctx.builder || ctx.name },
  };
}

const homeUrlOf = (ctx, home) => ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}/homes/${encodeURIComponent(home.id)}`);

/**
 * A home. Typed as a Product as well as a SingleFamilyResidence because
 * schema.org puts `offers` on Product, not on Accommodation: the pair is how
 * property listings are published in practice, and it keeps every property here
 * one that exists on a type the node actually has.
 */
function homeNode(ctx, home, { full }) {
  const url = homeUrlOf(ctx, home);
  const photos = full ? homePhotos(ctx, home) : [homeCover(ctx, home)].filter(Boolean);
  const beds = positive(home.beds);
  const baths = positive(home.baths);
  const sqft = positive(home.sqft);
  const plans = full ? floorPlanImages(ctx, home) : [];
  const lot = text(home.lotNumber);
  return {
    '@type': ['SingleFamilyResidence', 'Product'],
    '@id': `${url}#residence`,
    name: text(home.name),
    url,
    description: full ? text(home.description) : undefined,
    image: photos,
    numberOfBedrooms: beds || undefined,
    numberOfBathroomsTotal: baths || undefined,
    floorSize: sqft ? {
      '@type': 'QuantitativeValue', value: sqft, unitCode: 'FTK', unitText: 'sq ft',
    } : undefined,
    accommodationFloorPlan: plans.map((layoutImage, i) => ({
      '@type': 'FloorPlan',
      name: plans.length > 1 ? `${text(home.name)} floor plan ${i + 1}` : `${text(home.name)} floor plan`,
      layoutImage,
      numberOfBedrooms: beds || undefined,
      numberOfBathroomsTotal: baths || undefined,
      floorSize: sqft ? { '@type': 'QuantitativeValue', value: sqft, unitCode: 'FTK', unitText: 'sq ft' } : undefined,
    })),
    identifier: lot ? { '@type': 'PropertyValue', propertyID: 'Lot number', value: lot } : undefined,
    address: addressOf(ctx.location),
    containedInPlace: ref(ctx.ids.community),
    offers: offerNode(ctx, home, url),
  };
}

function agentNode(ctx, agent) {
  const brokerage = text(agent.brokerage);
  const no = text(agent.licenseNo).replace(/^#/, '');
  const state = text(agent.licenseState).toUpperCase();
  return {
    '@type': 'RealEstateAgent',
    '@id': `${ctx.root}/realtors#agent-${encodeURIComponent(agent.id)}`,
    name: text(agent.name),
    url: agent.website ? ctx.abs(text(agent.website)) : undefined,
    image: agentPhoto(ctx, agent),
    logo: agentLogo(ctx, agent),
    telephone: phoneOf(agent.phone),
    email: emailOf(agent.email),
    identifier: no ? {
      '@type': 'PropertyValue',
      propertyID: `${state ? `${state} ` : ''}real estate license`,
      value: no,
    } : undefined,
    memberOf: brokerage ? { '@type': 'Organization', name: brokerage } : undefined,
    areaServed: ref(ctx.ids.community),
  };
}

/**
 * Words that mark a name as an organisation or a team rather than a person. A
 * byline such as "By Acme Homes" or "By The Marketing Team" is credited to the
 * builder instead of being invented into a Person called that.
 */
const ORGANISATION_WORDS = new Set([
  'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'team', 'group', 'homes', 'realty', 'mortgage', 'lending',
  'loans', 'bank', 'brokers', 'associates', 'partners', 'builders', 'properties', 'staff', 'editors', 'editorial',
]);

/** Two to four words of letters, with no commas, digits or organisation words. */
function personName(value) {
  const name = text(value);
  if (!/^\p{L}[\p{L}.'\u2019-]*(?:\s+\p{L}[\p{L}.'\u2019-]*){1,3}$/u.test(name)) return '';
  const words = name.toLowerCase().replace(/[.,]/g, '').split(' ');
  return words.some((word) => ORGANISATION_WORDS.has(word)) ? '' : name;
}

/**
 * "By Dillan Lewis, NMLS #1337516 · Summit Home Loans LLC, NMLS #1790749" into a
 * Person and their firm. Only that shape is read ("By" or "Written by", a
 * personal name, an optional NMLS ID, then optionally a firm after a middle dot or
 * bar). Anything else (a team, a company, "Jane Doe, Realtor", a bare "By") is
 * credited to the builder, because a wrong Person is worse than an Organization.
 */
function authorOf(ctx, byline) {
  const fallback = { '@type': 'Organization', '@id': ctx.ids.organization, name: ctx.builder || ctx.name };
  const cleaned = text(byline).match(/^(?:written\s+)?by\s+(\S.*)$/i)?.[1];
  if (!cleaned) return fallback;
  const [personPart, firmPart, ...extra] = cleaned.split(/\s*[\u00b7|]\s*/);
  if (extra.length) return fallback;
  const split = (part) => {
    const match = text(part).match(/^(.*?)(?:,?\s*NMLS\s*(?:ID)?\s*#?\s*(\d+))?$/i);
    return { name: text(match?.[1]).replace(/[,\s]+$/, ''), nmls: match?.[2] ?? '' };
  };
  const person = split(personPart);
  const name = personName(person.name);
  if (!name) return fallback;
  const firm = firmPart ? split(firmPart) : null;
  return {
    '@type': 'Person',
    name,
    identifier: person.nmls ? { '@type': 'PropertyValue', propertyID: 'NMLS', value: person.nmls } : undefined,
    worksFor: firm?.name ? {
      '@type': 'Organization',
      name: firm.name,
      identifier: firm.nmls ? { '@type': 'PropertyValue', propertyID: 'NMLS', value: firm.nmls } : undefined,
    } : undefined,
  };
}

function guideUrlOf(ctx, guide) {
  return ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}/guides/${encodeURIComponent(guide.slug)}`);
}

/** An Article. On the list page only the card's worth is present; on its own page, everything. */
function articleNode(ctx, guide, { full, pageId }) {
  const url = guideUrlOf(ctx, guide);
  const modified = isoOf(guide.updatedAt);
  const published = isoOf(guide.publishedAt ?? guide.createdAt) || modified;
  return {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: text(guide.title),
    url,
    description: text(guide.summary) || undefined,
    articleSection: text(guide.category) || undefined,
    inLanguage: LANGUAGE,
    ...(full ? {
      author: authorOf(ctx, guide.byline),
      publisher: {
        '@type': 'Organization',
        '@id': ctx.ids.organization,
        name: ctx.builder || ctx.name,
        logo: organizationLogo(ctx),
      },
      datePublished: published,
      dateModified: modified || published,
      mainEntityOfPage: ref(pageId),
      isPartOf: ref(ctx.ids.website),
    } : {}),
  };
}

function toolNode(ctx, tool, { full }) {
  const url = ctx.abs(`/c/${encodeURIComponent(keyOf(ctx.community))}/tool/${encodeURIComponent(tool.k)}`);
  return {
    '@type': 'WebApplication',
    '@id': `${url}#app`,
    name: tool.name,
    url,
    description: tool.q,
    ...(full ? {
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      inLanguage: LANGUAGE,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      publisher: ref(ctx.ids.organization),
    } : {}),
  };
}

function highlightNode(ctx, highlight, index) {
  const address = text(highlight.address);
  return {
    '@type': 'Place',
    '@id': `${ctx.root}/area#${encodeURIComponent(text(highlight.id) || `spot-${index + 1}`)}`,
    name: text(highlight.name),
    description: text(highlight.description) || undefined,
    address: address || undefined,
    hasMap: mapsUrl(address) || undefined,
    image: highlightImage(ctx, highlight),
  };
}

/** An ItemList of the items worth listing, or undefined when there are none: an empty list says nothing. */
function itemList(url, items) {
  const listed = items.filter(Boolean);
  if (!listed.length) return undefined;
  return {
    '@type': 'ItemList',
    '@id': `${url}#list`,
    numberOfItems: listed.length,
    itemListElement: listed.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, url: item.url, item: item.node,
    })),
  };
}

// ── the public entry points ─────────────────────────────────────────────────

/**
 * The structured data for one buyer page, as a list of nodes ready for
 * `serializeJsonLd`. Returns `[]` when there is nothing safe to say: no
 * community, or an origin that is not an http(s) address.
 */
export function pageJsonLd({ page, community, origin, home, guide, tool } = {}) {
  const ctx = makeContext(origin, community);
  if (!ctx) return [];
  const view = resolveView({ page, home, guide, tool });
  const url = canonicalOf(ctx, view);
  const pageId = `${url}#webpage`;
  const lead = primaryImage(ctx, view);
  const meta = metaOf(ctx, view, url, lead?.contentUrl);
  const { community: c } = ctx;

  const nodes = [websiteNode(ctx), organizationNode(ctx)];
  const mentions = [];
  let pageType = 'WebPage';
  let mainEntity;
  const extra = [];

  // A list page's main entity is its ItemList, when there is anything to list.
  const addList = (items) => {
    pageType = 'CollectionPage';
    const listing = itemList(url, items);
    if (!listing) return;
    extra.push(listing);
    mainEntity = listing['@id'];
  };

  nodes.push(placeNode(ctx, { full: view.page === 'landing' || view.page === 'map' }));
  nodes.push(lenderNode(ctx));
  // Pictures the footer and header show that no entity above owns.
  nodes.push(logoLightImage(ctx), equalHousingImage(ctx));

  switch (view.page) {
    case 'tools': {
      addList(toolsOf(c).map((t) => ({
        name: t.name,
        url: ctx.abs(`/c/${encodeURIComponent(keyOf(c))}/tool/${t.k}`),
        node: toolNode(ctx, t, { full: false }),
      })));
      // The pictures the tools home shows that come from the community: its
      // banner and the realtors' faces. Guides are text only.
      const shown = [
        heroImage(ctx),
        ...agentsOf(c).map((a) => agentPhoto(ctx, a)),
      ];
      // The FAQ on the home screen, as the questions and answers a builder wrote.
      const faq = c.features?.faq === false ? [] : parseFaq(c.settings?.faqJson);
      if (faq.length) {
        extra.push({
          '@type': 'FAQPage',
          '@id': `${ctx.abs(`/c/${encodeURIComponent(keyOf(c))}/tools`)}#faq`,
          name: `${ctx.name} frequently asked questions`,
          inLanguage: LANGUAGE,
          mainEntity: faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        });
      }
      const described = new Set(nodes.map((n) => n?.contentUrl));
      for (const image of shown) {
        if (!image || described.has(image.contentUrl)) continue;
        described.add(image.contentUrl);
        extra.push(image);
      }
      break;
    }
    case 'tool': {
      const app = toolNode(ctx, view.tool, { full: true });
      extra.push(app);
      mainEntity = app['@id'];
      break;
    }
    case 'explore': {
      addList(homesOf(c).map((h) => ({
        name: text(h.name), url: homeUrlOf(ctx, h), node: homeNode(ctx, h, { full: false }),
      })));
      // The plat is drawn on this page as a picture of its own, below the homes.
      const map = siteMapImage(ctx);
      if (map) extra.push(map);
      break;
    }
    case 'home': {
      pageType = 'ItemPage';
      const residence = homeNode(ctx, view.home, { full: true });
      extra.push(residence);
      mainEntity = residence['@id'];
      for (const agent of agentsOf(c)) {
        const node = agentNode(ctx, agent);
        extra.push(node);
        mentions.push(ref(node['@id']));
      }
      break;
    }
    case 'area':
      addList(highlightsOf(c).map((h, i) => ({
        name: text(h.name), url: mapsUrl(text(h.address)) || url, node: highlightNode(ctx, h, i),
      })));
      break;
    case 'guides':
      addList(guidesOf(c).map((g) => ({
        name: text(g.title), url: guideUrlOf(ctx, g), node: articleNode(ctx, g, { full: false, pageId }),
      })));
      break;
    case 'guide': {
      const article = articleNode(ctx, view.guide, { full: true, pageId });
      extra.push(article);
      mainEntity = article['@id'];
      break;
    }
    case 'realtors': {
      const agents = agentsOf(c).map((agent) => agentNode(ctx, agent));
      extra.push(...agents);
      addList(agents.map((node) => ({ name: node.name, url: node['@id'], node: ref(node['@id']) })));
      break;
    }
    default:
  }

  const webPage = {
    '@type': pageType,
    '@id': pageId,
    url,
    name: meta.title,
    description: meta.description,
    inLanguage: LANGUAGE,
    isPartOf: ref(ctx.ids.website),
    about: ref(ctx.ids.community),
    breadcrumb: view.page === 'landing' ? undefined : ref(`${url}#breadcrumb`),
    primaryImageOfPage: lead,
    mainEntity: mainEntity ? ref(mainEntity) : undefined,
    mentions,
  };

  nodes.push(webPage);
  if (view.page !== 'landing') nodes.push(breadcrumbNode(ctx, view, url));
  nodes.push(...extra);

  return nodes
    .map((node) => prune(node))
    .filter(Boolean)
    .map((node) => ({ '@context': CONTEXT, ...node }));
}

/**
 * The head of a page: what a browser tab, a search result and a link preview
 * show. `image` is '' when the community has no picture to offer.
 */
export function pageMeta({ page, community, origin, guide, home, tool } = {}) {
  const ctx = makeContext(origin, community);
  if (!ctx) {
    return { title: '', description: '', canonical: '', image: '', type: 'website', robots: 'noindex, nofollow' };
  }
  const view = resolveView({ page, home, guide, tool });
  const url = canonicalOf(ctx, view);
  const lead = primaryImage(ctx, view);
  return metaOf(ctx, view, url, lead?.contentUrl);
}
