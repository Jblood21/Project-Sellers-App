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

export function shapeHome(row, photos = [], floorPlans = []) {
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
    position: Number(row.position) || 0,
    photos,
    floorPlans,
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

export function shapeLead(row, { plan = {}, activity = [] } = {}) {
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
    firstVisitAt: row.first_visit_at ?? row.firstVisitAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    plan,
    activity,
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
    position: Number(row.position) || 0,
    photo,
  };
}
