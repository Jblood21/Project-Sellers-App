import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  communitySlugCandidates, DEFAULT_FEATURES, DEFAULT_LAYOUT, DEFAULT_SETTINGS, DEFAULT_THEME,
  DEFAULT_TOOLS_ENABLED, isoDate, isSameLead, LISTING_FEATURES, LISTING_LAYOUT, LISTING_SETTINGS, LISTING_TOOLS, toolOfActivity,
} from '../../shared/domain.js';
import { loadDefaultGuides } from '../lib/guides.js';
import { FIGURES_REFRESH, needsRefresh, refreshedSettings } from './refresh.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import {
  guideRowFromDefault, shapeAdminActivity, shapeAgent, shapeBranch, shapeCommunity, shapeGuide, shapeHighlight, shapeHome,
  shapeLead, shapeMoveIn, shapePasswordReset, shapePhoto, shapeResource, shapeSlot, shapeConsent, uniqueSlug,
} from './shape.js';

const EMPTY = {
  admins: [], communities: [], homes: [], highlights: [], photos: [], resources: [],
  homeVideos: [], slots: [], leads: [], planItems: [], moveIn: [], activity: [],
  consents: [], agents: [], guides: [], communitySlugs: [], passwordResets: [],
  adminCommunities: [], adminActivity: [], branches: [], adminBranches: [],
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
    // Activity written before each line carried the tool it belongs to: tag it, so what people did before still
    // counts as the use of a tool (the Postgres store does the same when it starts).
    let tagged = false;
    for (const action of db.activity) {
      if (action.tool === undefined) {
        action.tool = toolOfActivity(action.text);
        tagged = true;
      }
    }
    // An account from before roles existed is a member, as the Postgres column's default makes it; ensureAdmin
    // (server/index.js) then makes the ADMIN_EMAIL account, or failing that the oldest one, the owner.
    for (const admin of db.admins) {
      if (admin.role === undefined) {
        admin.role = 'member';
        tagged = true;
      }
    }
    if (tagged) save();
    lastActivityAt = db.adminActivity.reduce((last, row) => (row.createdAt > last ? row.createdAt : last), '');
  };

  // The activity log is paged by created_at, so no two rows may share a stamp: the page's cursor is the last
  // row's, and a twin of it would fall between two pages. Rows written within one millisecond (a test, a fast
  // hand) take the next millisecond instead. Postgres keeps microseconds and needs no such help.
  let lastActivityAt = '';
  const activityStamp = () => {
    let at = now();
    if (at <= lastActivityAt) at = new Date(new Date(lastActivityAt).getTime() + 1).toISOString();
    lastActivityAt = at;
    return at;
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
  const addMissingDefaults = (communityId, kind) => {
    // Which set: a listing's own (buying a single-family home) or a community's. Asked of the row when not said.
    kind ??= db.communities.find((c) => c.id === communityId)?.settings?.siteKind === 'listing' ? 'listing' : 'community';
    const have = db.guides.filter((g) => g.communityId === communityId);
    const taken = new Set(have.map((g) => g.slug));
    const keys = new Set(have.map((g) => g.defaultKey).filter(Boolean));
    let position = have.reduce((max, g) => Math.max(max, g.position), -1) + 1;
    const added = [];
    for (const def of loadDefaultGuides(kind)) {
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
  /** How many times each tool was opened or worked in, per lead, from the activity log: Map(leadId -> { payment: 3 }). */
  const toolUsesIndex = () => {
    const byLead = new Map();
    for (const action of db.activity) {
      if (!action.tool) continue;
      const counts = byLead.get(action.leadId) ?? {};
      counts[action.tool] = (counts[action.tool] ?? 0) + 1;
      byLead.set(action.leadId, counts);
    }
    return byLead;
  };
  const toolUsesOf = (leadId) => toolUsesIndex().get(leadId) ?? {};
  const activityOf = (leadId, limit = 200) =>
    db.activity
      .filter((a) => a.leadId === leadId)
      .slice(-limit)
      .reverse()
      .map((a) => ({ text: a.text, createdAt: a.createdAt }));
  // Admins oldest first, then by address: the order the Postgres store lists them in.
  const byAdminAge = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.email.localeCompare(b.email));

  // ── branches ─────────────────────────────────────────────────────────────
  // Name order, as the Postgres store lists them: lower-cased and compared by code unit, which is what its
  // COLLATE "C" does, so the two stores put "Ivory" and "ivy homes" in the same place.
  const byBranchName = (a, b) => {
    const [x, y] = [a.name.toLowerCase(), b.name.toLowerCase()];
    if (x !== y) return x < y ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const branchRows = () => [...db.branches].sort(byBranchName);
  const branchNameOf = (branchId) => (branchId ? db.branches.find((b) => b.id === branchId)?.name ?? null : null);
  // A community with the name of its branch beside the id, as the Postgres store's join supplies it. A row from
  // before branches has no branchId at all, which shapeCommunity reads as none.
  const communityOf = (row, extra = {}) => shapeCommunity(row, { branchName: branchNameOf(row?.branchId), ...extra });
  const communityIdsIn = (branchId) => db.communities.filter((c) => c.branchId === branchId).map((c) => c.id);
  const memberIdsIn = (branchId) => {
    const inBranch = new Set(db.adminBranches.filter((r) => r.branchId === branchId).map((r) => r.adminId));
    return [...db.admins].sort(byAdminAge).filter((a) => inBranch.has(a.id)).map((a) => a.id);
  };
  const branchOf = (row) => (row ? shapeBranch(row, { communityIds: communityIdsIn(row.id), memberIds: memberIdsIn(row.id) }) : null);
  // The same error pg raises for a second branch with the same name in any case (the unique index on
  // lower(name)), so the route has one thing to catch whichever store is running.
  const duplicateBranchName = () => Object.assign(new Error('duplicate branch name'), { code: '23505' });
  const branchNameUsed = (name, exceptId = null) =>
    db.branches.some((b) => b.id !== exceptId && b.name.toLowerCase() === String(name).toLowerCase());

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
      await this.applyFiguresRefresh(FIGURES_REFRESH);
    },

    /** Brings every community not yet at `refresh.version` up to it; see refresh.js and the Postgres store. */
    async applyFiguresRefresh(refresh) {
      const done = [];
      const guides = refresh.guides ? loadDefaultGuides() : [];
      for (const community of db.communities) {
        if (!needsRefresh(community.figuresVersion, refresh.version)) continue;
        community.settings = refreshedSettings(community, refresh);
        community.figuresVersion = refresh.version;
        community.updatedAt = now();
        for (const def of guides) {
          const g = guideRowFromDefault(def, def.slug, 0);
          for (const row of db.guides) {
            if (row.communityId !== community.id || row.defaultKey !== def.defaultKey) continue;
            Object.assign(row, { summary: g.summary, body: g.body, updatedAt: now() });
          }
        }
        done.push(community.id);
      }
      if (done.length) save();
      return done;
    },

    async close() {},

    async countAdmins() {
      return db.admins.length;
    },
    async firstAdminEmail() {
      return db.admins[0]?.email ?? null;
    },
    /** Every admin, oldest first, as the Postgres store orders them. Copies, so a caller cannot edit the file through them. */
    async listAdmins() {
      return [...db.admins].sort(byAdminAge).map((admin) => ({ ...admin }));
    },

    async getAdminByEmail(email) {
      return db.admins.find((a) => a.email.toLowerCase() === String(email).toLowerCase()) || null;
    },
    async getAdminById(id) {
      return db.admins.find((a) => a.id === id) || null;
    },
    /** A new account, or the password and marks of one that exists; see the Postgres store. */
    async createAdmin({ email, passwordHash, bootPasswordHash = null, invitedAt = null, role = null }) {
      const stamp = invitedAt ? new Date(invitedAt).toISOString() : null;
      const existing = await this.getAdminByEmail(email);
      if (existing) {
        existing.password_hash = passwordHash;
        existing.boot_password_hash = bootPasswordHash;
        existing.invited_at = stamp;
        if (role) existing.role = role;
        save();
        return existing;
      }
      const admin = {
        id: uuid(), email, password_hash: passwordHash, password_changed_at: null, boot_password_hash: bootPasswordHash,
        invited_at: stamp, role: role ?? 'member', created_at: now(),
      };
      db.admins.push(admin);
      save();
      return admin;
    },
    /** Changes what is given and nothing else; see the Postgres store. The row, or null. */
    async updateAdmin(id, { passwordHash, passwordChangedAt, bootPasswordHash, invitedAt, role, profile } = {}) {
      const admin = await this.getAdminById(id);
      if (!admin) return null;
      if (passwordHash !== undefined) admin.password_hash = passwordHash;
      // Kept as the ISO string every other stamp in this file is, whatever the caller handed over.
      if (passwordChangedAt !== undefined) admin.password_changed_at = passwordChangedAt ? new Date(passwordChangedAt).toISOString() : null;
      if (bootPasswordHash !== undefined) admin.boot_password_hash = bootPasswordHash;
      if (invitedAt !== undefined) admin.invited_at = invitedAt ? new Date(invitedAt).toISOString() : null;
      if (role !== undefined) admin.role = role;
      if (profile !== undefined) admin.profile = profile;
      save();
      return admin;
    },
    /**
     * Removes the account, its reset links, its community assignments and its branch memberships, as the Postgres
     * tables' cascades do, unless it is the last one: the count and the removal have no pause between them, so two
     * removals at once cannot both get past the count. What they did stays in the activity log under their
     * address, as it does in Postgres, where that table has no foreign key to this one. True when the row was
     * deleted; false when it was the last one, or was not there.
     */
    async deleteAdmin(id) {
      if (db.admins.length <= 1) return false;
      const before = db.admins.length;
      db.admins = db.admins.filter((a) => a.id !== id);
      if (db.admins.length === before) return false;
      db.passwordResets = db.passwordResets.filter((r) => r.adminId !== id);
      db.adminCommunities = db.adminCommunities.filter((r) => r.adminId !== id);
      db.adminBranches = db.adminBranches.filter((r) => r.adminId !== id);
      save();
      return true;
    },

    // ── which communities a member may see ───────────────────────────────
    // The owner has every community by role and is never listed here; see the Postgres store.
    // In the order the communities were made, as the Postgres store lists them.
    async listAdminCommunities(adminId) {
      const mine = new Set(db.adminCommunities.filter((r) => r.adminId === adminId).map((r) => r.communityId));
      return db.communities.filter((c) => mine.has(c.id)).map((c) => c.id);
    },
    async listAdminAssignments() {
      const order = new Map(db.communities.map((c, index) => [c.id, index]));
      return db.adminCommunities
        .filter((r) => order.has(r.communityId))
        .sort((a, b) => order.get(a.communityId) - order.get(b.communityId))
        .map((r) => ({ adminId: r.adminId, communityId: r.communityId }));
    },
    /** Gives one community to one admin without touching what else they hold (see the Postgres store). */
    async addAdminCommunity(adminId, communityId) {
      if (!db.communities.some((c) => c.id === communityId)) return false;
      if (!db.adminCommunities.some((r) => r.adminId === adminId && r.communityId === communityId)) {
        db.adminCommunities.push({ adminId, communityId, createdAt: now() });
        save();
      }
      return true;
    },
    /** Replaces the whole list; an id with no community is dropped. Returns the ids kept. See the Postgres store. */
    async setAdminCommunities(adminId, communityIds) {
      const known = new Set(db.communities.map((c) => c.id));
      const kept = [...new Set(communityIds)].filter((id) => known.has(id));
      db.adminCommunities = db.adminCommunities.filter((r) => r.adminId !== adminId);
      for (const communityId of kept) db.adminCommunities.push({ adminId, communityId, createdAt: now() });
      save();
      return this.listAdminCommunities(adminId);
    },

    // ── branches: companies or groups of communities ─────────────────────
    // See the Postgres store and branches in schema.sql; what its cascades do is done by hand in deleteBranch.
    async listBranches() {
      return branchRows().map(branchOf);
    },
    async getBranch(id) {
      return branchOf(db.branches.find((b) => b.id === id));
    },
    async getBranchByName(name) {
      const lower = String(name).toLowerCase();
      return branchOf(db.branches.find((b) => b.name.toLowerCase() === lower));
    },
    async createBranch({ name }) {
      if (branchNameUsed(name)) throw duplicateBranchName();
      const row = { id: `br_${shortId(10)}`, name, createdAt: now() };
      db.branches.push(row);
      save();
      return branchOf(row);
    },
    async updateBranch(id, { name } = {}) {
      const row = db.branches.find((b) => b.id === id);
      if (!row) return null;
      if (name !== undefined) {
        if (branchNameUsed(name, id)) throw duplicateBranchName();
        row.name = name;
      }
      save();
      return branchOf(row);
    },
    async deleteBranch(id) {
      const before = db.branches.length;
      db.branches = db.branches.filter((b) => b.id !== id);
      if (db.branches.length === before) return false;
      // What Postgres does by ON DELETE SET NULL and ON DELETE CASCADE: the communities stay, in no branch, and
      // the people stay, out of it.
      for (const community of db.communities) if (community.branchId === id) community.branchId = null;
      db.adminBranches = db.adminBranches.filter((r) => r.branchId !== id);
      save();
      return true;
    },
    /** Replaces the whole list; a community ticked here leaves the branch it was in, one unticked is left in none. See the Postgres store. */
    async setBranchCommunities(branchId, communityIds) {
      if (!db.branches.some((b) => b.id === branchId)) return null;
      const wanted = new Set(communityIds);
      for (const community of db.communities) {
        if (wanted.has(community.id)) community.branchId = branchId;
        else if (community.branchId === branchId) community.branchId = null;
      }
      save();
      return communityIdsIn(branchId);
    },
    /** Replaces the whole list, members only; an owner's or unknown id is dropped. See the Postgres store. */
    async setBranchMembers(branchId, adminIds) {
      if (!db.branches.some((b) => b.id === branchId)) return null;
      const wanted = new Set(adminIds);
      db.adminBranches = db.adminBranches.filter((r) => r.branchId !== branchId);
      for (const admin of db.admins) {
        if (wanted.has(admin.id) && admin.role !== 'owner') db.adminBranches.push({ adminId: admin.id, branchId, createdAt: now() });
      }
      save();
      return memberIdsIn(branchId);
    },
    async listAdminBranches(adminId) {
      const mine = new Set(db.adminBranches.filter((r) => r.adminId === adminId).map((r) => r.branchId));
      return branchRows().filter((b) => mine.has(b.id)).map((b) => b.id);
    },
    async listAdminBranchAssignments() {
      const order = new Map(branchRows().map((b, index) => [b.id, index]));
      return db.adminBranches
        .filter((r) => order.has(r.branchId))
        .sort((a, b) => order.get(a.branchId) - order.get(b.branchId))
        .map((r) => ({ adminId: r.adminId, branchId: r.branchId }));
    },
    async setAdminBranches(adminId, branchIds) {
      const known = new Set(db.branches.map((b) => b.id));
      const kept = [...new Set(branchIds)].filter((id) => known.has(id));
      db.adminBranches = db.adminBranches.filter((r) => r.adminId !== adminId);
      for (const branchId of kept) db.adminBranches.push({ adminId, branchId, createdAt: now() });
      save();
      return this.listAdminBranches(adminId);
    },
    /** The union of the admin's branches' communities and their own, in the order the communities were made. See the Postgres store. */
    async listAccessibleCommunities(adminId) {
      const own = new Set(db.adminCommunities.filter((r) => r.adminId === adminId).map((r) => r.communityId));
      const branches = new Set(db.adminBranches.filter((r) => r.adminId === adminId).map((r) => r.branchId));
      return db.communities.filter((c) => own.has(c.id) || (c.branchId && branches.has(c.branchId))).map((c) => c.id);
    },

    // ── what each admin did ──────────────────────────────────────────────
    // One row per change made through the admin; see admin_activity in schema.sql for why rows outlive both the
    // admin and the community they name (deleteAdmin leaves them; deleteCommunity blanks communityId).
    async addAdminActivity({ adminId, adminEmail, communityId = null, action, subject = '', detail = '' }) {
      const row = {
        id: `act_${shortId(12)}`, adminId, adminEmail: adminEmail ?? '', communityId, action, subject, detail, createdAt: activityStamp(),
      };
      db.adminActivity.push(row);
      save();
      return shapeAdminActivity({ ...row, communityName: db.communities.find((c) => c.id === communityId)?.name ?? null });
    },
    async listAdminActivity({ adminId = null, communityId = null, before = null, limit = 50 } = {}) {
      const cutoff = before ? new Date(before).getTime() : Infinity;
      const names = new Map(db.communities.map((c) => [c.id, c.name]));
      return db.adminActivity
        .filter((row) => (!adminId || row.adminId === adminId) && (!communityId || row.communityId === communityId)
          && new Date(row.createdAt).getTime() < cutoff)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)))
        .slice(0, limit)
        .map((row) => shapeAdminActivity({ ...row, communityName: names.get(row.communityId) ?? null }));
    },

    // ── password reset links ─────────────────────────────────────────────
    // Only the hash of a link's token is ever kept; see admin_password_resets in schema.sql.
    async createPasswordReset({ adminId, tokenHash, expiresAt }) {
      db.passwordResets = db.passwordResets.filter((r) => r.adminId !== adminId);
      const row = {
        id: `pr_${shortId(12)}`, adminId, tokenHash, expiresAt: new Date(expiresAt).toISOString(), usedAt: null, createdAt: now(),
      };
      db.passwordResets.push(row);
      save();
      return shapePasswordReset(row);
    },
    async getPasswordReset(tokenHash) {
      return shapePasswordReset(db.passwordResets.find((r) => r.tokenHash === tokenHash) ?? null);
    },
    async usePasswordReset(id, usedAt) {
      const row = db.passwordResets.find((r) => r.id === id);
      if (!row || row.usedAt) return null;
      row.usedAt = new Date(usedAt).toISOString();
      db.passwordResets = db.passwordResets.filter((r) => r.id === id || r.adminId !== row.adminId);
      save();
      return shapePasswordReset(row);
    },

    async listCommunities() {
      return db.communities.map((c) =>
        communityOf(c, {
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
      return communityOf(db.communities.find((c) => c.id === id));
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

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = DEFAULT_THEME, builder = '', kind = 'community' }) {
      const id = slugId(name);
      // A listing starts on its own settings, tools, features, layout and guides (shared/listing.js).
      const listing = kind === 'listing';
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
        branchId: null,
        settings: listing ? { ...DEFAULT_SETTINGS, ...LISTING_SETTINGS } : { ...DEFAULT_SETTINGS },
        tools: listing ? { ...DEFAULT_TOOLS_ENABLED, ...LISTING_TOOLS } : { ...DEFAULT_TOOLS_ENABLED },
        features: listing ? { ...DEFAULT_FEATURES, ...LISTING_FEATURES } : { ...DEFAULT_FEATURES },
        layout: listing ? LISTING_LAYOUT : DEFAULT_LAYOUT,
        guidesSeeded: true,
        // Created on the current defaults, so the figures refresh that wrote them is already done for it.
        figuresVersion: FIGURES_REFRESH.version,
        createdAt: now(), updatedAt: now(),
      };
      db.communities.push(row);
      addMissingDefaults(row.id, listing ? 'listing' : 'community');
      save();
      return shapeCommunity(row);
    },

    async updateCommunity(id, patch) {
      const row = db.communities.find((c) => c.id === id);
      if (!row) return null;
      for (const key of [
        'name', 'location', 'status', 'theme', 'websiteUrl', 'builder', 'settings', 'tools', 'features',
        'layout', 'branchId',
      ]) {
        if (patch[key] !== undefined) row[key] = patch[key];
      }
      row.updatedAt = now();
      save();
      return communityOf(row);
    },

    /** Records when the last lead report went out, changing nothing else (see the Postgres store). */
    async stampReportSent(id, at) {
      const row = db.communities.find((c) => c.id === id);
      if (!row) return null;
      row.settings = { ...row.settings, reportLastSentAt: at };
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
      // Off every member's list, as the cascade does; the activity log keeps its rows and only forgets which
      // community they were about, as ON DELETE SET NULL does, so the owner can still read what was done there.
      db.adminCommunities = db.adminCommunities.filter((r) => r.communityId !== id);
      for (const row of db.adminActivity) if (row.communityId === id) row.communityId = null;
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

    /** The row without its bytes: what serving a resized copy checks on every request. */
    async getPhotoInfo(id) {
      const row = db.photos.find((p) => p.id === id);
      return row ? { id: row.id, content_type: row.content_type, url: row.url } : null;
    },

    /** Whose picture this is, for the delete route's access check and its log line; see the Postgres store. */
    async getPhotoOwner(id) {
      const row = db.photos.find((p) => p.id === id);
      if (!row) return null;
      return {
        id: row.id, communityId: row.communityId, homeId: row.homeId ?? null, highlightId: row.highlightId ?? null,
        agentId: row.agentId ?? null, guideId: row.guideId ?? null, kind: row.kind,
      };
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
      const uses = toolUsesIndex();
      return db.leads
        .filter((l) => l.communityId === communityId)
        .map((l) => ({
          ...shapeLead(l, { plan: planOf(l.id), moveIn: moveInOf(l.id), consent: consentOf(l.id), toolUses: uses.get(l.id) ?? {} }),
          activityCount: db.activity.filter((a) => a.leadId === l.id).length,
        }));
    },

    async getLead(id) {
      const row = db.leads.find((l) => l.id === id);
      return row
        ? shapeLead(row, {
          plan: planOf(id), activity: activityOf(id), moveIn: moveInOf(id), consent: consentOf(id), toolUses: toolUsesOf(id),
        })
        : null;
    },

    async findLeadByIdentity(communityId, input) {
      const row = db.leads.find((l) => l.communityId === communityId && isSameLead(l, input));
      return row
        ? shapeLead(row, {
          plan: planOf(row.id), activity: activityOf(row.id), moveIn: moveInOf(row.id),
          consent: consentOf(row.id), toolUses: toolUsesOf(row.id),
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
      // The consent answer comes back too, as it does from getLead and from the Postgres store: the admin
      // screen shows this row after a save, and "Do not call" is not a thing to print for someone who agreed.
      return shapeLead(row, {
        plan: planOf(id), activity: activityOf(id), moveIn: moveInOf(id), consent: consentOf(id), toolUses: toolUsesOf(id),
      });
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
      db.activity.push({ leadId, text, createdAt: now(), tool: toolOfActivity(text) });
      save();
    },
  };
}
