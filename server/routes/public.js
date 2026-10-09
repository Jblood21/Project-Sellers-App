import { Router } from 'express';

import {
  CONSENT_VERSION, cleanExtraEmails, complianceOf, consentText, DEFAULT_SETTINGS, GUIDE_TEXT_MAX, incentiveRecipient, SAFE_EMAIL_RE,
  CONTACT_METHOD_KEYS, describeTour, lenderNameOf, MOVE_IN_DRIVER_KEYS, MOVE_IN_DRIVER_STEP_KEYS,
  TOUR_TOPICS,
  MOVE_IN_STEP_KEYS, PAY_METHOD_KEYS,
  PLAN_LABELS, TOOL_KEYS,
} from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { issueLeadToken, requireLead } from '../lib/auth.js';
import { clientKey, createLimiter, limitRequests, reserve, tooMany } from '../lib/limits.js';
import { hasControlCharacter, rejectControlCharacters, stripControlCharacters } from '../lib/params.js';
import { emailConfigured } from '../lib/email.js';
import { emailLoanTeam, notifyCallRequest, sendPlanToBuyer } from '../lib/notify.js';
import { linkOriginOf, pinnedOrigin } from '../lib/ssr.js';
import { sendVideo } from '../lib/video.js';
import { catchAsyncErrors } from './admin.js';

// The only types /api/photos will label an image. SVG is absent on purpose.
const SERVED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUIDE_SLUG_RE = new RegExp(`^[a-z0-9-]{1,${GUIDE_TEXT_MAX.slug}}$`);

// How much of each thing a stranger may hand us. The gate is open to anyone with a
// community link and the fields are stored, shown to the builder and emailed, so each
// one is bounded to what a real person types.
const FIELD_MAX = { name: 120, email: 254, phone: 40, summary: 500 };

/**
 * A lead as the BUYER may see it: their own details and what they built. The record the
 * builder works from also holds that builder's private notes, the lead's status, read and
 * archive stamps, internal activity lines and the IP address on the consent row, none of
 * which is for the person they are about. Every buyer-facing response goes through this.
 */
export const publicLead = (lead) => (lead ? {
  id: lead.id,
  communityId: lead.communityId,
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  extraEmails: lead.extraEmails ?? [],
  savedHomeIds: lead.savedHomeIds ?? [],
  plan: lead.plan ?? {},
  moveIn: lead.moveIn ?? null,
  tour: lead.tour
    ? {
      slotId: lead.tour.slotId,
      date: lead.tour.date,
      time: lead.tour.time,
      contact: lead.tour.contact,
      topic: lead.tour.topic,
      requestedAt: lead.tour.requestedAt,
    }
    : null,
  consent: lead.consent ? { granted: Boolean(lead.consent.granted), at: lead.consent.at ?? null } : null,
} : null);
const PLAN_KEYS = new Set([...TOOL_KEYS, 'homes']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DRIVER_STEP_KEYS = new Set(MOVE_IN_DRIVER_STEP_KEYS);

/** A literal date or nothing. Anything else is dropped rather than half-trusted. */
const cleanDate = (value) => {
  const text = String(value ?? '').trim();
  return DATE_RE.test(text) ? text : '';
};

/**
 * The buyer's own move-in plan, trimmed to what we will store. Their own steps
 * are free text, so they are the part that needs bounding; everything else is a
 * date or a key from a fixed list.
 */
const cleanMoveIn = (body, homeIds) => {
  const ownSteps = (Array.isArray(body?.ownSteps) ? body.ownSteps : [])
    .map((step) => ({
      id: String(step?.id ?? '').trim().slice(0, 40),
      label: String(step?.label ?? '').trim().slice(0, 80),
      date: cleanDate(step?.date),
    }))
    .filter((step) => step.id && step.label)
    .slice(0, 20);
  const ownKeys = new Set(ownSteps.map((step) => `own:${step.id}`));
  const homeId = String(body?.homeId ?? '').trim();

  return {
    homeId: homeIds.has(homeId) ? homeId : null,
    targetDate: cleanDate(body?.targetDate),
    leaseEnd: cleanDate(body?.leaseEnd),
    payMethod: PAY_METHOD_KEYS.includes(body?.payMethod) ? body.payMethod : 'loan',
    drivers: [...new Set(Array.isArray(body?.drivers) ? body.drivers : [])].filter((d) => MOVE_IN_DRIVER_KEYS.includes(d)),
    // A step can be ticked only if it still exists -- deleting one of their own
    // items should not leave a tick behind that nothing can ever untick.
    done: [...new Set(Array.isArray(body?.done) ? body.done : [])]
      .filter((k) => MOVE_IN_STEP_KEYS.includes(k) || ownKeys.has(k) || DRIVER_STEP_KEYS.has(k))
      .slice(0, 60),
    ownSteps,
  };
};

/**
 * A feature the builder switched off is stripped here rather than hidden in the
 * client, so an unpublished lot number never reaches a buyer's browser at all.
 */
const applyFeatures = (homes, features) =>
  homes.map((home) => ({
    ...home,
    lotNumber: features.lotNumbers ? home.lotNumber : '',
    floorPlans: features.floorPlans ? home.floorPlans : [],
  }));

/** What a buyer sees of a realtor: no internal ids beyond their own, images as bare URLs. */
const publicAgent = (agent) => ({
  id: agent.id,
  name: agent.name,
  brokerage: agent.brokerage,
  licenseNo: agent.licenseNo,
  licenseState: agent.licenseState,
  phone: agent.phone,
  email: agent.email,
  website: agent.website,
  photo: agent.photo?.url ?? null,
  logo: agent.logo?.url ?? null,
});

/** A guide as the list sees it: enough for a card, never the article itself. */
const publicGuideSummary = (guide) => ({
  id: guide.id,
  slug: guide.slug,
  title: guide.title,
  category: guide.category,
  byline: guide.byline,
  note: guide.note,
  summary: guide.summary,
  image: guide.image,
  imageAlt: guide.imageAlt,
  createdAt: guide.createdAt,
  updatedAt: guide.updatedAt,
});

/**
 * The settings a buyer is served. A switched-off incentive or FAQ is not sent
 * (the same rule as the site map, agents and guides: draft marketing terms are
 * not for the public just because the card is hidden), and neither is the
 * address call requests are emailed to, which is the builder's, not a buyer's.
 */
const INCENTIVE_KEYS = Object.keys(DEFAULT_SETTINGS).filter((key) => key.startsWith('incentive'));
function publicSettings(community) {
  const { notifyEmail: _private, ...settings } = community.settings;
  if (!community.features.incentive) for (const key of INCENTIVE_KEYS) delete settings[key];
  if (!community.features.faq) settings.faqJson = '[]';
  return settings;
}

const publicCommunity = (
  community, homes, highlights, resources, heroPhoto, iconPhoto, siteMap, slots,
  { logo, logoLight, lenderLogo, agents, guides },
) => ({
  id: community.id,
  // How its address is written: the clean slug when it has one. The browser swaps the address bar to
  // this, so a printed link made from the id keeps working and quietly becomes the clean one.
  slug: community.slug,
  urlKey: community.urlKey,
  // The one public address when PUBLIC_ORIGIN pins it, so the browser writes the same
  // canonical and structured-data id the server wrote instead of whichever host it loaded from.
  siteOrigin: pinnedOrigin(),
  name: community.name,
  location: community.location,
  status: community.status,
  theme: community.theme,
  layout: community.layout,
  builder: community.builder,
  websiteUrl: community.websiteUrl,
  settings: publicSettings(community),
  tools: community.tools,
  features: community.features,
  heroPhoto: heroPhoto?.url ?? null,
  iconPhoto: iconPhoto?.url ?? null,
  siteMap: community.features.siteMap ? (siteMap?.url ?? null) : null,
  logo: logo?.url ?? null,
  logoLight: logoLight?.url ?? null,
  lenderLogo: lenderLogo?.url ?? null,
  // Realtors and guides follow the same rule as the site map: a feature switched
  // off is not served at all, rather than served and hidden by the client.
  agents: community.features.agents ? agents.map(publicAgent) : [],
  guides: community.features.guides ? guides.map(publicGuideSummary) : [],
  // Same rule as the site map: switched off means the buyer is not served it
  // at all, rather than being served it and told not to look.
  resources: community.features.resources ? resources : [],
  homes: applyFeatures(homes, community.features),
  highlights,
  // Same rule as the site map: switched off means the buyer is not served the times at all.
  slots: community.features.booking === false ? [] : slots,
  // Whether this server can send mail at all, so the buyer app shows a message form only when it can.
  // A fact about the server, not a secret.
  emailReady: emailConfigured(),
});

/**
 * The public payload for one community, or null when there is none. Exported so
 * the server-rendered page head reads exactly what the JSON route serves: the
 * two cannot drift into describing different communities.
 */
export async function loadPublicCommunity(store, communityId) {
  // An id, the id in other case, or any slug the community has had.
  const community = await store.resolveCommunity(communityId);
  if (!community) return null;
  const [
    homes, highlights, resources, heroes, icons, maps, slots, logos, logosLight, lenderLogos, agents,
    guides,
  ] = await Promise.all([
    store.listHomes(community.id),
    store.listHighlights(community.id),
    store.listResources(community.id),
    store.listCommunityPhotos(community.id, 'hero'),
    store.listCommunityPhotos(community.id, 'icon'),
    store.listCommunityPhotos(community.id, 'sitemap'),
    store.listOpenSlots(community.id),
    store.listCommunityPhotos(community.id, 'logo'),
    store.listCommunityPhotos(community.id, 'logolight'),
    store.listCommunityPhotos(community.id, 'lenderlogo'),
    store.listAgents(community.id),
    store.listGuides(community.id),
  ]);
  return publicCommunity(community, homes, highlights, resources, heroes[0], icons[0], maps[0], slots, {
    logo: logos[0], logoLight: logosLight[0], lenderLogo: lenderLogos[0], agents, guides,
  });
}

export function publicRouter() {
  const router = rejectControlCharacters(catchAsyncErrors(Router()));

  // A community is reached by its id or by a clean slug it was given (and any slug it has had). Every
  // route below works on the real id, so the address is turned into it once, here. An address that is
  // neither is left as it is and each route answers 404 as before.
  router.param('communityId', async (req, _res, next, value) => {
    try {
      const found = await (await getStore()).resolveCommunity(value);
      if (found) req.params.communityId = found.id;
      next();
    } catch (err) {
      next(err);
    }
  });

  // What a stranger can make this server do is limited per visitor (an address; an IPv6 block counts as
  // one) and, where there is one, per buyer. A model-home trailer is one wifi address with many buyers on
  // it, and a launch day puts a few hundred through the gate, so the per-address numbers are generous
  // and the per-person ones are what stop a script from repeating itself.
  const gatePerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 400 });
  const gatePerPerson = createLimiter({ windowMs: 60 * 60 * 1000, max: 8 });
  const writesPerIp = createLimiter({ windowMs: 10 * 60 * 1000, max: 3000 });
  const activityPerLead = createLimiter({ windowMs: 10 * 60 * 1000, max: 300 });
  const planMailPerLead = createLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 5 });
  // A plan goes to the email typed at the gate, which nobody has verified, so the cap that matters for a
  // stranger's inbox is on the recipient, whichever lead or address asked.
  const planMailPerRecipient = createLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 5 });
  const planMailPerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });
  const toursPerLead = createLimiter({ windowMs: 60 * 60 * 1000, max: 12 });
  // "Find out if you qualify" mail goes to a real inbox, and anyone can mint a buyer record at the gate,
  // so it is limited per buyer (and not twice in a breath), per visitor and per community.
  const incentiveBurst = createLimiter({ windowMs: 20 * 1000, max: 1 });
  const incentivePerLead = createLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
  const incentivePerIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
  const incentivePerCommunity = createLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
  router.use((req, res, next) => (
    req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
      ? next()
      : limitRequests(() => [[writesPerIp, clientKey(req)]], 'requests')(req, res, next)
  ));

  /** Everything the buyer app needs to render a community. */
  router.get('/c/:communityId', async (req, res) => {
    const payload = await loadPublicCommunity(await getStore(), req.params.communityId);
    if (!payload) return res.status(404).json({ error: 'This community link isn’t active anymore. Ask the team for a new one.' });
    res.json(payload);
  });

  /**
   * One whole guide. Public like the list: guides are the part of the app a
   * search engine and a buyer who has not signed in are meant to reach. An
   * unpublished guide and a switched-off feature both look like a guide that
   * does not exist, so a draft's address tells nobody anything.
   */
  router.get('/c/:communityId/guides/:slug', async (req, res) => {
    const store = await getStore();
    // A slug is only ever lowercase letters, digits and hyphens, so anything else
    // is a guide that cannot exist. Refusing it here keeps a crawler's malformed
    // address (a stray %00, say) from ever reaching the database driver.
    if (!GUIDE_SLUG_RE.test(req.params.slug)) {
      return res.status(404).json({ error: 'That guide could not be found.' });
    }
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'This community link isn’t active anymore. Ask the team for a new one.' });
    const guide = community.features.guides
      ? await store.getGuideBySlug(community.id, req.params.slug)
      : null;
    if (!guide || !guide.published) return res.status(404).json({ error: 'That guide could not be found.' });
    res.json({ ...publicGuideSummary(guide), body: guide.body });
  });

  /**
   * The contact gate. Returning buyers who re-enter the same email get their
   * existing record back rather than a duplicate lead.
   */
  router.post('/c/:communityId/leads', limitRequests((req) => [
    [gatePerIp, clientKey(req)],
    [gatePerPerson, `${clientKey(req)}|${String(req.body?.email ?? '').trim().toLowerCase().slice(0, FIELD_MAX.email)}`],
  ], 'sign-up attempts'), async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'This community link isn’t active anymore. Ask the team for a new one.' });

    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    // Bounded, and free of control characters (a NUL byte is refused by Postgres and would
    // otherwise surface as a server error for what is only a malformed form).
    if (
      name.length > FIELD_MAX.name || email.length > FIELD_MAX.email || phone.length > FIELD_MAX.phone
      || hasControlCharacter(name) || hasControlCharacter(email) || hasControlCharacter(phone)
    ) {
      return res.status(400).json({ error: 'Please check your name, email and cell number and try again.' });
    }
    // A cell number is optional here: nothing in the app needs one to work. It is asked for when a buyer
    // wants to meet with the team (POST /me/tour), because then the team has to be able to reach them.
    // One that is given has to look like a number.
    const digits = (phone.match(/\d/g) || []).length;
    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please add your full name and a valid email.' });
    }
    if (phone && digits < 7) {
      return res.status(400).json({ error: 'That cell number looks too short. Check it, or leave it blank for now.' });
    }

    // The consent paragraph is rendered HERE, from this community's own name,
    // and never taken from the request. What gets stored has to be the words the
    // server put on the screen: text supplied by the caller would make the
    // record say whatever a modified client felt like claiming, which is worth
    // less than no record at all.
    // Consent to calls and texts is about a number. Without one there is nothing to agree to, so the
    // answer is not taken and no row is written; it is asked for again when a number is given.
    const granted = Boolean(phone) && req.body?.consent === true;
    const consent = {
      granted,
      text: consentText(community.builder || community.name),
      version: CONSENT_VERSION,
      ip: req.ip ?? '',
      userAgent: String(req.get('user-agent') ?? '').slice(0, 400),
    };

    // All three have to match. A buyer coming back gets their own record and
    // everything in it; anyone whose details differ is a different person and
    // gets their own, even if they share an email with somebody here.
    const existing = await store.findLeadByIdentity(community.id, { name, email, phone });
    if (existing) {
      await store.addActivity(existing.id, 'Return visit');
      // A returning buyer is shown the box again, so their answer can change.
      // Only a real change is written: re-recording an identical answer on
      // every visit would bury the moment they actually decided under noise.
      const current = existing.consent;
      if (phone && (!current || current.granted !== granted || current.version !== consent.version)) {
        await store.recordConsent(existing.id, consent);
        await store.addActivity(
          existing.id,
          granted ? 'Agreed to calls and texts' : 'Declined calls and texts',
        );
      }
      const lead = await store.getLead(existing.id);
      return res.json({ lead: publicLead(lead), token: issueLeadToken(lead), returning: true });
    }

    const created = await store.createLead(community.id, { name, email, phone });
    await store.addActivity(created.id, 'Scanned QR — entered the app');
    // Recorded either way: that somebody was asked and left the box unchecked
    // is the answer, and it is the one that has to be visible before anyone
    // picks up the phone.
    //
    // Not written to the activity feed. Every lead would carry the same line
    // and it is the feed the builder actually reads; the consent record is the
    // record, and the lead screen puts it next to the phone number. Only a
    // CHANGE of mind is news, and that is logged below on a return visit.
    if (phone) await store.recordConsent(created.id, consent);
    const lead = await store.getLead(created.id);
    res.status(201).json({ lead: publicLead(lead), token: issueLeadToken(lead), returning: false });
  });

  // ── the buyer's own record ───────────────────────────────────────────────
  router.get('/me', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });
    res.json(publicLead(lead));
  });

  /** Toggle a saved home. Returns the new saved list so the client can reconcile. */
  router.post('/me/saves', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });

    const homeId = String(req.body?.homeId ?? '');
    const home = await store.getHome(homeId);
    if (!home || home.communityId !== lead.communityId) return res.status(404).json({ error: 'We couldn’t find that home. Reload the page and try again.' });

    const saved = new Set(lead.savedHomeIds);
    const wasSaved = saved.has(homeId);
    if (wasSaved) saved.delete(homeId);
    else saved.add(homeId);

    const updated = await store.updateLead(lead.id, { savedHomeIds: [...saved] });
    if (!wasSaved) await store.addActivity(lead.id, `Saved ${home.name}`);
    res.json({ savedHomeIds: updated.savedHomeIds, saved: !wasSaved });
  });

  /** Upsert one plan item and log it, the "Add to My Home Plan" action. */
  router.put('/me/plan/:key', requireLead, async (req, res) => {
    const key = req.params.key;
    if (!PLAN_KEYS.has(key)) return res.status(400).json({ error: 'Unknown plan item' });
    const summary = stripControlCharacters(req.body?.summary).trim().slice(0, FIELD_MAX.summary);
    if (!summary) return res.status(400).json({ error: 'Nothing to save yet' });

    const store = await getStore();
    await store.upsertPlanItem(req.leadId, key, summary);
    await store.addActivity(req.leadId, `${PLAN_LABELS[key] || key} saved: ${summary}`);
    res.json(publicLead(await store.getLead(req.leadId)));
  });

  /**
   * The buyer's move-in plan. Saved whole and on the lead rather than in the
   * browser, so it is still theirs when they come back on a different phone --
   * and so the builder can see what they are actually working towards.
   */
  router.put('/me/movein', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });

    const homes = await store.listHomes(lead.communityId);
    const plan = cleanMoveIn(req.body, new Set(homes.map((h) => h.id)));
    const before = lead.moveIn;
    await store.saveMoveIn(req.leadId, plan);

    // Log the date, not every tick -- a checkbox each way would bury the
    // activity feed the builder actually reads.
    if (plan.targetDate && plan.targetDate !== before?.targetDate) {
      await store.addActivity(req.leadId, `Wants to be moved in by ${plan.targetDate}`);
    }
    res.json(publicLead(await store.getLead(req.leadId)));
  });

  /** Behavioral tracking — price points tested, loan types explored, views. */
  router.post('/me/activity', requireLead, limitRequests((req) => [[activityPerLead, req.leadId]], 'requests'), async (req, res) => {
    const text = stripControlCharacters(req.body?.text).trim().slice(0, 300);
    if (!text) return res.status(400).json({ error: 'Nothing to log' });
    const store = await getStore();
    await store.addActivity(req.leadId, text);
    res.status(204).end();
  });

  /** The buyer asks for their own plan. Never sent unprompted. */
  router.post('/me/plan/email', requireLead, async (req, res) => {
    const store = await getStore();
    let lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });
    const community = await store.getCommunity(lead.communityId);
    if (!community) return res.status(404).json({ error: 'This community link isn’t active anymore. Ask the team for a new one.' });

    // An address typed in the "also send to" box is kept on the lead (the next send and the team have
    // it); an empty one removes it. Checked before anything is sent or counted.
    if (req.body?.also !== undefined) {
      const cleaned = cleanExtraEmails(req.body.also, lead.email);
      if (cleaned.error) return res.status(400).json({ error: cleaned.error, field: 'also' });
      if (JSON.stringify(cleaned.emails) !== JSON.stringify(lead.extraEmails ?? [])) {
        lead = await store.updateLead(lead.id, { extraEmails: cleaned.emails });
        await store.addActivity(lead.id, cleaned.emails.length ? 'Added a second email' : 'Removed the second email');
      }
    }
    const extras = lead.extraEmails ?? [];
    const recipients = [lead.email, ...extras];

    // Only an email that went out counts against the caps: a provider outage or a missing sender
    // must not use up a buyer's five for the day, or hide itself behind "too many" for everyone
    // on their wifi. The uses are held while the send is in flight and given back if it fails.
    // Every address that will receive one is counted against its own inbox, the second included.
    const hold = reserve([
      [planMailPerLead, req.leadId],
      ...recipients.map((address) => [planMailPerRecipient, String(address).trim().toLowerCase()]),
      [planMailPerIp, clientKey(req)],
    ]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: tooMany('plan emails', hold.wait) });
    }
    let result;
    const also = [];
    try {
      const homes = await store.listHomes(community.id);
      const withHomes = { ...community, homes };
      const baseUrl = linkOriginOf(req);
      result = await sendPlanToBuyer({ community: withHomes, lead, baseUrl });
      if (result.sent) {
        for (const address of extras) {
          const copy = await sendPlanToBuyer({ community: withHomes, lead, baseUrl, to: address, sharedBy: lead.name });
          also.push({ to: address, sent: Boolean(copy.sent) });
        }
      }
    } finally {
      // Also on a throw: nothing was sent either way.
      if (!result?.sent) hold.release();
    }
    if (!result.sent) {
      return res.status(503).json({
        error: 'We couldn’t email your plan right now. You can still download it as a PDF, or try again later.',
      });
    }
    const alsoSent = also.some((entry) => entry.sent);
    await store.addActivity(req.leadId, alsoSent ? 'Emailed their home plan to themselves and a second email' : 'Emailed their home plan to themselves');
    res.json({ sent: true, to: lead.email, also, lead: publicLead(lead) });
  });

  /**
   * "Find out if you qualify" → a message from the buyer to the incentive email (else the loan team),
   * sent for them so it works without a mail program. The address it goes to is chosen here from the
   * community's settings, never from the request. The buyer is told "sent" only when the mail provider
   * took it; when email is not set up or the send fails they are told so and shown another way, and a
   * failed send does not use up their limit.
   */
  router.post('/me/incentive/email', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });
    const community = await store.getCommunity(lead.communityId);
    if (!community || !community.features.incentive) {
      return res.status(404).json({ error: 'This isn’t available right now.' });
    }
    const recipient = incentiveRecipient(community.settings, { community });
    if (!recipient) {
      return res.status(409).json({ error: 'The team hasn’t listed an email address yet. Please call or text instead.' });
    }
    const lenderPhone = complianceOf(community.settings, { community }).lender.phone;
    const callInstead = lenderPhone ? ` You can also call ${lenderPhone}.` : '';

    // A blank name or email is theirs from the sign-up, so the form can be sent as it was prefilled.
    const name = stripControlCharacters(String(req.body?.name ?? '').trim() || lead.name).replace(/\s+/g, ' ').trim();
    const email = String(req.body?.email ?? '').trim() || lead.email;
    // Newlines are fine in a message; every other control character is not.
    const message = String(req.body?.message ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim();
    if (!name || name.length > FIELD_MAX.name) return res.status(400).json({ error: 'Please add your name.' });
    if (!SAFE_EMAIL_RE.test(email) || email.length > FIELD_MAX.email) return res.status(400).json({ error: 'Please check your email address.' });
    if (message.length < 3) return res.status(400).json({ error: 'Please write a short message.' });
    if (message.length > 1000) return res.status(400).json({ error: 'That message is a little long. Please keep it under 1,000 characters.' });

    if (!emailConfigured()) {
      return res.status(503).json({ error: `Messages can’t be sent from here yet.${callInstead}` });
    }
    const hold = reserve([
      [incentiveBurst, req.leadId],
      [incentivePerLead, req.leadId],
      [incentivePerIp, clientKey(req)],
      [incentivePerCommunity, community.id],
    ]);
    if (hold.wait) {
      res.set('Retry-After', String(hold.wait));
      return res.status(429).json({ error: `You’ve sent a few messages already. Please try again ${hold.wait < 90 ? 'in a minute' : 'later'}.${callInstead}` });
    }
    let result;
    try {
      result = await emailLoanTeam({
        community, lead, to: recipient.to, name, email, message, baseUrl: linkOriginOf(req),
      });
    } finally {
      if (!result?.sent) hold.release();
    }
    const label = recipient.kind === 'lender' ? (recipient.name || 'the loan team') : 'the team';
    const snippet = message.replace(/\s+/g, ' ').slice(0, 120);
    if (!result.sent) {
      await store.addActivity(lead.id, `Tried to email ${label} about the builder incentive (it could not be sent): “${snippet}”`);
      return res.status(503).json({ error: `We couldn’t send that right now.${callInstead}` });
    }
    await store.addActivity(lead.id, `Emailed ${label} about the builder incentive: “${snippet}”`);
    res.json({ sent: true, to: label });
  });

  /** Live open slots, so a buyer with the dialog open does not book a stale one. */
  router.get('/c/:communityId/slots', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    // Booking switched off: nothing is on offer, whatever times are published (they are kept).
    if (!community || community.features.booking === false) return res.json([]);
    res.json(await store.listOpenSlots(community.id));
  });

  router.post('/me/tour', requireLead, limitRequests((req) => [[toursPerLead, req.leadId]], 'booking attempts'), async (req, res) => {
    const store = await getStore();
    const slotId = String(req.body?.slotId ?? '').trim();
    const contact = CONTACT_METHOD_KEYS.includes(req.body?.contact) ? req.body.contact : 'phone';
    if (!slotId) return res.status(400).json({ error: 'Pick a time that works' });

    const buyer = await store.getLead(req.leadId);
    if (!buyer) return res.status(404).json({ error: 'We couldn’t find your plan. Reload the page and sign in again.' });
    const slot = await store.getSlot(slotId);
    // A time belongs to one community. Its id is published on that community's page, so
    // without this a buyer from one development could take another's appointment.
    if (!slot || slot.communityId !== buyer.communityId) {
      return res.status(404).json({ error: 'That time is no longer available.' });
    }

    // Meeting with the team needs a way to reach the buyer. Someone who signed up without a number gives it
    // here; it is checked before anything is booked, and saved on their record with the answer to the calls
    // and texts question, in the community's own words, exactly as at the sign-up form.
    const community = await store.getCommunity(buyer.communityId);
    // Switched off by the builder: the times are still stored, but no one can take one, including from a
    // sheet that was already open when it was switched off.
    if (community && community.features.booking === false) {
      return res.status(403).json({ error: 'Online booking is turned off right now. Please call, text or email the team.' });
    }
    let newPhone = '';
    if (!buyer.phone) {
      const given = String(req.body?.phone ?? '').trim();
      if ((given.match(/\d/g) || []).length < 7 || given.length > FIELD_MAX.phone || hasControlCharacter(given)) {
        return res.status(400).json({ error: 'To set up a time, we need a cell number we can reach you on.' });
      }
      newPhone = given;
    }
    // Another email to reach them or send the plan to, if they gave one. Checked before a time is taken.
    let extraPatch = {};
    if (req.body?.extraEmail !== undefined) {
      const cleaned = cleanExtraEmails(req.body.extraEmail, buyer.email);
      if (cleaned.error) return res.status(400).json({ error: cleaned.error, field: 'extraEmail' });
      if (JSON.stringify(cleaned.emails) !== JSON.stringify(buyer.extraEmails ?? [])) extraPatch = { extraEmails: cleaned.emails };
    }

    // Book first, release afterwards. The other order would hand back the
    // appointment they already had and then fail to get them a new one, leaving
    // a buyer who tried to reschedule with nothing at all.
    const booked = await store.bookSlot(slotId, req.leadId);
    if (!booked) {
      return res.status(409).json({ error: 'Somebody just took that time — please pick another.' });
    }
    await store.releaseSlotsForLead(req.leadId, booked.id);

    const tour = {
      slotId: booked.id,
      date: booked.date,
      time: booked.time,
      contact,
      // What they want to talk about. Stored on the tour rather than guessed
      // from where they tapped, so the person picking it up knows whether to
      // bring a floor plan or a loan officer.
      topic: TOUR_TOPICS.includes(req.body?.topic) ? req.body.topic : 'community',
      requestedAt: new Date().toISOString(),
    };
    const lead = await store.updateLead(req.leadId, { tour, ...(newPhone ? { phone: newPhone } : {}), ...extraPatch });
    if (extraPatch.extraEmails) {
      await store.addActivity(req.leadId, extraPatch.extraEmails.length ? 'Added a second email' : 'Removed the second email');
    }
    if (newPhone) {
      const granted = req.body?.consent === true;
      await store.recordConsent(req.leadId, {
        granted,
        text: consentText(community?.builder || community?.name),
        version: CONSENT_VERSION,
        ip: req.ip ?? '',
        userAgent: String(req.get('user-agent') ?? '').slice(0, 400),
      });
      await store.addActivity(req.leadId, granted ? 'Gave a cell number and agreed to calls and texts' : 'Gave a cell number to book a time');
    }
    await store.addActivity(
      req.leadId,
      `Booked ${describeTour(tour, lenderNameOf(community))}`,
    );

    // The request is already saved. Telling the builder is best-effort on top of
    // that — sendEmail never throws, so a mail outage cannot cost them the lead.
    if (community) {
      const homes = await store.listHomes(community.id);
      const result = await notifyCallRequest({
        store, community: { ...community, homes }, lead, baseUrl: linkOriginOf(req),
      });
      if (result.sent) await store.addActivity(req.leadId, 'Builder emailed about the call request');
    }
    res.json(publicLead(lead));
  });

  // ── photos ───────────────────────────────────────────────────────────────
  router.get('/photos/:id', async (req, res) => {
    const store = await getStore();
    const photo = await store.getPhotoData(req.params.id);
    if (!photo) return res.status(404).end();
    if (photo.url) return res.redirect(photo.url);
    if (!photo.data) return res.status(404).end();
    // Anything outside the raster list is served as an opaque download. Nothing
    // can be stored with another type today; this keeps that true if a future
    // write path forgets the check.
    const type = photo.content_type || 'image/jpeg';
    res.set('Content-Type', SERVED_IMAGE_TYPES.has(type) ? type : 'application/octet-stream');
    // These bytes come from an upload and are served from this site's own origin.
    // The type was checked against a raster allow-list on the way in; these two
    // headers make the browser hold to it instead of sniffing the bytes into
    // something it would run, and sandbox the response should one ever be opened
    // as a page.
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(photo.data, 'base64'));
  });

  /** A "Worth knowing" video. sendVideo handles the ranges seeking depends on. */
  router.get('/resources/:id/video', async (req, res) => {
    const store = await getStore();
    const video = await store.getResourceVideo(req.params.id);
    if (!video) return res.status(404).end();
    return sendVideo(req, res, video);
  });

  /**
   * A home's walkthrough. Public like the photos on the same home: the buyer
   * app is the whole audience, and a lot number is not a secret.
   */
  router.get('/homes/:id/video', async (req, res) => {
    const store = await getStore();
    const video = await store.getHomeVideo(req.params.id);
    if (!video) return res.status(404).end();
    return sendVideo(req, res, video);
  });

  return router;
}

/**
 * Inbound rate webhook — Zapier parses the lender's rate email and posts here.
 * Guarded by a shared secret so anyone with the community id can't move rates.
 */
export function ratesRouter() {
  const router = rejectControlCharacters(catchAsyncErrors(Router()));

  router.post('/communities/:id/rates', async (req, res) => {
    const secret = process.env.RATES_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Rate webhook is not configured' });
    if (req.get('x-webhook-secret') !== secret) return res.status(401).json({ error: 'Bad secret' });

    const store = await getStore();
    const community = await store.getCommunity(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const settings = { ...community.settings };
    let changed = false;
    for (const [field, key] of [['conv', 'rateConv'], ['fha', 'rateFha'], ['va', 'rateVa']]) {
      const value = req.body?.[field] ?? req.body?.[key];
      if (value === undefined || value === null || value === '') continue;
      const parsed = Number.parseFloat(String(value).replace('%', ''));
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 25) {
        return res.status(400).json({ error: `Rate "${field}" is out of range` });
      }
      settings[key] = parsed.toFixed(2);
      changed = true;
    }
    if (!changed) return res.status(400).json({ error: 'Send at least one of conv, fha, va' });

    settings.ratesUpdatedAt = new Date().toISOString();
    const updated = await store.updateCommunity(community.id, { settings });
    res.json({ ok: true, settings: updated.settings });
  });

  return router;
}
