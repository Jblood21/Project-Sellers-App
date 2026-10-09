import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  communitySlugCandidates, DEFAULT_SETTINGS, DEFAULT_THEME, DEFAULT_TOOLS_ENABLED, isSameLead,
} from '../../shared/domain.js';
import { loadDefaultGuides } from '../lib/guides.js';
import { shortId, slugId, uuid } from '../lib/ids.js';
import {
  guideRowFromDefault, shapeAgent, shapeCommunity, shapeGuide, shapeHighlight, shapeHome, shapeLead,
  shapeMoveIn, shapePhoto, shapeResource, shapeSlot, shapeConsent, uniqueSlug,
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
  // A connection the database ends while the pool is only holding it idle (a restart,
  // a failover, a maintenance window) comes up as an 'error' on the pool. With no
  // listener Node treats that as an uncaught exception and the whole server exits.
  // The pool has already discarded that connection and opens a new one for the next
  // query, so there is nothing to do but say so.
  pool.on('error', (error) => {
    console.error(`[pg] an idle connection was lost: ${error.message}`);
  });
  const q = (text, params) => pool.query(text, params);

  // Every photo column but the bytes. A picture is listed on every page load
  // (logos, realtors, guide thumbnails, home galleries) only to learn its id and
  // URL, and `data` is up to 3 MB of base64 per row: selecting it would drag
  // megabytes out of Postgres to throw them away. Only getPhotoData reads it.
  const PHOTO_COLUMNS = `id, community_id, home_id, highlight_id, agent_id, guide_id, kind,
    content_type, url, position, created_at`;

  /**
   * A home's images, split by kind: the gallery buyers swipe through, and the
   * floor plans. Both hang off home_id, so anything reading photos has to say
   * which it wants or it gets plan drawings in the photo carousel.
   */
  const photosFor = async (homeIds) => {
    const byHome = new Map(homeIds.map((id) => [id, { photos: [], floorPlans: [] }]));
    if (!homeIds.length) return byHome;
    const { rows } = await q(
      `SELECT ${PHOTO_COLUMNS} FROM photos WHERE home_id = ANY($1::text[]) ORDER BY position, created_at`,
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

  /**
   * Which of these homes have a walkthrough, and how big it is.
   *
   * The column list leaves out `data` deliberately and this is the reason the
   * videos live in their own table: a home list is read on every buyer page
   * load, and selecting the file here would pull megabytes out of Postgres for
   * a shaper that only wants to know whether one exists. Only the streaming
   * route reads the bytes.
   */
  const videosFor = async (homeIds) => {
    const byHome = new Map();
    if (!homeIds.length) return byHome;
    const { rows } = await q(
      `SELECT home_id, content_type, size_bytes, created_at FROM home_videos WHERE home_id = ANY($1::text[])`,
      [homeIds],
    );
    for (const row of rows) byHome.set(row.home_id, row);
    return byHome;
  };

  const planFor = async (leadId) => {
    const { rows } = await q(`SELECT key, summary FROM lead_plan_items WHERE lead_id = $1`, [leadId]);
    return Object.fromEntries(rows.map((r) => [r.key, r.summary]));
  };

  const moveInFor = async (leadId) => {
    const { rows } = await q(`SELECT * FROM lead_movein WHERE lead_id = $1`, [leadId]);
    return shapeMoveIn(rows[0]);
  };

  /** The latest consent row for this lead, or null if they were never asked. */
  const consentFor = async (leadId) => {
    const { rows } = await q(
      `SELECT * FROM lead_consents WHERE lead_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [leadId],
    );
    return shapeConsent(rows[0] ?? null);
  };

  const activityFor = async (leadId, limit = 200) => {
    const { rows } = await q(
      `SELECT text, created_at FROM lead_activity WHERE lead_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [leadId, limit],
    );
    return rows.map((r) => ({ text: r.text, createdAt: r.created_at }));
  };


  /**
   * The first portrait and the first logo of each agent. Two rows per agent at
   * most are ever kept (uploads replace), so taking the oldest of each kind is
   * the same as taking the only one, and stays sane if a stray extra exists.
   */
  const agentImagesFor = async (agentIds) => {
    const byAgent = new Map(agentIds.map((id) => [id, { photo: null, logo: null }]));
    if (!agentIds.length) return byAgent;
    const { rows } = await q(
      `SELECT ${PHOTO_COLUMNS} FROM photos WHERE agent_id = ANY($1::text[]) ORDER BY position, created_at`,
      [agentIds],
    );
    for (const row of rows) {
      const entry = byAgent.get(row.agent_id);
      if (!entry) continue;
      if (row.kind === 'agent' && !entry.photo) entry.photo = shapePhoto(row);
      if (row.kind === 'agentlogo' && !entry.logo) entry.logo = shapePhoto(row);
    }
    return byAgent;
  };

  /** The uploaded picture for each guide, if any. A guide has at most one. */
  const guideImagesFor = async (guideIds) => {
    const byGuide = new Map();
    if (!guideIds.length) return byGuide;
    const { rows } = await q(
      `SELECT ${PHOTO_COLUMNS} FROM photos WHERE guide_id = ANY($1::text[]) ORDER BY position, created_at`,
      [guideIds],
    );
    for (const row of rows) if (!byGuide.has(row.guide_id)) byGuide.set(row.guide_id, shapePhoto(row));
    return byGuide;
  };

  // Every column but the article itself, for the same reason listResources
  // spells its columns out: a list of guides is read on every buyer page load
  // and the body is up to 60,000 characters each.
  const GUIDE_SUMMARY_COLUMNS = `id, community_id, slug, default_key, title, category, byline, note,
    summary, image, image_alt, published, position, created_at, updated_at`;

  /**
   * Copies each supplied guide this community does not already have, matched by
   * default_key so a guide the builder retitled or re-slugged still counts as
   * present. Never touches an existing row. Takes a client so callers can run it
   * inside the transaction that also sets, or relies on, `guides_seeded`.
   */
  const addMissingDefaults = async (db, communityId) => {
    const { rows: have } = await db.query(
      `SELECT slug, default_key, position FROM guides WHERE community_id = $1`, [communityId],
    );
    const taken = new Set(have.map((r) => r.slug));
    const keys = new Set(have.map((r) => r.default_key).filter(Boolean));
    let position = have.reduce((max, r) => Math.max(max, r.position), -1) + 1;
    const added = [];
    for (const def of loadDefaultGuides()) {
      if (keys.has(def.defaultKey)) continue;
      // A slug the builder has since given to a different guide is theirs, so the
      // restored one takes a suffixed address instead of colliding with it.
      const slug = uniqueSlug(def.slug, taken);
      taken.add(slug);
      added.push(await insertGuide(db, communityId, guideRowFromDefault(def, slug, position)));
      position += 1;
    }
    return added;
  };

  /** Run `fn` in a transaction on one connection, rolling back if it throws. */
  const inTransaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  const agentOf = async (row) => {
    if (!row) return null;
    const images = (await agentImagesFor([row.id])).get(row.id);
    return shapeAgent(row, images.photo, images.logo);
  };

  const guideOf = async (row) => {
    if (!row) return null;
    return shapeGuide(row, { body: true, photo: (await guideImagesFor([row.id])).get(row.id) ?? null });
  };

  /**
   * Insert one guide row. Takes a client so seeding can run inside a transaction
   * with the flag that says it happened.
   */
  const insertGuide = async (db, communityId, g) => {
    const { rows } = await db.query(
      `INSERT INTO guides (id, community_id, slug, default_key, title, category, byline, note,
                           summary, body, image, image_alt, published, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [`g_${shortId(10)}`, communityId, g.slug, g.defaultKey ?? '', g.title, g.category ?? 'Guide',
        g.byline ?? '', g.note ?? '', g.summary ?? '', g.body ?? '', g.image ?? '', g.imageAlt ?? '',
        g.published ?? true, g.position],
    );
    return rows[0];
  };

  return {
    kind: 'postgres',

    async init() {
      await q(readFileSync(join(here, 'schema.sql'), 'utf8'));
      // Every community that has never been given the supplied guides gets them
      // now: this is how communities that existed before guides shipped receive
      // them. The flag is claimed inside the same transaction as the inserts, so
      // two instances booting at once seed once, and a builder who later deletes
      // the guides is not given them back on the next boot because the flag stays
      // true. Only the restore action brings them back.
      const { rows } = await q(`SELECT id FROM communities`);
      for (const { id } of rows) {
        await inTransaction(async (db) => {
          const claimed = await db.query(
            `UPDATE communities SET guides_seeded = true WHERE id = $1 AND NOT guides_seeded RETURNING id`,
            [id],
          );
          if (claimed.rowCount) await addMissingDefaults(db, id);
        });
      }
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
                   AND (l.tour->>'handledAt') IS NULL
                   AND l.archived_at IS NULL) AS pending_tours
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

    /**
     * The community behind whatever address a visitor used: its id, the same id in other case, or
     * any slug it has ever had. Everything stored is keyed on the id, which never changes; this is
     * only how an address becomes one.
     */
    async resolveCommunity(key) {
      const text = String(key ?? '').trim().slice(0, 80);
      if (!text) return null;
      const { rows } = await q(
        `SELECT c.* FROM communities c
          WHERE c.id = $1 OR c.id = lower($1)
             OR c.id = (SELECT community_id FROM community_slugs WHERE slug = lower($1))
          ORDER BY (c.id = $1) DESC, (c.id = lower($1)) DESC
          LIMIT 1`,
        [text],
      );
      return shapeCommunity(rows[0]);
    },

    /** Every slug the community has had, oldest first, the current one included. */
    async listCommunitySlugs(id) {
      const { rows } = await q(
        `SELECT slug FROM community_slugs WHERE community_id = $1 ORDER BY created_at, slug`, [id],
      );
      return rows.map((r) => r.slug);
    },

    /**
     * Make `slug` the community's address. { ok: true }, or { error: 'taken' } when another community
     * has it as an id or as a slug (current or former). The former one stays reserved for the
     * community that had it, so a printed sign is never handed to somebody else.
     */
    async setCommunitySlug(id, slug) {
      return inTransaction(async (db) => {
        const other = await db.query(`SELECT 1 FROM communities WHERE lower(id) = $1 AND id <> $2`, [slug, id]);
        if (other.rows.length) return { error: 'taken' };
        const claimed = await db.query(
          `INSERT INTO community_slugs (slug, community_id) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING slug`,
          [slug, id],
        );
        if (!claimed.rows.length) {
          const owner = await db.query(`SELECT community_id FROM community_slugs WHERE slug = $1`, [slug]);
          if (owner.rows[0]?.community_id !== id) return { error: 'taken' };
        }
        await db.query(`UPDATE communities SET slug = $1, updated_at = now() WHERE id = $2`, [slug, id]);
        return { ok: true };
      });
    },

    async createCommunity({ name, location = '', status = 'Pre-sale', theme = DEFAULT_THEME, builder = '' }) {
      const id = slugId(name);
      // The community and its guides land together or not at all, with the flag
      // already set: a new community must not be seen as "never seeded" by the
      // next boot and get a second copy.
      const row = await inTransaction(async (db) => {
        const { rows } = await db.query(
          `INSERT INTO communities (id, name, location, status, theme, builder, settings, tools, guides_seeded)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
          [id, name, location, status, theme, builder, DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED],
        );
        await addMissingDefaults(db, id);
        // A clean address from the name, or the next free variation of it. The id stays as it is.
        let slug = null;
        for (const candidate of communitySlugCandidates(name)) {
          const used = await db.query(`SELECT 1 FROM communities WHERE lower(id) = $1`, [candidate]);
          if (used.rows.length) continue;
          const claimed = await db.query(
            `INSERT INTO community_slugs (slug, community_id) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING slug`,
            [candidate, id],
          );
          if (!claimed.rows.length) continue;
          await db.query(`UPDATE communities SET slug = $1 WHERE id = $2`, [candidate, id]);
          slug = candidate;
          break;
        }
        return { ...rows[0], slug };
      });
      return shapeCommunity(row);
    },

    async updateCommunity(id, patch) {
      const map = {
        name: 'name', location: 'location', status: 'status', theme: 'theme',
        websiteUrl: 'website_url', builder: 'builder', settings: 'settings', tools: 'tools',
        features: 'features', layout: 'layout',
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
      const ids = rows.map((r) => r.id);
      const byHome = await photosFor(ids);
      const videos = await videosFor(ids);
      return rows.map((r) => {
        const images = byHome.get(r.id) || EMPTY_IMAGES;
        return shapeHome(r, images.photos, images.floorPlans, videos.get(r.id) ?? null);
      });
    },

    async getHome(id) {
      const { rows } = await q(`SELECT * FROM homes WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      const images = (await photosFor([id])).get(id) || EMPTY_IMAGES;
      const video = (await videosFor([id])).get(id) ?? null;
      return shapeHome(rows[0], images.photos, images.floorPlans, video);
    },

    async createHome(communityId, data) {
      const { rows: posRows } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM homes WHERE community_id = $1`, [communityId],
      );
      const { rows } = await q(
        `INSERT INTO homes (id, community_id, name, price, beds, baths, sqft, description,
                            availability, lot_number, ready_on, units_available, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [`h_${shortId(10)}`, communityId, data.name, data.price, data.beds, data.baths, data.sqft,
          data.description, data.availability, data.lotNumber ?? '', data.readyOn ?? '',
          // ?? not ||, so a home created as sold out stays at 0 rather than
          // becoming an uncounted one.
          data.unitsAvailable ?? null, posRows[0].pos],
      );
      return shapeHome(rows[0], [], []);
    },

    async updateHome(id, patch) {
      const map = {
        name: 'name', price: 'price', beds: 'beds', baths: 'baths', sqft: 'sqft',
        description: 'description', availability: 'availability', lotNumber: 'lot_number',
        readyOn: 'ready_on', unitsAvailable: 'units_available', position: 'position', videoLink: 'video_link',
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

    // ── home walkthroughs ────────────────────────────────────────────────
    /** Upload or replace the home's video. The primary key makes it one per home. */
    async setHomeVideo(homeId, { communityId, contentType, data, sizeBytes }) {
      await q(
        `INSERT INTO home_videos (home_id, community_id, content_type, data, size_bytes)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (home_id) DO UPDATE
           SET content_type = EXCLUDED.content_type,
               data = EXCLUDED.data,
               size_bytes = EXCLUDED.size_bytes,
               created_at = now()`,
        [homeId, communityId, contentType, data, sizeBytes],
      );
      return this.getHome(homeId);
    },

    /** The file itself, asked for only by the route that streams it. */
    async getHomeVideo(homeId) {
      const { rows } = await q(
        `SELECT content_type, data, created_at FROM home_videos WHERE home_id = $1`, [homeId],
      );
      return rows[0] ?? null;
    },

    async deleteHomeVideo(homeId) {
      await q(`DELETE FROM home_videos WHERE home_id = $1`, [homeId]);
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
      communityId, homeId = null, highlightId = null, agentId = null, guideId = null,
      kind = 'home', contentType = null, data = null, url = null,
    }) {
      const { rows: posRows } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM photos WHERE community_id = $1 AND coalesce(home_id,'') = coalesce($2,'')`,
        [communityId, homeId],
      );
      const { rows } = await q(
        `INSERT INTO photos (id, community_id, home_id, highlight_id, agent_id, guide_id, kind,
                             content_type, data, url, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [`p_${shortId(12)}`, communityId, homeId, highlightId, agentId, guideId, kind, contentType,
          data, url, posRows[0].pos],
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

    /** The gallery in the order given: the first is the home's hero. Only this home's gallery rows move. */
    async setHomePhotoOrder(homeId, orderedIds) {
      await q(
        `UPDATE photos SET position = o.pos
           FROM unnest($2::text[]) WITH ORDINALITY AS o(id, pos)
          WHERE photos.id = o.id AND photos.home_id = $1 AND photos.kind = 'home'`,
        [homeId, orderedIds],
      );
    },

    async listHomePhotosOfKind(homeId, kind) {
      const { rows } = await q(
        `SELECT ${PHOTO_COLUMNS} FROM photos WHERE home_id = $1 AND kind = $2 ORDER BY position, created_at`,
        [homeId, kind],
      );
      return rows.map(shapePhoto);
    },

    async listHighlightPhotos(highlightId) {
      const { rows } = await q(`SELECT ${PHOTO_COLUMNS} FROM photos WHERE highlight_id = $1`, [highlightId]);
      return rows.map(shapePhoto);
    },

    async listAgentPhotos(agentId, kind) {
      const { rows } = await q(
        `SELECT ${PHOTO_COLUMNS} FROM photos WHERE agent_id = $1 AND kind = $2 ORDER BY position, created_at`,
        [agentId, kind],
      );
      return rows.map(shapePhoto);
    },

    async listGuidePhotos(guideId) {
      const { rows } = await q(
        `SELECT ${PHOTO_COLUMNS} FROM photos WHERE guide_id = $1 ORDER BY position, created_at`, [guideId],
      );
      return rows.map(shapePhoto);
    },

    async listCommunityPhotos(communityId, kind) {
      const { rows } = await q(
        `SELECT ${PHOTO_COLUMNS} FROM photos WHERE community_id = $1 AND kind = $2 ORDER BY position, created_at`,
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
        `SELECT ${PHOTO_COLUMNS} FROM photos WHERE highlight_id = $1 ORDER BY created_at LIMIT 1`, [id],
      );
      return shapeHighlight(rows[0], pics[0] ? shapePhoto(pics[0]) : null);
    },

    async createHighlight(communityId, data) {
      const { rows: pos } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM highlights WHERE community_id = $1`,
        [communityId],
      );
      const { rows } = await q(
        `INSERT INTO highlights (id, community_id, category, name, description, detail, address, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [`g_${shortId(10)}`, communityId, data.category, data.name, data.description, data.detail,
          data.address ?? '', pos[0].pos],
      );
      return shapeHighlight(rows[0], null);
    },

    async updateHighlight(id, patch) {
      const map = {
        category: 'category', name: 'name', description: 'description',
        detail: 'detail', address: 'address', position: 'position',
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

    // ── videos and articles ────────────────────────────────────────────────
    // Every column but the file itself. SELECT * here would pull a base64 video
    // out of Postgres on every page load just to decide whether one exists —
    // the shaper would discard it, so nothing would look wrong and every buyer
    // would pay for it. No test can catch that from the shaped output, which is
    // exactly why the column list is written out rather than left to a star.
    async listResources(communityId) {
      const { rows } = await q(
        `SELECT id, community_id, kind, title, body, url, content_type, size_bytes, position, updated_at,
                (data IS NOT NULL) AS has_video
           FROM resources WHERE community_id = $1 ORDER BY position, created_at`,
        [communityId],
      );
      return rows.map(shapeResource);
    },

    async getResource(id) {
      const { rows } = await q(
        `SELECT id, community_id, kind, title, body, url, content_type, size_bytes, position, updated_at,
                (data IS NOT NULL) AS has_video
           FROM resources WHERE id = $1`,
        [id],
      );
      return shapeResource(rows[0] ?? null);
    },

    /** The file itself, asked for only by the route that streams it. */
    async getResourceVideo(id) {
      const { rows } = await q(
        `SELECT content_type, data, created_at, updated_at FROM resources WHERE id = $1 AND data IS NOT NULL`, [id],
      );
      return rows[0] ?? null;
    },

    async countResourcesOfKind(communityId, kind) {
      const { rows } = await q(
        `SELECT count(*)::int AS n FROM resources WHERE community_id = $1 AND kind = $2`,
        [communityId, kind],
      );
      return rows[0].n;
    },

    async createResource(communityId, data) {
      const { rows: pos } = await q(
        `SELECT coalesce(max(position), -1) + 1 AS pos FROM resources WHERE community_id = $1`,
        [communityId],
      );
      const { rows } = await q(
        `INSERT INTO resources (id, community_id, kind, title, body, url, content_type, data,
                                size_bytes, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, community_id, kind, title, body, url, content_type, size_bytes, position, updated_at,
                   (data IS NOT NULL) AS has_video`,
        [`r_${shortId(10)}`, communityId, data.kind, data.title ?? '', data.body ?? '',
          data.url ?? '', data.contentType ?? '', data.data ?? null, data.sizeBytes ?? 0,
          pos[0].pos],
      );
      return shapeResource(rows[0]);
    },

    async updateResource(id, patch) {
      const map = {
        kind: 'kind', title: 'title', body: 'body', url: 'url', position: 'position',
        contentType: 'content_type', data: 'data', sizeBytes: 'size_bytes',
      };
      const sets = [];
      const values = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] !== undefined) {
          values.push(patch[key]);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (!sets.length) return this.getResource(id);
      // The file is served as immutable under an address that carries this stamp,
      // so a changed file has to move it (see shapeResource).
      if (patch.data !== undefined) sets.push('updated_at = now()');
      values.push(id);
      const { rows } = await q(
        `UPDATE resources SET ${sets.join(', ')} WHERE id = $${values.length}
         RETURNING id, community_id, kind, title, body, url, content_type, size_bytes, position, updated_at,
                   (data IS NOT NULL) AS has_video`,
        values,
      );
      return shapeResource(rows[0] ?? null);
    },

    async deleteResource(id) {
      await q(`DELETE FROM resources WHERE id = $1`, [id]);
    },

    async deleteHighlight(id) {
      await q(`DELETE FROM photos WHERE highlight_id = $1`, [id]);
      await q(`DELETE FROM highlights WHERE id = $1`, [id]);
    },

    // ── realtors ─────────────────────────────────────────────────────────
    async listAgents(communityId) {
      const { rows } = await q(
        `SELECT * FROM agents WHERE community_id = $1 ORDER BY position, id COLLATE "C"`, [communityId],
      );
      const images = await agentImagesFor(rows.map((r) => r.id));
      return rows.map((r) => shapeAgent(r, images.get(r.id).photo, images.get(r.id).logo));
    },

    async getAgent(id) {
      const { rows } = await q(`SELECT * FROM agents WHERE id = $1`, [id]);
      return agentOf(rows[0]);
    },

    async countAgents(communityId) {
      const { rows } = await q(`SELECT count(*)::int AS n FROM agents WHERE community_id = $1`, [communityId]);
      return rows[0].n;
    },

    /** An unconditional add, for callers that enforce no cap (seeding, tests). */
    async createAgent(communityId, data) {
      return this.createAgentIfRoom(communityId, data, Infinity);
    },

    /**
     * Adds a realtor unless the community already has `max`, and answers null
     * when it does. The community row is locked for the whole check-and-insert,
     * the way restoreDefaultGuides does it, so concurrent requests queue up
     * instead of all counting the same number; the next position is worked out
     * under the same lock so two agents never share one.
     */
    async createAgentIfRoom(communityId, data, max) {
      return inTransaction(async (db) => {
        const { rows: locked } = await db.query(
          `SELECT id FROM communities WHERE id = $1 FOR UPDATE`, [communityId],
        );
        if (!locked.length) return null;
        const { rows: have } = await db.query(
          `SELECT count(*)::int AS n, coalesce(max(position), -1) + 1 AS pos
             FROM agents WHERE community_id = $1`,
          [communityId],
        );
        if (have[0].n >= max) return null;
        const { rows } = await db.query(
          `INSERT INTO agents (id, community_id, position, name, brokerage, license_no, license_state,
                               phone, email, website)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [`a_${shortId(10)}`, communityId, have[0].pos, data.name, data.brokerage ?? '',
            data.licenseNo ?? '', data.licenseState ?? 'UT', data.phone ?? '', data.email ?? '',
            data.website ?? ''],
        );
        return shapeAgent(rows[0]);
      });
    },

    async updateAgent(id, patch) {
      const map = {
        name: 'name', brokerage: 'brokerage', licenseNo: 'license_no', licenseState: 'license_state',
        phone: 'phone', email: 'email', website: 'website', position: 'position',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getAgent(id);
      params.push(id);
      await q(`UPDATE agents SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      return this.getAgent(id);
    },

    async deleteAgent(id) {
      await q(`DELETE FROM photos WHERE agent_id = $1`, [id]);
      await q(`DELETE FROM agents WHERE id = $1`, [id]);
    },

    // ── buyer guides ─────────────────────────────────────────────────────
    async listGuides(communityId, { includeUnpublished = false } = {}) {
      const { rows } = await q(
        `SELECT ${GUIDE_SUMMARY_COLUMNS} FROM guides
          WHERE community_id = $1 ${includeUnpublished ? '' : 'AND published'}
          ORDER BY position, id COLLATE "C"`,
        [communityId],
      );
      const images = await guideImagesFor(rows.map((r) => r.id));
      return rows.map((r) => shapeGuide(r, { photo: images.get(r.id) ?? null }));
    },

    async getGuide(id) {
      const { rows } = await q(`SELECT * FROM guides WHERE id = $1`, [id]);
      return guideOf(rows[0]);
    },

    async getGuideBySlug(communityId, slug) {
      const { rows } = await q(
        `SELECT * FROM guides WHERE community_id = $1 AND slug = $2`, [communityId, slug],
      );
      return guideOf(rows[0]);
    },

    /** A duplicate slug surfaces as pg's own 23505, which the route turns into a 400. */
    async createGuide(communityId, data) {
      // Locked like createAgentIfRoom so the next position is worked out one
      // request at a time and two new guides never share one.
      return inTransaction(async (db) => {
        await db.query(`SELECT id FROM communities WHERE id = $1 FOR UPDATE`, [communityId]);
        const { rows: pos } = await db.query(
          `SELECT coalesce(max(position), -1) + 1 AS pos FROM guides WHERE community_id = $1`,
          [communityId],
        );
        const row = await insertGuide(db, communityId, { ...data, position: pos[0].pos });
        return shapeGuide(row, { body: true });
      });
    },

    async updateGuide(id, patch) {
      const map = {
        slug: 'slug', title: 'title', category: 'category', byline: 'byline', note: 'note',
        summary: 'summary', body: 'body', image: 'image', imageAlt: 'image_alt',
        published: 'published', position: 'position',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
      if (!sets.length) return this.getGuide(id);
      params.push(id);
      await q(`UPDATE guides SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
      return this.getGuide(id);
    },

    /**
     * Adds back any supplied guide the community no longer has and returns what it
     * added. The community row is locked first so two clicks cannot both decide a
     * guide is missing and trip the unique slug index.
     */
    async restoreDefaultGuides(communityId) {
      return inTransaction(async (db) => {
        await db.query(`SELECT id FROM communities WHERE id = $1 FOR UPDATE`, [communityId]);
        const added = await addMissingDefaults(db, communityId);
        return added.map((row) => shapeGuide(row));
      });
    },

    async deleteGuide(id) {
      await q(`DELETE FROM photos WHERE guide_id = $1`, [id]);
      await q(`DELETE FROM guides WHERE id = $1`, [id]);
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
                   FROM lead_plan_items p WHERE p.lead_id = l.id) AS plan,
                (SELECT row_to_json(m) FROM lead_movein m WHERE m.lead_id = l.id) AS movein,
                (SELECT row_to_json(c) FROM lead_consents c WHERE c.lead_id = l.id
                  ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS consent
         FROM leads l WHERE l.community_id = $1 ORDER BY l.first_visit_at`,
        [communityId],
      );
      return rows.map((r) => ({
        ...shapeLead(r, {
          plan: r.plan || {}, moveIn: shapeMoveIn(r.movein), consent: shapeConsent(r.consent),
        }),
        activityCount: r.activity_count,
      }));
    },

    async getLead(id) {
      const { rows } = await q(`SELECT * FROM leads WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      return shapeLead(rows[0], {
        plan: await planFor(id), activity: await activityFor(id), moveIn: await moveInFor(id),
        consent: await consentFor(id),
      });
    },

    /**
     * The lead matching these exact details, or null. Candidates are narrowed by
     * email in SQL because that is what is indexed, then compared with the one
     * JS definition of identity so the rule cannot drift between here and there.
     */
    async findLeadByIdentity(communityId, input) {
      const { rows } = await q(
        `SELECT * FROM leads WHERE community_id = $1 AND lower(btrim(email)) = lower(btrim($2))`,
        [communityId, input.email],
      );
      const row = rows.find((candidate) => isSameLead(candidate, input));
      if (!row) return null;
      return shapeLead(row, {
        plan: await planFor(row.id), activity: await activityFor(row.id),
        consent: await consentFor(row.id),
      });
    },

    async createLead(communityId, { name, email, phone }) {
      const { rows } = await q(
        `INSERT INTO leads (id, community_id, name, email, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [`l_${shortId(12)}`, communityId, name, email, phone],
      );
      return shapeLead(rows[0], {});
    },

    /**
     * Write a consent answer. Append-only: nothing here updates a previous row,
     * because the record of what somebody agreed to on a given day is the point.
     */
    async recordConsent(leadId, { granted, text, version, ip, userAgent }) {
      const { rows } = await q(
        `INSERT INTO lead_consents (id, lead_id, granted, consent_text, version, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [`cs_${shortId(12)}`, leadId, Boolean(granted), text ?? '', version ?? '', ip ?? '',
          userAgent ?? ''],
      );
      return shapeConsent(rows[0]);
    },

    /** Every answer this lead has given, newest first — the audit trail. */
    async listConsents(leadId) {
      const { rows } = await q(
        `SELECT * FROM lead_consents WHERE lead_id = $1 ORDER BY created_at DESC, id DESC`,
        [leadId],
      );
      return rows.map(shapeConsent);
    },

    async updateLead(id, patch) {
      const map = {
        name: 'name', phone: 'phone', status: 'status', notes: 'notes',
        tour: 'tour', savedHomeIds: 'saved_home_ids', extraEmails: 'extra_emails',
        openedAt: 'opened_at', archivedAt: 'archived_at',
      };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (patch[key] === undefined) continue;
        params.push(key === 'savedHomeIds' || key === 'tour' || key === 'extraEmails' ? JSON.stringify(patch[key]) : patch[key]);
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

    /** The whole move-in plan at once -- the buyer edits it as one thing. */
    async saveMoveIn(leadId, plan) {
      const { rows } = await q(
        `INSERT INTO lead_movein (lead_id, home_id, target_date, lease_end, pay_method, drivers, done, own_steps)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
         ON CONFLICT (lead_id) DO UPDATE SET
           home_id = EXCLUDED.home_id, target_date = EXCLUDED.target_date,
           lease_end = EXCLUDED.lease_end, pay_method = EXCLUDED.pay_method,
           drivers = EXCLUDED.drivers, done = EXCLUDED.done,
           own_steps = EXCLUDED.own_steps, updated_at = now()
         RETURNING *`,
        [leadId, plan.homeId ?? null, plan.targetDate ?? '', plan.leaseEnd ?? '', plan.payMethod ?? 'loan',
          JSON.stringify(plan.drivers ?? []), JSON.stringify(plan.done ?? []),
          JSON.stringify(plan.ownSteps ?? [])],
      );
      return shapeMoveIn(rows[0]);
    },

    async addActivity(leadId, text) {
      await q(`INSERT INTO lead_activity (lead_id, text) VALUES ($1,$2)`, [leadId, text]);
    },
  };
}
