import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED } from '../../shared/domain.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import {
  shapeCommunity, shapeHighlight, shapeHome, shapeLead, shapePhoto, shapeSlot,
} from './shape.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createPostgresStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    // Render's managed Postgres terminates TLS with its own CA; the client still
    // encrypts, it just doesn't pin the chain.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 8,
  });
  const q = (text, params) => pool.query(text, params);

  /**
   * A home's images, split by kind: the gallery buyers swipe through, and the
   * floor plans. Both hang off home_id, so anything reading photos has to say
   * which it wants or it gets plan drawings in the photo carousel.
   */
  const photosFor = async (homeIds) => {
    const byHome = new Map(homeIds.map((id) => [id, { photos: [], floorPlans: [] }]));
    if (!homeIds.length) return byHome;
    const { rows } = await q(
      `SELECT * FROM photos WHERE home_id = ANY($1::text[]) ORDER BY position, created_at`,
      [homeIds],
    );
    for (const row of rows) {
      const entry = byHome.get(row.home_id);
      if (!entry) continue;
      (row.kind === 'floorplan' ? entry.floorPlans : entry.photos).push(shapePhoto(row));
    }
    return byHome;
  };
  const EMPTY_IMAGES = { photos: [], floorPlans: [] };

  const planFor = async (leadId) => {
    const { rows } = await q(`SELECT key, summary FROM lead_plan_items WHERE lead_id = $1`, [leadId]);
    return Object.fromEntries(rows.map((r) => [r.key, r.summary]));
  };

  const activityFor = async (leadId, limit = 200) => {
    const { rows } = await q(
      `SELECT text, created_at FROM lead_activity WHERE lead_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [leadId, limit],
    );
    return rows.map((r) => ({ text: r.text, createdAt: r.created_at }));
  };

  return {
    kind: 'postgres',

    async init() {
      await q(readFileSync(join(here, 'schema.sql'), 'utf8'));
    },

    async close() {
      await pool.end();
    },

    // ── admins ───────────────────────────────────────────────────────────
    async countAdmins() {
      const { rows } = await q(`SELECT count(*)::int AS n FROM admin_users`);
      return rows[0].n;
    },
    async firstAdminEmail() {
      const { rows } = await q(`SELECT email FROM admin_users ORDER BY created_at LIMIT 1`);
      return rows[0]?.email ?? null;
    },

    async getAdminByEmail(email) {
      const { rows } = await q(`SELECT * FROM admin_users WHERE lower(email) = lower($1)`, [email]);
      return rows[0] || null;
    },
    async createAdmin({ email, passwordHash }) {
      const { rows } = await q(
        `INSERT INTO admin_users (id, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
         RETURNING *`,
        [uuid(), email, passwordHash],
      );
      return rows[0];
    },

    // ── communities ──────────────────────────────────────────────────────
    async listCommunities() {
      const { rows } = await q(`
        SELECT c.*,
               (SELECT count(*)::int FROM homes h WHERE h.community_id = c.id) AS homes_count,
               (SELECT count(*)::int FROM leads l WHERE l.community_id = c.id) AS leads_count,
               (SELECT count(*)::int FROM leads l
                 WHERE l.community_id = c.id
                   AND l.tour IS NOT NULL
                   AND (l.tour->>'handledAt') IS NULL) AS pending_tours
        FROM communities c ORDER BY c.created_at`);
      return rows.map((r) =>
        shapeCommunity(r, {
          homesCount: r.homes_count,
          leadsCount: r.leads_count,
          pendingTours: r.pending_tours,
        }),
      );
    },

    async getCommunity(id) {
      const { rows } = await q(`SELECT * FROM communities WHERE id = $1`, [id]);
      return shapeCommunity(rows[0]);
    },

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = 'modern', builder = '' }) {
      const id = slugId(name);
      const { rows } = await q(
        `INSERT INTO communities (id, name, location, status, theme, builder, settings, tools)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, name, location, status, theme, builder, DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED],
      );
      return shapeCommunity(rows[0]);
    },

    async updateCommunity(id, patch) {
      const map = {
        name: 'name', location: 'location', status: 'status', theme: 'theme',
        websiteUrl: 'website_url', builder: 'builder', settings: 'settings', tools: 'tools',
        features: 'features',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getCommunity(id);
      params.push(id);
      const { rows } = await q(
        `UPDATE communities SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
        params,
      );
      return shapeCommunity(rows[0]);
    },

    async deleteCommunity(id) {
      await q(`DELETE FROM communities WHERE id = $1`, [id]);
    },

    // ── homes ────────────────────────────────────────────────────────────
    async listHomes(communityId) {
      const { rows } = await q(
        `SELECT * FROM homes WHERE community_id = $1 ORDER BY position, created_at`, [communityId],
      );
      const byHome = await photosFor(rows.map((r) => r.id));
      return rows.map((r) => {
        const images = byHome.get(r.id) || EMPTY_IMAGES;
        return shapeHome(r, images.photos, images.floorPlans);
      });
    },

    async getHome(id) {
      const { rows } = await q(`SELECT * FROM homes WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      const images = (await photosFor([id])).get(id) || EMPTY_IMAGES;
      return shapeHome(rows[0], images.photos, images.floorPlans);
    },

    async createHome(communityId, data) {
      const { rows: posRows } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM homes WHERE community_id = $1`, [communityId],
      );
      const { rows } = await q(
        `INSERT INTO homes (id, community_id, name, price, beds, baths, sqft, description,
                            availability, lot_number, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [`h_${shortId(10)}`, communityId, data.name, data.price, data.beds, data.baths, data.sqft,
          data.description, data.availability, data.lotNumber ?? '', posRows[0].pos],
      );
      return shapeHome(rows[0], [], []);
    },

    async updateHome(id, patch) {
      const map = {
        name: 'name', price: 'price', beds: 'beds', baths: 'baths', sqft: 'sqft',
        description: 'description', availability: 'availability', lotNumber: 'lot_number',
        position: 'position',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getHome(id);
      params.push(id);
      await q(`UPDATE homes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      return this.getHome(id);
    },

    async deleteHome(id) {
      await q(`DELETE FROM homes WHERE id = $1`, [id]);
    },

    // ── photos ───────────────────────────────────────────────────────────
    async countHomePhotos(homeId) {
      // Gallery photos only — floor plans are not part of the per-home photo limit.
      const { rows } = await q(
        `SELECT count(*)::int AS n FROM photos WHERE home_id = $1 AND kind <> 'floorplan'`, [homeId],
      );
      return rows[0].n;
    },

    async addPhoto({
      communityId, homeId = null, highlightId = null, kind = 'home',
      contentType = null, data = null, url = null,
    }) {
      const { rows: posRows } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM photos WHERE community_id = $1 AND coalesce(home_id,'') = coalesce($2,'')`,
        [communityId, homeId],
      );
      const { rows } = await q(
        `INSERT INTO photos (id, community_id, home_id, highlight_id, kind, content_type, data, url, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [`p_${shortId(12)}`, communityId, homeId, highlightId, kind, contentType, data, url, posRows[0].pos],
      );
      return shapePhoto(rows[0]);
    },

    async getPhotoData(id) {
      const { rows } = await q(`SELECT id, content_type, data, url FROM photos WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async deletePhoto(id) {
      await q(`DELETE FROM photos WHERE id = $1`, [id]);
    },

    async listHomePhotosOfKind(homeId, kind) {
      const { rows } = await q(
        `SELECT * FROM photos WHERE home_id = $1 AND kind = $2 ORDER BY position, created_at`,
        [homeId, kind],
      );
      return rows.map(shapePhoto);
    },

    async listHighlightPhotos(highlightId) {
      const { rows } = await q(`SELECT * FROM photos WHERE highlight_id = $1`, [highlightId]);
      return rows.map(shapePhoto);
    },

    async listCommunityPhotos(communityId, kind) {
      const { rows } = await q(
        `SELECT * FROM photos WHERE community_id = $1 AND kind = $2 ORDER BY position, created_at`,
        [communityId, kind],
      );
      return rows.map(shapePhoto);
    },

    // ── area highlights ──────────────────────────────────────────────────
    async listHighlights(communityId) {
      const { rows } = await q(
        `SELECT h.*, p.id AS photo_id, p.url AS photo_url
           FROM highlights h
           LEFT JOIN LATERAL (
             SELECT id, url FROM photos WHERE highlight_id = h.id ORDER BY created_at LIMIT 1
           ) p ON true
          WHERE h.community_id = $1
          ORDER BY h.position, h.created_at`,
        [communityId],
      );
      return rows.map((r) =>
        shapeHighlight(r, r.photo_id ? shapePhoto({ id: r.photo_id, url: r.photo_url }) : null),
      );
    },

    async getHighlight(id) {
      const { rows } = await q(`SELECT * FROM highlights WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      const { rows: pics } = await q(
        `SELECT * FROM photos WHERE highlight_id = $1 ORDER BY created_at LIMIT 1`, [id],
      );
      return shapeHighlight(rows[0], pics[0] ? shapePhoto(pics[0]) : null);
    },

    async createHighlight(communityId, data) {
      const { rows: pos } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM highlights WHERE community_id = $1`,
        [communityId],
      );
      const { rows } = await q(
        `INSERT INTO highlights (id, community_id, category, name, description, detail, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [`g_${shortId(10)}`, communityId, data.category, data.name, data.description, data.detail, pos[0].pos],
      );
      return shapeHighlight(rows[0], null);
    },

    async updateHighlight(id, patch) {
      const map = {
        category: 'category', name: 'name', description: 'description',
        detail: 'detail', position: 'position',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getHighlight(id);
      params.push(id);
      await q(`UPDATE highlights SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      return this.getHighlight(id);
    },

    async deleteHighlight(id) {
      await q(`DELETE FROM photos WHERE highlight_id = $1`, [id]);
      await q(`DELETE FROM highlights WHERE id = $1`, [id]);
    },

    // ── appointment slots ────────────────────────────────────────────────
    async listSlots(communityId) {
      const { rows } = await q(
        `SELECT * FROM slots WHERE community_id = $1 ORDER BY slot_date, slot_time`, [communityId],
      );
      return rows.map(shapeSlot);
    },

    /** What a buyer may choose: unbooked, and not in the past. */
    async listOpenSlots(communityId) {
      const { rows } = await q(
        `SELECT * FROM slots
          WHERE community_id = $1 AND lead_id IS NULL AND slot_date >= CURRENT_DATE
          ORDER BY slot_date, slot_time`,
        [communityId],
      );
      return rows.map(shapeSlot);
    },

    /** Every date x time combination at once. Re-adding an existing one is a no-op. */
    async createSlots(communityId, dates, times) {
      const values = [];
      const params = [communityId];
      for (const date of dates) {
        for (const time of times) {
          params.push(`s_${shortId(10)}`, date, time);
          values.push(`($${params.length - 2}, $1, $${params.length - 1}, $${params.length})`);
        }
      }
      if (!values.length) return [];
      const { rows } = await q(
        `INSERT INTO slots (id, community_id, slot_date, slot_time)
         VALUES ${values.join(', ')}
         ON CONFLICT (community_id, slot_date, slot_time) DO NOTHING
         RETURNING *`,
        params,
      );
      return rows.map(shapeSlot);
    },

    async getSlot(id) {
      const { rows } = await q(`SELECT * FROM slots WHERE id = $1`, [id]);
      return rows[0] ? shapeSlot(rows[0]) : null;
    },

    async deleteSlot(id) {
      await q(`DELETE FROM slots WHERE id = $1`, [id]);
    },

    /**
     * Claims a slot for a lead, or returns null if somebody got there first.
     * The `lead_id IS NULL` guard is inside the UPDATE on purpose: checking and
     * then writing would leave a window for two buyers to book the same time.
     */
    async bookSlot(slotId, leadId) {
      const { rows } = await q(
        `UPDATE slots SET lead_id = $2
          WHERE id = $1 AND (lead_id IS NULL OR lead_id = $2)
          RETURNING *`,
        [slotId, leadId],
      );
      return rows[0] ? shapeSlot(rows[0]) : null;
    },

    /** Frees whatever this lead held, so changing an appointment reopens the old one. */
    async releaseSlotsForLead(leadId, exceptSlotId = null) {
      await q(
        `UPDATE slots SET lead_id = NULL WHERE lead_id = $1 AND ($2::text IS NULL OR id <> $2)`,
        [leadId, exceptSlotId],
      );
    },

    // ── leads ────────────────────────────────────────────────────────────
    async listLeads(communityId) {
      const { rows } = await q(
        `SELECT l.*,
                (SELECT count(*)::int FROM lead_activity a WHERE a.lead_id = l.id) AS activity_count,
                (SELECT coalesce(json_object_agg(key, summary), '{}'::json)
                   FROM lead_plan_items p WHERE p.lead_id = l.id) AS plan
         FROM leads l WHERE l.community_id = $1 ORDER BY l.first_visit_at`,
        [communityId],
      );
      return rows.map((r) => ({ ...shapeLead(r, { plan: r.plan || {} }), activityCount: r.activity_count }));
    },

    async getLead(id) {
      const { rows } = await q(`SELECT * FROM leads WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      return shapeLead(rows[0], { plan: await planFor(id), activity: await activityFor(id) });
    },

    async findLeadByEmail(communityId, email) {
      const { rows } = await q(
        `SELECT * FROM leads WHERE community_id = $1 AND lower(email) = lower($2)`, [communityId, email],
      );
      if (!rows[0]) return null;
      return shapeLead(rows[0], { plan: await planFor(rows[0].id), activity: await activityFor(rows[0].id) });
    },

    async createLead(communityId, { name, email, phone }) {
      const { rows } = await q(
        `INSERT INTO leads (id, community_id, name, email, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [`l_${shortId(12)}`, communityId, name, email, phone],
      );
      return shapeLead(rows[0], {});
    },

    async updateLead(id, patch) {
      const map = {
        name: 'name', phone: 'phone', status: 'status', notes: 'notes',
        tour: 'tour', savedHomeIds: 'saved_home_ids',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(key === 'savedHomeIds' || key === 'tour' ? JSON.stringify(patch[key]) : patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getLead(id);
      params.push(id);
      await q(`UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
      return this.getLead(id);
    },

    async upsertPlanItem(leadId, key, summary) {
      await q(
        `INSERT INTO lead_plan_items (lead_id, key, summary) VALUES ($1,$2,$3)
         ON CONFLICT (lead_id, key) DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()`,
        [leadId, key, summary],
      );
    },

    async addActivity(leadId, text) {
      await q(`INSERT INTO lead_activity (lead_id, text) VALUES ($1,$2)`, [leadId, text]);
    },
  };
}
