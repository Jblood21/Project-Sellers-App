import { Router } from 'express';

import {
  AGENT_TEXT_MAX, AVAILABILITY, COMMUNITY_STATUSES, DEFAULT_FEATURES, DEFAULT_GUIDE_IMAGE_ALT,
  COMPLIANCE_DEFAULTS, DEFAULT_SETTINGS, DEFAULT_THEME, DEFAULT_TOOLS_ENABLED, FEATURE_KEYS, GUIDE_TEXT_MAX, HIGHLIGHT_CATEGORY_KEYS,
  LAYOUT_KEYS, MAX_AGENTS, MAX_PHOTOS_PER_HOME, MAX_VIDEO_BYTES, MAX_VIDEOS, RESOURCE_KINDS,
  VIDEO_TYPES, base64Bytes, megabytes, safeHref, settingMaxLength, slugify, videoEmbed,
  SLOT_TIMES, THEMES, TOOL_KEYS, normalizeFaqJson,
} from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { uniqueSlug } from '../db/shape.js';
import { clientKey, createLimiter, reserve, tooMany } from '../lib/limits.js';
import { rejectControlCharacters } from '../lib/params.js';
import { buildMismo34, mismoFilename } from '../lib/mismo.js';
import { issueToken, requireAdmin, verifyPassword } from '../lib/auth.js';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
// One address and nothing else: no list, no query string, no display name.
const INCENTIVE_EMAIL_RE = /^[^\s@?&#<>"%,;]+@[^\s@?&#<>"%,;]+\.[^\s@?&#<>"%,;]+$/;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_FLOOR_PLANS = 4;
// Raster only, and SVG is left out on purpose: an SVG is a document that can
// carry a script, and these files are served from this site's own origin, so one
// opened directly would run with the admin app's privileges.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// One of each per community: a new upload replaces the old one. `hero`, `icon` and
// `sitemap` are the original artwork; `logo` is the development's mark, `logolight`
// the same mark for dark backgrounds, and `lenderlogo` overrides the Summit logo.
const COMMUNITY_PHOTO_KINDS = ['hero', 'icon', 'sitemap', 'logo', 'logolight', 'lenderlogo'];
const AGENT_EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const AGENT_LABELS = {
  name: 'Name', brokerage: 'Brokerage', licenseNo: 'License number', licenseState: 'License state',
  phone: 'Phone', email: 'Email', website: 'Website',
};
const GUIDE_LABELS = {
  title: 'Title', category: 'Category', byline: 'Byline', note: 'Note', summary: 'Summary',
  body: 'Body', imageAlt: 'Picture description', slug: 'Address',
};
const GUIDE_TEXT_FIELDS = ['title', 'category', 'byline', 'note', 'summary', 'body', 'imageAlt'];
// A slug race loses to the unique index; pg and the file store both raise this.
const isDuplicate = (err) => err?.code === '23505';
// How many times a title-derived slug is recomputed after losing a race.
const SLUG_RETRIES = 12;

// Postgres refuses a NUL byte in any text value and throws, so one reaching a
// query would otherwise be an error the caller can trigger on demand. It has no
// meaning in anything a builder types, so it is dropped at the door.
// eslint-disable-next-line no-control-regex -- the NUL is the thing being matched.
const NUL = /\u0000/g;
const noNul = (text) => text.replace(NUL, '');

// The first bytes of each format we accept. WebP is a RIFF container, so its
// marker sits after a four-byte length and is checked separately.
const IMAGE_SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
};
const startsWith = (buffer, signature, offset = 0) =>
  buffer.length >= offset + signature.length && signature.every((byte, i) => buffer[offset + i] === byte);

/** Whether `head` (the leading bytes of the decoded file) is what `contentType` says it is. */
const looksLike = (contentType, head) => {
  if (contentType === 'image/webp') {
    return startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8);
  }
  return (IMAGE_SIGNATURES[contentType] ?? []).some((signature) => startsWith(head, signature));
};

/**
 * Express 4 does not catch a promise an async handler rejects: it becomes an
 * unhandled rejection, and Node exits on those. This wraps every handler a
 * router registers so a thrown store error reaches the app's 500 handler
 * instead, which keeps one bad request from taking the whole server down.
 * Error-handling middleware (four arguments) is passed through untouched.
 */
export const catchAsyncErrors = (router) => {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(path, ...handlers.map((handler) => (
      typeof handler !== 'function' || handler.length === 4
        ? handler
        : (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
    )));
  }
  return router;
};

/**
 * A text field from a request body: '' for blank, the trimmed string otherwise,
 * or an error when the caller sent something that is not text. Coercing instead
 * would store {a:1} as "[object Object]" and ['x','y'] as "x,y".
 */
const textField = (body, key, label) => {
  const value = body?.[key];
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: `${label} must be text.` };
  return { value: noNul(value).trim() };
};

/**
 * A realtor's fields from a request body, validated. Every limit is enforced
 * here rather than in the form, so a request that skips the form gets the same
 * answer. `partial` is a PATCH: only the fields present are checked and returned.
 *
 * Rejected, not trimmed to fit: silently cutting a licence number in half would
 * save something that looks right and is wrong.
 */
const cleanAgent = (body, { partial = false } = {}) => {
  const data = {};
  const has = (key) => body?.[key] !== undefined;

  for (const key of ['name', 'brokerage', 'licenseNo', 'phone']) {
    if (partial && !has(key)) continue;
    const { value, error } = textField(body, key, AGENT_LABELS[key]);
    if (error) return { error };
    if (value.length > AGENT_TEXT_MAX[key]) {
      return { error: `${AGENT_LABELS[key]} is too long (up to ${AGENT_TEXT_MAX[key]} characters).` };
    }
    data[key] = value;
  }
  if ('name' in data && !data.name) return { error: 'Give the realtor a name.' };

  if (!partial || has('licenseState')) {
    const field = has('licenseState') ? textField(body, 'licenseState', AGENT_LABELS.licenseState) : { value: 'UT' };
    if (field.error) return { error: field.error };
    const state = field.value.toUpperCase();
    if (!/^[A-Z]{0,2}$/.test(state)) {
      return { error: 'License state is a two-letter abbreviation, like UT.' };
    }
    data.licenseState = state;
  }
  if (!partial || has('email')) {
    const { value: email, error } = textField(body, 'email', AGENT_LABELS.email);
    if (error) return { error };
    if (email.length > AGENT_TEXT_MAX.email) {
      return { error: `Email is too long (up to ${AGENT_TEXT_MAX.email} characters).` };
    }
    if (email && !AGENT_EMAIL_RE.test(email)) return { error: 'That email address is not valid.' };
    data.email = email;
  }
  if (!partial || has('website')) {
    const { value: raw, error } = textField(body, 'website', AGENT_LABELS.website);
    if (error) return { error };
    // safeHref returns '' for anything that is not http(s), which is how a
    // javascript: address is refused rather than stored and rendered as a link.
    const href = raw ? safeHref(raw) : '';
    if (raw && !href) return { error: 'The website must be an http:// or https:// address.' };
    if (href.length > AGENT_TEXT_MAX.website) {
      return { error: `Website is too long (up to ${AGENT_TEXT_MAX.website} characters).` };
    }
    data.website = href;
  }
  return { data };
};

/** A guide's text fields, validated the same way: refused when over the cap. */
const cleanGuideText = (body, { partial = false } = {}) => {
  const data = {};
  for (const key of GUIDE_TEXT_FIELDS) {
    if (partial && body?.[key] === undefined) continue;
    // The article keeps its own line breaks and indentation, so only the ends are trimmed.
    const { value, error } = textField(body, key, GUIDE_LABELS[key]);
    if (error) return { error };
    if (value.length > GUIDE_TEXT_MAX[key]) {
      return { error: `${GUIDE_LABELS[key]} is too long (up to ${GUIDE_TEXT_MAX[key]} characters).` };
    }
    data[key] = value;
  }
  return { data };
};

/** A real boolean, the fallback when absent, or null for anything else ('false' is not false). */
const flag = (value, fallback) => {
  if (value === undefined) return fallback ?? null;
  return typeof value === 'boolean' ? value : null;
};

/** Community name, location and builder are published into page titles and structured data, so they are bounded. */
const COMMUNITY_TEXT_MAX = 200;

const str = (v, fallback = '') => (v === undefined || v === null ? fallback : noNul(String(v)).trim());
const numOr = (v, fallback) => {
  const n = Number.parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * How many of a home are left: a whole number, or null for "this one has no
 * count". Blank clears it back to null; 0 is a real answer meaning sold, so it
 * must not be mistaken for blank. A negative or fractional count is nonsense
 * and clears rather than being stored.
 */
const unitCount = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
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
const LINK_INSTEAD = 'for a longer one, paste a YouTube or Vimeo link instead.';
const TRIM_INSTEAD = 'try a shorter clip.';

/**
 * What the first bytes say the file is, or null if they say nothing we know.
 *
 * The type a browser reports comes from the file's extension and the operating
 * system's registry, so a perfectly good clip arrives as '' or
 * application/octet-stream (an upper-case .MOV on Linux, a Windows machine with no
 * registered type) and as video/x-m4v for a file that plays fine as MP4. The
 * container's own signature is the better witness.
 *
 * It answers with a type that is NOT allowed for the files it recognises as
 * something else (a HEIC/AVIF picture or an M4A recording shares MP4's `ftyp` box,
 * and Matroska shares WebM's header), so a wrong label cannot talk them in.
 */
const NOT_VIDEO_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis', 'crx ',
]);
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ']);
const sniffVideoType = (base64) => {
  const head = Buffer.from(base64.slice(0, 96), 'base64');
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12);
    if (NOT_VIDEO_BRANDS.has(brand)) return 'image/heif';
    if (AUDIO_BRANDS.has(brand)) return 'audio/mp4';
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return head.includes('webm') ? 'video/webm' : 'video/x-matroska'; // browsers play WebM, not Matroska
  }
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'OggS') return 'video/ogg';
  return null;
};

const readVideo = (body, longerHint = LINK_INSTEAD) => {
  const dataUrl = String(body?.dataUrl ?? '');
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return { error: 'That file could not be read. Try picking it again.' };

  const [, declared, base64] = match;
  // A label that is missing or unhelpful yields to what the file says it is; a label
  // that says something else entirely (an image, a PDF) is never overruled.
  const sniffed = declared.startsWith('video/') || declared === 'application/octet-stream' ? sniffVideoType(base64) : null;
  const contentType = sniffed ?? declared;
  if (!VIDEO_TYPES.has(contentType)) {
    return { error: 'That is not a video file. MP4 works everywhere; WebM and MOV also play.' };
  }
  const sizeBytes = base64Bytes(base64);
  if (sizeBytes > MAX_VIDEO_BYTES) {
    // The hint differs by where the video is going: a resource can fall back to
    // a link, a home walkthrough cannot, and telling a builder to paste a link
    // into a form that has no link field is worse than saying nothing.
    return {
      error: `That video is ${megabytes(sizeBytes)}. Uploads stop at ${megabytes(MAX_VIDEO_BYTES)} `
        + `— ${longerHint}`,
    };
  }
  return { contentType, data: base64, sizeBytes };
};

export function adminRouter() {
  const router = rejectControlCharacters(catchAsyncErrors(Router()));

  // Wrong passwords are counted per visitor (an address; an IPv6 block counts as one), per visitor AND
  // email, and per email alone. The second means a single guesser at one address is stopped at 8 tries
  // without touching anyone else's sign-ins; it also means that on a shared address (an office wifi) a
  // guesser and the owner share a count, and the owner waits too. The third is the ceiling for
  // guessing from many addresses at once; it holds for 15 minutes for everyone, the owner included.
  // A right password clears the visitor-and-email count.
  const failuresPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  const failuresPerPerson = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
  const failuresPerEmail = createLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

  router.post('/login', async (req, res) => {
    const store = await getStore();
    const email = str(req.body?.email);
    const password = String(req.body?.password ?? '');
    const visitor = clientKey(req);
    const emailKey = email.toLowerCase().slice(0, 254);
    const personKey = `${visitor}|${emailKey}`;
    // Held before anything is awaited, and given back on a right password. Counting after the lookup
    // would let a burst of guesses sent at once all pass the check before the first is counted.
    const attempt = reserve([[failuresPerIp, visitor], [failuresPerPerson, personKey], [failuresPerEmail, emailKey]]);
    if (attempt.wait) {
      res.set('Retry-After', String(attempt.wait));
      return res.status(429).json({ error: tooMany('sign-in attempts', attempt.wait) });
    }
    let admin;
    try {
      admin = email && (await store.getAdminByEmail(email));
    } catch (err) {
      attempt.release(); // our failure, not a wrong password
      throw err;
    }
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'That email and password do not match.' });
    }
    attempt.release();
    failuresPerPerson.reset(personKey);
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
    const name = str(req.body?.name).slice(0, COMMUNITY_TEXT_MAX);
    if (!name) return res.status(400).json({ error: 'Give the community a name.' });
    const store = await getStore();
    const community = await store.createCommunity({
      name,
      location: str(req.body?.location).slice(0, COMMUNITY_TEXT_MAX) || 'Location TBD',
      status: COMMUNITY_STATUSES.includes(req.body?.status) ? req.body.status : 'Pre-sale',
      theme: THEMES[req.body?.theme] ? req.body.theme : DEFAULT_THEME,
      builder: str(req.body?.builder).slice(0, COMMUNITY_TEXT_MAX),
    });
    res.status(201).json(community);
  });

  router.get('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const [
      homes, highlights, resources, heroes, icons, maps, logos, logosLight, lenderLogos, agents, guides,
    ] = await Promise.all([
      store.listHomes(community.id),
      store.listHighlights(community.id),
      store.listResources(community.id),
      store.listCommunityPhotos(community.id, 'hero'),
      store.listCommunityPhotos(community.id, 'icon'),
      store.listCommunityPhotos(community.id, 'sitemap'),
      store.listCommunityPhotos(community.id, 'logo'),
      store.listCommunityPhotos(community.id, 'logolight'),
      store.listCommunityPhotos(community.id, 'lenderlogo'),
      store.listAgents(community.id),
      // Unpublished included: this is the builder's list, and a draft they
      // cannot see is a draft they cannot finish. No bodies; GET /guides/:id has those.
      store.listGuides(community.id, { includeUnpublished: true }),
    ]);
    res.json({
      ...community, homes, highlights, resources,
      heroPhoto: heroes[0] ?? null, iconPhoto: icons[0] ?? null, siteMap: maps[0] ?? null,
      logo: logos[0] ?? null, logoLight: logosLight[0] ?? null, lenderLogo: lenderLogos[0] ?? null,
      agents, guides,
    });
  });

  router.patch('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name).slice(0, COMMUNITY_TEXT_MAX) || community.name;
    if (req.body?.location !== undefined) patch.location = str(req.body.location).slice(0, COMMUNITY_TEXT_MAX);
    if (req.body?.builder !== undefined) patch.builder = str(req.body.builder).slice(0, COMMUNITY_TEXT_MAX);
    if (req.body?.websiteUrl !== undefined) patch.websiteUrl = str(req.body.websiteUrl) || null;
    if (req.body?.status !== undefined && COMMUNITY_STATUSES.includes(req.body.status)) patch.status = req.body.status;
    if (req.body?.theme !== undefined && THEMES[req.body.theme]) patch.theme = req.body.theme;
    // An unknown layout is ignored like an unknown theme, never stored: the buyer
    // app would have no stylesheet for it.
    if (req.body?.layout !== undefined && LAYOUT_KEYS.includes(req.body.layout)) {
      patch.layout = req.body.layout;
    }

    if (req.body?.settings) {
      const settings = { ...community.settings };
      for (const key of SETTING_KEYS) {
        const value = req.body.settings[key];
        if (value === undefined) continue;
        // Text or a number (the rate fields arrive as numbers), or null to clear.
        // Anything else would be stored as "[object Object]" or "x,y" and then
        // printed in the footer, the plan email and the structured data, which for
        // regulated wording is worse than a refusal.
        const plain = value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
        if (!plain) return res.status(400).json({ error: `${key} must be text.` });
        // Trimmed here, not in the form, so stray whitespace cannot break a
        // statement's wording. Only the printed copy has a length cap: it is
        // shown on every page of the buyer app, so a pasted novel is cut at the
        // door. A setting that predates the cap (a long program name, say) is
        // never silently shortened by an unrelated save.
        const text = str(value);
        // An address that would be ignored at render is refused here, so the admin is told
        // instead of wondering why a link never appears.
        if (key === 'loanApplicationUrl' && text && !safeHref(text)) {
          return res.status(400).json({ error: 'The loan application link must be a web address starting with http:// or https://.' });
        }
        if (key === 'incentiveEmail' && text && !INCENTIVE_EMAIL_RE.test(text)) {
          return res.status(400).json({ error: 'The incentive email must be a single email address.' });
        }
        if (key === 'lenderEmail' && text && !INCENTIVE_EMAIL_RE.test(text)) {
          return res.status(400).json({ error: 'The loan team email must be a single email address.' });
        }
        if (key === 'faqJson') {
          // A list, normalised: items trimmed, half-finished ones dropped, counts
          // capped. Anything that is not a list is refused rather than stored,
          // so a bad request cannot quietly empty the FAQ.
          const faq = normalizeFaqJson(text);
          if (faq === null) return res.status(400).json({ error: 'The FAQ could not be read. Send a list of questions and answers.' });
          settings[key] = faq;
        } else {
          // The incentive card is printed on the home screen like the compliance copy.
          const capped = key in COMPLIANCE_DEFAULTS || key.startsWith('incentive');
          settings[key] = capped ? text.slice(0, settingMaxLength(key)) : text;
        }
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
      unitsAvailable: unitCount(req.body?.unitsAvailable),
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
    // Sent explicitly as null or '' to clear the count; both land as null.
    if (req.body?.unitsAvailable !== undefined) {
      patch.unitsAvailable = unitCount(req.body.unitsAvailable);
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

  // ── home walkthroughs ────────────────────────────────────────────────────
  /**
   * One video per home, uploaded as a file. A PUT rather than a POST because
   * that is what it does: there is one walkthrough and this is it, so sending a
   * second replaces the first instead of leaving the builder to delete the old
   * one first.
   */
  router.put('/homes/:id/video', async (req, res) => {
    const store = await getStore();
    const home = await store.getHome(req.params.id);
    if (!home) return res.status(404).json({ error: 'Home not found' });

    // Validated here and not only in the browser: the cap is the product
    // decision, and a request that skips the form should not get past it.
    const read = readVideo(req.body, TRIM_INSTEAD);
    if (read.error) return res.status(400).json({ error: read.error });

    res.json(await store.setHomeVideo(home.id, { communityId: home.communityId, ...read }));
  });

  router.delete('/homes/:id/video', async (req, res) => {
    const store = await getStore();
    await store.deleteHomeVideo(req.params.id);
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
    // The label is the caller's word for it; the first bytes are the file's own.
    // An HTML page or a script labelled image/png is refused, and so is a
    // payload that decodes to nothing, which would otherwise replace a lender
    // logo or a realtor's portrait with an empty file.
    if (!looksLike(contentType, Buffer.from(data.slice(0, 128), 'base64'))) {
      return { error: 'That file is not a valid JPEG, PNG, WebP or GIF image. Try picking it again.' };
    }
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

  /**
   * Community-level artwork: `hero` for the QR landing, `icon` for the PWA, `sitemap` for the plat,
   * `logo` / `logolight` for the development's mark and `lenderlogo` for a replacement lender logo.
   */
  router.post('/communities/:id/photos/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!COMMUNITY_PHOTO_KINDS.includes(kind)) return res.status(400).json({ error: 'Unknown photo slot' });
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    // One of each per community — replace whatever is there. Added first and the
    // old ones removed after, so a failed write cannot leave the slot empty.
    const old = await store.listCommunityPhotos(community.id, kind);
    const added = await store.addPhoto({ communityId: community.id, kind, ...image });
    for (const photo of old) await store.deletePhoto(photo.id);
    res.status(201).json(added);
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

  // ── realtors ─────────────────────────────────────────────────────────────
  /** Up to MAX_AGENTS real estate agents per community, listed on every home. */
  router.post('/communities/:id/agents', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const full = () => res.status(400).json({ error: `Up to ${MAX_AGENTS} realtors per community.` });
    // A quick look first so a full community answers "full" before it answers
    // about the body; it is only a courtesy, the check that holds is below.
    if ((await store.countAgents(community.id)) >= MAX_AGENTS) return full();
    const clean = cleanAgent(req.body);
    if (clean.error) return res.status(400).json({ error: clean.error });
    // Counting and inserting are one step inside the store, under a lock. Done
    // here as two calls, a double-click on "Add a realtor" could pass the count
    // twice and leave five, with two of them sharing a position.
    const created = await store.createAgentIfRoom(community.id, clean.data, MAX_AGENTS);
    if (!created) return full();
    res.status(201).json(created);
  });

  router.patch('/agents/:id', async (req, res) => {
    const store = await getStore();
    const agent = await store.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Realtor not found' });
    const clean = cleanAgent(req.body, { partial: true });
    if (clean.error) return res.status(400).json({ error: clean.error });
    const patch = { ...clean.data };
    if (Number.isInteger(req.body?.position) && req.body.position >= 0 && req.body.position <= 99) {
      patch.position = req.body.position;
    }
    res.json(await store.updateAgent(agent.id, patch));
  });

  /** Removing the agent removes their picture and logo with them. */
  router.delete('/agents/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteAgent(req.params.id);
    res.status(204).end();
  });

  /**
   * An agent has one portrait and one logo; a second upload replaces the first.
   * Removing one outright is the existing DELETE /photos/:id.
   */
  const agentImageRoute = (kind) => async (req, res) => {
    const store = await getStore();
    const agent = await store.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Realtor not found' });
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    const old = await store.listAgentPhotos(agent.id, kind);
    const added = await store.addPhoto({
      communityId: agent.communityId, agentId: agent.id, kind, ...image,
    });
    for (const photo of old) await store.deletePhoto(photo.id);
    res.status(201).json(added);
  };
  router.post('/agents/:id/photo', agentImageRoute('agent'));
  router.post('/agents/:id/logo', agentImageRoute('agentlogo'));

  // ── buyer guides ─────────────────────────────────────────────────────────
  const slugsOf = async (store, communityId, exceptId = null) =>
    new Set(
      (await store.listGuides(communityId, { includeUnpublished: true }))
        .filter((g) => g.id !== exceptId)
        .map((g) => g.slug),
    );

  router.get('/guides/:id', async (req, res) => {
    const store = await getStore();
    const guide = await store.getGuide(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Guide not found' });
    res.json(guide);
  });

  router.post('/communities/:id/guides', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const clean = cleanGuideText(req.body);
    if (clean.error) return res.status(400).json({ error: clean.error });
    if (!clean.data.title) return res.status(400).json({ error: 'Give the guide a title.' });

    const published = flag(req.body?.published, true);
    if (published === null) return res.status(400).json({ error: 'Published must be true or false.' });

    let taken = await slugsOf(store, community.id);
    // A slug the builder typed is theirs to get right, so a clash is an error;
    // one derived from the title is ours to fix, so it gets a suffix instead.
    const typed = req.body?.slug !== undefined && str(req.body.slug);
    let slug;
    if (typed) {
      slug = slugify(req.body.slug);
      if (!slug) return res.status(400).json({ error: 'That address has no letters or numbers in it.' });
      if (taken.has(slug)) return res.status(400).json({ error: 'Another guide already uses that address.' });
    } else {
      slug = uniqueSlug(clean.data.title, taken);
    }
    const data = { ...clean.data, category: clean.data.category || 'Guide', published };
    for (let attempt = 0; ; attempt += 1) {
      try {
        return res.status(201).json(await store.createGuide(community.id, { ...data, slug }));
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        // Two requests with the same title picked the same suffix from the same
        // snapshot and the unique index let one through. Only a derived slug is
        // ours to move: look again at what is taken now and take the next free one.
        if (typed || attempt >= SLUG_RETRIES) {
          return res.status(400).json({ error: 'Another guide already uses that address.' });
        }
        taken = await slugsOf(store, community.id);
        slug = uniqueSlug(clean.data.title, taken);
      }
    }
  });

  /**
   * Brings back any supplied guide this community no longer has. Registered as
   * its own path, never a side effect of anything else: it is the only way
   * deleted guides return, because boot deliberately does not.
   */
  router.post('/communities/:id/guides/restore-defaults', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const added = await store.restoreDefaultGuides(community.id);
    res.json({
      restored: added.length,
      guides: await store.listGuides(community.id, { includeUnpublished: true }),
    });
  });

  router.patch('/guides/:id', async (req, res) => {
    const store = await getStore();
    const guide = await store.getGuide(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Guide not found' });

    const clean = cleanGuideText(req.body, { partial: true });
    if (clean.error) return res.status(400).json({ error: clean.error });
    const patch = { ...clean.data };
    // The title is what the buyer reads in the list and the browser tab: a guide
    // with none cannot be told apart from another.
    if ('title' in patch && !patch.title) return res.status(400).json({ error: 'A guide needs a title.' });
    // The category is blank-tolerant in the form but falls back, so the list never groups under "".
    if ('category' in patch && !patch.category) patch.category = 'Guide';

    if (req.body?.slug !== undefined) {
      const slug = slugify(req.body.slug);
      if (!slug) return res.status(400).json({ error: 'That address has no letters or numbers in it.' });
      if (slug !== guide.slug) {
        if ((await slugsOf(store, guide.communityId, guide.id)).has(slug)) {
          return res.status(400).json({ error: 'Another guide already uses that address.' });
        }
        patch.slug = slug;
      }
    }
    if (req.body?.published !== undefined) {
      const published = flag(req.body.published);
      if (published === null) return res.status(400).json({ error: 'Published must be true or false.' });
      patch.published = published;
    }
    if (Number.isInteger(req.body?.position) && req.body.position >= 0 && req.body.position <= 9999) {
      patch.position = req.body.position;
    }
    try {
      res.json(await store.updateGuide(guide.id, patch));
    } catch (err) {
      if (isDuplicate(err)) return res.status(400).json({ error: 'Another guide already uses that address.' });
      throw err;
    }
  });

  router.delete('/guides/:id', async (req, res) => {
    const store = await getStore();
    await store.deleteGuide(req.params.id);
    res.status(204).end();
  });

  /** One picture per guide: a second upload replaces the first. */
  router.post('/guides/:id/image', async (req, res) => {
    const store = await getStore();
    const guide = await store.getGuide(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Guide not found' });
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    const old = await store.listGuidePhotos(guide.id);
    const added = await store.addPhoto({
      communityId: guide.communityId, guideId: guide.id, kind: 'guide', ...image,
    });
    for (const photo of old) await store.deletePhoto(photo.id);
    // The stock picture's description would otherwise ride along onto the
    // builder's own photo, in the page and in the ImageObject markup. Blank
    // makes the guide fall back to its title until the builder writes a real one.
    if (guide.imageAlt === DEFAULT_GUIDE_IMAGE_ALT) await store.updateGuide(guide.id, { imageAlt: '' });
    res.status(201).json(added);
  });

  /** Back to the shared default picture. Answers with the guide so the editor can redraw it. */
  router.delete('/guides/:id/image', async (req, res) => {
    const store = await getStore();
    const guide = await store.getGuide(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Guide not found' });
    for (const photo of await store.listGuidePhotos(guide.id)) await store.deletePhoto(photo.id);
    res.json(await store.updateGuide(guide.id, { image: '' }));
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
   * Every consent answer this lead has given, newest first.
   *
   * Read-only, and there is deliberately no route that writes or edits one from
   * the admin side: a consent record the business can author is not evidence of
   * anything. They are written in one place, by the buyer, at the gate.
   */
  router.get('/leads/:id/consents', async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(await store.listConsents(lead.id));
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
