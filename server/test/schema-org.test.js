import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_FAQ, DEFAULT_SETTINGS, EHL_MARKS, LENDER_LOGOS } from '../../shared/domain.js';
import { absoluteUrl, pageJsonLd, pageMeta, serializeJsonLd } from '../../shared/schema.js';

const ORIGIN = 'https://app.example.com';
const BASE = `${ORIGIN}/c/willow-creek`;
const abs = (path) => `${ORIGIN}${path}`;

// ── the fixture ─────────────────────────────────────────────────────────────

const PRIVATE_EMAIL = 'private-builder@example.com';
const LEAD_EMAIL = 'buyer-lead@example.com';

/**
 * A community as the buyer app receives it (public.js `publicCommunity`), with
 * everything switched on: four kinds of home (move-in ready, under construction
 * with a ready date, sold, and unpriced), highlights with and without a photo,
 * three realtors (two with pictures), guides, a site map and logos. The private
 * values planted in it (the alert email, a lead, a slot) must never come out.
 */
function fixture(overrides = {}) {
  return {
    id: 'willow-creek',
    name: 'Willow Creek',
    location: 'Lehi, UT',
    status: 'Now selling',
    theme: 'navy',
    layout: 'cornerpost',
    builder: 'Acme Homes',
    websiteUrl: 'https://acme-homes.example',
    settings: {
      ...DEFAULT_SETTINGS,
      notifyEmail: PRIVATE_EMAIL,
      lenderLicense: 'Licensed by the Utah Division of Real Estate, license #12345.',
      loName: 'Alan Blood',
      loNmls: '3146',
    },
    tools: { payment: true, afford: true, loans: true, compare: true, dpa: true, savings: true, movein: false },
    features: { lotNumbers: true, floorPlans: true, siteMap: true, resources: true, guides: true, agents: true },
    heroPhoto: '/api/photos/p_hero',
    iconPhoto: '/api/photos/p_icon',
    siteMap: '/api/photos/p_sitemap',
    logo: '/api/photos/p_logo',
    logoLight: '/api/photos/p_logolight',
    lenderLogo: null,
    resources: [{ id: 'r_1', kind: 'article', title: 'Reading', body: '', url: 'https://example.com/a' }],
    slots: [{ id: 's_1', date: '2026-10-10', time: '10:00', leadId: 'lead_secret' }],
    leadNote: LEAD_EMAIL,
    homes: [
      {
        id: 'h_ready', name: 'The Aspen', price: 489900, beds: 3, baths: 2.5, sqft: 1850,
        description: 'A corner home with a finished basement.', availability: 'Move-in ready',
        lotNumber: '12', readyOn: '', unitsAvailable: null, position: 0,
        photos: [
          { id: 'p_a1', url: '/api/photos/p_a1' }, { id: 'p_a2', url: '/api/photos/p_a2' },
          { id: 'p_a3', url: '/api/photos/p_a3' },
        ],
        floorPlans: [{ id: 'f_a1', url: '/api/photos/f_a1' }, { id: 'f_a2', url: '/api/photos/f_a2' }],
      },
      {
        id: 'h_build', name: 'The Birch', price: 512000, beds: 4, baths: 3, sqft: 2210,
        description: '', availability: 'Under Construction', lotNumber: '14', readyOn: '2027-04-15',
        unitsAvailable: 3, position: 1,
        photos: [{ id: 'p_b1', url: '/api/photos/p_b1' }],
        floorPlans: [{ id: 'f_b1', url: '/api/photos/f_b1' }],
      },
      {
        id: 'h_sold', name: 'The Cedar', price: 455000, beds: 3, baths: 2, sqft: 1600,
        description: 'Gone.', availability: 'Move-in ready', lotNumber: '3', readyOn: '',
        unitsAvailable: 0, position: 2,
        photos: [{ id: 'p_c1', url: '/api/photos/p_c1' }], floorPlans: [],
      },
      {
        id: 'h_plan', name: 'The Dogwood', price: 0, beds: 0, baths: 0, sqft: 0,
        description: '', availability: 'Planning', lotNumber: '', readyOn: '', unitsAvailable: null,
        position: 3, photos: [], floorPlans: [],
      },
    ],
    highlights: [
      {
        id: 'hl_1', category: 'schools', name: 'Oakridge Elementary', description: 'Four blocks away.',
        detail: '', address: '100 School Ln, Lehi UT', photo: { id: 'p_h1', url: '/api/photos/p_h1' },
      },
      {
        id: 'hl_2', category: 'parks', name: 'Willow Park', description: 'Splash pad and trails.',
        detail: '', address: 'Willow Park, Lehi UT', photo: { id: 'p_h2', url: '/api/photos/p_h2' },
      },
      {
        id: 'hl_3', category: 'shopping', name: 'Main Street Market', description: '', detail: '',
        address: '', photo: null,
      },
    ],
    agents: [
      {
        id: 'a_one', name: 'Pat Rivera', brokerage: 'Wasatch Realty Group', licenseNo: '5551234-SA00',
        licenseState: 'UT', phone: '801-555-0101', email: 'pat@wasatch.example',
        website: 'https://pat.wasatch.example', photo: '/api/photos/p_ag1', logo: '/api/photos/p_agl1',
      },
      {
        id: 'a_two', name: 'Sam Lee', brokerage: 'Summit Peak Brokers', licenseNo: '#9988776',
        licenseState: 'ut', phone: '(801) 555-0102', email: 'sam@peak.example', website: '',
        photo: '/api/photos/p_ag2', logo: '/api/photos/p_agl2',
      },
      {
        id: 'a_three', name: 'Jo Kim', brokerage: '', licenseNo: '', licenseState: '', phone: '',
        email: 'not-an-email', website: 'javascript:alert(1)', photo: null, logo: null,
      },
    ],
    guides: [
      {
        id: 'g_one', slug: 'rent-vs-buy-ogden-clearfield', title: 'Rent or buy?', category: 'Deciding',
        byline: 'By Dillan Lewis, NMLS #1337516 · Summit Home Loans LLC, NMLS #1790749',
        note: 'Educational information.', summary: 'Most people compare rent against principal and interest. That is the wrong comparison.',
        image: '/guides/blog-hero-model-home.webp', imageAlt: 'New construction townhome living room',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      {
        id: 'g_two', slug: 'closing-costs-utah-homebuyer', title: 'What closing costs really include',
        category: 'Closing costs', byline: 'By Alan Blood', note: '', summary: 'Lender fees, third-party fees and prepaids.',
        image: '/api/photos/p_guide2', imageAlt: '', updatedAt: '2026-09-02T12:30:00.000Z',
      },
      {
        id: 'g_three', slug: 'townhome-hoa-fees-utah', title: 'Townhome HOA fees', category: 'HOA',
        byline: '', note: '', summary: '', image: '/guides/blog-hero-model-home.webp',
        imageAlt: 'New construction townhome living room', updatedAt: null,
      },
    ],
    ...overrides,
  };
}

const ALL_TOOLS_OFF = {
  payment: false, afford: false, loans: false, compare: false, dpa: false, savings: false, movein: false,
};
const community = fixture();
const [HOME_READY, HOME_BUILD, HOME_SOLD, HOME_PLAN] = community.homes;
const [GUIDE_ONE] = community.guides;

const SUMMIT_LOGO = abs(LENDER_LOGOS.color);
const EHL = abs(EHL_MARKS.ink);
const LOGOS = [abs('/api/photos/p_logo'), abs('/api/photos/p_logolight')];
const HERO = abs('/api/photos/p_hero');
const SITE_MAP = abs('/api/photos/p_sitemap');
const photoUrls = (home) => home.photos.map((p) => abs(p.url));
const planUrls = (home) => home.floorPlans.map((p) => abs(p.url));
const AGENT_IMAGES = ['/api/photos/p_ag1', '/api/photos/p_agl1', '/api/photos/p_ag2', '/api/photos/p_agl2'].map(abs);
const HIGHLIGHT_IMAGES = ['/api/photos/p_h1', '/api/photos/p_h2'].map(abs);
const GUIDE_IMAGES = [abs('/guides/blog-hero-model-home.webp'), abs('/api/photos/p_guide2')];
const EVERY_HOME_PHOTO = community.homes.flatMap(photoUrls);

/**
 * One row per page type: the arguments, and the images the real buyer page
 * shows, which is what the output has to cover. `canonical` is where the page
 * lives; `indexable` is the robots expectation from the spec.
 */
const PAGES = [
  {
    page: 'landing', path: '/c/willow-creek', indexable: true, crumbs: 0,
    images: [HERO, ...LOGOS, SUMMIT_LOGO], types: ['WebSite', 'Organization', 'Place', 'FinancialService', 'WebPage'],
  },
  { page: 'start', path: '/c/willow-creek/start', indexable: false, crumbs: 2, images: [HERO, ...LOGOS, SUMMIT_LOGO], types: ['WebPage'] },
  {
    page: 'tools', path: '/c/willow-creek/tools', indexable: false, crumbs: 2,
    images: [HERO, abs('/api/photos/p_ag1'), abs('/api/photos/p_ag2'), ...LOGOS, SUMMIT_LOGO],
    types: ['CollectionPage', 'ItemList', 'ImageObject'],
  },
  {
    page: 'explore', path: '/c/willow-creek/explore', indexable: false, crumbs: 2,
    images: [SITE_MAP, ...LOGOS, SUMMIT_LOGO, photoUrls(HOME_READY)[0], photoUrls(HOME_BUILD)[0], photoUrls(HOME_SOLD)[0]],
    types: ['CollectionPage', 'ItemList', 'SingleFamilyResidence'],
  },
  {
    page: 'area', path: '/c/willow-creek/area', indexable: false, crumbs: 2,
    images: [...HIGHLIGHT_IMAGES, ...LOGOS, SUMMIT_LOGO], types: ['CollectionPage', 'ItemList', 'Place'],
  },
  { page: 'map', path: '/c/willow-creek/map', indexable: false, crumbs: 2, images: [SITE_MAP, ...LOGOS, SUMMIT_LOGO], types: ['WebPage', 'Place'] },
  {
    page: 'home', extra: { home: HOME_READY }, path: '/c/willow-creek/homes/h_ready', indexable: false, crumbs: 3,
    images: [...photoUrls(HOME_READY), ...planUrls(HOME_READY), ...AGENT_IMAGES, ...LOGOS, SUMMIT_LOGO],
    types: ['ItemPage', 'SingleFamilyResidence', 'Offer', 'FloorPlan', 'RealEstateAgent'],
  },
  {
    page: 'tool', extra: { tool: 'payment' }, path: '/c/willow-creek/tool/payment', indexable: false, crumbs: 3,
    images: [...LOGOS, SUMMIT_LOGO], types: ['WebApplication'],
  },
  { page: 'saved', path: '/c/willow-creek/saved', indexable: false, crumbs: 2, images: [...LOGOS, SUMMIT_LOGO], types: ['WebPage'] },
  { page: 'plan', path: '/c/willow-creek/plan', indexable: false, crumbs: 2, images: [...LOGOS, SUMMIT_LOGO], types: ['WebPage'] },
  {
    page: 'guides', path: '/c/willow-creek/guides', indexable: true, crumbs: 2,
    images: [...LOGOS, SUMMIT_LOGO], types: ['CollectionPage', 'ItemList', 'Article'],
  },
  {
    page: 'guide', extra: { guide: GUIDE_ONE }, path: '/c/willow-creek/guides/rent-vs-buy-ogden-clearfield', indexable: true, crumbs: 3,
    images: [...LOGOS, SUMMIT_LOGO], types: ['Article', 'Person'],
  },
  {
    page: 'realtors', path: '/c/willow-creek/realtors', indexable: false, crumbs: 2,
    images: [...AGENT_IMAGES, ...LOGOS, SUMMIT_LOGO], types: ['CollectionPage', 'ItemList', 'RealEstateAgent'],
  },
];

const build = (row, from = community) => pageJsonLd({ page: row.page, community: from, origin: ORIGIN, ...(row.extra ?? {}) });

// ── a small structural validator ───────────────────────────────────────────
//
// For every @type used: the properties schema.org defines on it (including what
// it inherits from Thing, CreativeWork, Organization and so on) and the ones we
// rely on being present. A node carrying a property not in the list is a typo
// or an invention, and fails here instead of silently never being read.

// schema.org defines the floor plan property on Accommodation as
// `accommodationFloorPlan` (range FloorPlan); there is no `floorPlan`. An earlier
// version of this table and of the builder both said `floorPlan`, which no
// consumer reads, and the suite could not tell because it only checked itself.
// A vocabulary source (schema-dts, or the schema.org JSON-LD release) is not a
// dependency of this repo, so the table below is a hand-checked slice of it.
const THING = ['@type', '@id', '@context', 'name', 'url', 'description', 'image', 'identifier', 'sameAs'];
const ORGANIZATION = [...THING, 'logo', 'telephone', 'email', 'address', 'employee', 'memberOf', 'areaServed'];
const PAGE = [...THING, 'inLanguage', 'isPartOf', 'about', 'breadcrumb', 'primaryImageOfPage', 'mainEntity', 'mentions', 'publisher'];
const SPECS = {
  WebSite: { allowed: [...THING, 'inLanguage', 'publisher'], required: ['name', 'url', 'publisher'] },
  Organization: { allowed: ORGANIZATION, required: ['name'] },
  FinancialService: { allowed: ORGANIZATION, required: ['name', 'identifier', 'telephone', 'address', 'logo'] },
  RealEstateAgent: { allowed: ORGANIZATION, required: ['name'] },
  Place: { allowed: [...THING, 'address', 'logo', 'hasMap', 'containedInPlace'], required: ['name'] },
  PostalAddress: { allowed: ['@type', 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'], required: ['addressLocality', 'addressRegion'] },
  Person: { allowed: [...THING, 'jobTitle', 'worksFor'], required: ['name'] },
  PropertyValue: { allowed: ['@type', 'propertyID', 'value'], required: ['propertyID', 'value'] },
  ImageObject: { allowed: ['@type', 'contentUrl', 'url', 'name', 'caption', 'description'], required: ['contentUrl', 'url', 'name', 'caption'] },
  WebPage: { allowed: PAGE, required: ['url', 'name', 'description', 'inLanguage', 'isPartOf'] },
  CollectionPage: { allowed: PAGE, required: ['url', 'name', 'description', 'inLanguage', 'isPartOf'] },
  ItemPage: { allowed: PAGE, required: ['url', 'name', 'description', 'inLanguage', 'isPartOf', 'mainEntity'] },
  BreadcrumbList: { allowed: ['@type', '@id', 'itemListElement'], required: ['itemListElement'] },
  ItemList: { allowed: ['@type', '@id', 'itemListElement', 'numberOfItems'], required: ['itemListElement', 'numberOfItems'] },
  ListItem: { allowed: ['@type', 'position', 'item', 'name', 'url'], required: ['position', 'name'] },
  SingleFamilyResidence: {
    allowed: [...THING, 'numberOfBedrooms', 'numberOfBathroomsTotal', 'floorSize', 'accommodationFloorPlan', 'address', 'containedInPlace', 'offers'],
    required: ['name', 'url'],
  },
  Product: {
    allowed: [...THING, 'numberOfBedrooms', 'numberOfBathroomsTotal', 'floorSize', 'accommodationFloorPlan', 'address', 'containedInPlace', 'offers'],
    required: ['name'],
  },
  QuantitativeValue: { allowed: ['@type', 'value', 'unitCode', 'unitText'], required: ['value'] },
  FloorPlan: { allowed: [...THING, 'layoutImage', 'numberOfBedrooms', 'numberOfBathroomsTotal', 'floorSize'], required: ['name', 'layoutImage'] },
  Offer: {
    allowed: ['@type', 'price', 'priceCurrency', 'availability', 'itemCondition', 'availabilityStarts', 'inventoryLevel', 'seller', 'url'],
    required: ['price', 'priceCurrency'],
  },
  Article: {
    allowed: [...THING, 'headline', 'author', 'publisher', 'datePublished', 'dateModified', 'mainEntityOfPage', 'isPartOf', 'articleSection', 'inLanguage'],
    required: ['headline', 'url'],
  },
  WebApplication: {
    allowed: [...THING, 'applicationCategory', 'operatingSystem', 'browserRequirements', 'offers', 'isAccessibleForFree', 'publisher', 'inLanguage'],
    required: ['name', 'url'],
  },
  FAQPage: { allowed: ['@type', '@id', 'name', 'inLanguage', 'mainEntity'], required: ['@id', 'name', 'mainEntity'] },
  Question: { allowed: ['@type', 'name', 'acceptedAnswer'], required: ['name', 'acceptedAnswer'] },
  Answer: { allowed: ['@type', 'text'], required: ['text'] },
};
const NUMERIC = new Set(['price', 'position', 'numberOfBedrooms', 'numberOfBathroomsTotal', 'value', 'numberOfItems']);
const URL_KEYS = new Set(['url', 'contentUrl', '@id', 'sameAs', 'hasMap']);
const ISO_KEYS = new Set(['datePublished', 'dateModified']);

const typesOf = (node) => [].concat(node['@type']);

/** Every object in the tree with a string @type, depth first. */
function typedNodes(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => typedNodes(v, out));
  else if (value && typeof value === 'object') {
    if (value['@type']) out.push(value);
    Object.values(value).forEach((v) => typedNodes(v, out));
  }
  return out;
}

function validate(nodes, label) {
  for (const node of typedNodes(nodes)) {
    const types = typesOf(node);
    for (const type of types) {
      const spec = SPECS[type];
      assert.ok(spec, `${label}: no spec for @type ${type}`);
      for (const key of spec.required) {
        assert.ok(node[key] !== undefined, `${label}: ${type} is missing required "${key}" (${JSON.stringify(node).slice(0, 120)})`);
      }
    }
    const allowed = new Set(types.flatMap((t) => SPECS[t].allowed));
    for (const key of Object.keys(node).filter((k) => k !== '@context')) {
      assert.ok(allowed.has(key), `${label}: ${types.join('+')} has unknown property "${key}"`);
      // A PropertyValue's value is the identifier as printed (an NMLS ID is text), so only a QuantitativeValue's is a number.
      const textual = key === 'value' && types.includes('PropertyValue');
      if (NUMERIC.has(key) && !textual) assert.equal(typeof node[key], 'number', `${label}: ${key} must be a number`);
      if (ISO_KEYS.has(key)) assert.ok(!Number.isNaN(Date.parse(node[key])), `${label}: ${key} is not a date`);
    }
    if (typeof node.isAccessibleForFree !== 'undefined') assert.equal(typeof node.isAccessibleForFree, 'boolean');
  }
}

/** Every leaf must be a real value: no undefined, null, NaN, '' and no empty containers. */
function assertNoEmptyLeaves(value, where = '$') {
  if (Array.isArray(value)) {
    assert.ok(value.length > 0, `${where}: empty array`);
    value.forEach((v, i) => assertNoEmptyLeaves(v, `${where}[${i}]`));
  } else if (value && typeof value === 'object') {
    assert.ok(Object.keys(value).length > 0, `${where}: empty object`);
    for (const [k, v] of Object.entries(value)) assertNoEmptyLeaves(v, `${where}.${k}`);
  } else {
    assert.notEqual(value, undefined, `${where}: undefined`);
    assert.notEqual(value, null, `${where}: null`);
    assert.notEqual(value, '', `${where}: empty string`);
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${where}: ${value}`);
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), `${where}: ${typeof value}`);
  }
}

function assertUrlsAbsolute(value, where = '$') {
  if (Array.isArray(value)) value.forEach((v, i) => assertUrlsAbsolute(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (URL_KEYS.has(k) && typeof v === 'string') {
        assert.ok(v.startsWith(`${ORIGIN}/`) || v.startsWith('https://'), `${where}.${k}: ${v} is not absolute`);
        assert.doesNotThrow(() => new URL(v), `${where}.${k}: ${v} does not parse`);
      } else if (k === 'item' && typeof v === 'string') {
        assert.ok(v.startsWith(`${ORIGIN}/`), `${where}.item: ${v}`);
      } else assertUrlsAbsolute(v, `${where}.${k}`);
    }
  }
}

/** Every `{ "@id": ... }` reference points at an @id defined somewhere in the graph. */
function assertRefsResolve(nodes, label) {
  const defined = new Set();
  const refs = [];
  (function walk(value) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const keys = Object.keys(value).filter((k) => k !== '@context');
      if (keys.length === 1 && keys[0] === '@id') refs.push(value['@id']);
      else if (value['@id']) defined.add(value['@id']);
      Object.values(value).forEach(walk);
    }
  }(nodes));
  for (const id of refs) assert.ok(defined.has(id), `${label}: dangling reference ${id}`);
}

const imageUrls = (nodes) => new Set(typedNodes(nodes).filter((n) => typesOf(n).includes('ImageObject')).map((n) => n.contentUrl));
const byType = (nodes, type) => typedNodes(nodes).filter((n) => typesOf(n).includes(type));
const topLevel = (nodes, type) => nodes.filter((n) => typesOf(n).includes(type));

// ── every page type ─────────────────────────────────────────────────────────

for (const row of PAGES) {
  test(`${row.page}: valid, absolute, pruned, covered`, () => {
    const nodes = build(row);
    assert.ok(nodes.length > 0);

    // Round trip: what we hand over is exactly what JSON carries.
    assert.deepEqual(JSON.parse(JSON.stringify(nodes)), nodes);
    const graph = JSON.parse(serializeJsonLd(nodes));
    assert.equal(graph['@context'], 'https://schema.org');
    assert.equal(graph['@graph'].length, nodes.length);
    for (const node of nodes) assert.equal(node['@context'], 'https://schema.org');

    assertNoEmptyLeaves(nodes);
    assertUrlsAbsolute(nodes);
    assertRefsResolve(graph['@graph'], row.page);
    validate(nodes, row.page);

    for (const type of row.types) {
      assert.ok(byType(nodes, type).length > 0, `${row.page}: expected a ${type}`);
    }
    // A list page points at its list, so a crawler knows what the page is about.
    if (row.types.includes('ItemList')) {
      assert.equal(nodes.find((n) => n['@type'] === 'CollectionPage').mainEntity['@id'], `${abs(row.path)}#list`);
    }

    // The page node says where it is, and that url is the canonical one.
    const webPage = nodes.find((n) => ['WebPage', 'CollectionPage', 'ItemPage'].includes(n['@type']));
    assert.equal(webPage.url, abs(row.path));
    assert.equal(webPage['@id'], `${abs(row.path)}#webpage`);
    assert.equal(webPage.isPartOf['@id'], `${BASE}#website`);

    // Pictures: every one the page shows is an ImageObject; none are invented.
    const found = imageUrls(nodes);
    for (const url of row.images) assert.ok(found.has(url), `${row.page}: no ImageObject for ${url}`);
    // The Equal Housing Lender mark is in every page's footer, so every page describes it.
    assert.ok(found.has(EHL), `${row.page}: no ImageObject for the Equal Housing Lender mark`);
    const everything = new Set([
      HERO, SITE_MAP, SUMMIT_LOGO, EHL, ...LOGOS, ...community.homes.flatMap((h) => [...photoUrls(h), ...planUrls(h)]),
      ...AGENT_IMAGES, ...HIGHLIGHT_IMAGES,
    ]);
    for (const url of found) assert.ok(everything.has(url), `${row.page}: ImageObject for unknown ${url}`);
    for (const image of byType(nodes, 'ImageObject')) {
      assert.equal(image.url, image.contentUrl);
      assert.ok(image.name && image.caption);
    }
  });

  test(`${row.page}: breadcrumb, stable ids, robots`, () => {
    const nodes = build(row);
    const crumbs = topLevel(nodes, 'BreadcrumbList');
    if (row.crumbs === 0) {
      assert.equal(crumbs.length, 0, 'the landing page is the root: no trail');
      assert.equal(nodes.find((n) => n['@type'] === 'WebPage').breadcrumb, undefined);
    } else {
      assert.equal(crumbs.length, 1);
      const items = crumbs[0].itemListElement;
      assert.equal(items.length, row.crumbs);
      assert.deepEqual(items.map((i) => i.position), items.map((_, i) => i + 1));
      assert.equal(items[0].item, BASE);
      assert.equal(items[0].name, 'Willow Creek');
      assert.equal(items[items.length - 1].item, abs(row.path));
      const page = nodes.find((n) => ['WebPage', 'CollectionPage', 'ItemPage'].includes(n['@type']));
      assert.equal(page.breadcrumb['@id'], crumbs[0]['@id']);
    }

    // The same entities carry the same ids on every page, and across calls.
    const ids = (list) => Object.fromEntries(['WebSite', 'Organization', 'FinancialService']
      .map((t) => [t, topLevel(list, t)[0]?.['@id']]));
    assert.deepEqual(ids(nodes), {
      WebSite: `${BASE}#website`, Organization: `${BASE}#organization`, FinancialService: `${BASE}#lender`,
    });
    assert.deepEqual(build(row), nodes, 'the same input gives the same output');
    assert.equal(topLevel(nodes, 'Place')[0]['@id'], `${BASE}#community`);

    const meta = pageMeta({ page: row.page, community, origin: ORIGIN, ...(row.extra ?? {}) });
    assert.equal(meta.robots, row.indexable ? 'index, follow' : 'noindex, nofollow');
    assert.equal(meta.canonical, abs(row.path));
    assert.equal(meta.type, row.page === 'guide' ? 'article' : 'website');
  });

  test(`${row.page}: meta is plain, bounded and public`, () => {
    const meta = pageMeta({ page: row.page, community, origin: ORIGIN, ...(row.extra ?? {}) });
    assert.deepEqual(Object.keys(meta).sort(), ['canonical', 'description', 'image', 'robots', 'title', 'type']);
    assert.ok(meta.title.length > 0 && meta.title.length <= 70, meta.title);
    assert.ok(meta.description.length > 0 && meta.description.length <= 160, meta.description);
    assert.doesNotMatch(`${meta.title}${meta.description}`, /[<>]/);
    assert.doesNotMatch(meta.description, /\s{2,}|^\s|\s$/);
    if (meta.image) assert.ok(meta.image.startsWith(`${ORIGIN}/`), meta.image);

    // Nothing private rides along in any page, in the data or in the meta.
    const everything = JSON.stringify(build(row)) + JSON.stringify(meta);
    assert.ok(!everything.includes(PRIVATE_EMAIL), 'notifyEmail leaked');
    assert.ok(!everything.includes(LEAD_EMAIL), 'lead data leaked');
    assert.ok(!everything.includes('lead_secret'), 'slot data leaked');
    assert.ok(!everything.includes('notifyEmail'));
  });
}

test('tools: every community picture the home shows is an ImageObject, once, described without contact details', () => {
  const nodes = pageJsonLd({ page: 'tools', community, origin: ORIGIN });
  const images = byType(nodes, 'ImageObject');
  const named = (url) => images.filter((i) => i.contentUrl === url);

  assert.equal(named(HERO).length, 1);
  assert.equal(named(HERO)[0].name, 'Willow Creek community photo');

  // Guides carry no pictures, so none is described, whatever a guide row still holds.
  assert.equal(named(GUIDE_IMAGES[0]).length, 0);
  assert.equal(named(GUIDE_IMAGES[1]).length, 0);

  const [pat, sam] = [named(abs('/api/photos/p_ag1'))[0], named(abs('/api/photos/p_ag2'))[0]];
  assert.equal(pat.name, 'Pat Rivera, Wasatch Realty Group');
  assert.match(pat.description, /Pat Rivera/);
  assert.match(pat.description, /Wasatch Realty Group/);
  assert.match(sam.description, /Summit Peak Brokers/);
  const all = JSON.stringify(nodes);
  for (const private_ of ['pat@wasatch.example', 'sam@peak.example', '801-555-0101', '555-0102']) {
    assert.ok(!all.includes(private_), `${private_} must not be published`);
  }
  // Every image is still one node per file, so nothing is described twice.
  const urls = images.map((i) => i.contentUrl);
  assert.equal(new Set(urls).size, urls.length, 'no picture appears twice');

  const bare = imageUrls(pageJsonLd({
    page: 'tools', origin: ORIGIN, community: fixture({ heroPhoto: null, agents: [], guides: [] }),
  }));
  for (const url of [HERO, ...GUIDE_IMAGES, abs('/api/photos/p_ag1')]) assert.ok(!bare.has(url), `${url} is not there to describe`);
});

test('only the pages that reveal nothing private get photos of homes the buyer did not ask for', () => {
  // The tools, plan and saved pages are about the visitor, so no listing photos belong on them.
  for (const page of ['start', 'tools', 'saved', 'plan', 'map', 'guides', 'guide', 'area']) {
    const found = imageUrls(pageJsonLd({
      page, community, origin: ORIGIN, guide: GUIDE_ONE,
    }));
    for (const url of EVERY_HOME_PHOTO) assert.ok(!found.has(url), `${page} shows a home photo`);
  }
});

// ── per-type content ────────────────────────────────────────────────────────

test('landing: website, builder, place and the lender with its NMLS number', () => {
  const nodes = build(PAGES[0]);
  const site = topLevel(nodes, 'WebSite')[0];
  assert.equal(site.name, 'Willow Creek');
  assert.equal(site.url, BASE);
  const org = topLevel(nodes, 'Organization')[0];
  assert.equal(org.name, 'Acme Homes');
  assert.equal(org.url, 'https://acme-homes.example/');
  assert.equal(org.logo, undefined, 'the development logo is not the builder\'s logo');

  const place = topLevel(nodes, 'Place')[0];
  assert.equal(place.name, 'Willow Creek');
  assert.deepEqual(place.address, {
    '@type': 'PostalAddress', addressLocality: 'Lehi', addressRegion: 'UT', addressCountry: 'US',
  });
  assert.equal(place.logo.contentUrl, LOGOS[0]);
  assert.equal(place.image[0].contentUrl, HERO);
  assert.equal(place.hasMap, SITE_MAP);

  const lender = topLevel(nodes, 'FinancialService')[0];
  assert.equal(lender.name, 'Summit Home Loans');
  assert.deepEqual(lender.identifier, { '@type': 'PropertyValue', propertyID: 'NMLS', value: '1790749' });
  assert.equal(lender.telephone, '+18018558535');
  assert.equal(lender.address.addressLocality, 'Kaysville');
  assert.equal(lender.address.postalCode, '84037');
  assert.equal(lender.logo.contentUrl, SUMMIT_LOGO);
  assert.equal(lender.employee.identifier.value, '3146');

  const page = nodes.find((n) => n['@type'] === 'WebPage');
  assert.equal(page.primaryImageOfPage.contentUrl, HERO);
  assert.equal(page.primaryImageOfPage.name, 'Willow Creek community photo');
});

test('lender: a custom logo replaces the supplied one, an unfinished lender is left out', () => {
  const custom = pageJsonLd({
    page: 'landing', origin: ORIGIN, community: fixture({ lenderLogo: '/api/photos/p_lender' }),
  });
  assert.equal(topLevel(custom, 'FinancialService')[0].logo.contentUrl, abs('/api/photos/p_lender'));
  assert.ok(!imageUrls(custom).has(SUMMIT_LOGO));

  const blank = fixture({ settings: { ...DEFAULT_SETTINGS, lenderNmls: '' } });
  const nodes = pageJsonLd({ page: 'landing', origin: ORIGIN, community: blank });
  assert.equal(topLevel(nodes, 'FinancialService').length, 0, 'no NMLS, no advertisement');
});

test('home: offer price and availability follow the home', () => {
  const offerFor = (home) => byType(pageJsonLd({ page: 'home', community, origin: ORIGIN, home }), 'Offer')[0];

  const ready = offerFor(HOME_READY);
  assert.equal(ready.price, 489900);
  assert.equal(ready.priceCurrency, 'USD');
  assert.equal(ready.availability, 'https://schema.org/InStock');
  assert.equal(ready.availabilityStarts, undefined, 'a finished home has no start date');
  assert.equal(ready.url, abs('/c/willow-creek/homes/h_ready'));
  assert.equal(ready.seller['@id'], `${BASE}#organization`);

  const build_ = offerFor(HOME_BUILD);
  assert.equal(build_.price, 512000);
  assert.equal(build_.availability, 'https://schema.org/PreOrder');
  assert.equal(build_.availabilityStarts, '2027-04-15');
  assert.deepEqual(build_.inventoryLevel, { '@type': 'QuantitativeValue', value: 3 });

  // Sold wins over "Move-in ready": the last one has gone.
  const sold = offerFor(HOME_SOLD);
  assert.equal(sold.availability, 'https://schema.org/SoldOut');
  assert.equal(sold.price, 455000);
  assert.equal(sold.inventoryLevel, undefined);

  // No price, no offer: a zero is not a price.
  assert.equal(offerFor(HOME_PLAN), undefined);

  const planning = { ...HOME_BUILD, availability: 'Planning', readyOn: '' };
  assert.equal(offerFor(planning).availability, 'https://schema.org/PreOrder');
  assert.equal(offerFor({ ...HOME_READY, availability: 'Surprise' }).availability, undefined);
});

test('home: the residence carries its facts, photos and floor plans', () => {
  const nodes = build(PAGES.find((p) => p.page === 'home'));
  const residence = byType(nodes, 'SingleFamilyResidence')[0];
  assert.deepEqual(residence['@type'], ['SingleFamilyResidence', 'Product']);
  assert.equal(residence['@id'], `${abs('/c/willow-creek/homes/h_ready')}#residence`);
  assert.equal(residence.numberOfBedrooms, 3);
  assert.equal(residence.numberOfBathroomsTotal, 2.5);
  assert.deepEqual(residence.floorSize, { '@type': 'QuantitativeValue', value: 1850, unitCode: 'FTK', unitText: 'sq ft' });
  assert.equal(residence.image.length, 3);
  assert.equal(residence.image[1].name, 'The Aspen photo 2 of 3');
  assert.equal(residence.floorPlan, undefined, 'floorPlan is not a schema.org property');
  assert.equal(residence.accommodationFloorPlan.length, 2);
  assert.equal(residence.accommodationFloorPlan[0].layoutImage.contentUrl, planUrls(HOME_READY)[0]);
  assert.equal(residence.identifier.value, '12');
  assert.equal(residence.containedInPlace['@id'], `${BASE}#community`);

  const page = nodes.find((n) => n['@type'] === 'ItemPage');
  assert.equal(page.mainEntity['@id'], residence['@id']);
  assert.equal(page.primaryImageOfPage.contentUrl, photoUrls(HOME_READY)[0]);
  assert.equal(page.mentions.length, 3, 'the community realtors appear on the home page');
});

test('explore: every home is a list item, with the same offer the home page makes', () => {
  const nodes = build(PAGES.find((p) => p.page === 'explore'));
  const list = topLevel(nodes, 'ItemList')[0];
  assert.equal(list.numberOfItems, 4);
  assert.equal(list.itemListElement[2].item.offers.availability, 'https://schema.org/SoldOut');
  assert.equal(list.itemListElement[3].item.offers, undefined);
  assert.equal(list.itemListElement[0].url, abs('/c/willow-creek/homes/h_ready'));
  assert.equal(list.itemListElement[0].item['@id'], `${abs('/c/willow-creek/homes/h_ready')}#residence`);
  const page = nodes.find((n) => n['@type'] === 'CollectionPage');
  assert.equal(page.primaryImageOfPage.contentUrl, photoUrls(HOME_READY)[0]);
});

test('area: spots become places, a map link only where there is an address', () => {
  const nodes = build(PAGES.find((p) => p.page === 'area'));
  const [first, , third] = topLevel(nodes, 'ItemList')[0].itemListElement.map((i) => i.item);
  assert.equal(first.name, 'Oakridge Elementary');
  assert.match(first.hasMap, /^https:\/\/www\.google\.com\/maps\/search\//);
  assert.equal(first.image.name, 'Oakridge Elementary');
  assert.equal(third.hasMap, undefined);
  assert.equal(third.image, undefined);
});

test('guides: a card per guide, and the article carries author, dates and image', () => {
  const nodes = build(PAGES.find((p) => p.page === 'guides'));
  const items = topLevel(nodes, 'ItemList')[0].itemListElement;
  assert.deepEqual(items.map((i) => i.name), community.guides.map((g) => g.title));
  assert.equal(items[0].url, abs('/c/willow-creek/guides/rent-vs-buy-ogden-clearfield'));

  const article = byType(build(PAGES.find((p) => p.page === 'guide')), 'Article')[0];
  assert.equal(article['@id'], `${abs('/c/willow-creek/guides/rent-vs-buy-ogden-clearfield')}#article`);
  assert.equal(article.headline, 'Rent or buy?');
  assert.equal(article.datePublished, '2026-08-27T00:00:00.000Z');
  assert.equal(article.dateModified, '2026-08-27T00:00:00.000Z');
  assert.equal(article.image, undefined, 'guides carry no pictures');
  assert.equal(article.publisher.name, 'Acme Homes');
  assert.equal(article.publisher.logo, undefined, 'the builder has no logo of its own here');
  assert.equal(article.mainEntityOfPage['@id'], `${abs('/c/willow-creek/guides/rent-vs-buy-ogden-clearfield')}#webpage`);
  assert.equal(article.author['@type'], 'Person');
  assert.equal(article.author.name, 'Dillan Lewis');
  assert.equal(article.author.identifier.value, '1337516');
  assert.equal(article.author.worksFor.name, 'Summit Home Loans LLC');
  assert.equal(article.author.worksFor.identifier.value, '1790749');
});

test('guide: author falls back to the builder and a missing date is omitted, not invented', () => {
  const guide = { ...GUIDE_ONE, byline: '', updatedAt: null, image: '', imageAlt: '' };
  const article = byType(pageJsonLd({ page: 'guide', community, origin: ORIGIN, guide }), 'Article')[0];
  assert.equal(article.author['@type'], 'Organization');
  assert.equal(article.author.name, 'Acme Homes');
  assert.equal(article.datePublished, undefined);
  assert.equal(article.dateModified, undefined);
  assert.equal(article.image, undefined);
  const plainByline = { ...GUIDE_ONE, byline: 'By Alan Blood' };
  const person = byType(pageJsonLd({ page: 'guide', community, origin: ORIGIN, guide: plainByline }), 'Article')[0].author;
  assert.deepEqual(person, { '@type': 'Person', name: 'Alan Blood' });
});

test('tool: a free web application under Finance', () => {
  const app = byType(build(PAGES.find((p) => p.page === 'tool')), 'WebApplication')[0];
  assert.equal(app.name, 'See My Payment');
  assert.equal(app.applicationCategory, 'FinanceApplication');
  assert.equal(app.isAccessibleForFree, true);
  assert.deepEqual(app.offers, { '@type': 'Offer', price: 0, priceCurrency: 'USD' });
  const tools = topLevel(build(PAGES.find((p) => p.page === 'tools')), 'ItemList')[0];
  assert.equal(tools.numberOfItems, 6, 'the switched-off tool is not listed');
  assert.ok(!tools.itemListElement.some((i) => i.name === 'My Move-In Plan'));
  // The tool object itself is accepted as well as its key.
  const byObject = pageJsonLd({ page: 'tool', tool: { k: 'afford' }, community, origin: ORIGIN });
  assert.equal(byType(byObject, 'WebApplication')[0].name, 'See What I Can Afford');
});

test('realtors: agent, licence, brokerage and both pictures; junk contact data is dropped', () => {
  const nodes = build(PAGES.find((p) => p.page === 'realtors'));
  const [pat, sam, jo] = topLevel(nodes, 'RealEstateAgent');
  assert.equal(pat['@id'], `${BASE}/realtors#agent-a_one`);
  assert.equal(pat.name, 'Pat Rivera');
  assert.equal(pat.image.contentUrl, abs('/api/photos/p_ag1'));
  assert.equal(pat.image.name, 'Pat Rivera, Wasatch Realty Group');
  assert.equal(pat.logo.contentUrl, abs('/api/photos/p_agl1'));
  assert.equal(pat.logo.name, 'Wasatch Realty Group logo');
  assert.equal(pat.telephone, '+18015550101');
  assert.equal(pat.email, 'pat@wasatch.example');
  assert.equal(pat.url, 'https://pat.wasatch.example/');
  assert.deepEqual(pat.identifier, { '@type': 'PropertyValue', propertyID: 'UT real estate license', value: '5551234-SA00' });
  assert.deepEqual(pat.memberOf, { '@type': 'Organization', name: 'Wasatch Realty Group' });

  assert.equal(sam.identifier.value, '9988776', 'a leading # is not part of the number');
  assert.equal(sam.identifier.propertyID, 'UT real estate license');
  assert.equal(sam.url, undefined);

  assert.equal(jo.email, undefined, 'not an email address');
  assert.equal(jo.url, undefined, 'a javascript: website is never published');
  assert.equal(jo.image, undefined);
  assert.equal(jo.identifier, undefined);
  assert.equal(jo.memberOf, undefined);

  const list = topLevel(nodes, 'ItemList')[0];
  assert.equal(list.numberOfItems, 3);
  assert.equal(list.itemListElement[0].item['@id'], pat['@id']);
});

test('admin-shaped pictures ({ id, url }) work as well as bare urls', () => {
  const admin = fixture({
    heroPhoto: { id: 'p_hero', url: '/api/photos/p_hero' },
    agents: [{ ...community.agents[0], photo: { id: 'x', url: '/api/photos/p_ag1' }, logo: { id: 'y', url: '/api/photos/p_agl1' } }],
  });
  const nodes = pageJsonLd({ page: 'realtors', community: admin, origin: ORIGIN });
  assert.ok(imageUrls(nodes).has(abs('/api/photos/p_ag1')));
  assert.ok(imageUrls(nodes).has(abs('/api/photos/p_agl1')));
});

// ── safety ──────────────────────────────────────────────────────────────────

const EVIL = '</script><script>alert(1)</script>';

test('serializeJsonLd cannot be broken out of, whatever the data says', () => {
  const evil = fixture({
    name: EVIL, builder: `${EVIL}&<!--`, location: `${EVIL}, UT`,
    homes: [{ ...HOME_READY, name: EVIL, description: `${EVIL}\u2028\u2029` }],
    guides: [{ ...GUIDE_ONE, title: EVIL, summary: `${EVIL} ok`, byline: `By ${EVIL}` }],
    agents: [{ ...community.agents[0], name: EVIL, brokerage: EVIL }],
    highlights: [{ ...community.highlights[0], name: EVIL, address: EVIL }],
  });
  for (const row of PAGES) {
    const nodes = pageJsonLd({
      page: row.page, community: evil, origin: ORIGIN, home: evil.homes[0], guide: evil.guides[0], tool: 'payment',
    });
    const json = serializeJsonLd(nodes);
    assert.doesNotMatch(json, /[<>&\u2028\u2029]/, `${row.page}: raw markup characters survived`);
    assert.doesNotMatch(json, /<\/script/i);

    // As a browser parses it: the element ends at the first </script, and that is ours.
    const html = `<script type="application/ld+json">${json}</script>`;
    assert.equal(html.indexOf('</script'), html.length - '</script>'.length);

    // Escaped on the way out, identical on the way back in.
    const parsed = JSON.parse(json);
    assert.equal(parsed['@graph'].find((n) => n['@type'] === 'WebSite').name, EVIL);

    const meta = pageMeta({ page: row.page, community: evil, origin: ORIGIN, home: evil.homes[0], guide: evil.guides[0], tool: 'payment' });
    assert.doesNotMatch(`${meta.title} ${meta.description}`, /[<>]/);
  }
});

test('serializeJsonLd escapes line separators and markup in any string, not just the ones our builders pass', () => {
  const json = serializeJsonLd([{ '@type': 'Thing', name: 'a\u2028b\u2029c </script> & <!--' }]);
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/);
  assert.equal(JSON.parse(json)['@graph'][0].name, 'a\u2028b\u2029c </script> & <!--');
});

test('quantities that are not real numbers are left out instead of printed', () => {
  const odd = { ...HOME_READY, price: Infinity, beds: Infinity, baths: 'lots', sqft: NaN };
  const nodes = pageJsonLd({ page: 'home', community, origin: ORIGIN, home: odd });
  assertNoEmptyLeaves(nodes);
  validate(nodes, 'odd numbers');
  const residence = byType(nodes, 'SingleFamilyResidence')[0];
  for (const key of ['numberOfBedrooms', 'numberOfBathroomsTotal', 'floorSize', 'offers']) {
    assert.equal(residence[key], undefined, key);
  }
  assert.doesNotMatch(pageMeta({ page: 'home', community, origin: ORIGIN, home: { ...odd, description: '' } }).description, /Infinity|NaN/);
});

test('absoluteUrl resolves site paths and refuses everything that is not safe', () => {
  const cases = [
    [ORIGIN, '/c/x', `${ORIGIN}/c/x`],
    [`${ORIGIN}/`, '/c/x', `${ORIGIN}/c/x`],
    [`${ORIGIN}/ignored/path?q=1`, '/c/x', `${ORIGIN}/c/x`],
    ['http://localhost:3000', '/api/photos/p_1', 'http://localhost:3000/api/photos/p_1'],
    [ORIGIN, 'https://elsewhere.example/a', 'https://elsewhere.example/a'],
    [ORIGIN, '/c/a b', `${ORIGIN}/c/a%20b`],
    [ORIGIN, '//evil.example/x', ''],
    [ORIGIN, '/\\evil.example', ''],
    [ORIGIN, '\\\\evil.example', ''],
    [ORIGIN, 'javascript:alert(1)', ''],
    [ORIGIN, 'data:text/html,<b>x</b>', ''],
    [ORIGIN, 'ftp://x.example/a', ''],
    [ORIGIN, 'https://user:pass@x.example/a', ''],
    [ORIGIN, 'images/relative.png', ''],
    [ORIGIN, '', ''],
    [ORIGIN, undefined, ''],
    [ORIGIN, null, ''],
    ['', '/c/x', ''],
    ['not a url', '/c/x', ''],
    ['ftp://x.example', '/c/x', ''],
  ];
  for (const [origin, path, expected] of cases) {
    assert.equal(absoluteUrl(origin, path), expected, `${origin} + ${path}`);
  }
});

test('an unusable community or origin yields nothing rather than relative urls', () => {
  assert.deepEqual(pageJsonLd({ page: 'landing', community, origin: '' }), []);
  assert.deepEqual(pageJsonLd({ page: 'landing', community, origin: 'javascript:alert(1)' }), []);
  assert.deepEqual(pageJsonLd({ page: 'landing', community: null, origin: ORIGIN }), []);
  assert.deepEqual(pageJsonLd({ page: 'landing', community: {}, origin: ORIGIN }), []);
  assert.deepEqual(pageJsonLd(), []);
  assert.equal(pageMeta({ page: 'landing', community: null, origin: ORIGIN }).robots, 'noindex, nofollow');
  assert.equal(serializeJsonLd([]), '{"@context":"https://schema.org","@graph":[]}');
  assert.equal(serializeJsonLd(undefined), '{"@context":"https://schema.org","@graph":[]}');
});

test('a missing home, guide or tool degrades to its list page; an unknown page is a plain noindex page', () => {
  const home = pageJsonLd({ page: 'home', community, origin: ORIGIN, home: { name: 'No id' } });
  assert.equal(home.find((n) => n['@type'] === 'CollectionPage').url, abs('/c/willow-creek/explore'));
  const guide = pageJsonLd({ page: 'guide', community, origin: ORIGIN });
  assert.equal(guide.find((n) => n['@type'] === 'CollectionPage').url, abs('/c/willow-creek/guides'));
  assert.equal(pageMeta({ page: 'tool', tool: 'nope', community, origin: ORIGIN }).canonical, abs('/c/willow-creek/tools'));

  const strange = pageMeta({ page: 'admin-secrets', community, origin: ORIGIN });
  assert.equal(strange.robots, 'noindex, nofollow');
  assert.equal(strange.canonical, BASE);
  validate(pageJsonLd({ page: 'admin-secrets', community, origin: ORIGIN }), 'unknown');
});

// Kept from when a request path could set the canonical: the answers are unchanged (the derived URL is always the clean one), but the path is no longer an input.
test('a supplied request path with a query, hash, trailing slash or another host still gives the clean canonical', () => {
  const row = { page: 'guides' };
  const withPath = (path) => pageMeta({ ...row, community, origin: ORIGIN, path }).canonical;
  assert.equal(withPath('/c/willow-creek/guides/?utm=1#top'), abs('/c/willow-creek/guides'));
  assert.equal(withPath('https://evil.example/c/willow-creek/guides'), abs('/c/willow-creek/guides'), 'another host is ignored');
  assert.equal(withPath('//evil.example'), abs('/c/willow-creek/guides'));
  const nodes = pageJsonLd({ ...row, community, origin: ORIGIN, path: '/c/willow-creek/guides/' });
  assert.equal(nodes.find((n) => n['@type'] === 'CollectionPage').url, abs('/c/willow-creek/guides'));
});

// ── descriptions ───────────────────────────────────────────────────────────

test('descriptions are bounded and never end mid-word', () => {
  const words = Array.from({ length: 80 }, (_, i) => `longword${i}`).join(' ');
  const sentences = 'First sentence here that is quite long and keeps going for a while. '.repeat(12).trim();
  const cases = [
    { guide: { ...GUIDE_ONE, summary: words } },
    { guide: { ...GUIDE_ONE, summary: sentences } },
    { guide: { ...GUIDE_ONE, summary: '<p>Markup <b>inside</b>   and   spaces</p>' } },
  ];
  for (const { guide } of cases) {
    const { description } = pageMeta({ page: 'guide', community, origin: ORIGIN, guide });
    assert.ok(description.length <= 160, `${description.length}`);
    assert.doesNotMatch(description, /[<>]/);
    const body = description.replace(/…$/, '');
    const original = String(guide.summary).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(original.startsWith(body), `${body} is a prefix of the source`);
    // The character after the cut is a space, or it was the end: no word is split.
    const next = original.charAt(body.length);
    assert.ok(next === '' || next === ' ', `cut mid-word before "${next}"`);
    assert.match(description, /[.!?…]$|^[^…]+$/);
  }

  const long = pageMeta({ page: 'guide', community, origin: ORIGIN, guide: { ...GUIDE_ONE, summary: words } }).description;
  assert.match(long, /…$/);
  const sentenceCut = pageMeta({ page: 'guide', community, origin: ORIGIN, guide: { ...GUIDE_ONE, summary: sentences } }).description;
  assert.match(sentenceCut, /sentence here that is quite long and keeps going for a while\.$/);

  const home = pageMeta({
    page: 'home', community, origin: ORIGIN, home: { ...HOME_READY, description: `${words}` },
  }).description;
  assert.ok(home.length <= 160);

  const hugeName = pageMeta({ page: 'landing', origin: ORIGIN, community: fixture({ name: `${words} Estates` }) });
  assert.ok(hugeName.description.length <= 160);
  assert.ok(hugeName.title.length <= 70);
});

test('a long guide title keeps the page name but drops the community suffix when both do not fit', () => {
  const title = '16 Questions to Ask Before Buying a New Construction Townhome in Utah';
  const meta = pageMeta({ page: 'guide', community, origin: ORIGIN, guide: { ...GUIDE_ONE, title } });
  assert.equal(meta.title, title);
  assert.ok(meta.title.length <= 70);
  const short = pageMeta({ page: 'guide', community, origin: ORIGIN, guide: GUIDE_ONE });
  assert.equal(short.title, 'Rent or buy? | Willow Creek');
});

test('landing description is built from facts the page has, and skips what it does not', () => {
  const meta = pageMeta({ page: 'landing', community, origin: ORIGIN });
  assert.match(meta.description, /^Willow Creek by Acme Homes in Lehi, UT\./);
  assert.match(meta.description, /3 new homes from \$489,900\./, 'the sold home is not for sale, so not the cheapest');
  const bare = pageMeta({
    page: 'landing', origin: ORIGIN,
    community: fixture({ builder: '', location: '', homes: [], guides: [], tools: ALL_TOOLS_OFF }),
  });
  assert.equal(bare.description, 'Willow Creek.');
  assert.equal(bare.title, 'Willow Creek');
  assert.equal(pageMeta({ page: 'landing', community, origin: ORIGIN }).title, 'Willow Creek | New homes in Lehi, UT');
});

test('meta image falls back to the hero, then to nothing', () => {
  assert.equal(pageMeta({ page: 'landing', community, origin: ORIGIN }).image, HERO);
  assert.equal(pageMeta({ page: 'home', community, origin: ORIGIN, home: HOME_READY }).image, photoUrls(HOME_READY)[0]);
  assert.equal(pageMeta({ page: 'home', community, origin: ORIGIN, home: HOME_PLAN }).image, HERO, 'a home with no photo uses the hero');
  assert.equal(pageMeta({ page: 'guide', community, origin: ORIGIN, guide: GUIDE_ONE }).image, HERO, 'a guide has no picture of its own, so it shares the hero');
  assert.equal(pageMeta({ page: 'tools', community, origin: ORIGIN }).image, '');
  assert.equal(pageMeta({ page: 'landing', community: fixture({ heroPhoto: null }), origin: ORIGIN }).image, '');
});

// ── a community with nothing set up ────────────────────────────────────────

test('a bare community still produces clean, valid output on every page', () => {
  const bare = {
    id: 'bare', name: 'Bare Acres', location: '', builder: '', websiteUrl: null,
    settings: { ...DEFAULT_SETTINGS, lenderName: '' }, tools: ALL_TOOLS_OFF, features: {},
    heroPhoto: null, iconPhoto: null, siteMap: null, logo: null, logoLight: null, lenderLogo: null,
    homes: [], highlights: [], agents: [], guides: [], resources: [], slots: [],
  };
  for (const row of PAGES) {
    const nodes = pageJsonLd({ page: row.page, community: bare, origin: ORIGIN, home: HOME_READY, guide: GUIDE_ONE, tool: 'payment' });
    assert.ok(nodes.length > 0);
    assertNoEmptyLeaves(nodes);
    assertUrlsAbsolute(nodes);
    validate(nodes, `bare ${row.page}`);
    assertRefsResolve(nodes, `bare ${row.page}`);
    assert.equal(topLevel(nodes, 'FinancialService').length, 0);
    const { description } = pageMeta({ page: row.page, community: bare, origin: ORIGIN, home: HOME_READY, guide: GUIDE_ONE, tool: 'payment' });
    assert.ok(description.length > 0 && description.length <= 160);
  }
});

// ── the validator itself ───────────────────────────────────────────────────

test('the validator catches a misspelled property, a missing required one and a wrong type', () => {
  const nodes = JSON.parse(JSON.stringify(build(PAGES.find((p) => p.page === 'home'))));
  const residence = byType(nodes, 'SingleFamilyResidence')[0];

  const typo = JSON.parse(JSON.stringify(nodes));
  const t = byType(typo, 'SingleFamilyResidence')[0];
  t.numberOfBedroom = t.numberOfBedrooms;
  delete t.numberOfBedrooms;
  assert.throws(() => validate(typo, 'typo'), /unknown property "numberOfBedroom"/);

  const missing = JSON.parse(JSON.stringify(nodes));
  delete byType(missing, 'Offer')[0].priceCurrency;
  assert.throws(() => validate(missing, 'missing'), /missing required "priceCurrency"/);

  const wrong = JSON.parse(JSON.stringify(nodes));
  byType(wrong, 'Offer')[0].price = '489900';
  assert.throws(() => validate(wrong, 'wrong'), /price must be a number/);

  assert.ok(residence, 'and the untouched output passes');
  assert.doesNotThrow(() => validate(nodes, 'clean'));
  assert.throws(() => assertNoEmptyLeaves({ a: [{ b: '' }] }), /empty string/);
  assert.throws(() => assertNoEmptyLeaves({ a: NaN }), /NaN/);
  assert.throws(() => assertUrlsAbsolute({ url: '/relative' }), /not absolute/);
  assert.throws(() => assertRefsResolve([{ a: { '@id': 'x' } }], 'refs'), /dangling/);
});

// ── review fixes: vocabulary, input size, phones, robots, canonical, logos, bylines ──

const timed = (fn) => {
  const start = Date.now();
  const result = fn();
  return { result, ms: Date.now() - start };
};

const ownerOf = (nodes, type) => topLevel(nodes, type)[0];

test('the validator rejects floorPlan, which is not a schema.org property', () => {
  const nodes = JSON.parse(JSON.stringify(build(PAGES.find((p) => p.page === 'home'))));
  const residence = byType(nodes, 'SingleFamilyResidence')[0];
  residence.floorPlan = residence.accommodationFloorPlan;
  delete residence.accommodationFloorPlan;
  assert.throws(() => validate(nodes, 'floorPlan'), /unknown property "floorPlan"/);
});

test('offer: new construction is stated, and a stale ready date is never published for a finished or sold home', () => {
  const offer = (home) => byType(pageJsonLd({ page: 'home', community, origin: ORIGIN, home }), 'Offer')[0];
  assert.equal(offer(HOME_READY).itemCondition, 'https://schema.org/NewCondition');
  // The builder left a ready date on a home that has since sold or finished: it is history, not a start date.
  assert.equal(offer({ ...HOME_SOLD, readyOn: '2027-01-01' }).availabilityStarts, undefined);
  assert.equal(offer({ ...HOME_READY, readyOn: '2027-01-01' }).availabilityStarts, undefined);
  assert.equal(offer({ ...HOME_BUILD, readyOn: '2027-01-01' }).availabilityStarts, '2027-01-01');
  assert.equal(offer({ ...HOME_BUILD, readyOn: 'soon' }).availabilityStarts, undefined, 'only a real date is a date');
});

// A name is uncapped by the admin API and the injector runs this synchronously on
// the request path, so the cost of the longest name matters more than its content.
test('a very long name made of angle brackets cannot stall the server', () => {
  for (const unit of ['<', '<a', '<a ', '> <', '</']) {
    const name = unit.repeat(Math.ceil(60000 / unit.length));
    const landing = timed(() => pageMeta({
      page: 'landing', origin: ORIGIN, community: fixture({ name, location: `${name}, UT`, builder: name }),
    }));
    assert.ok(landing.ms < 3000, `pageMeta took ${landing.ms}ms for ${JSON.stringify(unit)}`);
    assert.ok(landing.result.title.length <= 70);
    assert.doesNotMatch(`${landing.result.title}${landing.result.description}`, /[<>]/);
    const graph = timed(() => pageJsonLd({
      page: 'landing', origin: ORIGIN, community: fixture({ name, location: `${name}, UT` }),
    }));
    assert.ok(graph.ms < 3000, `pageJsonLd took ${graph.ms}ms for ${JSON.stringify(unit)}`);
  }
  // A million ordinary characters are just as cheap.
  const plain = timed(() => pageMeta({ page: 'landing', origin: ORIGIN, community: fixture({ name: 'x'.repeat(1000000) }) }));
  assert.ok(plain.ms < 3000, `${plain.ms}ms`);
});

test('markup is removed from a description, but a stray < or > does not delete the words around it', () => {
  const description = (text) => pageMeta({ page: 'home', community, origin: ORIGIN, home: { ...HOME_READY, description: text } }).description;
  assert.equal(description('Priced < $500k and > 3 beds <b>bold</b>'), 'Priced $500k and 3 beds bold');
  assert.equal(description('<p>Hello <a href="x">there</a></p><!-- c -->!'), 'Hello there !');
  assert.equal(description('Two < three and four > one'), 'Two three and four one');
});

test('a description is cut on a character boundary, never in the middle of an emoji', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const emoji of ['\u{1F3E0}', 'a\u{1F3E0}', '\u{1F3E0}\u{1F3E1}b']) {
    const meta = pageMeta({
      page: 'home', community, origin: ORIGIN, home: { ...HOME_READY, description: emoji.repeat(200) },
    });
    assert.ok(meta.description.length <= 160, `${meta.description.length}`);
    assert.doesNotMatch(meta.description, lone, 'a lone surrogate was left behind');
    const title = pageMeta({ page: 'landing', origin: ORIGIN, community: fixture({ name: emoji.repeat(200) }) }).title;
    assert.doesNotMatch(title, lone);
  }
});

test('telephone is only normalised when the field is unmistakably one number', () => {
  const phones = (typed) => {
    const lender = pageJsonLd({
      page: 'landing', origin: ORIGIN, community: fixture({ settings: { ...DEFAULT_SETTINGS, lenderPhone: typed } }),
    });
    const agent = pageJsonLd({
      page: 'realtors', origin: ORIGIN, community: fixture({ agents: [{ ...community.agents[0], phone: typed }] }),
    });
    assert.equal(ownerOf(lender, 'FinancialService').telephone, ownerOf(agent, 'RealEstateAgent').telephone, 'one rule for both');
    return ownerOf(agent, 'RealEstateAgent').telephone;
  };
  // Normalised: ten digits, eleven starting with 1, an explicit +country number.
  assert.equal(phones('(801) 555-0101'), '+18015550101');
  assert.equal(phones('801.555.0101'), '+18015550101');
  assert.equal(phones('1-801-555-0101'), '+18015550101');
  assert.equal(phones('+44 20 7946 0958'), '+442079460958');
  // Left as typed: an extension, two numbers, a local number, and digit counts that fit no scheme.
  assert.equal(phones('(801) 555-0101 ext. 12'), '(801) 555-0101 ext. 12');
  assert.equal(phones('801-555-0101 x23'), '801-555-0101 x23');
  assert.equal(phones('801-555-0101 #4'), '801-555-0101 #4');
  assert.equal(phones('801.555.0101 / 801.555.0102'), '801.555.0101 / 801.555.0102');
  assert.equal(phones('555-0101'), '555-0101');
  assert.equal(phones('2 801 555 0101'), '2 801 555 0101');
  assert.equal(phones('+12345'), '+12345');
  assert.equal(phones('+1 2345'), '+1 2345', 'too short for an international number');
  assert.equal(phones('+1 801 555 0101 0102 0103'), '+1 801 555 0101 0102 0103', 'too long for one');
  // Letters mean it is not a bare number, even when the digits add up to ten.
  assert.equal(phones('801-555 x0101'), '801-555 x0101');
  assert.equal(phones('801-555-0 ext 101'), '801-555-0 ext 101');
  assert.equal(phones('Call the office'), 'Call the office');
});

test('robots: a page must be named and exist to be indexed', () => {
  const robots = (args) => pageMeta({ community, origin: ORIGIN, ...args }).robots;
  assert.equal(robots({ page: 'landing' }), 'index, follow');
  // No page, an empty page, or a page this file does not know is not the landing page.
  for (const page of [undefined, null, '', '   ', 'LANDING', 'bogus', 'gate']) {
    assert.equal(robots({ page }), 'noindex, nofollow', JSON.stringify(page));
  }
  // A guide URL with no guide behind it must not inherit the list page's indexing.
  assert.equal(robots({ page: 'guide' }), 'noindex, nofollow');
  assert.equal(robots({ page: 'guide', guide: { title: 'No slug' } }), 'noindex, nofollow');
  assert.equal(pageMeta({ page: 'guide', community, origin: ORIGIN }).canonical, abs('/c/willow-creek/guides'));
  assert.equal(robots({ page: 'guide', guide: GUIDE_ONE }), 'index, follow');
  assert.equal(robots({ page: 'guides' }), 'index, follow');
  assert.equal(robots({ page: 'home' }), 'noindex, nofollow');
  assert.equal(robots({ page: 'tool', tool: 'nope' }), 'noindex, nofollow');
});

test('an unpublished guide is not listed, not indexed and not described as an article', () => {
  const draft = { ...GUIDE_ONE, published: false };
  const withDraft = fixture({ guides: [draft, community.guides[1]] });
  const items = topLevel(pageJsonLd({ page: 'guides', community: withDraft, origin: ORIGIN }), 'ItemList')[0].itemListElement;
  assert.deepEqual(items.map((i) => i.name), [community.guides[1].title]);
  assert.ok(!imageUrls(pageJsonLd({ page: 'guides', community: withDraft, origin: ORIGIN })).has(GUIDE_IMAGES[0]), 'the draft\'s picture');

  assert.equal(pageMeta({ page: 'guide', community: withDraft, origin: ORIGIN, guide: draft }).robots, 'noindex, nofollow');
  const nodes = pageJsonLd({ page: 'guide', community: withDraft, origin: ORIGIN, guide: draft });
  assert.ok(!byType(nodes, 'Article').some((a) => a.headline === draft.title), 'the draft was described as an article');
  assert.equal(nodes.find((n) => n['@type'] === 'CollectionPage').url, abs('/c/willow-creek/guides'));
  // published: true, or the flag absent (the public API does not send it), is a normal guide.
  assert.equal(pageMeta({ page: 'guide', community, origin: ORIGIN, guide: { ...GUIDE_ONE, published: true } }).robots, 'index, follow');
  assert.doesNotMatch(pageMeta({ page: 'landing', community: fixture({ guides: [draft] }), origin: ORIGIN }).description, /buyer guides/);
  assert.match(pageMeta({ page: 'landing', community, origin: ORIGIN }).description, /buyer guides/);
});

test('the canonical is derived from the community and the page; a request path cannot choose it', () => {
  const hostile = [
    '/c/other-community/guides', '/api/admin/communities', '/c/willow-creek/guides/other-guide',
    'https://evil.example/c/willow-creek/guides', '//evil.example', '/c/willow-creek/guides/?utm=1#top',
  ];
  for (const path of hostile) {
    assert.equal(pageMeta({ page: 'guides', community, origin: ORIGIN, path }).canonical, abs('/c/willow-creek/guides'), path);
    const nodes = pageJsonLd({ page: 'guides', community, origin: ORIGIN, path });
    assert.equal(nodes.find((n) => n['@type'] === 'CollectionPage').url, abs('/c/willow-creek/guides'), path);
    assert.equal(pageMeta({ page: 'landing', community, origin: ORIGIN, path }).canonical, BASE, path);
    assert.equal(
      pageMeta({ page: 'guide', guide: GUIDE_ONE, community, origin: ORIGIN, path }).canonical,
      abs('/c/willow-creek/guides/rent-vs-buy-ogden-clearfield'), path,
    );
  }
});

test('logos: the regular logo is the development place\'s; the reversed one is only a picture', () => {
  const place = (c, page = 'tools') => ownerOf(pageJsonLd({ page, community: c, origin: ORIGIN }), 'Place');
  const org = (c) => ownerOf(pageJsonLd({ page: 'landing', community: c, origin: ORIGIN }), 'Organization');

  // The Place carries the development logo on every page, not only the landing page.
  for (const page of ['tools', 'landing', 'map', 'guides']) assert.equal(place(community, page).logo.contentUrl, LOGOS[0], page);

  // The reversed logo is a picture of its own and never a `logo` property.
  const nodes = pageJsonLd({ page: 'tools', community, origin: ORIGIN });
  assert.ok(imageUrls(nodes).has(LOGOS[1]));
  const logoProps = [];
  (function walk(value) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      if (value.logo) logoProps.push(...[].concat(value.logo).map((l) => l.contentUrl));
      Object.values(value).forEach(walk);
    }
  }(nodes));
  assert.ok(!logoProps.includes(LOGOS[1]), 'the dark-background logo was offered as a logo');

  // Only the reversed logo uploaded: shown as a picture, offered as nobody's logo.
  const lightOnly = fixture({ logo: null });
  assert.equal(place(lightOnly).logo, undefined);
  assert.equal(org(lightOnly).logo, undefined);
  assert.ok(imageUrls(pageJsonLd({ page: 'tools', community: lightOnly, origin: ORIGIN })).has(LOGOS[1]));

  // The Organization is the builder: the development's mark is its logo only when there is no other builder.
  assert.equal(org(community).logo, undefined);
  const own = fixture({ builder: '' });
  assert.equal(org(own).name, 'Willow Creek');
  assert.equal(org(own).logo.contentUrl, LOGOS[0]);
  assert.equal(org(fixture({ builder: '', logo: null })).logo, undefined);
  const article = byType(pageJsonLd({ page: 'guide', community: own, origin: ORIGIN, guide: GUIDE_ONE }), 'Article')[0];
  assert.equal(article.publisher.logo.contentUrl, LOGOS[0]);
});

test('the Equal Housing Lender mark is described wherever the lender is, and only then', () => {
  for (const row of PAGES) {
    const images = byType(build(row), 'ImageObject').filter((i) => i.contentUrl === EHL);
    assert.equal(images.length, 1, `${row.page}: ${images.length} EHL images`);
    assert.equal(images[0].name, 'Equal Housing Lender');
  }
  const blank = fixture({ settings: { ...DEFAULT_SETTINGS, lenderNmls: '' } });
  assert.ok(!imageUrls(pageJsonLd({ page: 'landing', community: blank, origin: ORIGIN })).has(EHL), 'no lender, no mark');
});

test('guide dates: published is when it was created, modified is when it last changed', () => {
  const article = (guide) => byType(pageJsonLd({ page: 'guide', community, origin: ORIGIN, guide }), 'Article')[0];
  const dated = article({ ...GUIDE_ONE, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z' });
  assert.equal(dated.datePublished, '2026-08-01T09:00:00.000Z');
  assert.equal(dated.dateModified, '2026-09-15T10:00:00.000Z');
  const explicit = article({
    ...GUIDE_ONE, publishedAt: '2026-08-05T00:00:00.000Z', createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z',
  });
  assert.equal(explicit.datePublished, '2026-08-05T00:00:00.000Z', 'an explicit publish date wins over the row creation date');
  // With only a creation date, it is also the last change.
  const created = article({ ...GUIDE_ONE, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: null });
  assert.equal(created.datePublished, '2026-08-01T09:00:00.000Z');
  assert.equal(created.dateModified, '2026-08-01T09:00:00.000Z');
});

test('bylines: only "By Name[, NMLS #n][ · Firm[, NMLS #n]]" becomes a person; everything else is the builder', () => {
  const author = (byline) => byType(pageJsonLd({
    page: 'guide', community, origin: ORIGIN, guide: { ...GUIDE_ONE, byline },
  }), 'Article')[0].author;
  const builder = { '@type': 'Organization', '@id': `${BASE}#organization`, name: 'Acme Homes' };

  assert.deepEqual(author('By Alan Blood'), { '@type': 'Person', name: 'Alan Blood' });
  assert.deepEqual(author('Written by Pat Rivera'), { '@type': 'Person', name: 'Pat Rivera' });
  assert.equal(author('by María José O\'Neil-Smith').name, 'María José O\'Neil-Smith');
  assert.equal(author('By Dillan Lewis, NMLS #1337516').identifier.value, '1337516');

  for (const junk of [
    'By Jane Doe, Realtor', 'By Acme Homes, Inc.', 'The Acme Homes Team', 'By Acme Homes', 'By The Marketing Team',
    'by', 'by  ', 'By', 'Written by', 'By Madonna', 'By A B C D E', 'By Jane 2nd', 'Pat Rivera', '',
    'By Jane Doe · Firm · Extra',
  ]) {
    assert.deepEqual(author(junk), builder, JSON.stringify(junk));
  }
});

test('control characters never reach the published data', () => {
  const dirty = fixture({
    name: 'Wil\u0007low\u0000 Creek\u007F',
    settings: { ...DEFAULT_SETTINGS, lenderTagline: 'Financing\u0001 for\u0008 buyers' },
    guides: [{ ...GUIDE_ONE, title: 'Rent\u000B or\u001F buy?' }],
  });
  for (const page of ['landing', 'guides']) {
    const nodes = pageJsonLd({ page, community: dirty, origin: ORIGIN });
    assert.doesNotMatch(JSON.stringify(nodes), /\\u00[01][0-9a-f]|\\u007f/i, `${page}: a control character survived`);
    assert.doesNotMatch(serializeJsonLd(nodes), /\\u00[01][0-9a-f]|\\u007f/i);
  }
  assert.equal(topLevel(pageJsonLd({ page: 'landing', community: dirty, origin: ORIGIN }), 'WebSite')[0].name, 'Willow Creek');
  // The lender's tagline is read straight from settings, so only the final prune can clean it.
  assert.equal(
    ownerOf(pageJsonLd({ page: 'landing', community: dirty, origin: ORIGIN }), 'FinancialService').description,
    'Financing for buyers',
  );
  assert.equal(pageMeta({ page: 'landing', community: dirty, origin: ORIGIN }).title, 'Willow Creek | New homes in Lehi, UT');
});

test('serializeJsonLd wraps the nodes in one graph and does not repeat their @context', () => {
  const nodes = build(PAGES[0]);
  assert.ok(nodes.every((n) => n['@context'] === 'https://schema.org'));
  const graph = JSON.parse(serializeJsonLd(nodes))['@graph'];
  assert.equal(graph.length, nodes.length);
  for (const node of graph) assert.equal(node['@context'], undefined, 'the graph carries the context once, at the top');
});

test('the lender links to its NMLS Consumer Access record', () => {
  const lender = ownerOf(build(PAGES[0]), 'FinancialService');
  assert.equal(lender.sameAs, 'https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1790749');
});

test('addresses: a lower-case state is read and printed as a state code', () => {
  const place = ownerOf(pageJsonLd({
    page: 'landing', origin: ORIGIN, community: fixture({ location: '12 Main St, Lehi, ut 84043' }),
  }), 'Place');
  assert.deepEqual(place.address, {
    '@type': 'PostalAddress', streetAddress: '12 Main St', addressLocality: 'Lehi', addressRegion: 'UT',
    postalCode: '84043', addressCountry: 'US',
  });
  assert.equal(ownerOf(pageJsonLd({
    page: 'landing', origin: ORIGIN, community: fixture({ location: 'Lehi, Utah' }),
  }), 'Place').address, 'Lehi, Utah', 'text that is not "City, ST" stays as typed');
});

test('the place is fully described on the landing and map pages and kept short elsewhere', () => {
  const place = (page) => ownerOf(pageJsonLd({ page, community, origin: ORIGIN }), 'Place');
  for (const page of ['landing', 'map']) {
    const full = place(page);
    assert.ok(full.description, `${page}: description`);
    assert.equal(full.image[0].contentUrl, HERO, `${page}: image`);
    assert.equal(full.hasMap, SITE_MAP, `${page}: hasMap`);
  }
  for (const page of ['tools', 'explore', 'guides', 'realtors']) {
    const short = place(page);
    assert.equal(short.description, undefined, `${page}: description`);
    assert.equal(short.image, undefined, `${page}: image`);
    assert.equal(short.hasMap, undefined, `${page}: hasMap`);
  }
});

test('an agent or guide with no name is not published, listed or counted', () => {
  const nameless = fixture({
    agents: [...community.agents, { id: 'a_blank', name: '  ', brokerage: 'Ghost Realty', photo: '/api/photos/p_ghost' }],
    guides: [
      ...community.guides,
      { id: 'g_blank', slug: 'no-title', title: ' ', image: '/api/photos/p_ghost_guide', imageAlt: 'x' },
      { id: 'g_noslug', slug: '', title: 'Has no slug', image: '/api/photos/p_ghost_guide' },
    ],
  });
  const realtors = pageJsonLd({ page: 'realtors', community: nameless, origin: ORIGIN });
  assert.equal(topLevel(realtors, 'RealEstateAgent').length, 3);
  assert.equal(topLevel(realtors, 'ItemList')[0].numberOfItems, 3);
  assert.ok(!imageUrls(realtors).has(abs('/api/photos/p_ghost')));
  assert.equal(pageJsonLd({ page: 'home', community: nameless, origin: ORIGIN, home: HOME_READY })
    .find((n) => n['@type'] === 'ItemPage').mentions.length, 3);
  assert.doesNotMatch(pageMeta({ page: 'realtors', community: nameless, origin: ORIGIN }).description, /Ghost/);

  const guides = pageJsonLd({ page: 'guides', community: nameless, origin: ORIGIN });
  assert.equal(topLevel(guides, 'ItemList')[0].numberOfItems, 3);
  assert.ok(!imageUrls(guides).has(abs('/api/photos/p_ghost_guide')));
});

test('realtors serve the community they work in', () => {
  const [pat] = topLevel(build(PAGES.find((p) => p.page === 'realtors')), 'RealEstateAgent');
  assert.deepEqual(pat.areaServed, { '@id': `${BASE}#community` });
});

test('tools: the FAQ is described as a FAQPage, and only when there is one', () => {
  const faqJson = JSON.stringify([{ q: 'Can I buy with a VA loan?', a: 'Yes, where the program allows it.' }, { q: 'Half done', a: '' }]);
  const nodes = pageJsonLd({ page: 'tools', community: fixture({ settings: { ...DEFAULT_SETTINGS, faqJson } }), origin: ORIGIN });
  const [faq] = byType(nodes, 'FAQPage');
  assert.equal(faq['@id'], `${abs('/c/willow-creek/tools')}#faq`);
  assert.deepEqual(faq.mainEntity, [{
    '@type': 'Question', name: 'Can I buy with a VA loan?',
    acceptedAnswer: { '@type': 'Answer', text: 'Yes, where the program allows it.' },
  }], 'a question with no answer is not published');

  const bare = fixture({ settings: { ...DEFAULT_SETTINGS, faqJson: '[]' } });
  assert.equal(byType(pageJsonLd({ page: 'tools', community: bare, origin: ORIGIN }), 'FAQPage').length, 0, 'no FAQ, no FAQPage');
  // A community that has not edited its FAQ publishes the starter questions, as a buyer sees them.
  const starter = byType(pageJsonLd({ page: 'tools', community, origin: ORIGIN }), 'FAQPage')[0];
  assert.equal(starter.mainEntity.length, DEFAULT_FAQ.length);
  assert.equal(starter.mainEntity[0].name, DEFAULT_FAQ[0].q);
  const off = fixture({ features: { ...community.features, faq: false }, settings: { ...DEFAULT_SETTINGS, faqJson } });
  assert.equal(byType(pageJsonLd({ page: 'tools', community: off, origin: ORIGIN }), 'FAQPage').length, 0, 'a switched-off FAQ is not published');
});
