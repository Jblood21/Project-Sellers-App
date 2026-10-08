import {
  DEFAULT_FEATURES, DEFAULT_GUIDE_IMAGE, DEFAULT_GUIDE_IMAGE_ALT, DEFAULT_SETTINGS, REPLACED_DEFAULTS,
  DEFAULT_TOOLS_ENABLED, GUIDE_TEXT_MAX, normalizeLayout, normalizeTheme, slugify,
} from '../../shared/domain.js';
import { revisionOfFile } from '../lib/video.js';

/** A community's settings: the defaults, then what it saved, with any reworded default brought up to date. */
function currentSettings(saved) {
  const settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  for (const [key, replaced] of Object.entries(REPLACED_DEFAULTS)) {
    if (replaced.includes(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
  }
  return settings;
}

export function shapeCommunity(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    status: row.status,
    theme: normalizeTheme(row.theme),
    // Falls back rather than trusting the column: a layout retired later must
    // not leave a community rendering a stylesheet that is not there.
    layout: normalizeLayout(row.layout),
    websiteUrl: row.website_url ?? row.websiteUrl ?? null,
    builder: row.builder || '',
    settings: currentSettings(row.settings),
    tools: { ...DEFAULT_TOOLS_ENABLED, ...(row.tools || {}) },
    features: { ...DEFAULT_FEATURES, ...(row.features || {}) },
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    ...extra,
  };
}

/**
 * `video` is the home's walkthrough as {sizeBytes, contentType}, or null. Never
 * the bytes: like a resource video, the file is fetched from its own URL so it
 * can be ranged and cached, and so it never rides along in a JSON payload.
 */
/** An integer count, or null for "this home does not have a count". */
const units = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export function shapeHome(row, photos = [], floorPlans = [], video = null) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    name: row.name,
    price: Number(row.price) || 0,
    beds: Number(row.beds) || 0,
    baths: Number(row.baths) || 0,
    sqft: Number(row.sqft) || 0,
    description: row.description || '',
    availability: row.availability,
    lotNumber: row.lot_number ?? row.lotNumber ?? '',
    readyOn: row.ready_on ?? row.readyOn ?? '',
    // Null and zero mean different things here -- no count at all versus sold
    // out -- so this cannot fall back through `|| 0` like the numbers above it.
    unitsAvailable: units(row.units_available ?? row.unitsAvailable),
    position: Number(row.position) || 0,
    photos,
    floorPlans,
    // `v` is when this file was stored. The route sends the bytes as immutable for
    // a year, and the address is the only cache key a browser has, so a replaced
    // walkthrough has to arrive under a new address or every browser that already
    // played the old one keeps playing it.
    videoUrl: video ? `/api/homes/${row.id}/video?v=${revisionOfFile(video)}` : '',
    videoSizeBytes: Number(video?.sizeBytes ?? video?.size_bytes ?? 0) || 0,
  };
}

export function shapePhoto(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url || `/api/photos/${row.id}`,
    position: Number(row.position) || 0,
  };
}

/**
 * The consent record as the admin needs to read it. `null` means no row at all
 * — a lead from before the box existed — which is not the same as `granted:
 * false`, somebody who was asked and said no. Both mean do not call; only one
 * of them means you asked.
 */
export function shapeConsent(row) {
  if (!row) return null;
  return {
    granted: Boolean(row.granted),
    text: row.consent_text ?? row.consentText ?? '',
    version: row.version ?? '',
    at: row.created_at ?? row.createdAt ?? null,
    ip: row.ip ?? '',
  };
}

export function shapeLead(row, { plan = {}, activity = [], moveIn = null, consent = null } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    status: row.status,
    notes: row.notes || '',
    tour: row.tour ?? null,
    savedHomeIds: row.saved_home_ids ?? row.savedHomeIds ?? [],
    openedAt: row.opened_at ?? row.openedAt ?? null,
    archivedAt: row.archived_at ?? row.archivedAt ?? null,
    firstVisitAt: row.first_visit_at ?? row.firstVisitAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    plan,
    activity,
    moveIn,
    consent,
  };
}

/** The buyer's own move-in plan. Absent simply means they have not started one. */
export function shapeMoveIn(row) {
  if (!row) return null;
  return {
    homeId: row.home_id ?? row.homeId ?? null,
    targetDate: row.target_date ?? row.targetDate ?? '',
    leaseEnd: row.lease_end ?? row.leaseEnd ?? '',
    payMethod: row.pay_method ?? row.payMethod ?? 'loan',
    drivers: row.drivers ?? [],
    done: row.done ?? [],
    ownSteps: row.own_steps ?? row.ownSteps ?? [],
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function shapeHighlight(row, photo = null) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    category: row.category,
    name: row.name,
    description: row.description || '',
    detail: row.detail || '',
    address: row.address || '',
    position: Number(row.position) || 0,
    photo,
  };
}

/**
 * Whether this row has an uploaded file behind it. The list queries deliberately
 * do not SELECT the data column — a base64 video is megabytes — so they report
 * `has_video` instead, and either answer means the same thing here.
 */
const hasVideo = (row) =>
  row.has_video ?? row.hasVideo ?? Boolean(row.data);

export function shapeResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    kind: row.kind,
    title: row.title || '',
    body: row.body || '',
    url: row.url || '',
    // The bytes are deliberately absent: a list of resources is sent to every
    // buyer on every page load, and a base64 video in that payload would be
    // megabytes of JSON nobody asked for. Callers that want the file fetch it
    // from its own route, where it can stream.
    // Versioned for the reason shapeHome gives: the same id keeps its address when
    // the file is replaced, and the bytes are served as immutable.
    videoUrl: hasVideo(row)
      ? `/api/resources/${row.id}/video?v=${revisionOfFile(row)}`
      : '',
    contentType: row.content_type ?? row.contentType ?? '',
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes) || 0,
    position: Number(row.position) || 0,
  };
}

export function shapeSlot(row) {
  if (!row) return null;
  const raw = row.slot_date ?? row.slotDate;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    // pg returns DATE as a Date object; the buyer and admin both want the
    // literal 'YYYY-MM-DD' the builder chose, with no timezone applied.
    date: raw instanceof Date
      ? `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`
      : String(raw).slice(0, 10),
    time: row.slot_time ?? row.slotTime,
    leadId: row.lead_id ?? row.leadId ?? null,
  };
}

/**
 * A realtor. `photo` and `logo` are shapePhoto results (or null); the public
 * route flattens them to bare URLs, the admin keeps the ids so it can remove them.
 */
export function shapeAgent(row, photo = null, logo = null) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    name: row.name,
    brokerage: row.brokerage || '',
    licenseNo: row.license_no ?? row.licenseNo ?? '',
    licenseState: row.license_state ?? row.licenseState ?? '',
    phone: row.phone || '',
    email: row.email || '',
    website: row.website || '',
    position: Number(row.position) || 0,
    photo,
    logo,
  };
}

/** A path on this site, or an https address: the only two things an image column may name. */
const usableImage = (value) => {
  const text = String(value ?? '').trim();
  return /^https:\/\//i.test(text) || /^\/(?!\/)/.test(text) ? text : '';
};

/**
 * A guide. `body` is only included when asked for: the list of guides is sent to
 * every buyer on every page load and a 60,000-character article in each entry
 * would be most of the payload.
 *
 * `image` is always a URL a page can use. An uploaded picture wins, then a
 * well-formed address stored on the row, then the shared default, so a guide can
 * never render a broken image because the column was blank or hand-edited.
 */
export function shapeGuide(row, { body = false, photo = null } = {}) {
  if (!row) return null;
  const title = row.title || '';
  const stored = usableImage(row.image);
  const image = photo?.url || stored || DEFAULT_GUIDE_IMAGE;
  const alt = String(row.image_alt ?? row.imageAlt ?? '').trim();
  const shaped = {
    id: row.id,
    communityId: row.community_id ?? row.communityId,
    slug: row.slug,
    defaultKey: row.default_key ?? row.defaultKey ?? '',
    title,
    category: row.category || '',
    byline: row.byline || '',
    note: row.note || '',
    summary: row.summary || '',
    image,
    imageAlt: alt || (image === DEFAULT_GUIDE_IMAGE ? DEFAULT_GUIDE_IMAGE_ALT : title),
    published: row.published !== false,
    position: Number(row.position) || 0,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
  if (body) shaped.body = row.body || '';
  return shaped;
}

/**
 * A slug nobody in `taken` already has. Both stores and the create route use
 * this one function so a slug collision resolves identically everywhere.
 */
export function uniqueSlug(base, taken) {
  const root = slugify(base) || 'guide';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, GUIDE_TEXT_MAX.slug - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The row a supplied guide becomes in a community. Shared by seeding and by
 * restore-defaults so the two cannot copy it differently.
 */
export function guideRowFromDefault(def, slug, position) {
  return {
    slug,
    defaultKey: def.defaultKey,
    title: def.title,
    category: def.category || 'Guide',
    byline: def.byline || '',
    note: def.note || '',
    summary: def.summary || '',
    body: def.body || '',
    // Blank means "the shared default picture", so the supplied guides keep
    // following DEFAULT_GUIDE_IMAGE rather than freezing a path into every row.
    image: '',
    imageAlt: def.imageAlt || '',
    published: true,
    position,
  };
}
