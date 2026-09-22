import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  DEFAULT_FEATURES, DEFAULT_SETTINGS, DEFAULT_THEME, DEFAULT_TOOLS_ENABLED, isoDate, isSameLead,
} from '../../shared/domain.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import {
  shapeCommunity, shapeHighlight, shapeHome, shapeLead, shapeMoveIn, shapePhoto, shapeSlot,
} from './shape.js';

const EMPTY = {
  admins: [], communities: [], homes: [], highlights: [], photos: [],
  slots: [], leads: [], planItems: [], moveIn: [], activity: [],
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
  // A highlight carries at most one photo, so take the first rather than a gallery.
  const photoOf = (highlightId) => {
    const row = db.photos.find((p) => p.highlightId === highlightId);
    return row ? shapePhoto(row) : null;
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

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = DEFAULT_THEME, builder = '' }) {
      const row = {
        id: slugId(name), name, location, status, theme, builder,
        websiteUrl: null,
        settings: { ...DEFAULT_SETTINGS },
        tools: { ...DEFAULT_TOOLS_ENABLED },
        features: { ...DEFAULT_FEATURES },
        createdAt: now(), updatedAt: now(),
      };
      db.communities.push(row);
      save();
      return shapeCommunity(row);
    },

    async updateCommunity(id, patch) {
      const row = db.communities.find((c) => c.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'location', 'status', 'theme', 'websiteUrl', 'builder', 'settings', 'tools', 'features',
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
      db.homes = db.homes.filter((h) => h.communityId !== id);
      db.highlights = db.highlights.filter((h) => h.communityId !== id);
      db.slots = db.slots.filter((s) => s.communityId !== id);
      db.photos = db.photos.filter((p) => p.communityId !== id);
      db.leads = db.leads.filter((l) => l.communityId !== id);
      db.planItems = db.planItems.filter((p) => !leadIds.includes(p.leadId));
      db.moveIn = db.moveIn.filter((m) => !leadIds.includes(m.leadId));
      db.activity = db.activity.filter((a) => !leadIds.includes(a.leadId));
      void homeIds;
      save();
    },

    async listHomes(communityId) {
      return db.homes
        .filter((h) => h.communityId === communityId)
        .sort((a, b) => a.position - b.position)
        .map((h) => shapeHome(h, photosOf(h.id), plansOf(h.id)));
    },

    async getHome(id) {
      const row = db.homes.find((h) => h.id === id);
      return row ? shapeHome(row, photosOf(id), plansOf(id)) : null;
    },

    async createHome(communityId, data) {
      const position = db.homes.filter((h) => h.communityId === communityId).length;
      const row = { id: `h_${shortId(10)}`, communityId, ...data, position, createdAt: now() };
      db.homes.push(row);
      save();
      return shapeHome(row, [], []);
    },

    async updateHome(id, patch) {
      const row = db.homes.find((h) => h.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'price', 'beds', 'baths', 'sqft', 'description', 'availability',
        'lotNumber', 'readyOn', 'position',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      save();
      return shapeHome(row, photosOf(id), plansOf(id));
    },

    async deleteHome(id) {
      db.homes = db.homes.filter((h) => h.id !== id);
      db.photos = db.photos.filter((p) => p.homeId !== id);
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

    async deleteHighlight(id) {
      db.highlights = db.highlights.filter((h) => h.id !== id);
      db.photos = db.photos.filter((p) => p.highlightId !== id);
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
      communityId, homeId = null, highlightId = null, kind = 'home',
      contentType = null, data = null, url = null,
    }) {
      const position = db.photos.filter((p) => p.communityId === communityId && p.homeId === homeId).length;
      const row = {
        id: `p_${shortId(12)}`, communityId, homeId, highlightId, kind,
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

    async listCommunityPhotos(communityId, kind) {
      return db.photos
        .filter((p) => p.communityId === communityId && p.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map(shapePhoto);
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
          ...shapeLead(l, { plan: planOf(l.id), moveIn: moveInOf(l.id) }),
          activityCount: db.activity.filter((a) => a.leadId === l.id).length,
        }));
    },

    async getLead(id) {
      const row = db.leads.find((l) => l.id === id);
      return row ? shapeLead(row, { plan: planOf(id), activity: activityOf(id), moveIn: moveInOf(id) }) : null;
    },

    async findLeadByIdentity(communityId, input) {
      const row = db.leads.find((l) => l.communityId === communityId && isSameLead(l, input));
      return row ? shapeLead(row, { plan: planOf(row.id), activity: activityOf(row.id), moveIn: moveInOf(row.id) }) : null;
    },

    async createLead(communityId, { name, email, phone }) {
      const row = {
        id: `l_${shortId(12)}`, communityId, name, email, phone,
        status: 'new', notes: '', tour: null, savedHomeIds: [],
        firstVisitAt: now(), updatedAt: now(),
      };
      db.leads.push(row);
      save();
      return shapeLead(row, {});
    },

    async updateLead(id, patch) {
      const row = db.leads.find((l) => l.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'phone', 'status', 'notes', 'tour', 'savedHomeIds', 'openedAt', 'archivedAt',
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
