import {
  DEFAULT_FEATURES, DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED, normalizeTheme,
} from '../../shared/domain.js';

export function shapeCommunity(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    status: row.status,
    theme: normalizeTheme(row.theme),
    websiteUrl: row.website_url ?? row.websiteUrl ?? null,
    builder: row.builder || '',
    settings: { ...DEFAULT_SETTINGS, ...(row.settings || {}) },
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
    videoUrl: video ? `/api/homes/${row.id}/video` : '',
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
    videoUrl: hasVideo(row) ? `/api/resources/${row.id}/video` : '',
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
