import { DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED, normalizeTheme } from '../../shared/domain.js';

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
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    ...extra,
  };
}

export function shapeHome(row, photos = []) {
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
    position: Number(row.position) || 0,
    photos,
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
