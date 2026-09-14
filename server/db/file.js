import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED } from '../../shared/domain.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import { shapeCommunity, shapeHome, shapeLead, shapePhoto } from './shape.js';

const EMPTY = { admins: [], communities: [], homes: [], photos: [], leads: [], planItems: [], activity: [] };

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
  const photosOf = (homeId) =>
    db.photos.filter((p) => p.homeId === homeId).sort((a, b) => a.position - b.position).map(shapePhoto);
  const planOf = (leadId) =>
    Object.fromEntries(db.planItems.filter((p) => p.leadId === leadId).map((p) => [p.key, p.summary]));
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
        }),
      );
    },

    async getCommunity(id) {
      return shapeCommunity(db.communities.find((c) => c.id === id));
    },

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = 'classic', builder = '' }) {
      const row = {
        id: slugId(name), name, location, status, theme, builder,
        websiteUrl: null,
        settings: { ...DEFAULT_SETTINGS },
        tools: { ...DEFAULT_TOOLS_ENABLED },
        createdAt: now(), updatedAt: now(),
      };
      db.communities.push(row);
      save();
      return shapeCommunity(row);
    },

    async updateCommunity(id, patch) {
      const row = db.communities.find((c) => c.id === id);
      if (!row) return null;
      for (const key of ['name', 'location', 'status', 'theme', 'websiteUrl', 'builder', 'settings', 'tools']) {
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
      db.photos = db.photos.filter((p) => p.communityId !== id);
      db.leads = db.leads.filter((l) => l.communityId !== id);
      db.planItems = db.planItems.filter((p) => !leadIds.includes(p.leadId));
      db.activity = db.activity.filter((a) => !leadIds.includes(a.leadId));
      void homeIds;
      save();
    },

    async listHomes(communityId) {
      return db.homes
        .filter((h) => h.communityId === communityId)
        .sort((a, b) => a.position - b.position)
        .map((h) => shapeHome(h, photosOf(h.id)));
    },

    async getHome(id) {
      const row = db.homes.find((h) => h.id === id);
      return row ? shapeHome(row, photosOf(id)) : null;
    },

    async createHome(communityId, data) {
      const position = db.homes.filter((h) => h.communityId === communityId).length;
      const row = { id: `h_${shortId(10)}`, communityId, ...data, position, createdAt: now() };
      db.homes.push(row);
      save();
      return shapeHome(row, []);
    },

    async updateHome(id, patch) {
      const row = db.homes.find((h) => h.id === id);
      if (!row) return null;
      for (const key of ['name', 'price', 'beds', 'baths', 'sqft', 'description', 'availability', 'position']) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      save();
      return shapeHome(row, photosOf(id));
    },

    async deleteHome(id) {
      db.homes = db.homes.filter((h) => h.id !== id);
      db.photos = db.photos.filter((p) => p.homeId !== id);
      save();
    },

    async countHomePhotos(homeId) {
      return db.photos.filter((p) => p.homeId === homeId).length;
    },

    async addPhoto({ communityId, homeId = null, kind = 'home', contentType = null, data = null, url = null }) {
      const position = db.photos.filter((p) => p.communityId === communityId && p.homeId === homeId).length;
      const row = {
        id: `p_${shortId(12)}`, communityId, homeId, kind,
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

    async listLeads(communityId) {
      return db.leads
        .filter((l) => l.communityId === communityId)
        .map((l) => ({
          ...shapeLead(l, { plan: planOf(l.id) }),
          activityCount: db.activity.filter((a) => a.leadId === l.id).length,
        }));
    },

    async getLead(id) {
      const row = db.leads.find((l) => l.id === id);
      return row ? shapeLead(row, { plan: planOf(id), activity: activityOf(id) }) : null;
    },

    async findLeadByEmail(communityId, email) {
      const row = db.leads.find(
        (l) => l.communityId === communityId && l.email.toLowerCase() === String(email).toLowerCase(),
      );
      return row ? shapeLead(row, { plan: planOf(row.id), activity: activityOf(row.id) }) : null;
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
      for (const key of ['name', 'phone', 'status', 'notes', 'tour', 'savedHomeIds']) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      row.updatedAt = now();
      save();
      return shapeLead(row, { plan: planOf(id), activity: activityOf(id) });
    },

    async upsertPlanItem(leadId, key, summary) {
      const existing = db.planItems.find((p) => p.leadId === leadId && p.key === key);
      if (existing) existing.summary = summary;
      else db.planItems.push({ leadId, key, summary, updatedAt: now() });
      save();
    },

    async addActivity(leadId, text) {
      db.activity.push({ leadId, text, createdAt: now() });
      save();
    },
  };
}
