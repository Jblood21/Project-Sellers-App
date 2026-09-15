import { Router } from 'express';

import {
  AVAILABILITY, COMMUNITY_STATUSES, DEFAULT_SETTINGS, DEFAULT_TOOLS_ENABLED,
  HIGHLIGHT_CATEGORY_KEYS, MAX_PHOTOS_PER_HOME, THEMES, TOOL_KEYS,
} from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { issueToken, requireAdmin, verifyPassword } from '../lib/auth.js';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const str = (v, fallback = '') => (v === undefined || v === null ? fallback : String(v).trim());
const numOr = (v, fallback) => {
  const n = Number.parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

export function adminRouter() {
  const router = Router();

  router.post('/login', async (req, res) => {
    const store = await getStore();
    const email = str(req.body?.email);
    const password = String(req.body?.password ?? '');
    const admin = email && (await store.getAdminByEmail(email));
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'That email and password do not match.' });
    }
    res.json({ token: issueToken(admin), admin: { id: admin.id, email: admin.email } });
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ id: req.admin.sub, email: req.admin.email });
  });

  // Everything below requires a signed-in admin.
  router.use(requireAdmin);

  // ── communities ──────────────────────────────────────────────────────────
  router.get('/communities', async (_req, res) => {
    const store = await getStore();
    res.json(await store.listCommunities());
  });

  router.post('/communities', async (req, res) => {
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the community a name.' });
    const store = await getStore();
    const community = await store.createCommunity({
      name,
      location: str(req.body?.location) || 'Location TBD',
      status: COMMUNITY_STATUSES.includes(req.body?.status) ? req.body.status : 'Pre-sale',
      theme: THEMES[req.body?.theme] ? req.body.theme : 'modern',
      builder: str(req.body?.builder),
    });
    res.status(201).json(community);
  });

  router.get('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const [homes, highlights, heroes, icons] = await Promise.all([
      store.listHomes(community.id),
      store.listHighlights(community.id),
      store.listCommunityPhotos(community.id, 'hero'),
      store.listCommunityPhotos(community.id, 'icon'),
    ]);
    res.json({
      ...community, homes, highlights,
      heroPhoto: heroes[0] ?? null, iconPhoto: icons[0] ?? null,
    });
  });

  router.patch('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name) || community.name;
    if (req.body?.location !== undefined) patch.location = str(req.body.location);
    if (req.body?.builder !== undefined) patch.builder = str(req.body.builder);
    if (req.body?.websiteUrl !== undefined) patch.websiteUrl = str(req.body.websiteUrl) || null;
    if (req.body?.status !== undefined && COMMUNITY_STATUSES.includes(req.body.status)) patch.status = req.body.status;
    if (req.body?.theme !== undefined && THEMES[req.body.theme]) patch.theme = req.body.theme;

    if (req.body?.settings) {
      const settings = { ...community.settings };
      for (const key of SETTING_KEYS) {
        if (req.body.settings[key] !== undefined) settings[key] = String(req.body.settings[key]);
      }
      patch.settings = settings;
    }
    if (req.body?.tools) {
      const tools = { ...DEFAULT_TOOLS_ENABLED, ...community.tools };
      for (const key of TOOL_KEYS) {
        if (req.body.tools[key] !== undefined) tools[key] = Boolean(req.body.tools[key]);
      }
      patch.tools = tools;
    }
    res.json(await store.updateCommunity(community.id, patch));
  });

  router.delete('/communities/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteCommunity(req.params.id);
    res.status(204).end();
  });

  /**
   * "Check rate inbox" — in production Zapier posts the parsed lender email to
   * /api/communities/:id/rates. This stamps the timestamp so an admin can confirm
   * the pipeline, and accepts manual rates in the same call.
   */
  router.post('/communities/:id/rates/check', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const settings = { ...community.settings, ratesUpdatedAt: new Date().toISOString() };
    const updated = await store.updateCommunity(community.id, { settings });
    res.json({ settings: updated.settings, webhookConfigured: Boolean(process.env.RATES_WEBHOOK_SECRET) });
  });

  // ── homes ────────────────────────────────────────────────────────────────
  router.post('/communities/:id/homes', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the home a name.' });
    const home = await store.createHome(community.id, {
      name,
      price: numOr(req.body?.price, 450000),
      beds: numOr(req.body?.beds, 3),
      baths: numOr(req.body?.baths, 2),
      sqft: numOr(req.body?.sqft, 2000),
      description: str(req.body?.description) || 'New home — add a description.',
      availability: AVAILABILITY.includes(req.body?.availability) ? req.body.availability : 'Planning',
    });
    res.status(201).json(home);
  });

  router.patch('/homes/:id', async (req, res) => {
    const store = await getStore();
    const home = await store.getHome(req.params.id);
    if (!home) return res.status(404).json({ error: 'Home not found' });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name) || home.name;
    if (req.body?.price !== undefined) patch.price = numOr(req.body.price, home.price);
    if (req.body?.beds !== undefined) patch.beds = numOr(req.body.beds, home.beds);
    if (req.body?.baths !== undefined) patch.baths = numOr(req.body.baths, home.baths);
    if (req.body?.sqft !== undefined) patch.sqft = numOr(req.body.sqft, home.sqft);
    if (req.body?.description !== undefined) patch.description = str(req.body.description);
    if (req.body?.availability !== undefined && AVAILABILITY.includes(req.body.availability)) {
      patch.availability = req.body.availability;
    }
    res.json(await store.updateHome(home.id, patch));
  });

  router.delete('/homes/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteHome(req.params.id);
    res.status(204).end();
  });

  // ── area highlights ──────────────────────────────────────────────────────
  /** What's around the community: schools, parks, shops, clinics, commute notes. */
  router.post('/communities/:id/highlights', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give this place a name.' });
    const highlight = await store.createHighlight(community.id, {
      category: HIGHLIGHT_CATEGORY_KEYS.includes(req.body?.category) ? req.body.category : 'other',
      name,
      description: str(req.body?.description),
      detail: str(req.body?.detail),
    });
    res.status(201).json(highlight);
  });

  router.patch('/highlights/:id', async (req, res) => {
    const store = await getStore();
    const highlight = await store.getHighlight(req.params.id);
    if (!highlight) return res.status(404).json({ error: 'Highlight not found' });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name) || highlight.name;
    if (req.body?.description !== undefined) patch.description = str(req.body.description);
    if (req.body?.detail !== undefined) patch.detail = str(req.body.detail);
    if (req.body?.category !== undefined && HIGHLIGHT_CATEGORY_KEYS.includes(req.body.category)) {
      patch.category = req.body.category;
    }
    res.json(await store.updateHighlight(highlight.id, patch));
  });

  router.delete('/highlights/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteHighlight(req.params.id);
    res.status(204).end();
  });

  // ── photos ───────────────────────────────────────────────────────────────
  /**
   * Accepts either a data URL (the client downscales before upload) or an external
   * image URL. Stored in the database so Render's ephemeral disk doesn't lose them.
   */
  const readImage = (body) => {
    const url = str(body?.url);
    if (url) {
      if (!/^https:\/\//i.test(url)) return { error: 'Photo links must start with https://' };
      return { url };
    }
    const dataUrl = str(body?.dataUrl);
    const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) return { error: 'Send an image file or an https:// link.' };
    const [, contentType, data] = match;
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return { error: 'Use a JPEG, PNG, WebP or GIF image.' };
    if (Buffer.byteLength(data, 'base64') > MAX_PHOTO_BYTES) return { error: 'That image is over 3 MB.' };
    return { contentType, data };
  };

  router.post('/homes/:id/photos', async (req, res) => {
    const store = await getStore();
    const home = await store.getHome(req.params.id);
    if (!home) return res.status(404).json({ error: 'Home not found' });
    if ((await store.countHomePhotos(home.id)) >= MAX_PHOTOS_PER_HOME) {
      return res.status(400).json({ error: `Up to ${MAX_PHOTOS_PER_HOME} photos per home.` });
    }
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    res.status(201).json(await store.addPhoto({ communityId: home.communityId, homeId: home.id, kind: 'home', ...image }));
  });

  /** Community-level artwork: `hero` for the QR landing, `icon` for the PWA. */
  router.post('/communities/:id/photos/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!['hero', 'icon'].includes(kind)) return res.status(400).json({ error: 'Unknown photo slot' });
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    // One hero and one icon per community — replace whatever is there.
    for (const old of await store.listCommunityPhotos(community.id, kind)) await store.deletePhoto(old.id);
    res.status(201).json(await store.addPhoto({ communityId: community.id, kind, ...image }));
  });

  /** One photo per highlight — a second upload replaces the first. */
  router.post('/highlights/:id/photos', async (req, res) => {
    const store = await getStore();
    const highlight = await store.getHighlight(req.params.id);
    if (!highlight) return res.status(404).json({ error: 'Highlight not found' });
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    for (const old of await store.listHighlightPhotos(highlight.id)) await store.deletePhoto(old.id);
    res.status(201).json(await store.addPhoto({
      communityId: highlight.communityId, highlightId: highlight.id, kind: 'highlight', ...image,
    }));
  });

  router.delete('/photos/:id', async (req, res) => {
    const store = await getStore();
    await store.deletePhoto(req.params.id);
    res.status(204).end();
  });

  // ── leads ────────────────────────────────────────────────────────────────
  router.get('/communities/:id/leads', async (req, res) => {
    const store = await getStore();
    res.json(await store.listLeads(req.params.id));
  });

  router.get('/leads/:id', async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  });

  router.patch('/leads/:id', async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const patch = {};
    if (req.body?.status !== undefined && ['new', 'contacted'].includes(req.body.status)) {
      patch.status = req.body.status;
    }
    if (req.body?.notes !== undefined) patch.notes = String(req.body.notes).slice(0, 4000);
    // Clearing the call request is what keeps the badge meaningful: handled
    // requests stop counting, but the request itself stays on the record.
    if (req.body?.tourHandled !== undefined && lead.tour) {
      patch.tour = {
        ...lead.tour,
        handledAt: req.body.tourHandled ? new Date().toISOString() : null,
      };
    }
    res.json(await store.updateLead(lead.id, patch));
  });

  return router;
}
