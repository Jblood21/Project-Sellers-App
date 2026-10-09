import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  communitySlugCandidates, DEFAULT_FEATURES, DEFAULT_LAYOUT, DEFAULT_SETTINGS, DEFAULT_THEME,
  DEFAULT_TOOLS_ENABLED, isoDate, isSameLead,
} from '../../shared/domain.js';
import { loadDefaultGuides } from '../lib/guides.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import {
  guideRowFromDefault, shapeAgent, shapeCommunity, shapeGuide, shapeHighlight, shapeHome, shapeLead,
  shapeMoveIn, shapePhoto, shapeResource, shapeSlot, shapeConsent, uniqueSlug,
} from './shape.js';

const EMPTY = {
  admins: [], communities: [], homes: [], highlights: [], photos: [], resources: [],
  homeVideos: [], slots: [], leads: [], planItems: [], moveIn: [], activity: [],
  consents: [], agents: [], guides: [], communitySlugs: [],
};

/**
 * Local-development store: the same interface as the Postgres one, backed by a JSON
 * file. Handy for running the app without a database; production on Render sets
 * DATABASE_URL and gets the Postgres store instead.
 */
export function createFileStore(path) {
  let db = structuredClone(EMPTY);
  let writeQueued = false;

  const load = () => {
    try {
      db = { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(path, 'utf8')) };
    } catch {
      db = structuredClone(EMPTY);
    }
  };

  const save = () => {
    if (writeQueued) return;
    writeQueued = true;
    queueMicrotask(() => {
      writeQueued = false;
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(db, null, 2));
      renameSync(tmp, path);
    });
  };

  const now = () => new Date().toISOString();
  // A home's gallery and its floor plans both hang off homeId, so every read has
  // to say which kind it wants or plan drawings land in the photo carousel.
  const imagesOf = (homeId, kind) =>
    db.photos
      .filter((p) => p.homeId === homeId && (kind === 'floorplan' ? p.kind === 'floorplan' : p.kind !== 'floorplan'))
      .sort((a, b) => a.position - b.position)
      .map(shapePhoto);
  const photosOf = (homeId) => imagesOf(homeId, 'home');
  const plansOf = (homeId) => imagesOf(homeId, 'floorplan');
  // Newest answer wins; the older rows stay as the audit trail.
  const consentOf = (leadId) => shapeConsent(
    db.consents.filter((c) => c.leadId === leadId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null,
  );
  // Presence and size only, so shapeHome never sees the bytes — the same split
  // the Postgres store draws by keeping the file out of its column list.
  const videoOf = (homeId) => {
    const row = db.homeVideos.find((v) => v.homeId === homeId);
    return row ? { contentType: row.contentType, sizeBytes: row.sizeBytes, createdAt: row.createdAt } : null;
  };
  // A highlight carries at most one photo, so take the first rather than a gallery.
  const photoOf = (highlightId) => {
    const row = db.photos.find((p) => p.highlightId === highlightId);
    return row ? shapePhoto(row) : null;
  };
  // Realtor images: at most one portrait and one logo each, the oldest of a kind
  // winning, exactly as the Postgres store reads them.
  const agentImage = (agentId, kind) => {
    const row = db.photos.find((p) => p.agentId === agentId && p.kind === kind);
    return row ? shapePhoto(row) : null;
  };
  // Position first, then id: the id makes the order of equal positions the same
  // here as in Postgres, where ties would otherwise fall to whatever order the
  // rows happen to sit in on disk (an UPDATE moves a row). Creation time is not
  // used because seeded rows share one in Postgres and differ by a millisecond
  // here. Plain < compares code units, which for the ASCII ids is what
  // Postgres' "C" collation does.
  const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const agentOf = (row) => (row ? shapeAgent(row, agentImage(row.id, 'agent'), agentImage(row.id, 'agentlogo')) : null);
  const guideImage = (guideId) => {
    const row = db.photos.find((p) => p.guideId === guideId);
    return row ? shapePhoto(row) : null;
  };
  const guideOf = (row, body) => (row ? shapeGuide(row, { body, photo: guideImage(row.id) }) : null);
  // The same error pg raises for a duplicate (community_id, slug), so the route
  // has one thing to catch whichever store is running.
  const duplicateSlug = () => Object.assign(new Error('duplicate guide slug'), { code: '23505' });
  const newGuideRow = (communityId, g, position) => ({
    id: `g_${shortId(10)}`, communityId, slug: g.slug, defaultKey: g.defaultKey ?? '',
    title: g.title, category: g.category ?? 'Guide', byline: g.byline ?? '', note: g.note ?? '',
    summary: g.summary ?? '', body: g.body ?? '', image: g.image ?? '', imageAlt: g.imageAlt ?? '',
    published: g.published ?? true, position, createdAt: now(), updatedAt: now(),
  });
  // Copies each supplied guide the community does not have, matched by defaultKey
  // so a retitled or re-slugged guide still counts as present. Never touches an
  // existing row. The same algorithm as the Postgres store's addMissingDefaults.
  const addMissingDefaults = (communityId) => {
    const have = db.guides.filter((g) => g.communityId === communityId);
    const taken = new Set(have.map((g) => g.slug));
    const keys = new Set(have.map((g) => g.defaultKey).filter(Boolean));
    let position = have.reduce((max, g) => Math.max(max, g.position), -1) + 1;
    const added = [];
    for (const def of loadDefaultGuides()) {
      if (keys.has(def.defaultKey)) continue;
      const slug = uniqueSlug(def.slug, taken);
      taken.add(slug);
      const row = newGuideRow(communityId, guideRowFromDefault(def, slug, position), position);
      db.guides.push(row);
      added.push(row);
      position += 1;
    }
    return added;
  };
  const planOf = (leadId) =>
    Object.fromEntries(db.planItems.filter((p) => p.leadId === leadId).map((p) => [p.key, p.summary]));
  const moveInOf = (leadId) => shapeMoveIn(db.moveIn.find((m) => m.leadId === leadId));
  const activityOf = (leadId, limit = 200) =>
    db.activity
      .filter((a) => a.leadId === leadId)
      .slice(-limit)
      .reverse()
      .map((a) => ({ text: a.text, createdAt: a.createdAt }));

  return {
    kind: 'file',

    async init() {
      load();
      // Communities that predate guides get the supplied ones once. The flag is
      // what stops a builder's deletions being undone on the next start; see the
      // Postgres store's init for the longer account.
      for (const community of db.communities) {
        if (community.guidesSeeded) continue;
        addMissingDefaults(community.id);
        community.guidesSeeded = true;
      }
      save();
    },

    async close() {},

    async countAdmins() {
      return db.admins.length;
    },
    async firstAdminEmail() {
      return db.admins[0]?.email ?? null;
    },

    async getAdminByEmail(email) {
      return db.admins.find((a) => a.email.toLowerCase() === String(email).toLowerCase()) || null;
    },
    async createAdmin({ email, passwordHash }) {
      const existing = await this.getAdminByEmail(email);
      if (existing) {
        existing.password_hash = passwordHash;
        save();
        return existing;
      }
      const admin = { id: uuid(), email, password_hash: passwordHash, created_at: now() };
      db.admins.push(admin);
      save();
      return admin;
    },

    async listCommunities() {
      return db.communities.map((c) =>
        shapeCommunity(c, {
          homesCount: db.homes.filter((h) => h.communityId === c.id).length,
          leadsCount: db.leads.filter((l) => l.communityId === c.id).length,
          pendingTours: db.leads.filter(
            // Archiving a lead retires its call request too — see isTourPending.
            (l) => l.communityId === c.id && l.tour && !l.tour.handledAt && !l.archivedAt,
          ).length,
        }),
      );
    },

    async getCommunity(id) {
      return shapeCommunity(db.communities.find((c) => c.id === id));
    },

    /** See the Postgres store: an id, the id in other case, or any slug the community has had. */
    async resolveCommunity(key) {
      const text = String(key ?? '').trim().slice(0, 80);
      // Printable ASCII only, as in the other store: the two fold letter case differently outside it.
      if (!text || !/^[\x21-\x7e]+$/.test(text)) return null;
      const lower = text.toLowerCase();
      const row = db.communities.find((c) => c.id === text)
        ?? db.communities.find((c) => c.id === lower)
        ?? db.communities.find((c) => c.id === db.communitySlugs.find((s) => s.slug === lower)?.communityId);
      return shapeCommunity(row);
    },

    async listCommunitySlugs(id) {
      return db.communitySlugs.filter((s) => s.communityId === id).map((s) => s.slug);
    },

    async setCommunitySlug(id, slug) {
      if (db.communities.some((c) => c.id.toLowerCase() === slug && c.id !== id)) return { error: 'taken' };
      const owner = db.communitySlugs.find((s) => s.slug === slug);
      if (owner && owner.communityId !== id) return { error: 'taken' };
      const row = db.communities.find((c) => c.id === id);
      if (!row) return { error: 'missing' };
      if (!owner) db.communitySlugs.push({ slug, communityId: id });
      row.slug = slug;
      row.updatedAt = now();
      save();
      return { ok: true };
    },

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = DEFAULT_THEME, builder = '' }) {
      const id = slugId(name);
      let slug = null;
      for (const candidate of communitySlugCandidates(name)) {
        if (db.communities.some((c) => c.id.toLowerCase() === candidate)) continue;
        if (db.communitySlugs.some((s) => s.slug === candidate)) continue;
        db.communitySlugs.push({ slug: candidate, communityId: id });
        slug = candidate;
        break;
      }
      const row = {
        id, slug, name, location, status, theme, builder,
        websiteUrl: null,
        settings: { ...DEFAULT_SETTINGS },
        tools: { ...DEFAULT_TOOLS_ENABLED },
        features: { ...DEFAULT_FEATURES },
        layout: DEFAULT_LAYOUT,
        guidesSeeded: true,
        createdAt: now(), updatedAt: now(),
      };
      db.communities.push(row);
      addMissingDefaults(row.id);
      save();
      return shapeCommunity(row);
    },

    async updateCommunity(id, patch) {
      const row = db.communities.find((c) => c.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'location', 'status', 'theme', 'websiteUrl', 'builder', 'settings', 'tools', 'features',
        'layout',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      row.updatedAt = now();
      save();
      return shapeCommunity(row);
    },

    async deleteCommunity(id) {
      const homeIds = db.homes.filter((h) => h.communityId === id).map((h) => h.id);
      const leadIds = db.leads.filter((l) => l.communityId === id).map((l) => l.id);
      db.communities = db.communities.filter((c) => c.id !== id);
      db.communitySlugs = db.communitySlugs.filter((s) => s.communityId !== id);
      db.homes = db.homes.filter((h) => h.communityId !== id);
      db.highlights = db.highlights.filter((h) => h.communityId !== id);
      db.slots = db.slots.filter((s) => s.communityId !== id);
      db.photos = db.photos.filter((p) => p.communityId !== id);
      db.leads = db.leads.filter((l) => l.communityId !== id);
      db.planItems = db.planItems.filter((p) => !leadIds.includes(p.leadId));
      db.moveIn = db.moveIn.filter((m) => !leadIds.includes(m.leadId));
      db.activity = db.activity.filter((a) => !leadIds.includes(a.leadId));
      // What Postgres gets from ON DELETE CASCADE has to be done by hand here.
      // Realtor and guide pictures are photos rows with this community_id, so
      // the photos filter above already took them.
      db.agents = db.agents.filter((a) => a.communityId !== id);
      db.guides = db.guides.filter((g) => g.communityId !== id);
      db.resources = db.resources.filter((r) => r.communityId !== id);
      db.homeVideos = db.homeVideos.filter((v) => !homeIds.includes(v.homeId));
      db.consents = db.consents.filter((c) => !leadIds.includes(c.leadId));
      save();
    },

    async listHomes(communityId) {
      return db.homes
        .filter((h) => h.communityId === communityId)
        .sort((a, b) => a.position - b.position)
        .map((h) => shapeHome(h, photosOf(h.id), plansOf(h.id), videoOf(h.id)));
    },

    async getHome(id) {
      const row = db.homes.find((h) => h.id === id);
      return row ? shapeHome(row, photosOf(id), plansOf(id), videoOf(id)) : null;
    },

    async createHome(communityId, data) {
      const position = db.homes.filter((h) => h.communityId === communityId).length;
      const row = {
        id: `h_${shortId(10)}`, communityId, ...data,
        // Spelled out so a home created without one has the column rather than
        // the key simply missing -- null is a value here, not an absence.
        unitsAvailable: data.unitsAvailable ?? null,
        position, createdAt: now(),
      };
      db.homes.push(row);
      save();
      return shapeHome(row, [], []);
    },

    async updateHome(id, patch) {
      const row = db.homes.find((h) => h.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'price', 'beds', 'baths', 'sqft', 'description', 'availability',
        'lotNumber', 'readyOn', 'unitsAvailable', 'position', 'videoLink',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      save();
      return shapeHome(row, photosOf(id), plansOf(id), videoOf(id));
    },

    async deleteHome(id) {
      db.homes = db.homes.filter((h) => h.id !== id);
      db.photos = db.photos.filter((p) => p.homeId !== id);
      db.homeVideos = db.homeVideos.filter((v) => v.homeId !== id);
      save();
    },

    // ── home walkthroughs ────────────────────────────────────────────────
    async setHomeVideo(homeId, { communityId, contentType, data, sizeBytes }) {
      // One per home, so a second upload replaces the first rather than stacking.
      db.homeVideos = db.homeVideos.filter((v) => v.homeId !== homeId);
      db.homeVideos.push({ homeId, communityId, contentType, data, sizeBytes, createdAt: now() });
      save();
      return this.getHome(homeId);
    },

    async getHomeVideo(homeId) {
      const row = db.homeVideos.find((v) => v.homeId === homeId);
      return row ? { content_type: row.contentType, data: row.data, createdAt: row.createdAt } : null;
    },

    async deleteHomeVideo(homeId) {
      db.homeVideos = db.homeVideos.filter((v) => v.homeId !== homeId);
      save();
    },

    async listHighlights(communityId) {
      return db.highlights
        .filter((h) => h.communityId === communityId)
        .sort((a, b) => a.position - b.position)
        .map((h) => shapeHighlight(h, photoOf(h.id)));
    },

    async getHighlight(id) {
      const row = db.highlights.find((h) => h.id === id);
      return row ? shapeHighlight(row, photoOf(id)) : null;
    },

    async createHighlight(communityId, data) {
      const position = db.highlights.filter((h) => h.communityId === communityId).length;
      const row = { id: `g_${shortId(10)}`, communityId, ...data, position, createdAt: now() };
      db.highlights.push(row);
      save();
      return shapeHighlight(row, null);
    },

    async updateHighlight(id, patch) {
      const row = db.highlights.find((h) => h.id === id);
      if (!row) return null;
      for (const key of ['category', 'name', 'description', 'detail', 'address', 'position']) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      save();
      return shapeHighlight(row, photoOf(id));
    },

    // ── videos and articles ────────────────────────────────────────────────
    async listResources(communityId) {
      return (db.resources ?? [])
        .filter((r) => r.communityId === communityId)
        .sort((a, b) => a.position - b.position)
        .map(shapeResource);
    },

    async getResource(id) {
      return shapeResource((db.resources ?? []).find((r) => r.id === id) ?? null);
    },

    async getResourceVideo(id) {
      const row = (db.resources ?? []).find((r) => r.id === id);
      return row?.data ? { content_type: row.contentType || '', data: row.data, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;
    },

    async countResourcesOfKind(communityId, kind) {
      return (db.resources ?? []).filter((r) => r.communityId === communityId && r.kind === kind).length;
    },

    async createResource(communityId, data) {
      db.resources = db.resources ?? [];
      const position = db.resources.filter((r) => r.communityId === communityId).length;
      const row = {
        id: `r_${shortId(10)}`, communityId, kind: data.kind,
        title: data.title ?? '', body: data.body ?? '', url: data.url ?? '',
        contentType: data.contentType ?? '', data: data.data ?? null,
        sizeBytes: data.sizeBytes ?? 0,
        position, createdAt: now(), updatedAt: now(),
      };
      db.resources.push(row);
      save();
      return shapeResource(row);
    },

    async updateResource(id, patch) {
      const row = (db.resources ?? []).find((r) => r.id === id);
      if (!row) return null;
      for (const key of ['kind', 'title', 'body', 'url', 'position', 'contentType', 'data', 'sizeBytes']) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      if (patch.data !== undefined) row.updatedAt = now();
      save();
      return shapeResource(row);
    },

    async deleteResource(id) {
      db.resources = (db.resources ?? []).filter((r) => r.id !== id);
      save();
    },

    async deleteHighlight(id) {
      db.highlights = db.highlights.filter((h) => h.id !== id);
      db.photos = db.photos.filter((p) => p.highlightId !== id);
      save();
    },

    async setHomePhotoOrder(homeId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const row = db.photos.find((p) => p.id === id && p.homeId === homeId && p.kind === 'home');
        if (row) row.position = index;
      });
      save();
    },

    async listHomePhotosOfKind(homeId, kind) {
      return db.photos
        .filter((p) => p.homeId === homeId && p.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map(shapePhoto);
    },

    async listHighlightPhotos(highlightId) {
      return db.photos.filter((p) => p.highlightId === highlightId).map(shapePhoto);
    },

    async countHomePhotos(homeId) {
      return db.photos.filter((p) => p.homeId === homeId && p.kind !== 'floorplan').length;
    },

    async addPhoto({
      communityId, homeId = null, highlightId = null, agentId = null, guideId = null,
      kind = 'home', contentType = null, data = null, url = null,
    }) {
      // After the last one, not "how many there are": deleting some leaves gaps, and a count then lands before a survivor.
      const position = db.photos
        .filter((p) => p.communityId === communityId && p.homeId === homeId)
        .reduce((last, p) => Math.max(last, p.position ?? -1), -1) + 1;
      const row = {
        id: `p_${shortId(12)}`, communityId, homeId, highlightId, agentId, guideId, kind,
        content_type: contentType, data, url, position, createdAt: now(),
      };
      db.photos.push(row);
      save();
      return shapePhoto(row);
    },

    async getPhotoData(id) {
      return db.photos.find((p) => p.id === id) || null;
    },

    async deletePhoto(id) {
      db.photos = db.photos.filter((p) => p.id !== id);
      save();
    },

    async listAgentPhotos(agentId, kind) {
      return db.photos
        .filter((p) => p.agentId === agentId && p.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map(shapePhoto);
    },

    async listGuidePhotos(guideId) {
      return db.photos.filter((p) => p.guideId === guideId).map(shapePhoto);
    },

    async listCommunityPhotos(communityId, kind) {
      return db.photos
        .filter((p) => p.communityId === communityId && p.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map(shapePhoto);
    },

    // ── realtors ─────────────────────────────────────────────────────────
    async listAgents(communityId) {
      return db.agents
        .filter((a) => a.communityId === communityId)
        .sort(byPosition)
        .map(agentOf);
    },

    async getAgent(id) {
      return agentOf(db.agents.find((a) => a.id === id));
    },

    async countAgents(communityId) {
      return db.agents.filter((a) => a.communityId === communityId).length;
    },

    /** An unconditional add, for callers that enforce no cap (seeding, tests). */
    async createAgent(communityId, data) {
      return this.createAgentIfRoom(communityId, data, Infinity);
    },

    /**
     * Adds a realtor unless the community already has `max`, answering null when
     * it does. The same contract as the Postgres store, where the check and the
     * insert are one locked step; here they are one synchronous block.
     */
    async createAgentIfRoom(communityId, data, max) {
      if (!db.communities.some((c) => c.id === communityId)) return null;
      const mine = db.agents.filter((a) => a.communityId === communityId);
      if (mine.length >= max) return null;
      const row = {
        id: `a_${shortId(10)}`, communityId,
        position: mine.length ? Math.max(...mine.map((a) => a.position)) + 1 : 0,
        name: data.name, brokerage: data.brokerage ?? '', licenseNo: data.licenseNo ?? '',
        licenseState: data.licenseState ?? 'UT', phone: data.phone ?? '', email: data.email ?? '',
        website: data.website ?? '', createdAt: now(),
      };
      db.agents.push(row);
      save();
      return shapeAgent(row);
    },

    async updateAgent(id, patch) {
      const row = db.agents.find((a) => a.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'brokerage', 'licenseNo', 'licenseState', 'phone', 'email', 'website', 'position',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      save();
      return agentOf(row);
    },

    async deleteAgent(id) {
      db.agents = db.agents.filter((a) => a.id !== id);
      db.photos = db.photos.filter((p) => p.agentId !== id);
      save();
    },

    // ── buyer guides ─────────────────────────────────────────────────────
    async listGuides(communityId, { includeUnpublished = false } = {}) {
      return db.guides
        .filter((g) => g.communityId === communityId && (includeUnpublished || g.published !== false))
        .sort(byPosition)
        .map((g) => guideOf(g, false));
    },

    async getGuide(id) {
      return guideOf(db.guides.find((g) => g.id === id), true);
    },

    async getGuideBySlug(communityId, slug) {
      return guideOf(db.guides.find((g) => g.communityId === communityId && g.slug === slug), true);
    },

    async createGuide(communityId, data) {
      if (db.guides.some((g) => g.communityId === communityId && g.slug === data.slug)) {
        throw duplicateSlug();
      }
      const mine = db.guides.filter((g) => g.communityId === communityId);
      const row = newGuideRow(
        communityId, data, mine.length ? Math.max(...mine.map((g) => g.position)) + 1 : 0,
      );
      db.guides.push(row);
      save();
      return guideOf(row, true);
    },

    async updateGuide(id, patch) {
      const row = db.guides.find((g) => g.id === id);
      if (!row) return null;
      if (
        patch.slug !== undefined && patch.slug !== row.slug
        && db.guides.some((g) => g.communityId === row.communityId && g.slug === patch.slug)
      ) {
        throw duplicateSlug();
      }
      let changed = false;
      for (const key of [
        'slug', 'title', 'category', 'byline', 'note', 'summary', 'body', 'image', 'imageAlt',
        'published', 'position',
      ]) {
        if (patch[key] !== undefined) {
          row[key] = patch[key];
          changed = true;
        }
      }
      // An empty patch changes nothing, so it must not look like an edit: the
      // Postgres store leaves updated_at alone too, and dateModified is read from it.
      if (changed) row.updatedAt = now();
      save();
      return guideOf(row, true);
    },

    async restoreDefaultGuides(communityId) {
      const added = addMissingDefaults(communityId);
      save();
      return added.map((row) => shapeGuide(row));
    },

    async deleteGuide(id) {
      db.guides = db.guides.filter((g) => g.id !== id);
      db.photos = db.photos.filter((p) => p.guideId !== id);
      save();
    },

    async listSlots(communityId) {
      return db.slots
        .filter((s) => s.communityId === communityId)
        .sort((a, b) => `${a.slotDate}${a.slotTime}`.localeCompare(`${b.slotDate}${b.slotTime}`))
        .map(shapeSlot);
    },

    async listOpenSlots(communityId) {
      const today = isoDate(new Date());
      return db.slots
        .filter((s) => s.communityId === communityId && !s.leadId && s.slotDate >= today)
        .sort((a, b) => `${a.slotDate}${a.slotTime}`.localeCompare(`${b.slotDate}${b.slotTime}`))
        .map(shapeSlot);
    },

    async createSlots(communityId, dates, times) {
      const made = [];
      for (const date of dates) {
        for (const time of times) {
          const exists = db.slots.some(
            (s) => s.communityId === communityId && s.slotDate === date && s.slotTime === time,
          );
          if (exists) continue;
          const row = {
            id: `s_${shortId(10)}`, communityId, slotDate: date, slotTime: time,
            leadId: null, createdAt: now(),
          };
          db.slots.push(row);
          made.push(shapeSlot(row));
        }
      }
      save();
      return made;
    },

    async getSlot(id) {
      const row = db.slots.find((s) => s.id === id);
      return row ? shapeSlot(row) : null;
    },

    async deleteSlot(id) {
      db.slots = db.slots.filter((s) => s.id !== id);
      save();
    },

    async bookSlot(slotId, leadId) {
      const row = db.slots.find((s) => s.id === slotId);
      // Re-confirming the slot you already hold is not a clash.
      if (!row || (row.leadId && row.leadId !== leadId)) return null;
      row.leadId = leadId;
      save();
      return shapeSlot(row);
    },

    async releaseSlotsForLead(leadId, exceptSlotId = null) {
      for (const row of db.slots) {
        if (row.leadId === leadId && row.id !== exceptSlotId) row.leadId = null;
      }
      save();
    },

    async listLeads(communityId) {
      return db.leads
        .filter((l) => l.communityId === communityId)
        .map((l) => ({
          ...shapeLead(l, { plan: planOf(l.id), moveIn: moveInOf(l.id), consent: consentOf(l.id) }),
          activityCount: db.activity.filter((a) => a.leadId === l.id).length,
        }));
    },

    async getLead(id) {
      const row = db.leads.find((l) => l.id === id);
      return row
        ? shapeLead(row, {
          plan: planOf(id), activity: activityOf(id), moveIn: moveInOf(id), consent: consentOf(id),
        })
        : null;
    },

    async findLeadByIdentity(communityId, input) {
      const row = db.leads.find((l) => l.communityId === communityId && isSameLead(l, input));
      return row
        ? shapeLead(row, {
          plan: planOf(row.id), activity: activityOf(row.id), moveIn: moveInOf(row.id),
          consent: consentOf(row.id),
        })
        : null;
    },

    async createLead(communityId, { name, email, phone }) {
      const row = {
        id: `l_${shortId(12)}`, communityId, name, email, phone,
        status: 'new', notes: '', tour: null, savedHomeIds: [], extraEmails: [],
        firstVisitAt: now(), updatedAt: now(),
      };
      db.leads.push(row);
      save();
      return shapeLead(row, {});
    },

    async recordConsent(leadId, { granted, text, version, ip, userAgent }) {
      // Append-only, like the Postgres store: a change of mind is a new row.
      const row = {
        id: `cs_${shortId(12)}`, leadId, granted: Boolean(granted), consentText: text ?? '',
        version: version ?? '', ip: ip ?? '', userAgent: userAgent ?? '', createdAt: now(),
      };
      db.consents.push(row);
      save();
      return shapeConsent(row);
    },

    async listConsents(leadId) {
      return db.consents
        .filter((c) => c.leadId === leadId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(shapeConsent);
    },

    async updateLead(id, patch) {
      const row = db.leads.find((l) => l.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'phone', 'status', 'notes', 'tour', 'savedHomeIds', 'extraEmails', 'openedAt', 'archivedAt',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      row.updatedAt = now();
      save();
      return shapeLead(row, { plan: planOf(id), activity: activityOf(id), moveIn: moveInOf(id) });
    },

    async upsertPlanItem(leadId, key, summary) {
      const existing = db.planItems.find((p) => p.leadId === leadId && p.key === key);
      if (existing) existing.summary = summary;
      else db.planItems.push({ leadId, key, summary, updatedAt: now() });
      save();
    },

    /** The whole move-in plan at once -- the buyer edits it as one thing. */
    async saveMoveIn(leadId, plan) {
      const next = {
        leadId,
        homeId: plan.homeId ?? null,
        targetDate: plan.targetDate ?? '',
        leaseEnd: plan.leaseEnd ?? '',
        payMethod: plan.payMethod ?? 'loan',
        drivers: plan.drivers ?? [],
        done: plan.done ?? [],
        ownSteps: plan.ownSteps ?? [],
        updatedAt: now(),
      };
      const index = db.moveIn.findIndex((m) => m.leadId === leadId);
      if (index === -1) db.moveIn.push(next);
      else db.moveIn[index] = next;
      save();
      return shapeMoveIn(next);
    },

    async addActivity(leadId, text) {
      db.activity.push({ leadId, text, createdAt: now() });
      save();
    },
  };
}
