import { Router } from 'express';

import {
  AGENT_TEXT_MAX, AVAILABILITY, COMMUNITY_STATUSES, DEFAULT_FEATURES, DEFAULT_GUIDE_IMAGE_ALT,
  COMPLIANCE_DEFAULTS, CUSTOM_THEME, DEFAULT_SETTINGS, DEFAULT_THEME, DEFAULT_TOOLS_ENABLED, FEATURE_KEYS, GUIDE_TEXT_MAX, HIGHLIGHT_CATEGORY_KEYS,
  LAYOUT_KEYS, MAX_AGENTS, MAX_PHOTOS_PER_HOME, MAX_VIDEO_BYTES, MAX_VIDEOS, RESOURCE_KINDS,
  VIDEO_TYPES, base64Bytes, megabytes, safeHref, settingMaxLength, slugify, videoEmbed,
  isSafeEmail, isThemeKey, SLOT_TIMES, TOOL_KEYS, normalizeCommunitySlug, normalizeFaqJson, suggestCommunitySlug,
  LISTING_FEATURES, LISTING_LAYOUT, LISTING_SETTINGS, LISTING_STATUSES, LISTING_TOOLS, isListing, normalizeOpenHouses,
} from '../../shared/domain.js';
import { CUSTOM_KEYS, customThemeFrom, normalizeHex } from '../../shared/customTheme.js';
import { HOME_NUMBER_RULES, SETTING_NUMBER_RULES, creditOrderProblem, readHomeNumbers, readSetting } from '../../shared/numberInput.js';
import { getStore } from '../db/index.js';
import { uniqueSlug } from '../db/shape.js';
import { clientKey, createLimiter, mailboxKey, reserve, tooMany } from '../lib/limits.js';
import { hasControlCharacter, rejectControlCharacters } from '../lib/params.js';
import { emailConfigured } from '../lib/email.js';
import { buildReport, emailReport, reportDay } from '../lib/report.js';
import { linkOriginOf, pinnedOrigin } from '../lib/ssr.js';
import { buildMismo34, mismoFilename } from '../lib/mismo.js';
import {
  DEFAULT_LEAD_SORT, LEAD_SORTS, describeTour, isReadyToCall, isTourPending, isUnread, lenderNameOf,
} from '../../shared/domain.js';
import { loadLenderBrand } from '../lib/lenderBrand.js';
import { PERIODS, buildLeadsPdf, buildUserPdf } from '../lib/pdfReports.js';
import {
  INVITE_TTL_MS, RESET_TTL_MS, forgetAdminSessions, hashPassword, hashResetToken, issueToken, newResetToken, passwordProblem,
  requireAdmin, unusablePasswordHash, verifyPassword,
} from '../lib/auth.js';
import { NO_ACCESS, OWNER_ONLY, canAccess, forgetAdminAccess, forgetAllAdminAccess, isOwner, requireOwner, roleOf } from '../lib/access.js';
import { recordActivity } from '../lib/activity.js';
import { sendAdminInvite, sendPasswordReset } from '../lib/notify.js';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
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
// The same slots as the activity log names them, so "changed the site map" reads as what the admin did.
const ARTWORK_NAMES = {
  hero: 'the cover photo', icon: 'the app icon', sitemap: 'the site map', logo: 'the development logo',
  logolight: 'the development logo for dark backgrounds', lenderlogo: 'the lender logo',
};
// What a home's fields are called in the log, so a line says "price, availability" rather than camelCase.
const HOME_FIELD_NAMES = {
  name: 'name', price: 'price', beds: 'beds', baths: 'baths', sqft: 'square feet', description: 'description',
  availability: 'availability', lotNumber: 'lot number', readyOn: 'ready date', unitsAvailable: 'units available', videoLink: 'video link',
};
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

/**
 * Whether a figure sent for a home is the one already stored. Only a plain number or a plain numeric string
 * can be "the same": "475k" is a change even if it happens to match, and a blank count is the same as a stored
 * 0 ("not given") but a blank price is never the same, since a price is required.
 */
const sameHomeNumber = (home, key, sent) => {
  if (sent === null || (typeof sent === 'string' && !sent.trim())) return key !== 'price' && Number(home[key]) === 0;
  if (typeof sent !== 'number' && typeof sent !== 'string') return false;
  const text = String(sent).trim();
  if (typeof sent === 'string' && !/^\d+(\.\d+)?$/.test(text)) return false;
  return Number(text) === Number(home[key]);
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
  // The lead report goes to a real inbox and holds people's details, so a double click or a stuck button cannot
  // send it twice in a breath, and a day has a ceiling.
  const reportBurst = createLimiter({ windowMs: 15 * 1000, max: 1 });
  const reportPerDay = createLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 30 });
  // A PDF is built in memory from every lead, so the number made at once is kept small.
  const pdfBurst = createLimiter({ windowMs: 10 * 1000, max: 4 });
  const failuresPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  const failuresPerPerson = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
  const failuresPerEmail = createLimiter({ windowMs: 15 * 60 * 1000, max: 60 });

  /** The account as a session answer carries it: what the client keeps beside the token, the role included. */
  const sessionAdmin = (admin) => ({ id: admin.id, email: admin.email, role: roleOf(admin) });

  // ── who may touch what ───────────────────────────────────────────────────
  // Every route below that is about a community, or a thing inside one (a home, a guide, a lead, a photo),
  // finds the community first and asks canAccess (server/lib/access.js) before it does anything else. The
  // owner passes everywhere. A member passes inside the communities shared with them and is answered 403,
  // with the same sentence, for any other, whether it exists or not. A thing that does not exist at all is
  // still a 404, as it was, so a stale page learns the right thing.
  const refuse = (res) => res.status(403).json({ error: NO_ACCESS });
  /** Whether this admin may see `communityId`, answering the 403 when not: for the routes that read by the id alone. */
  const allowed = (req, res, communityId) => {
    if (canAccess(req.access, communityId)) return true;
    refuse(res);
    return false;
  };
  /**
   * The row a route is about, looked up and checked, or null once the answer has gone out (404 for no such
   * row, 403 for one in a community this admin may not see). `lookup` is the store's promise of the row, which
   * carries its communityId; one helper per kind of thing below, so the first lines of every route read alike.
   */
  const guarded = async (req, res, lookup, missing) => {
    const row = await lookup;
    if (!row) {
      res.status(404).json({ error: missing });
      return null;
    }
    if (!canAccess(req.access, row.communityId)) {
      refuse(res);
      return null;
    }
    return row;
  };
  // A community is checked by its id before it is looked up: a member gets the one sentence for a community that
  // is not theirs whether it exists, was deleted a moment ago or never was, and learns nothing from the difference.
  const communityOf = async (req, res, store, id = req.params.id) => {
    if (!allowed(req, res, id)) return null;
    const community = await store.getCommunity(id);
    if (!community) {
      res.status(404).json({ error: 'Community not found' });
      return null;
    }
    return community;
  };
  const homeOf = (req, res, store) => guarded(req, res, store.getHome(req.params.id), 'Home not found');
  const highlightOf = (req, res, store) => guarded(req, res, store.getHighlight(req.params.id), 'Highlight not found');
  const resourceOf = (req, res, store) => guarded(req, res, store.getResource(req.params.id), 'Not found');
  const agentOf = (req, res, store) => guarded(req, res, store.getAgent(req.params.id), 'Realtor not found');
  const guideOf = (req, res, store) => guarded(req, res, store.getGuide(req.params.id), 'Guide not found');
  const slotOf = (req, res, store) => guarded(req, res, store.getSlot(req.params.id), 'Slot not found');
  const leadOf = (req, res, store) => guarded(req, res, store.getLead(req.params.id), 'Lead not found');
  const photoOf = (req, res, store) => guarded(req, res, store.getPhotoOwner(req.params.id), 'Photo not found');

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
    res.json({ token: issueToken(admin), admin: sessionAdmin(admin) });
  });

  /** Who is signed in. The role comes from the row (through requireAdmin's cache), never from the token: a token outlives a role. */
  router.get('/me', requireAdmin, (req, res) => {
    res.json({ id: req.admin.sub, email: req.admin.email, role: req.access.role });
  });

  // ── forgotten passwords ──────────────────────────────────────────────────
  // Anyone can type an address into the form, so the answer never says whether it has an account: the
  // same sentence either way, and the email is not waited for, so the round trip does not say whether
  // one went out. What does differ is one write: an address with an account has its link row written
  // before the answer (a few milliseconds; one transaction on Postgres), which a caller timing many
  // requests could tell from an address without one. That is accepted rather than faked with a write
  // for every stranger: there is one account, and the limits below (three requests per inbox and ten
  // per visitor in 15 minutes, which also keep the form from filling somebody's mailbox) leave a caller
  // few requests to time. They are held before the lookup, like a sign-in attempt, so a burst sent at
  // once cannot all pass the check first.
  const forgotPerMailbox = createLimiter({ windowMs: 15 * 60 * 1000, max: 3 });
  const forgotPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const resetPerIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const FORGOT_ANSWER = 'If that address has an account, a reset link is on its way; it works for 30 minutes.';
  const BAD_LINK = 'That link has expired or was already used. Ask for a new one.';

  router.post('/password/forgot', async (req, res) => {
    const store = await getStore();
    const email = str(req.body?.email).slice(0, 254);
    if (!email.includes('@')) return res.status(400).json({ error: 'Enter the email you sign in with.' });
    const attempt = reserve([[forgotPerIp, clientKey(req)], [forgotPerMailbox, mailboxKey(email)]]);
    if (attempt.wait) {
      res.set('Retry-After', String(attempt.wait));
      return res.status(429).json({ error: tooMany('reset requests', attempt.wait) });
    }
    let admin;
    try {
      admin = await store.getAdminByEmail(email);
    } catch (err) {
      attempt.release(); // our failure, not theirs
      throw err;
    }
    if (admin) {
      const { token, hash } = newResetToken();
      await store.createPasswordReset({ adminId: admin.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
      const origin = linkOriginOf(req);
      if (!emailConfigured()) {
        console.warn(`A password reset was asked for ${admin.email}, but email is off (RESEND_API_KEY is not set), so no link was sent. `
          + 'Set it, or set a new ADMIN_PASSWORD in the Render dashboard instead.');
      } else if (!origin) {
        console.warn(`A password reset was asked for ${admin.email}, but the site\'s address is not known (set PUBLIC_ORIGIN), so no link was sent.`);
      } else {
        // Not awaited: the person is told the same thing either way, and a send that fails is logged by
        // sendEmail itself. The token is in the link and nowhere else.
        sendPasswordReset({ to: admin.email, link: `${origin}/admin/reset?token=${token}` });
      }
    }
    return res.json({ ok: true, message: FORGOT_ANSWER });
  });

  router.post('/password/reset', async (req, res) => {
    const store = await getStore();
    const visitor = clientKey(req);
    const attempt = reserve([[resetPerIp, visitor]]);
    if (attempt.wait) {
      res.set('Retry-After', String(attempt.wait));
      return res.status(429).json({ error: tooMany('attempts', attempt.wait) });
    }
    const token = str(req.body?.token);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    // One sentence for a link that is missing, made up, used or old: which of those it is tells a
    // stranger holding a stale link nothing useful, and the owner's next step is the same for all.
    const reset = token ? await store.getPasswordReset(hashResetToken(token)) : null;
    if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: BAD_LINK });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    const admin = await store.getAdminById(reset.adminId);
    if (!admin) return res.status(400).json({ error: BAD_LINK });
    const passwordHash = hashPassword(password);
    // Taken after the hashing, so a session issued just before this request began is surely older.
    const changedAt = new Date();
    // The link is spent before the password changes: two requests carrying it at once get one change.
    if (!(await store.usePasswordReset(reset.id, changedAt))) return res.status(400).json({ error: BAD_LINK });
    // An invited account becomes an ordinary one here: the link in its invitation is a reset link too.
    await store.updateAdmin(admin.id, { passwordHash, passwordChangedAt: changedAt, invitedAt: null });
    forgetAdminSessions(admin.id);
    // Whoever was guessing at this account was guessing the old password.
    const emailKey = admin.email.toLowerCase();
    failuresPerEmail.reset(emailKey);
    failuresPerPerson.reset(`${visitor}|${emailKey}`);
    // Signed in from here, with a token that dates from the change itself, so this is the one session left.
    return res.json({ token: issueToken(admin, { issuedAt: changedAt.getTime() }), admin: sessionAdmin(admin) });
  });

  // Everything below requires a signed-in admin.
  router.use(requireAdmin);

  /**
   * A new password chosen while signed in. The current one is asked for again, so a tab left open on a
   * shared computer cannot be used to lock the owner out; a wrong one is counted like a wrong sign-in.
   * The answer carries a fresh session for this tab, dated from the change, so it stays signed in while
   * every other one (the old phone, the shared computer) ends on its next request.
   */
  router.post('/password/change', async (req, res) => {
    const store = await getStore();
    const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const admin = await store.getAdminById(req.admin.sub);
    if (!admin) return res.status(401).json({ error: 'Not signed in' });
    const visitor = clientKey(req);
    const emailKey = admin.email.toLowerCase();
    const personKey = `${visitor}|${emailKey}`;
    const attempt = reserve([[failuresPerIp, visitor], [failuresPerPerson, personKey], [failuresPerEmail, emailKey]]);
    if (attempt.wait) {
      res.set('Retry-After', String(attempt.wait));
      return res.status(429).json({ error: tooMany('password attempts', attempt.wait) });
    }
    if (!verifyPassword(current, admin.password_hash)) {
      return res.status(400).json({ error: 'That is not your current password.' });
    }
    attempt.release();
    failuresPerPerson.reset(personKey);
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    const passwordHash = hashPassword(password);
    const changedAt = new Date();
    await store.updateAdmin(admin.id, { passwordHash, passwordChangedAt: changedAt, invitedAt: null });
    forgetAdminSessions(admin.id);
    return res.json({ token: issueToken(admin, { issuedAt: changedAt.getTime() }), admin: sessionAdmin(admin) });
  });

  // ── the team ─────────────────────────────────────────────────────────────
  // The owner's pages: who can sign in, who sees which communities, and what everyone did. A member is
  // answered 403 on all of them (requireOwner), so the team is the owner's alone to shape. An invite makes
  // the account at once, as a member with whatever branches and communities the owner ticked, with a password nobody
  // holds, and emails a set-password link: the same link the forgot form sends, kept for seven days instead
  // of thirty minutes, so the person signs in by choosing a password and nothing (no temporary password)
  // ever travels in the mail. Until they do, the row is marked invited, the invite can be sent again, and a
  // sign-in attempt at that address fails like any wrong password. The limits are per signed-in visitor: an
  // admin is trusted, but a stuck button or a script on a signed-in tab should still not be able to fill
  // strangers' mailboxes from the site's sending address.
  router.use('/team', requireOwner);
  router.use('/activity', requireOwner);
  const invitePerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
  const resendPerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const COMMUNITY_IDS_BAD = 'Send communityIds as a list of community ids.';
  const BRANCH_IDS_BAD = 'Send branchIds as a list of branch ids.';
  /**
   * A list of ids a Team or Branches request carries (`communityIds`, `branchIds`, `adminIds`): each once, or
   * null for anything that is not a list of strings. An absent field is an empty list (an invite with no
   * communities is fine); the ids are not checked against the store here, because every set* store method keeps
   * only the ones that exist.
   */
  const idList = (value) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && !hasControlCharacter(id))) return null;
    return [...new Set(value.map((id) => id.trim()).filter(Boolean))];
  };
  /** The names of these communities for a log line, in their usual order, or `none` when there are none. */
  const namesOf = async (store, ids, none) => {
    if (!ids.length) return none;
    return (await store.listCommunities()).filter((c) => ids.includes(c.id)).map((c) => c.name).join(', ');
  };
  /** "A", "A and B", "A, B and C": names the way a sentence lists them. */
  const listed = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
  /**
   * What a person may see, for a log line: their branches first (every community in each, now and later), then
   * the communities ticked for them on their own, or "no communities" for neither. "the Summit Homes branch, and
   * Willow Creek" says where each part of their access comes from, which is what the owner reads the line for.
   */
  const describeAccess = async (store, branchIds, communityIds) => {
    const parts = [];
    if (branchIds.length) {
      const names = (await store.listBranches()).filter((b) => branchIds.includes(b.id)).map((b) => b.name);
      if (names.length) parts.push(`the ${listed(names)} ${names.length === 1 ? 'branch' : 'branches'}`);
    }
    if (communityIds.length) parts.push(await namesOf(store, communityIds, ''));
    return parts.filter(Boolean).join(', and ') || 'no communities';
  };
  /**
   * The address ensureAdmin (server/index.js) makes an account for at every start, while both variables are set.
   * Removing that account here would hold only until the next deploy, when it would be back with ADMIN_PASSWORD,
   * so its row says so, and a removal is refused with what to change instead. Read per request: the variables
   * are the dashboard's, and the tests set them for a moment.
   */
  const bootstrapEmail = () => (
    process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD ? process.env.ADMIN_EMAIL.toLowerCase() : null
  );
  const BOOTSTRAP_STAYS = 'That account is set by ADMIN_EMAIL in Render and would be made again at the next deploy. '
    + 'Change or clear ADMIN_EMAIL and ADMIN_PASSWORD there first.';
  /**
   * An admin as the Team page shows it: never the hashes, whether the invited person has set a password yet, the
   * role, and for a member where their access comes from: the branches they are in (`branchIds`, every community
   * in each) and the communities shared with them on their own (`communityIds`). An owner's lists are empty: the
   * role says they have every community, and the page reads "All communities" from it.
   */
  const teamMember = (admin, communityIds = [], branchIds = []) => ({
    id: admin.id,
    email: admin.email,
    role: roleOf(admin),
    branchIds: roleOf(admin) === 'owner' ? [] : branchIds,
    communityIds: roleOf(admin) === 'owner' ? [] : communityIds,
    createdAt: admin.created_at,
    // Set until a password is chosen, by whichever link; the page says "Invited" and offers to resend.
    invitedAt: admin.invited_at ?? null,
    passwordSet: !admin.invited_at,
    // Made again at every start, so the page explains instead of offering Remove; see bootstrapEmail.
    bootstrap: admin.email.toLowerCase() === bootstrapEmail(),
  });
  /**
   * Emails the set-password link to a new or re-invited admin, and says whether it went. Not sent when email is
   * off or the site's own address is unknown; the account exists either way, so the owner is told why and can
   * press Resend once the setting is in place, rather than finding out from a log line.
   */
  const emailInvite = async (req, admin, token) => {
    const origin = linkOriginOf(req);
    if (!emailConfigured()) {
      return { sent: false, reason: 'email is not set up on this site yet. Add RESEND_API_KEY and EMAIL_FROM in Render, then press Resend invite.' };
    }
    if (!origin) return { sent: false, reason: 'the site\'s address is not known. Set PUBLIC_ORIGIN in Render, then press Resend invite.' };
    // `invite=1` only picks the words on the page ("Set your password" rather than "Choose a new one"); the
    // token is checked on the server as it is for every reset link, and the hint changes nothing there.
    const result = await sendAdminInvite({ to: admin.email, invitedBy: req.admin.email, link: `${origin}/admin/reset?token=${token}&invite=1` });
    return result.sent ? { sent: true } : { sent: false, reason: result.error || result.skipped || 'the email could not be sent.' };
  };

  router.get('/team', async (_req, res) => {
    const store = await getStore();
    // One read for everyone's communities and one for everyone's branches rather than two per row: the page
    // lists the whole team at once.
    const [admins, assignments, memberships] = await Promise.all([
      store.listAdmins(), store.listAdminAssignments(), store.listAdminBranchAssignments(),
    ]);
    const communitiesOf = new Map();
    for (const { adminId, communityId } of assignments) communitiesOf.set(adminId, [...(communitiesOf.get(adminId) ?? []), communityId]);
    const branchesOf = new Map();
    for (const { adminId, branchId } of memberships) branchesOf.set(adminId, [...(branchesOf.get(adminId) ?? []), branchId]);
    res.json(admins.map((admin) => teamMember(admin, communitiesOf.get(admin.id) ?? [], branchesOf.get(admin.id) ?? [])));
  });

  router.post('/team/invites', async (req, res) => {
    const store = await getStore();
    // Lower-cased: sign-in looks the address up without regard to case, and the row is the one the person
    // will see in the list and in the mail's "invited by" line.
    const email = str(req.body?.email).toLowerCase();
    if (!isSafeEmail(email) || hasControlCharacter(email)) {
      return res.status(400).json({ error: 'Enter a full email address, like name@example.com.' });
    }
    const communityIds = idList(req.body?.communityIds);
    if (communityIds === null) return res.status(400).json({ error: COMMUNITY_IDS_BAD });
    const branchIds = idList(req.body?.branchIds);
    if (branchIds === null) return res.status(400).json({ error: BRANCH_IDS_BAD });
    const hold = reserve([[invitePerIp, clientKey(req)]]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('invites', hold.wait) });
    }
    let created;
    let given;
    let joined;
    try {
      if (await store.getAdminByEmail(email)) {
        hold.release(); // nothing was sent
        return res.status(400).json({ error: 'That address already has access.' });
      }
      created = await store.createAdmin({ email, passwordHash: unusablePasswordHash(), invitedAt: new Date(), role: 'member' });
      // Shared from the start, so the person opens on their communities the moment they set a password.
      given = await store.setAdminCommunities(created.id, communityIds);
      joined = await store.setAdminBranches(created.id, branchIds);
    } catch (err) {
      hold.release(); // our failure
      throw err;
    }
    const { token, hash } = newResetToken();
    await store.createPasswordReset({ adminId: created.id, tokenHash: hash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
    const outcome = await emailInvite(req, created, token);
    await recordActivity(store, req, {
      action: 'team.invited', subject: created.email, detail: `Given access to: ${await describeAccess(store, joined, given)}`,
    });
    return res.json({ admin: teamMember(created, given, joined), ...outcome });
  });

  /**
   * Which communities a member may see on their own, replaced whole: the page saves the ticked boxes as one list,
   * so a list is what arrives, and what was shared before and is not in it is withdrawn. Their branches are left
   * as they are (PUT /team/:id/access below changes both at once). Not for the owner, who has every community by
   * role and nothing here to change. Seen by the member at once on this instance: their cached access is dropped,
   * so their next request is answered from the new list (see forgetAdminAccess).
   */
  router.put('/team/:id/communities', async (req, res) => {
    const store = await getStore();
    const admin = await store.getAdminById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'That account is no longer here.' });
    if (roleOf(admin) === 'owner') return res.status(400).json({ error: 'The owner has every community already.' });
    const communityIds = req.body?.communityIds === undefined ? null : idList(req.body.communityIds);
    if (communityIds === null) return res.status(400).json({ error: COMMUNITY_IDS_BAD });
    const kept = await store.setAdminCommunities(admin.id, communityIds);
    forgetAdminAccess(admin.id);
    const branchIds = await store.listAdminBranches(admin.id);
    await recordActivity(store, req, {
      action: 'team.assigned', subject: admin.email, detail: `Now has access to: ${await describeAccess(store, branchIds, kept)}`,
    });
    return res.json(teamMember(admin, kept, branchIds));
  });

  /**
   * Where a member's access comes from, both parts at once: the branches they are in and the communities shared
   * with them on their own, each replaced whole, which is what the Edit access dialog saves. Both lists have to
   * be sent: one left out would have to mean "and clear the other", which nobody means, so it is refused instead.
   */
  router.put('/team/:id/access', async (req, res) => {
    const store = await getStore();
    const admin = await store.getAdminById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'That account is no longer here.' });
    if (roleOf(admin) === 'owner') return res.status(400).json({ error: 'The owner has every community already.' });
    const branchIds = req.body?.branchIds === undefined ? null : idList(req.body.branchIds);
    if (branchIds === null) return res.status(400).json({ error: BRANCH_IDS_BAD });
    const communityIds = req.body?.communityIds === undefined ? null : idList(req.body.communityIds);
    if (communityIds === null) return res.status(400).json({ error: COMMUNITY_IDS_BAD });
    const joined = await store.setAdminBranches(admin.id, branchIds);
    const kept = await store.setAdminCommunities(admin.id, communityIds);
    forgetAdminAccess(admin.id);
    await recordActivity(store, req, {
      action: 'team.assigned', subject: admin.email, detail: `Now has access to: ${await describeAccess(store, joined, kept)}`,
    });
    return res.json(teamMember(admin, kept, joined));
  });

  /** The invitation again, with a fresh link that replaces the earlier one. Only for an account still waiting on its password. */
  router.post('/team/invites/:id/resend', async (req, res) => {
    const store = await getStore();
    const admin = await store.getAdminById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'That account is no longer here.' });
    if (!admin.invited_at) return res.status(400).json({ error: 'They have already set a password, so there is nothing to resend.' });
    const hold = reserve([[resendPerIp, clientKey(req)]]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('invites', hold.wait) });
    }
    const { token, hash } = newResetToken();
    // Stamped again, so the list says when the link that is now good went out.
    const invited = await store.updateAdmin(admin.id, { invitedAt: new Date() });
    await store.createPasswordReset({ adminId: admin.id, tokenHash: hash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
    const outcome = await emailInvite(req, invited, token);
    await recordActivity(store, req, { action: 'team.invited', subject: invited.email, detail: 'Sent the invite again' });
    return res.json({
      admin: teamMember(invited, await store.listAdminCommunities(invited.id), await store.listAdminBranches(invited.id)), ...outcome,
    });
  });

  /**
   * Takes someone's access away. Not your own (sign out, or have a colleague do it), not the account the
   * environment would make again at the next start, and never the last account, so the admin can always be got
   * into: that last rule is the store's, checked as it deletes, so two admins removing each other at the same
   * moment cannot both get through. Their reset links go with the row, and their sessions end on their next
   * request: the session check reads the store for an admin it has nothing cached for and finds no row.
   */
  router.delete('/team/:id', async (req, res) => {
    const store = await getStore();
    const { id } = req.params;
    if (id === req.admin.sub) return res.status(400).json({ error: 'You cannot remove yourself. Ask another admin to.' });
    const admin = await store.getAdminById(id);
    if (!admin) return res.status(404).json({ error: 'That account is no longer here.' });
    if (admin.email.toLowerCase() === bootstrapEmail()) return res.status(400).json({ error: BOOTSTRAP_STAYS });
    if (!(await store.deleteAdmin(id))) {
      // The store says no for the last account, and just the same when the row went between the look-up above
      // and now (a colleague removed it first).
      return (await store.getAdminById(id))
        ? res.status(400).json({ error: 'The last admin cannot be removed.' })
        : res.status(404).json({ error: 'That account is no longer here.' });
    }
    // Their assignments went with the row (the table cascades); this drops the copy their last request cached,
    // so a request already in flight on an old token finds no row rather than a 30-second-old list.
    forgetAdminSessions(id);
    // The email in the subject, because the row that held it is gone and the line must still read.
    await recordActivity(store, req, { action: 'team.removed', subject: admin.email });
    return res.status(204).end();
  });

  // ── the activity log ─────────────────────────────────────────────────────
  // Owner only (router.use above). The most rows one page carries; the Today card asks for 5, the page for 50.
  const ACTIVITY_PAGE_MAX = 200;
  /**
   * What everyone did, newest first, as pages: `adminId` and `communityId` narrow it to one person or one
   * community, `before` is the `nextBefore` of the page before, and `limit` (50 unless asked) is the page's
   * size. `nextBefore` is null on the last page. Each entry names the admin by email and the community by its
   * current name, or null for a community since deleted (the entry's subject or detail still says which).
   */
  router.get('/activity', async (req, res) => {
    const store = await getStore();
    const one = (value) => (typeof value === 'string' ? value.trim() : '');
    const adminId = one(req.query.adminId);
    const communityId = one(req.query.communityId);
    const before = one(req.query.before);
    if (before && Number.isNaN(new Date(before).getTime())) return res.status(400).json({ error: 'before must be a time from an earlier page.' });
    const asked = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(asked) || asked < 1) return res.status(400).json({ error: `limit must be a whole number from 1 to ${ACTIVITY_PAGE_MAX}.` });
    const limit = Math.min(asked, ACTIVITY_PAGE_MAX);
    // One more than the page, to know whether there is a next one without a second query.
    const rows = await store.listAdminActivity({ adminId: adminId || null, communityId: communityId || null, before: before || null, limit: limit + 1 });
    const page = rows.slice(0, limit);
    // The cursor is the store's own stamp for the last row, at whatever precision it keeps; `at` is for reading.
    const nextBefore = rows.length > limit ? page[page.length - 1].cursor : null;
    res.json({ entries: page.map(({ cursor, ...entry }) => entry), nextBefore });
  });

  // ── branches ─────────────────────────────────────────────────────────────
  // A branch is a company or a group: the owner's way of boxing one builder's communities off from another's
  // while still seeing all of them. A community is in at most one branch; a person can be in several, and being
  // in one is access to every community in it, now and whenever one is added, on top of whatever is ticked for
  // them on their own (server/lib/access.js). All of it is the owner's: a member sees the name of the branch a
  // community is in on the community itself (GET /communities) and nothing more, so every route here answers a
  // member 403.
  //
  // A change to which communities a branch holds reaches whoever is in it (and, for a community moved from
  // another branch, whoever is in that one), and which members those are is exactly the question the access cache
  // exists to avoid asking per request, so those changes clear the whole cache (forgetAllAdminAccess) rather than
  // work it out; each admin's next request reads their access afresh. A change to who is in a branch names the
  // people, so it clears only theirs.
  router.use('/branches', requireOwner);
  const BRANCH_NAME_MAX = 80;
  /** The branch's name from a request body: trimmed, 1 to 80 characters, or the sentence saying why not. */
  const branchNameOf = (body) => {
    const { value, error } = textField(body, 'name', 'The branch name');
    if (error) return { error };
    if (!value) return { error: 'Give the branch a name.' };
    if (value.length > BRANCH_NAME_MAX) return { error: `The branch name is too long (up to ${BRANCH_NAME_MAX} characters).` };
    return { name: value };
  };
  /**
   * Whether another branch already has this name in any letter case; the owner would otherwise have two "Summit
   * Homes" to tell apart in every list. The unique index in schema.sql is what catches two requests racing
   * (isDuplicate, below); this check is what lets the answer say which name.
   */
  const branchNameTaken = async (store, name, exceptId = null) => {
    const other = await store.getBranchByName(name);
    return Boolean(other && other.id !== exceptId);
  };
  const nameTaken = (name) => `There is already a branch called ${name}.`;
  const BRANCH_MISSING = 'Branch not found';
  const branchOf = async (req, res, store) => {
    const branch = await store.getBranch(req.params.id);
    if (!branch) res.status(404).json({ error: BRANCH_MISSING });
    return branch;
  };
  /** "2 communities", "1 person": a count with its noun, for a log line. */
  const countOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /** Every branch with its communities and people, in name order: what the Branches page and the Edit access dialog list. */
  router.get('/branches', async (_req, res) => {
    const store = await getStore();
    res.json(await store.listBranches());
  });

  router.post('/branches', async (req, res) => {
    const store = await getStore();
    const { name, error } = branchNameOf(req.body);
    if (error) return res.status(400).json({ error });
    if (await branchNameTaken(store, name)) return res.status(400).json({ error: nameTaken(name) });
    let branch;
    try {
      branch = await store.createBranch({ name });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      return res.status(400).json({ error: nameTaken(name) });
    }
    await recordActivity(store, req, { action: 'branch.created', subject: branch.name });
    return res.status(201).json(branch);
  });

  /** A rename. Nothing about who or what is in the branch moves, so nobody's access changes. */
  router.patch('/branches/:id', async (req, res) => {
    const store = await getStore();
    const branch = await branchOf(req, res, store);
    if (!branch) return;
    const { name, error } = branchNameOf(req.body);
    if (error) return res.status(400).json({ error });
    if (await branchNameTaken(store, name, branch.id)) return res.status(400).json({ error: nameTaken(name) });
    let renamed;
    try {
      renamed = await store.updateBranch(branch.id, { name });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      return res.status(400).json({ error: nameTaken(name) });
    }
    if (!renamed) return res.status(404).json({ error: BRANCH_MISSING });
    // The same name again is not a change, and a line saying "renamed from X to X" would only puzzle the owner.
    if (renamed.name !== branch.name) {
      await recordActivity(store, req, { action: 'branch.updated', subject: renamed.name, detail: `Renamed from ${branch.name}` });
    }
    return res.json(renamed);
  });

  /**
   * Takes the grouping away and nothing else: its communities stay, in no branch, and its people keep their
   * accounts and whatever communities are ticked for them on their own (the cascades in schema.sql; the file
   * store does the same by hand). What goes, at once, is the access that came only through the branch.
   */
  router.delete('/branches/:id', async (req, res) => {
    const store = await getStore();
    const branch = await branchOf(req, res, store);
    if (!branch) return;
    if (!(await store.deleteBranch(branch.id))) return res.status(404).json({ error: BRANCH_MISSING });
    forgetAllAdminAccess();
    await recordActivity(store, req, {
      action: 'branch.deleted', subject: branch.name,
      detail: `Kept its ${countOf(branch.communityIds.length, 'community', 'communities')} and ${countOf(branch.memberIds.length, 'person', 'people')}`,
    });
    return res.status(204).end();
  });

  /**
   * Which communities are in the branch, replaced whole, as the page's ticked boxes are saved. A community is in
   * at most one branch, so one ticked here leaves the branch it was in; one unticked is left in no branch. An
   * unknown id is ignored, as on the Team page.
   */
  router.put('/branches/:id/communities', async (req, res) => {
    const store = await getStore();
    const branch = await branchOf(req, res, store);
    if (!branch) return;
    const communityIds = req.body?.communityIds === undefined ? null : idList(req.body.communityIds);
    if (communityIds === null) return res.status(400).json({ error: COMMUNITY_IDS_BAD });
    const kept = await store.setBranchCommunities(branch.id, communityIds);
    if (kept === null) return res.status(404).json({ error: BRANCH_MISSING });
    forgetAllAdminAccess();
    await recordActivity(store, req, {
      action: 'branch.updated', subject: branch.name, detail: `Communities: ${await namesOf(store, kept, 'none')}`,
    });
    return res.json(await store.getBranch(branch.id));
  });

  /**
   * Who is in the branch, replaced whole. Members only: the owner has every community by role, so an owner's id
   * is dropped rather than stored, and an unknown id is ignored. Whoever was in it and whoever now is has their
   * cached access dropped, so the change reaches each of them on their next request.
   */
  router.put('/branches/:id/members', async (req, res) => {
    const store = await getStore();
    const branch = await branchOf(req, res, store);
    if (!branch) return;
    const adminIds = req.body?.adminIds === undefined ? null : idList(req.body.adminIds);
    if (adminIds === null) return res.status(400).json({ error: 'Send adminIds as a list of account ids.' });
    const kept = await store.setBranchMembers(branch.id, adminIds);
    if (kept === null) return res.status(404).json({ error: BRANCH_MISSING });
    for (const adminId of new Set([...branch.memberIds, ...kept])) forgetAdminAccess(adminId);
    const emails = (await store.listAdmins()).filter((a) => kept.includes(a.id)).map((a) => a.email);
    await recordActivity(store, req, {
      action: 'branch.updated', subject: branch.name, detail: `People: ${emails.join(', ') || 'none'}`,
    });
    return res.json(await store.getBranch(branch.id));
  });

  // ── communities ──────────────────────────────────────────────────────────
  /**
   * Every community for the owner; for a member, the ones shared with them. The other lists (Today, the switcher)
   * read this too. Each row says which branch it is in (`branchId`, `branchName`, null for none), for a member as
   * for the owner: the name is read-only there, and all a member learns of branches.
   */
  router.get('/communities', async (req, res) => {
    const store = await getStore();
    res.json((await store.listCommunities()).filter((row) => canAccess(req.access, row.id)));
  });

  /**
   * What needs the team across every community, for the page the admin opens on: for each community the people who
   * are open (closed ones are never counted), how many of them nobody has opened yet and how many wait for a call,
   * and the calls themselves, those past their day first and then the soonest. Read-only, built from the same
   * `buildReport` the emailed report uses, so the two agree about who is waiting.
   *
   * `ready` is everyone who agreed to calls and texts and gave a number but never booked a call (isReadyToCall):
   * people the team may ring who have not asked for a time. Those nobody has marked contacted come first, then the
   * most recent to agree; the list is capped and `totals` says how many there are.
   *
   * Each community also carries its hero photo (`heroPhoto`, the one buyers see on the QR landing, or null when
   * Setup has none), so its card shows the picture a builder knows it by and not only its name.
   */
  // The most people the Today page lists who agreed to calls without asking for a time; each community's Leads has the rest.
  const READY_LISTED = 500;
  router.get('/today', async (req, res) => {
    const store = await getStore();
    const now = new Date();
    const communities = [];
    const calls = [];
    const ready = [];
    // Filtered before anything is counted, so a member's totals, calls and ready list are drawn only from the
    // communities shared with them: the page must not hint at people in a community they cannot open.
    for (const row of (await store.listCommunities()).filter((c) => canAccess(req.access, c.id))) {
      const [community, leads, heroes] = await Promise.all([
        store.getCommunity(row.id), store.listLeads(row.id), store.listCommunityPhotos(row.id, 'hero'),
      ]);
      if (!community) continue;
      const report = buildReport({ community, leads, now });
      const lender = lenderNameOf(community);
      for (const [lead, overdue] of [...report.overdue.map((l) => [l, true]), ...report.comingUp.map((l) => [l, false])]) {
        calls.push({
          // Sorted on, then dropped: the same key the report orders its own calls by, so a call with no day goes last.
          key: `${lead.tour.date || '9999-12-31'} ${lead.tour.time || ''}`,
          communityId: community.id, communityName: community.name, leadId: lead.id, name: lead.name, phone: lead.phone || '', email: lead.email,
          canCall: Boolean(lead.phone && lead.consent?.granted), when: describeTour(lead.tour, lender), overdue,
        });
      }
      const listingHome = isListing(community) ? (await store.listHomes(community.id))[0] : null;
      const agreed = report.leads.filter(isReadyToCall);
      for (const lead of agreed) {
        ready.push({
          communityId: community.id, communityName: community.name, leadId: lead.id, name: lead.name, phone: lead.phone,
          agreedAt: lead.consent?.at ?? null, firstVisitAt: lead.firstVisitAt ?? null, contacted: lead.status === 'contacted',
        });
      }
      communities.push({
        id: community.id, name: community.name, location: community.location, status: community.status, theme: community.theme,
        // The branch (company or group) it is in, so the page can group the cards under it; see `branches` below.
        branchId: community.branchId, branchName: community.branchName,
        // The four colour settings, so Today names a community on its own colours "Custom colours" (themeView
        // needs them to tell a full palette from a half-finished one) without the rest of its settings.
        // A listing's card says what kind it is, its price and its open houses (the client picks the next one by
        // the viewer's own date), so an agent's portfolio reads as homes and not as developments.
        settings: Object.fromEntries([...CUSTOM_KEYS, 'siteKind', 'openHousesJson'].map((key) => [key, community.settings?.[key] ?? ''])),
        kind: isListing(community) ? 'listing' : 'community',
        price: listingHome?.price ?? null,
        // Only the address, flattened the way the public route flattens it: the card needs nothing else of the photo.
        // A listing's pictures are its home's, so with no community cover the home's first photo stands in.
        heroPhoto: heroes[0]?.url ?? listingHome?.photos?.[0]?.url ?? null,
        homesCount: row.homesCount, people: report.leads.length, unread: report.leads.filter(isUnread).length,
        waiting: report.comingUp.length + report.overdue.length, overdue: report.overdue.length,
        ready: agreed.length, readyNew: agreed.filter((lead) => lead.status !== 'contacted').length,
      });
    }
    const sum = (key) => communities.reduce((total, c) => total + c[key], 0);
    // One order across every community, then the cap: a call that is past its day in the last community must not
    // be cut off by the later calls of the first. (Past their day means an earlier day, so the day alone orders them.)
    calls.sort((a, b) => a.key.localeCompare(b.key));
    const time = (value) => {
      const t = value ? new Date(value).getTime() : Number.NaN;
      return Number.isNaN(t) ? -Infinity : t;
    };
    ready.sort((a, b) => (a.contacted - b.contacted) || (time(b.agreedAt ?? b.firstVisitAt) - time(a.agreedAt ?? a.firstVisitAt)));
    // The branches to group the cards under, in name order: every branch for the owner, who sees them all and may
    // want an empty one to put a card in; for a member, only the branches their own communities are in, which is
    // all a member learns of branches (the names are on their cards already).
    const inView = new Set(communities.map((c) => c.branchId).filter(Boolean));
    const branches = (await store.listBranches())
      .filter((b) => isOwner(req.access) || inView.has(b.id))
      .map(({ id, name }) => ({ id, name }));
    res.json({
      communities,
      branches,
      calls: calls.slice(0, 30).map(({ key, ...call }) => call),
      ready: ready.slice(0, READY_LISTED).map(({ firstVisitAt, ...person }) => person),
      totals: {
        communities: communities.length, people: sum('people'), unread: sum('unread'), waiting: sum('waiting'), overdue: sum('overdue'),
        ready: sum('ready'), readyNew: sum('readyNew'),
      },
    });
  });

  /** Making a community is the owner's: a member works inside the ones they are given and cannot add to the list. */
  /**
   * A listing: one home an agent is selling, made as a community marked `siteKind: 'listing'` (shared/listing.js) with
   * its one home beside it. The address is its name and the home's name. Everything is checked before anything is
   * made, so a refusal leaves nothing half-built. A member may make listings (not communities), and is given
   * access to what they make: it is their portfolio, given as a single insert so it cannot undo a list the owner
   * saves at the same moment. If any step after the first fails, what was made is removed again, so a failed
   * request never leaves a half-built listing reachable at a public address.
   */
  async function createListing(req, res) {
    const address = str(req.body?.address ?? req.body?.name).slice(0, COMMUNITY_TEXT_MAX);
    if (!address) return res.status(400).json({ error: 'Give the home an address.' });
    const numbers = readHomeNumbers(req.body);
    if (numbers.error) return res.status(400).json({ error: numbers.error });
    const store = await getStore();
    const made = await store.createCommunity({
      name: address,
      location: str(req.body?.city ?? req.body?.location).slice(0, COMMUNITY_TEXT_MAX),
      status: LISTING_STATUSES.includes(req.body?.status) ? req.body.status : 'Active',
      theme: isThemeKey(req.body?.theme) ? req.body.theme : DEFAULT_THEME,
      // A listing's "builder" is the brokerage it is listed with: the footer and the consent wording read it.
      builder: str(req.body?.brokerage).slice(0, COMMUNITY_TEXT_MAX),
    });
    let community;
    let home;
    try {
      community = await store.updateCommunity(made.id, {
        settings: { ...made.settings, ...LISTING_SETTINGS },
        tools: { ...made.tools, ...LISTING_TOOLS },
        features: { ...made.features, ...LISTING_FEATURES },
        layout: LISTING_LAYOUT,
      });
      home = await store.createHome(community.id, {
        name: address,
        ...numbers.data,
        description: str(req.body?.description),
        availability: 'Move-in ready',
        lotNumber: '',
        readyOn: readyDate(null),
        unitsAvailable: null,
      });
      if (!isOwner(req.access)) {
        await store.addAdminCommunity(req.admin.sub, community.id);
        forgetAdminAccess(req.admin.sub);
      }
    } catch (err) {
      await store.deleteCommunity(made.id).catch(() => {});
      throw err;
    }
    await recordActivity(store, req, { communityId: community.id, action: 'listing.created', subject: community.name });
    return res.status(201).json({ ...community, homes: [home] });
  }

  router.post('/communities', async (req, res) => {
    if (req.body?.kind === 'listing') return createListing(req, res);
    if (!isOwner(req.access)) return res.status(403).json({ error: OWNER_ONLY });
    const name = str(req.body?.name).slice(0, COMMUNITY_TEXT_MAX);
    if (!name) return res.status(400).json({ error: 'Give the community a name.' });
    const store = await getStore();
    const community = await store.createCommunity({
      name,
      location: str(req.body?.location).slice(0, COMMUNITY_TEXT_MAX) || 'Location TBD',
      status: COMMUNITY_STATUSES.includes(req.body?.status) ? req.body.status : 'Pre-sale',
      theme: isThemeKey(req.body?.theme) ? req.body.theme : DEFAULT_THEME,
      builder: str(req.body?.builder).slice(0, COMMUNITY_TEXT_MAX),
    });
    await recordActivity(store, req, { communityId: community.id, action: 'community.created', subject: community.name });
    res.status(201).json(community);
  });

  router.get('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
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
    const slugs = await store.listCommunitySlugs(community.id);
    res.json({
      ...community, homes, highlights, resources,
      heroPhoto: heroes[0] ?? null, iconPhoto: icons[0] ?? null, siteMap: maps[0] ?? null,
      logo: logos[0] ?? null, logoLight: logosLight[0] ?? null, lenderLogo: lenderLogos[0] ?? null,
      agents, guides,
      // The buyer link: its clean address, the addresses it used to have (which still work), what the
      // name suggests, and the public origin when the site pins one (so a link is written with the
      // domain it is meant to be shared on, not whichever address the admin happens to be using).
      formerSlugs: slugs.filter((slug) => slug !== community.slug),
      suggestedSlug: suggestCommunitySlug(community.name),
      siteOrigin: pinnedOrigin(),
      // Whether this server can send mail at all, and from what: the builder is told in Setup rather than
      // finding out when an alert never arrives. The sender is only said to be set or not.
      emailStatus: { ready: emailConfigured(), senderSet: Boolean(process.env.EMAIL_FROM) },
    });
  });

  router.patch('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;

    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name).slice(0, COMMUNITY_TEXT_MAX) || community.name;
    if (req.body?.location !== undefined) patch.location = str(req.body.location).slice(0, COMMUNITY_TEXT_MAX);
    if (req.body?.builder !== undefined) patch.builder = str(req.body.builder).slice(0, COMMUNITY_TEXT_MAX);
    if (req.body?.websiteUrl !== undefined) patch.websiteUrl = str(req.body.websiteUrl) || null;
    // The buyer link. Checked before anything else is saved, so a refusal changes nothing.
    let newSlug = '';
    if (req.body?.slug !== undefined && str(req.body.slug) !== (community.slug ?? '')) {
      newSlug = normalizeCommunitySlug(req.body.slug);
      if (!newSlug) {
        return res.status(400).json({
          error: 'The buyer link needs 3 to 40 letters, numbers or hyphens, and cannot be a word the site uses itself, like admin.',
        });
      }
    }
    if (req.body?.status !== undefined && (isListing(community) ? LISTING_STATUSES : COMMUNITY_STATUSES).includes(req.body.status)) patch.status = req.body.status;
    if (req.body?.theme !== undefined && (isThemeKey(req.body.theme) || req.body.theme === CUSTOM_THEME)) patch.theme = req.body.theme;
    // An unknown layout is ignored like an unknown theme, never stored: the buyer
    // app would have no stylesheet for it.
    if (req.body?.layout !== undefined && LAYOUT_KEYS.includes(req.body.layout)) {
      patch.layout = req.body.layout;
    }
    // Which branch (company or group) the community is in: the owner's to change, and null takes it out of any.
    // A member's forms never send it; one that does is refused in words rather than quietly ignored, so a stale
    // form cannot look as if it worked. Checked before anything is saved, like the slug, so a refusal changes
    // nothing. `movedTo` is the branch it is going into, null for out of its branch, undefined for no move.
    let movedTo;
    if (req.body?.branchId !== undefined) {
      if (!isOwner(req.access)) return res.status(400).json({ error: 'Only the owner can move a community between branches.' });
      const to = req.body.branchId === null ? null : (typeof req.body.branchId === 'string' ? str(req.body.branchId) || null : undefined);
      if (to === undefined) return res.status(400).json({ error: 'Send branchId as a branch id, or null for no branch.' });
      if (to !== community.branchId) {
        if (to) {
          movedTo = await store.getBranch(to);
          if (!movedTo) return res.status(400).json({ error: 'That branch is no longer here.' });
        } else {
          movedTo = null;
        }
        patch.branchId = to;
      }
    }

    if (req.body?.settings) {
      const settings = { ...community.settings };
      for (const key of SETTING_KEYS) {
        // The time the last report went is the server's to say: the Setup form sends back every setting it
        // loaded, and an old copy of this one would make the next report list people twice.
        if (key === 'reportLastSentAt') continue;
        // What kind of site this is was set when it was made. A form (or a stale copy of one) cannot change it.
        if (key === 'siteKind') continue;
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
        if (key === 'incentiveEmail' && text && !isSafeEmail(text)) {
          return res.status(400).json({ error: 'The incentive email must be a single email address.' });
        }
        if (key === 'lenderEmail' && text && !isSafeEmail(text)) {
          return res.status(400).json({ error: 'The loan team email must be a single email address.' });
        }
        if (key === 'teamEmail' && text && !isSafeEmail(text)) {
          return res.status(400).json({ error: 'The sales team email must be a single email address.' });
        }
        if (key === 'reportEmail' && text && !isSafeEmail(text)) {
          return res.status(400).json({ error: 'The report email must be a single email address.' });
        }
        if (key in SETTING_NUMBER_RULES) {
          // The rates and costs the buyer's payment is worked out from. A value that is not a number in a range
          // that makes sense is refused in words, where it used to be stored as typed and counted as 0 (so
          // "six and a half" gave a 0% rate). A stray % or $ or comma is dropped. A value that is the one already
          // saved goes through as it is, so an old figure the person did not touch can never make a save fail.
          if (text === str(community.settings[key])) {
            settings[key] = text;
            continue;
          }
          const read = readSetting(key, text);
          if (read.error) return res.status(400).json({ error: `Check ${SETTING_NUMBER_RULES[key].name}: ${read.error.charAt(0).toLowerCase()}${read.error.slice(1)}` });
          settings[key] = read.text;
          continue;
        }
        if (CUSTOM_KEYS.includes(key)) {
          // A community's own colours: colour codes (or blank), and the base a set theme, so nothing else can
          // reach the style attribute the buyer app writes them into.
          if (key === 'customBase') {
            if (text && !isThemeKey(text)) return res.status(400).json({ error: 'Custom colours start from one of the themes.' });
            settings[key] = text;
          } else {
            const hex = text ? normalizeHex(text) : '';
            if (hex === null) return res.status(400).json({ error: 'Colours must be colour codes like #5A1E33.' });
            settings[key] = hex;
          }
          continue;
        }
        if (key === 'openHousesJson') {
          // The sessions people can come to see a listing: dates and times as typed, checked and put in order.
          const sessions = normalizeOpenHouses(text);
          if (sessions.error) return res.status(400).json({ error: sessions.error });
          settings[key] = sessions.value;
          continue;
        }
        if (key === 'faqJson') {
          // A list, normalised: items trimmed, half-finished ones dropped, counts
          // capped. Anything that is not a list is refused rather than stored,
          // so a bad request cannot quietly empty the FAQ.
          const faq = normalizeFaqJson(text);
          if (faq === null) return res.status(400).json({ error: 'The FAQ could not be read. Send a list of questions and answers.' });
          settings[key] = faq;
        } else {
          // The incentive card and the home screen's heading are printed on the home screen like the compliance copy.
          const capped = key in COMPLIANCE_DEFAULTS || key.startsWith('incentive') || key.startsWith('team') || key.startsWith('home')
            || key.startsWith('listing') || key === 'agentLicense' || key === 'mlsNumber';
          settings[key] = capped ? text.slice(0, settingMaxLength(key)) : text;
        }
      }
      // The three cutoffs are read as ranges ("Good 700-739"), so they have to step down. Checked only when one of
      // them is part of this save, for the same reason an untouched figure is never re-checked above.
      const creditKeys = ['creditExcellentMin', 'creditGoodMin', 'creditFairMin'];
      if (creditKeys.some((key) => settings[key] !== community.settings[key])) {
        const problem = creditOrderProblem(settings);
        if (problem) return res.status(400).json({ error: problem });
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
    // Custom colours are only ever drawn whole: choosing them, or clearing one of the three while they are in
    // use, needs all three to be set once this request is applied.
    const nextTheme = patch.theme ?? community.theme;
    if (nextTheme === CUSTOM_THEME && !customThemeFrom(patch.settings ?? community.settings)) {
      return res.status(400).json({ error: 'Pick all three colours before using your own colours.' });
    }
    if (newSlug) {
      const claimed = await store.setCommunitySlug(community.id, newSlug);
      if (claimed.error === 'missing') return res.status(404).json({ error: 'Community not found' });
      if (claimed.error) {
        return res.status(409).json({
          error: 'That link is already used by another community, or was before and is kept for it so printed links keep working. Pick a different one.',
        });
      }
    }
    const updated = await store.updateCommunity(community.id, patch);
    // Its people changed with the branch: whoever is in the old branch or the new one sees it go or come at once.
    if (movedTo !== undefined) forgetAllAdminAccess();
    // Which parts of Setup moved, in the words the page uses for them, so the owner can tell a rename from a colour
    // change. The forms send back every field they loaded, so a field counts only when its value is new: the Edit
    // community pop-up that only picks a branch must not read as "Changed details" as well. Settings, tools and
    // features are whole objects normalised on the way in, which cannot be told apart from the stored ones with
    // any confidence, so they count when sent, as before.
    const differs = (key) => key in patch && patch[key] !== community[key];
    const changed = [
      ['name', 'location', 'builder', 'websiteUrl', 'status'].some(differs) && 'details',
      (differs('theme') || differs('layout')) && 'look',
      'settings' in patch && 'settings',
      'tools' in patch && 'tools',
      'features' in patch && 'features',
      newSlug && 'buyer link',
    ].filter(Boolean);
    // A move between branches is its own clause, naming the branch, since that is what the owner looks for.
    const moved = movedTo === undefined ? '' : movedTo ? `moved to branch ${movedTo.name}` : `taken out of branch ${community.branchName}`;
    const detail = [changed.length ? `Changed ${changed.join(', ')}` : '', moved].filter(Boolean).join('; ');
    await recordActivity(store, req, {
      communityId: community.id, action: 'community.updated', subject: updated.name,
      detail: detail.charAt(0).toUpperCase() + detail.slice(1),
    });
    res.json(updated);
  });

  /**
   * Deleting a community is the owner's, like making one; a listing is the agent's own to delete, as they may make
   * one. Looked up first so the log can name what went.
   */
  router.delete('/communities/:id', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    if (!isListing(community) && !isOwner(req.access)) return res.status(403).json({ error: OWNER_ONLY });
    // Who had it: their assignments go with the row, and their cached access should too, so the community is
    // gone for them at once rather than answering "not found" for up to 30 seconds (see forgetAdminAccess). One
    // in a branch was had by whoever is in that branch as well, which is the cache's question to avoid, so that
    // case clears everyone's.
    const holders = (await store.listAdminAssignments()).filter((a) => a.communityId === community.id);
    await store.deleteCommunity(community.id);
    if (community.branchId) forgetAllAdminAccess();
    else for (const { adminId } of holders) forgetAdminAccess(adminId);
    // No communityId: the row it would point at is gone, so the name goes in the subject, where it keeps reading.
    await recordActivity(store, req, { action: isListing(community) ? 'listing.deleted' : 'community.deleted', subject: community.name, detail: community.location });
    res.status(204).end();
  });

  /**
   * "Check rate inbox" — in production Zapier posts the parsed lender email to
   * /api/communities/:id/rates. This stamps the timestamp so an admin can confirm
   * the pipeline. The date is stamped only when a rate inbox is connected: buyers read it beside their payment as
   * "rates updated", so a press on a site with no automatic updates must not make old rates look fresh.
   */
  router.post('/communities/:id/rates/check', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    const webhookConfigured = Boolean(process.env.RATES_WEBHOOK_SECRET);
    let settings = community.settings;
    if (webhookConfigured) {
      const updated = await store.updateCommunity(community.id, { settings: { ...community.settings, ratesUpdatedAt: new Date().toISOString() } });
      settings = updated.settings;
    }
    await recordActivity(store, req, { communityId: community.id, action: 'community.updated', subject: community.name, detail: 'Checked the rate inbox' });
    res.json({ settings, webhookConfigured });
  });

  // ── homes ────────────────────────────────────────────────────────────────
  router.post('/communities/:id/homes', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    // A listing is one home, made with it. More would turn it back into a community.
    if (isListing(community) && (await store.listHomes(community.id)).length) {
      return res.status(400).json({ error: 'A listing has one home. Change it instead of adding another.' });
    }
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the home a name.' });
    // A home goes live to buyers the moment it exists, so nothing is made up for a box left empty: the price is
    // required and has to be a real one, and a blank bed, bath or square-foot count is kept as "not given" (0),
    // which every buyer screen leaves out. (This used to fill in $450,000, 3 bed, 2 bath and 2,000 sq ft.)
    const numbers = readHomeNumbers(req.body);
    if (numbers.error) return res.status(400).json({ error: numbers.error });
    const home = await store.createHome(community.id, {
      name,
      ...numbers.data,
      description: str(req.body?.description),
      availability: AVAILABILITY.includes(req.body?.availability) ? req.body.availability : 'Planning',
      lotNumber: str(req.body?.lotNumber),
      readyOn: readyDate(req.body?.readyOn),
      unitsAvailable: unitCount(req.body?.unitsAvailable),
    });
    await recordActivity(store, req, { communityId: community.id, action: 'home.added', subject: home.name });
    res.status(201).json(home);
  });

  router.patch('/homes/:id', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    const patch = {};
    // A name or a price the request sends has to be a real one: a refusal says why and changes nothing, where
    // it used to keep the old value and answer 200, so a box that closed looked saved and was not. Only what is
    // sent is checked, so a home stored before these rules still saves when its other fields are edited.
    if (req.body?.name !== undefined) {
      patch.name = str(req.body.name);
      if (!patch.name) return res.status(400).json({ error: 'Give the home a name.' });
      // A listing's home is named like the listing, whose own name is capped: the two must stay equal.
      if (isListing(await store.getCommunity(home.communityId))) patch.name = patch.name.slice(0, COMMUNITY_TEXT_MAX);
    }
    // The edit form sends every box back, touched or not, and a home stored before these rules may hold a figure
    // they would refuse (a price of $475 from a "475k" that lost its k, a bed count of 2.5). Judging a figure the
    // person never touched would stop every other change to that home, so one equal to what is stored is left
    // alone, and only a figure that moves is checked. The same rule the settings loop follows for the rates.
    const sentNumbers = { ...req.body };
    for (const key of Object.keys(HOME_NUMBER_RULES)) {
      if (sentNumbers[key] !== undefined && sameHomeNumber(home, key, sentNumbers[key])) delete sentNumbers[key];
    }
    const numbers = readHomeNumbers(sentNumbers, { partial: true });
    if (numbers.error) return res.status(400).json({ error: numbers.error });
    Object.assign(patch, numbers.data);
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
    // The video tour as a link. '' removes it. Anything else has to be a YouTube or Vimeo address the player
    // can embed, so a bad one is refused here and never shows a buyer a blank box. A home has one source:
    // saving a link removes an uploaded file.
    if (req.body?.videoLink !== undefined) {
      const link = str(req.body.videoLink).slice(0, 300);
      if (link && !videoEmbed(link)) {
        return res.status(400).json({ error: 'That link is not a YouTube or Vimeo video.' });
      }
      patch.videoLink = link;
    }
    const updated = await store.updateHome(home.id, patch);
    // The file goes only once the link is saved: if saving failed, the buyer keeps the video they had.
    if (patch.videoLink) await store.deleteHomeVideo(home.id);
    const result = patch.videoLink ? await store.getHome(home.id) : updated;
    // A save that is only the video link is a video change; anything else names the fields that moved.
    const fields = Object.keys(patch);
    const onlyVideo = fields.length === 1 && fields[0] === 'videoLink';
    await recordActivity(store, req, {
      communityId: home.communityId, action: onlyVideo ? 'home.video' : 'home.updated', subject: result?.name ?? home.name,
      detail: onlyVideo ? (patch.videoLink ? 'set a video link' : 'removed the video link') : fields.map((key) => HOME_FIELD_NAMES[key] ?? key).join(', '),
    });
    res.json(result);
  });

  router.delete('/homes/:id', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    if (isListing(await store.getCommunity(home.communityId))) {
      return res.status(400).json({ error: 'A listing keeps its home. Delete the whole listing instead.' });
    }
    await store.deleteHome(home.id);
    await recordActivity(store, req, { communityId: home.communityId, action: 'home.deleted', subject: home.name });
    res.status(204).end();
  });

  // ── area highlights ──────────────────────────────────────────────────────
  /** What's around the community: schools, parks, shops, clinics, commute notes. */
  router.post('/communities/:id/highlights', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give this place a name.' });
    const highlight = await store.createHighlight(community.id, {
      category: HIGHLIGHT_CATEGORY_KEYS.includes(req.body?.category) ? req.body.category : 'other',
      name,
      description: str(req.body?.description),
      detail: str(req.body?.detail),
      address: str(req.body?.address),
    });
    await recordActivity(store, req, { communityId: community.id, action: 'highlight.added', subject: highlight.name });
    res.status(201).json(highlight);
  });

  router.patch('/highlights/:id', async (req, res) => {
    const store = await getStore();
    const highlight = await highlightOf(req, res, store);
    if (!highlight) return;
    const patch = {};
    if (req.body?.name !== undefined) patch.name = str(req.body.name) || highlight.name;
    if (req.body?.description !== undefined) patch.description = str(req.body.description);
    if (req.body?.detail !== undefined) patch.detail = str(req.body.detail);
    if (req.body?.address !== undefined) patch.address = str(req.body.address);
    if (req.body?.category !== undefined && HIGHLIGHT_CATEGORY_KEYS.includes(req.body.category)) {
      patch.category = req.body.category;
    }
    const updated = await store.updateHighlight(highlight.id, patch);
    await recordActivity(store, req, { communityId: highlight.communityId, action: 'highlight.updated', subject: updated?.name ?? highlight.name });
    res.json(updated);
  });

  router.delete('/highlights/:id', async (req, res) => {
    const store = await getStore();
    const highlight = await highlightOf(req, res, store);
    if (!highlight) return;
    await store.deleteHighlight(highlight.id);
    await recordActivity(store, req, { communityId: highlight.communityId, action: 'highlight.deleted', subject: highlight.name });
    res.status(204).end();
  });

  // ── videos and articles ──────────────────────────────────────────────────
  /** What the builder has written and filmed, shown below the tools. */
  router.post('/communities/:id/resources', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;

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

    const resource = await store.createResource(community.id, {
      kind, title, body: kind === 'article' ? str(req.body?.body) : '',
      url: kind === 'video' && !file.data ? str(req.body?.url) : '',
      ...file,
    });
    await recordActivity(store, req, {
      communityId: community.id, action: 'resource.added', subject: resource.title, detail: kind === 'video' ? 'a video' : 'an article',
    });
    res.status(201).json(resource);
  });

  router.patch('/resources/:id', async (req, res) => {
    const store = await getStore();
    const resource = await resourceOf(req, res, store);
    if (!resource) return;
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
    const updated = await store.updateResource(resource.id, patch);
    await recordActivity(store, req, { communityId: resource.communityId, action: 'resource.updated', subject: updated?.title ?? resource.title });
    res.json(updated);
  });

  router.delete('/resources/:id', async (req, res) => {
    const store = await getStore();
    const resource = await resourceOf(req, res, store);
    if (!resource) return;
    await store.deleteResource(resource.id);
    await recordActivity(store, req, { communityId: resource.communityId, action: 'resource.deleted', subject: resource.title });
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
    const home = await homeOf(req, res, store);
    if (!home) return;

    // Validated here and not only in the browser: the cap is the product
    // decision, and a request that skips the form should not get past it.
    const read = readVideo(req.body, TRIM_INSTEAD);
    if (read.error) return res.status(400).json({ error: read.error });

    const saved = await store.setHomeVideo(home.id, { communityId: home.communityId, ...read });
    // An uploaded file replaces a pasted link: one source per home.
    if (home.videoLink) await store.updateHome(home.id, { videoLink: '' });
    await recordActivity(store, req, {
      communityId: home.communityId, action: 'home.video', subject: home.name, detail: `uploaded a walkthrough (${megabytes(read.sizeBytes)})`,
    });
    res.json(await store.getHome(home.id) ?? saved);
  });

  router.delete('/homes/:id/video', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    await store.deleteHomeVideo(home.id);
    await recordActivity(store, req, { communityId: home.communityId, action: 'home.video', subject: home.name, detail: 'removed the walkthrough' });
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

  /**
   * Puts the gallery in the order given. The first photo is the hero buyers see at the top of the home.
   * The list has to be exactly this home's gallery photos, each once: a request that leaves one out or
   * adds another home's would otherwise quietly reorder (or leak into) something it does not own.
   */
  router.put('/homes/:id/photos/order', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    const ids = req.body?.ids;
    const own = (await store.listHomePhotosOfKind(home.id, 'home')).map((photo) => photo.id);
    if (!Array.isArray(ids) || ids.length !== own.length || !ids.every((id) => typeof id === 'string')
      || new Set(ids).size !== ids.length || !ids.every((id) => own.includes(id))) {
      return res.status(400).json({ error: 'Send every photo of this home once, in the order you want.' });
    }
    await store.setHomePhotoOrder(home.id, ids);
    await recordActivity(store, req, { communityId: home.communityId, action: 'home.photos', subject: home.name, detail: 'reordered' });
    res.json(await store.getHome(home.id));
  });

  router.post('/homes/:id/photos', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    if ((await store.countHomePhotos(home.id)) >= MAX_PHOTOS_PER_HOME) {
      return res.status(400).json({ error: `Up to ${MAX_PHOTOS_PER_HOME} photos per home.` });
    }
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    const added = await store.addPhoto({ communityId: home.communityId, homeId: home.id, kind: 'home', ...image });
    await recordActivity(store, req, { communityId: home.communityId, action: 'home.photos', subject: home.name, detail: 'added a photo' });
    res.status(201).json(added);
  });

  /** Floor plans hang off the home like photos but under their own kind. */
  router.post('/homes/:id/floorplans', async (req, res) => {
    const store = await getStore();
    const home = await homeOf(req, res, store);
    if (!home) return;
    if ((await store.listHomePhotosOfKind(home.id, 'floorplan')).length >= MAX_FLOOR_PLANS) {
      return res.status(400).json({ error: `Up to ${MAX_FLOOR_PLANS} floor plans per home.` });
    }
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    const added = await store.addPhoto({ communityId: home.communityId, homeId: home.id, kind: 'floorplan', ...image });
    await recordActivity(store, req, { communityId: home.communityId, action: 'home.photos', subject: home.name, detail: 'added a floor plan' });
    res.status(201).json(added);
  });

  /**
   * Community-level artwork: `hero` for the QR landing, `icon` for the PWA, `sitemap` for the plat,
   * `logo` / `logolight` for the development's mark and `lenderlogo` for a replacement lender logo.
   */
  router.post('/communities/:id/photos/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!COMMUNITY_PHOTO_KINDS.includes(kind)) return res.status(400).json({ error: 'Unknown photo slot' });
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    // One of each per community — replace whatever is there. Added first and the
    // old ones removed after, so a failed write cannot leave the slot empty.
    const old = await store.listCommunityPhotos(community.id, kind);
    const added = await store.addPhoto({ communityId: community.id, kind, ...image });
    for (const photo of old) await store.deletePhoto(photo.id);
    await recordActivity(store, req, {
      communityId: community.id, action: 'community.updated', subject: community.name, detail: `changed ${ARTWORK_NAMES[kind]}`,
    });
    res.status(201).json(added);
  });

  /** One photo per highlight — a second upload replaces the first. */
  router.post('/highlights/:id/photos', async (req, res) => {
    const store = await getStore();
    const highlight = await highlightOf(req, res, store);
    if (!highlight) return;
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    for (const old of await store.listHighlightPhotos(highlight.id)) await store.deletePhoto(old.id);
    const added = await store.addPhoto({ communityId: highlight.communityId, highlightId: highlight.id, kind: 'highlight', ...image });
    await recordActivity(store, req, { communityId: highlight.communityId, action: 'highlight.updated', subject: highlight.name, detail: 'changed the photo' });
    res.status(201).json(added);
  });

  // ── realtors ─────────────────────────────────────────────────────────────
  /** Up to MAX_AGENTS real estate agents per community, listed on every home. */
  router.post('/communities/:id/agents', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
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
    await recordActivity(store, req, { communityId: community.id, action: 'agent.added', subject: created.name });
    res.status(201).json(created);
  });

  router.patch('/agents/:id', async (req, res) => {
    const store = await getStore();
    const agent = await agentOf(req, res, store);
    if (!agent) return;
    const clean = cleanAgent(req.body, { partial: true });
    if (clean.error) return res.status(400).json({ error: clean.error });
    const patch = { ...clean.data };
    if (Number.isInteger(req.body?.position) && req.body.position >= 0 && req.body.position <= 99) {
      patch.position = req.body.position;
    }
    const updated = await store.updateAgent(agent.id, patch);
    await recordActivity(store, req, { communityId: agent.communityId, action: 'agent.updated', subject: updated?.name ?? agent.name });
    res.json(updated);
  });

  /** Removing the agent removes their picture and logo with them. */
  router.delete('/agents/:id', async (req, res) => {
    const store = await getStore();
    const agent = await agentOf(req, res, store);
    if (!agent) return;
    await store.deleteAgent(agent.id);
    await recordActivity(store, req, { communityId: agent.communityId, action: 'agent.deleted', subject: agent.name });
    res.status(204).end();
  });

  /**
   * An agent has one portrait and one logo; a second upload replaces the first.
   * Removing one outright is the existing DELETE /photos/:id.
   */
  const agentImageRoute = (kind) => async (req, res) => {
    const store = await getStore();
    const agent = await agentOf(req, res, store);
    if (!agent) return;
    const image = readImage(req.body);
    if (image.error) return res.status(400).json({ error: image.error });
    const old = await store.listAgentPhotos(agent.id, kind);
    const added = await store.addPhoto({
      communityId: agent.communityId, agentId: agent.id, kind, ...image,
    });
    for (const photo of old) await store.deletePhoto(photo.id);
    await recordActivity(store, req, {
      communityId: agent.communityId, action: 'agent.updated', subject: agent.name, detail: kind === 'agent' ? 'changed the photo' : 'changed the logo',
    });
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
    const guide = await guideOf(req, res, store);
    if (!guide) return;
    res.json(guide);
  });

  router.post('/communities/:id/guides', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;

    const clean = cleanGuideText(req.body);
    if (clean.error) return res.status(400).json({ error: clean.error });
    if (!clean.data.title) return res.status(400).json({ error: 'Give the guide a title.' });

    // A guide a builder adds starts as a draft and goes to buyers only when they publish it: one with just a title
    // used to be live at once, an empty page in the buyer's list. (The supplied guides are copied in by the stores,
    // not through here, and stay published.)
    const published = flag(req.body?.published, false);
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
        const guide = await store.createGuide(community.id, { ...data, slug });
        await recordActivity(store, req, {
          communityId: community.id, action: 'guide.added', subject: guide.title, detail: published ? '' : 'as a draft',
        });
        return res.status(201).json(guide);
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
    const community = await communityOf(req, res, store);
    if (!community) return;
    const added = await store.restoreDefaultGuides(community.id);
    await recordActivity(store, req, {
      communityId: community.id, action: 'guide.restored', subject: community.name,
      detail: added.length === 1 ? '1 guide came back' : `${added.length} guides came back`,
    });
    res.json({
      restored: added.length,
      guides: await store.listGuides(community.id, { includeUnpublished: true }),
    });
  });

  router.patch('/guides/:id', async (req, res) => {
    const store = await getStore();
    const guide = await guideOf(req, res, store);
    if (!guide) return;

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
    // Turning a draft on is the moment an empty page would reach buyers, so it is held here and not only in the
    // editor: the switch on the guide list sends the same request, and the list does not carry the text, so only
    // the server can tell. A guide already live and empty is left alone, so it can still be edited.
    if (patch.published === true && !guide.published) {
      const text = 'body' in patch ? patch.body : guide.body;
      if (!String(text ?? '').trim()) {
        return res.status(400).json({ error: 'Write the guide text before you publish it.' });
      }
    }
    if (Number.isInteger(req.body?.position) && req.body.position >= 0 && req.body.position <= 9999) {
      patch.position = req.body.position;
    }
    let updated;
    try {
      updated = await store.updateGuide(guide.id, patch);
    } catch (err) {
      if (isDuplicate(err)) return res.status(400).json({ error: 'Another guide already uses that address.' });
      throw err;
    }
    // Publishing is the change a buyer notices, so the line says so when that is what moved.
    const published = 'published' in patch && patch.published !== guide.published;
    await recordActivity(store, req, {
      communityId: guide.communityId, action: 'guide.updated', subject: updated?.title ?? guide.title,
      detail: published ? (patch.published ? 'published' : 'unpublished') : '',
    });
    res.json(updated);
  });

  router.delete('/guides/:id', async (req, res) => {
    const store = await getStore();
    const guide = await guideOf(req, res, store);
    if (!guide) return;
    await store.deleteGuide(guide.id);
    await recordActivity(store, req, { communityId: guide.communityId, action: 'guide.deleted', subject: guide.title });
    res.status(204).end();
  });

  /** One picture per guide: a second upload replaces the first. */
  router.post('/guides/:id/image', async (req, res) => {
    const store = await getStore();
    const guide = await guideOf(req, res, store);
    if (!guide) return;
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
    await recordActivity(store, req, { communityId: guide.communityId, action: 'guide.updated', subject: guide.title, detail: 'changed the picture' });
    res.status(201).json(added);
  });

  /** Back to the shared default picture. Answers with the guide so the editor can redraw it. */
  router.delete('/guides/:id/image', async (req, res) => {
    const store = await getStore();
    const guide = await guideOf(req, res, store);
    if (!guide) return;
    for (const photo of await store.listGuidePhotos(guide.id)) await store.deletePhoto(photo.id);
    const updated = await store.updateGuide(guide.id, { image: '' });
    await recordActivity(store, req, { communityId: guide.communityId, action: 'guide.updated', subject: guide.title, detail: 'put back the default picture' });
    res.json(updated);
  });

  /**
   * Removes one picture, whatever it belongs to. The photo row says which community it is in, which is what
   * the access check needs, and what it hangs off (a home, a place, a realtor, a guide, or the community itself),
   * which is what the log names: the line is about the thing the picture was of, not about the picture.
   */
  router.delete('/photos/:id', async (req, res) => {
    const store = await getStore();
    const photo = await photoOf(req, res, store);
    if (!photo) return;
    await store.deletePhoto(photo.id);
    const owned = async (lookup, action, detail) => {
      const owner = await lookup;
      return owner ? { action, subject: owner.name ?? owner.title, detail } : null;
    };
    const line = (photo.homeId && await owned(store.getHome(photo.homeId), 'home.photos', photo.kind === 'floorplan' ? 'removed a floor plan' : 'removed a photo'))
      || (photo.highlightId && await owned(store.getHighlight(photo.highlightId), 'highlight.updated', 'removed the photo'))
      || (photo.agentId && await owned(store.getAgent(photo.agentId), 'agent.updated', photo.kind === 'agentlogo' ? 'removed the logo' : 'removed the photo'))
      || (photo.guideId && await owned(store.getGuide(photo.guideId), 'guide.updated', 'removed the picture'))
      || await owned(store.getCommunity(photo.communityId), 'community.updated', `removed ${ARTWORK_NAMES[photo.kind] ?? 'a picture'}`);
    if (line) await recordActivity(store, req, { communityId: photo.communityId, ...line });
    res.status(204).end();
  });

  // ── appointment slots ────────────────────────────────────────────────────
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  router.get('/communities/:id/slots', async (req, res) => {
    const store = await getStore();
    // Read by the id alone (no community row is needed for the list), so the check is on the id itself.
    if (!allowed(req, res, req.params.id)) return;
    res.json(await store.listSlots(req.params.id));
  });

  /** Publishes every date x time the builder ticked, in one call. */
  router.post('/communities/:id/slots', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;

    const dates = [...new Set((req.body?.dates ?? []).filter((d) => ISO_DATE.test(String(d))))];
    const times = [...new Set((req.body?.times ?? []).filter((t) => SLOT_TIMES.includes(String(t))))];
    if (!dates.length) return res.status(400).json({ error: 'Pick at least one date.' });
    if (!times.length) return res.status(400).json({ error: 'Pick at least one time.' });
    if (dates.length * times.length > 400) {
      return res.status(400).json({ error: 'That is more than 400 slots at once — add them in smaller batches.' });
    }

    const created = await store.createSlots(community.id, dates.sort(), times.sort());
    await recordActivity(store, req, {
      communityId: community.id, action: 'slot.added',
      subject: created.length === 1 ? '1 time slot' : `${created.length} time slots`,
      detail: `on ${dates.join(', ')}`,
    });
    res.status(201).json({ created: created.length, slots: await store.listSlots(community.id) });
  });

  router.delete('/slots/:id', async (req, res) => {
    const store = await getStore();
    const slot = await slotOf(req, res, store);
    if (!slot) return;
    await store.deleteSlot(slot.id);
    await recordActivity(store, req, { communityId: slot.communityId, action: 'slot.deleted', subject: `${slot.date} ${slot.time}` });
    res.status(204).end();
  });

  // ── leads ────────────────────────────────────────────────────────────────
  /**
   * "Email the report": the scheduled calls waiting, the people who signed up since the last report, and a
   * spreadsheet of everyone, sent to the address saved in Setup (never one named by the request). Only when
   * pressed. The time is stamped only once the mail provider took it, so a failed send does not hide anyone
   * from the next report. The time stamped is when this one was started, not when it finished: somebody who
   * signs up while the mail is going out is then new in the next report rather than in neither.
   */
  router.post('/communities/:id/report', async (req, res) => {
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    const to = str(community.settings?.reportEmail);
    if (!to) return res.status(400).json({ error: 'Add the report email under Setup, save it, then try again.' });
    if (!emailConfigured()) {
      return res.status(503).json({ error: 'Email is not set up on this site yet. Add RESEND_API_KEY and EMAIL_FROM in Render, then try again.' });
    }
    const hold = reserve([[reportBurst, community.id], [reportPerDay, community.id]]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('reports', hold.wait) });
    }
    let sent = null;
    const startedAt = new Date();
    try {
      const [leads, homes] = await Promise.all([store.listLeads(community.id), store.listHomes(community.id)]);
      sent = await emailReport({
        community, leads, homes, to, baseUrl: linkOriginOf(req), now: startedAt,
        since: str(community.settings?.reportLastSentAt), until: startedAt.toISOString(),
      });
    } finally {
      if (!sent?.result?.sent) hold.release();
    }
    if (!sent.result.sent) {
      const testSender = process.env.EMAIL_FROM
        ? ''
        : ' Mail is going out from Resend’s test address, which only delivers to your own Resend login: verify your domain in Resend and set EMAIL_FROM in Render.';
      return res.status(503).json({ error: `The report could not be sent.${testSender} Nothing was marked as sent, so try again.` });
    }
    // One atomic merge into the settings (never a read-modify-write of the whole object), so a Setup save made
    // while the mail was going out is not overwritten by a stale copy.
    const at = startedAt.toISOString();
    let stamped = true;
    try {
      await store.stampReportSent(community.id, at);
    } catch (err) {
      // The mail is already in their inbox. Saying it failed would invite a second send, so say what happened.
      stamped = false;
      console.error(`Report sent for ${community.id} but the time could not be saved:`, err);
    }
    const { report } = sent;
    await recordActivity(store, req, {
      communityId: community.id, action: 'report.sent', subject: community.name,
      detail: `to ${to}: ${report.comingUp.length + report.overdue.length} calls waiting, ${report.fresh.length} new, ${report.everyone} in all`,
    });
    res.json({
      sent: true, to, at, ...(stamped ? {} : { notRecorded: true }),
      comingUp: report.comingUp.length, overdue: report.overdue.length, newPeople: report.fresh.length, everyone: report.everyone,
    });
  });

  /**
   * A PDF file for the browser to save: private (it holds people's contact details and what they agreed to), never
   * cached by the browser or a proxy, and never sniffed into anything else.
   */
  const sendPdf = (res, { buffer, filename }) => {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  };

  /**
   * The leads report as a PDF: the summary, what people did, the calls waiting and everyone. `period` is `all`
   * (the default) or the last 7, 30 or 90 days of sign-ups. Built from the store when asked and kept nowhere.
   */
  router.get('/communities/:id/reports/leads.pdf', async (req, res) => {
    const period = req.query.period === undefined ? 'all' : req.query.period;
    if (typeof period !== 'string' || !Object.hasOwn(PERIODS, period)) {
      return res.status(400).json({ error: `Choose a period: ${Object.keys(PERIODS).join(', ')}.` });
    }
    const sort = req.query.sort === undefined ? DEFAULT_LEAD_SORT : req.query.sort;
    if (typeof sort !== 'string' || !Object.hasOwn(LEAD_SORTS, sort)) {
      return res.status(400).json({ error: `Choose an order: ${Object.keys(LEAD_SORTS).join(', ')}.` });
    }
    const store = await getStore();
    const community = await communityOf(req, res, store);
    if (!community) return;
    const hold = reserve([[pdfBurst, community.id]]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('reports', hold.wait) });
    }
    const [leads, homes, brand] = await Promise.all([
      store.listLeads(community.id), store.listHomes(community.id), loadLenderBrand(store, community),
    ]);
    sendPdf(res, buildLeadsPdf({ community, leads, homes, period, sort, brand }));
  });

  /** One person's report as a PDF: contact, what they agreed to, their homes and plan, and everything they did. */
  router.get('/leads/:id/report.pdf', async (req, res) => {
    const store = await getStore();
    const lead = await leadOf(req, res, store);
    if (!lead) return;
    const hold = reserve([[pdfBurst, lead.communityId]]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('reports', hold.wait) });
    }
    const [community, homes, consents] = await Promise.all([
      store.getCommunity(lead.communityId), store.listHomes(lead.communityId), store.listConsents(lead.id),
    ]);
    const brand = await loadLenderBrand(store, community);
    sendPdf(res, buildUserPdf({ community: community ?? { name: 'Community' }, lead, homes, consents, brand }));
  });

  router.get('/communities/:id/leads', async (req, res) => {
    const store = await getStore();
    // Read by the id alone, like the slots, so the check is on the id itself.
    if (!allowed(req, res, req.params.id)) return;
    // `callLate`: a call still waiting whose day has passed, by the same day the reports and the Today page count
    // in (REPORT_TIME_ZONE), so the Leads list cannot call a request late when they do not, whatever the device's clock says.
    const today = reportDay();
    res.json((await store.listLeads(req.params.id)).map((lead) => ({
      ...lead, callLate: Boolean(isTourPending(lead) && lead.tour.date && lead.tour.date < today),
    })));
  });

  /**
   * Reading a lead is what marks it read — there is no other caller, and the
   * only way to reach this is an admin opening that lead's screen. Stamped once
   * and never moved, so "unread" cannot come back and the badge stays honest.
   * The stamp is a read receipt, not a change the owner oversees, so it writes no activity line.
   */
  router.get('/leads/:id', async (req, res) => {
    const store = await getStore();
    const lead = await leadOf(req, res, store);
    if (!lead) return;
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
    const lead = await leadOf(req, res, store);
    if (!lead) return;
    res.json(await store.listConsents(lead.id));
  });

  /**
   * The lead as a MISMO 3.4 file, so a loan officer can import them rather than
   * retype them. Contact and plan only — see server/lib/mismo.js for why.
   */
  router.get('/leads/:id/mismo', async (req, res) => {
    const store = await getStore();
    const lead = await leadOf(req, res, store);
    if (!lead) return;
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
    const lead = await leadOf(req, res, store);
    if (!lead) return;
    const patch = {};
    // What this save did, in the words the Leads page uses, for the owner's log.
    const did = [];
    if (req.body?.status !== undefined && ['new', 'contacted'].includes(req.body.status)) {
      patch.status = req.body.status;
      did.push(patch.status === 'contacted' ? 'marked contacted' : 'marked new');
    }
    if (req.body?.notes !== undefined) {
      patch.notes = String(req.body.notes).slice(0, 4000);
      did.push('changed the notes');
    }
    // Archiving is reversible and never deletes: a buyer who went quiet this
    // spring is the same buyer who calls back in the autumn.
    if (req.body?.archived !== undefined) {
      patch.archivedAt = req.body.archived ? new Date().toISOString() : null;
      did.push(req.body.archived ? 'closed' : 'reopened');
    }
    // Clearing the call request is what keeps the badge meaningful: handled
    // requests stop counting, but the request itself stays on the record.
    if (req.body?.tourHandled !== undefined && lead.tour) {
      patch.tour = {
        ...lead.tour,
        handledAt: req.body.tourHandled ? new Date().toISOString() : null,
      };
      did.push(req.body.tourHandled ? 'call handled' : 'call reopened');
    }
    const updated = await store.updateLead(lead.id, patch);
    await recordActivity(store, req, { communityId: lead.communityId, action: 'lead.updated', subject: lead.name, detail: did.join(', ') });
    res.json(updated);
  });

  return router;
}
