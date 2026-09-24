import { Router } from 'express';

import {
  AVAILABILITY, COMMUNITY_STATUSES, DEFAULT_FEATURES, DEFAULT_SETTINGS, DEFAULT_THEME,
  DEFAULT_TOOLS_ENABLED, FEATURE_KEYS, HIGHLIGHT_CATEGORY_KEYS, MAX_PHOTOS_PER_HOME,
  MAX_VIDEO_BYTES, MAX_VIDEOS, RESOURCE_KINDS, VIDEO_TYPES, base64Bytes, megabytes,
  videoEmbed,
  SLOT_TIMES, THEMES, TOOL_KEYS,
} from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { buildMismo34, mismoFilename } from '../lib/mismo.js';
import { issueToken, requireAdmin, verifyPassword } from '../lib/auth.js';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_FLOOR_PLANS = 4;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const str = (v, fallback = '') => (v === undefined || v === null ? fallback : String(v).trim());
const numOr = (v, fallback) => {
  const n = Number.parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A completion date is 'YYYY-MM-DD' or nothing. Stored literally, like slots:
 * a buyer plans their lease notice around this, so it must not shift a day for
 * someone in another timezone.
 */
const readyDate = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

/**
 * A video file arriving as a data URL, or an explanation of why it cannot be
 * stored. The cap is enforced on the decoded size, not the encoded string: the
 * builder picked a 24MB file and that is the number to hold them to.
 */
const readVideo = (body) => {
  const dataUrl = String(body?.dataUrl ?? '');
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return { error: 'That file could not be read. Try picking it again.' };

  const [, contentType, base64] = match;
  if (!VIDEO_TYPES.has(contentType)) {
    return { error: 'That is not a video file. MP4 works everywhere; WebM and MOV also play.' };
  }
  const sizeBytes = base64Bytes(base64);
  if (sizeBytes > MAX_VIDEO_BYTES) {
    return {
      error: `That video is ${megabytes(sizeBytes)}. Uploads stop at ${megabytes(MAX_VIDEO_BYTES)} `
        + '— for a longer one, paste a YouTube or Vimeo link instead.',
    };
  }
  return { contentType, data: base64, sizeBytes };
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
      theme: THEMES[req.body?.theme] ? req.body.theme : DEFAULT_THEME,
      builder: str(req.body?.builder),
    });
    res.status(201).json(community);
  });

  router.get('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const [homes, highlights, resources, heroes, icons, maps] = await Promise.all([
      store.listHomes(community.id),
      store.listHighlights(community.id),
      store.listResources(community.id),
      store.listCommunityPhotos(community.id, 'hero'),
      store.listCommunityPhotos(community.id, 'icon'),
      store.listCommunityPhotos(community.id, 'sitemap'),
    ]);
    res.json({
      ...community, homes, highlights, resources,
      heroPhoto: heroes[0] ?? null, iconPhoto: icons[0] ?? null, siteMap: maps[0] ?? null,
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
    if (req.body?.features) {
      const features = { ...DEFAULT_FEATURES, ...community.features };
      for (const key of FEATURE_KEYS) {
        if (req.body.features[key] !== undefined) features[key] = Boolean(req.body.features[key]);
      }
      patch.features = features;
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
      lotNumber: str(req.body?.lotNumber),
      readyOn: readyDate(req.body?.readyOn),
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
    if (req.body?.lotNumber !== undefined) patch.lotNumber = str(req.body.lotNumber);
    if (req.body?.readyOn !== undefined) patch.readyOn = readyDate(req.body.readyOn);
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
      address: str(req.body?.address),
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
    if (req.body?.address !== undefined) patch.address = str(req.body.address);
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

  // ── videos and articles ──────────────────────────────────────────────────
  /** What the builder has written and filmed, shown below the tools. */
  router.post('/communities/:id/resources', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const kind = RESOURCE_KINDS.includes(req.body?.kind) ? req.body.kind : 'article';
    const title = str(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Give this a title.' });

    const file = {};
    if (kind === 'video') {
      // Checked here rather than only in the browser: the cap is the product
      // decision, and a request that skips the form should not get past it.
      if (await store.countResourcesOfKind(community.id, 'video') >= MAX_VIDEOS) {
        return res.status(400).json({ error: `You can add up to ${MAX_VIDEOS} videos.` });
      }
      // An uploaded file or a link, and exactly one of them: two sources for one
      // player is a question about which wins that nobody should have to answer.
      const hasFile = Boolean(req.body?.dataUrl);
      const hasLink = Boolean(str(req.body?.url));
      if (hasFile && hasLink) {
        return res.status(400).json({ error: 'Upload a file or paste a link, not both.' });
      }
      if (!hasFile && !hasLink) {
        return res.status(400).json({ error: 'Choose a video file, or paste a link to one.' });
      }
      if (hasFile) {
        const read = readVideo(req.body);
        if (read.error) return res.status(400).json({ error: read.error });
        Object.assign(file, read);
      } else if (!videoEmbed(req.body?.url)) {
        return res.status(400).json({ error: 'That link is not a YouTube or Vimeo video.' });
      }
    }

    res.status(201).json(await store.createResource(community.id, {
      kind, title, body: kind === 'article' ? str(req.body?.body) : '',
      url: kind === 'video' && !file.data ? str(req.body?.url) : '',
      ...file,
    }));
  });

  router.patch('/resources/:id', async (req, res) => {
    const store = await getStore();
    const resource = await store.getResource(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Not found' });
    const patch = {};
    if (req.body?.title !== undefined) patch.title = str(req.body.title) || resource.title;
    if (req.body?.body !== undefined && resource.kind === 'article') patch.body = str(req.body.body);
    if (req.body?.dataUrl && resource.kind === 'video') {
      const read = readVideo(req.body);
      if (read.error) return res.status(400).json({ error: read.error });
      // Replacing a link with a file clears the link, and the other way round,
      // so a resource never carries two sources at once.
      Object.assign(patch, read, { url: '' });
    } else if (req.body?.url !== undefined && resource.kind === 'video') {
      if (!videoEmbed(req.body.url)) {
        return res.status(400).json({ error: 'That link is not a YouTube or Vimeo video.' });
      }
      Object.assign(patch, { url: str(req.body.url), data: null, contentType: '', sizeBytes: 0 });
    }
    res.json(await store.updateResource(resource.id, patch));
  });

  router.delete('/resources/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteResource(req.params.id);
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

  /** Floor plans hang off the home like photos but under their own kind. */
  router.post('/homes/:id/floorplans', async (req, res) => {
    const store = await getStore();
    const home = await store.getHome(req.params.id);
    if (!home) return res.status(404).json({ error: 'Home not found' });
    if ((await store.listHomePhotosOfKind(home.id, 'floorplan')).length >= MAX_FLOOR_PLANS) {
      return res.status(400).json({ error: `Up to ${MAX_FLOOR_PLANS} floor plans per home.` });
    }
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    res.status(201).json(await store.addPhoto({
      communityId: home.communityId, homeId: home.id, kind: 'floorplan', ...image,
    }));
  });

  /** Community-level artwork: `hero` for the QR landing, `icon` for the PWA, `sitemap` for the plat. */
  router.post('/communities/:id/photos/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!['hero', 'icon', 'sitemap'].includes(kind)) return res.status(400).json({ error: 'Unknown photo slot' });
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

  // ── appointment slots ────────────────────────────────────────────────────
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  router.get('/communities/:id/slots', async (req, res) => {
    const store = await getStore();
    res.json(await store.listSlots(req.params.id));
  });

  /** Publishes every date x time the builder ticked, in one call. */
  router.post('/communities/:id/slots', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const dates = [...new Set((req.body?.dates ?? []).filter((d) => ISO_DATE.test(String(d))))];
    const times = [...new Set((req.body?.times ?? []).filter((t) => SLOT_TIMES.includes(String(t))))];
    if (!dates.length) return res.status(400).json({ error: 'Pick at least one date.' });
    if (!times.length) return res.status(400).json({ error: 'Pick at least one time.' });
    if (dates.length * times.length > 400) {
      return res.status(400).json({ error: 'That is more than 400 slots at once — add them in smaller batches.' });
    }

    const created = await store.createSlots(community.id, dates.sort(), times.sort());
    res.status(201).json({ created: created.length, slots: await store.listSlots(community.id) });
  });

  router.delete('/slots/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteSlot(req.params.id);
    res.status(204).end();
  });

  // ── leads ────────────────────────────────────────────────────────────────
  router.get('/communities/:id/leads', async (req, res) => {
    const store = await getStore();
    res.json(await store.listLeads(req.params.id));
  });

  /**
   * Reading a lead is what marks it read — there is no other caller, and the
   * only way to reach this is an admin opening that lead's screen. Stamped once
   * and never moved, so "unread" cannot come back and the badge stays honest.
   */
  router.get('/leads/:id', async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.openedAt) return res.json(lead);
    res.json(await store.updateLead(lead.id, { openedAt: new Date().toISOString() }));
  });

  /**
   * The lead as a MISMO 3.4 file, so a loan officer can import them rather than
   * retype them. Contact and plan only — see server/lib/mismo.js for why.
   */
  router.get('/leads/:id/mismo', async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const community = await store.getCommunity(lead.communityId);
    // The home their plan names, or the first one they starred: either way a
    // home they chose, which is what makes its price the sales price.
    const homes = await store.listHomes(lead.communityId);
    const home =
      homes.find((h) => h.id === lead.moveIn?.homeId) ??
      homes.find((h) => lead.savedHomeIds?.includes(h.id)) ??
      null;

    res.type('application/xml');
    res.set('Content-Disposition', `attachment; filename="${mismoFilename(lead)}"`);
    res.send(buildMismo34({ lead, community, home }));
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
    // Archiving is reversible and never deletes: a buyer who went quiet this
    // spring is the same buyer who calls back in the autumn.
    if (req.body?.archived !== undefined) {
      patch.archivedAt = req.body.archived ? new Date().toISOString() : null;
    }
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
