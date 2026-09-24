import { Router } from 'express';

import {
  CONTACT_METHOD_KEYS, describeTour, MOVE_IN_DRIVER_KEYS, MOVE_IN_DRIVER_STEP_KEYS,
  MOVE_IN_STEP_KEYS, PAY_METHOD_KEYS,
  PLAN_LABELS, TOOL_KEYS,
} from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { issueLeadToken, requireLead } from '../lib/auth.js';
import { notifyCallRequest, sendPlanToBuyer } from '../lib/notify.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Absolute URL of this deployment, so emails can link back into the app. */
const baseUrlOf = (req) => {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return '';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${host}`;
};
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
    drivers: (Array.isArray(body?.drivers) ? body.drivers : []).filter((d) => MOVE_IN_DRIVER_KEYS.includes(d)),
    // A step can be ticked only if it still exists -- deleting one of their own
    // items should not leave a tick behind that nothing can ever untick.
    done: (Array.isArray(body?.done) ? body.done : [])
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

const publicCommunity = (community, homes, highlights, resources, heroPhoto, iconPhoto, siteMap, slots) => ({
  id: community.id,
  name: community.name,
  location: community.location,
  status: community.status,
  theme: community.theme,
  builder: community.builder,
  websiteUrl: community.websiteUrl,
  settings: community.settings,
  tools: community.tools,
  features: community.features,
  heroPhoto: heroPhoto?.url ?? null,
  iconPhoto: iconPhoto?.url ?? null,
  siteMap: community.features.siteMap ? (siteMap?.url ?? null) : null,
  // Same rule as the site map: switched off means the buyer is not served it
  // at all, rather than being served it and told not to look.
  resources: community.features.resources ? resources : [],
  homes: applyFeatures(homes, community.features),
  highlights,
  slots,
});

export function publicRouter() {
  const router = Router();

  /** Everything the buyer app needs to render a community. */
  router.get('/c/:communityId', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'That community link is no longer active.' });
    const [homes, highlights, resources, heroes, icons, maps, slots] = await Promise.all([
      store.listHomes(community.id),
      store.listHighlights(community.id),
      store.listResources(community.id),
      store.listCommunityPhotos(community.id, 'hero'),
      store.listCommunityPhotos(community.id, 'icon'),
      store.listCommunityPhotos(community.id, 'sitemap'),
      store.listOpenSlots(community.id),
    ]);
    res.json(publicCommunity(community, homes, highlights, resources, heroes[0], icons[0], maps[0], slots));
  });

  /**
   * The contact gate. Returning buyers who re-enter the same email get their
   * existing record back rather than a duplicate lead.
   */
  router.post('/c/:communityId/leads', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'That community link is no longer active.' });

    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const digits = (phone.match(/\d/g) || []).length;
    if (!name || !EMAIL_RE.test(email) || digits < 7) {
      return res.status(400).json({ error: 'Please add your full name, a valid email and a cell number.' });
    }

    // All three have to match. A buyer coming back gets their own record and
    // everything in it; anyone whose details differ is a different person and
    // gets their own, even if they share an email with somebody here.
    const existing = await store.findLeadByIdentity(community.id, { name, email, phone });
    if (existing) {
      await store.addActivity(existing.id, 'Return visit');
      const lead = await store.getLead(existing.id);
      return res.json({ lead, token: issueLeadToken(lead), returning: true });
    }

    const created = await store.createLead(community.id, { name, email, phone });
    await store.addActivity(created.id, 'Scanned QR — entered the app');
    const lead = await store.getLead(created.id);
    res.status(201).json({ lead, token: issueLeadToken(lead), returning: false });
  });

  // ── the buyer's own record ───────────────────────────────────────────────
  router.get('/me', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  });

  /** Toggle a saved home. Returns the new saved list so the client can reconcile. */
  router.post('/me/saves', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const homeId = String(req.body?.homeId ?? '');
    const home = await store.getHome(homeId);
    if (!home || home.communityId !== lead.communityId) return res.status(404).json({ error: 'Home not found' });

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
    const summary = String(req.body?.summary ?? '').trim();
    if (!summary) return res.status(400).json({ error: 'Nothing to save yet' });

    const store = await getStore();
    await store.upsertPlanItem(req.leadId, key, summary);
    await store.addActivity(req.leadId, `${PLAN_LABELS[key] || key} saved: ${summary}`);
    res.json(await store.getLead(req.leadId));
  });

  /**
   * The buyer's move-in plan. Saved whole and on the lead rather than in the
   * browser, so it is still theirs when they come back on a different phone --
   * and so the builder can see what they are actually working towards.
   */
  router.put('/me/movein', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We could not find your plan.' });

    const homes = await store.listHomes(lead.communityId);
    const plan = cleanMoveIn(req.body, new Set(homes.map((h) => h.id)));
    const before = lead.moveIn;
    await store.saveMoveIn(req.leadId, plan);

    // Log the date, not every tick -- a checkbox each way would bury the
    // activity feed the builder actually reads.
    if (plan.targetDate && plan.targetDate !== before?.targetDate) {
      await store.addActivity(req.leadId, `Wants to be moved in by ${plan.targetDate}`);
    }
    res.json(await store.getLead(req.leadId));
  });

  /** Behavioral tracking — price points tested, loan types explored, views. */
  router.post('/me/activity', requireLead, async (req, res) => {
    const text = String(req.body?.text ?? '').trim().slice(0, 300);
    if (!text) return res.status(400).json({ error: 'Nothing to log' });
    const store = await getStore();
    await store.addActivity(req.leadId, text);
    res.status(204).end();
  });

  /** The buyer asks for their own plan. Never sent unprompted. */
  router.post('/me/plan/email', requireLead, async (req, res) => {
    const store = await getStore();
    const lead = await store.getLead(req.leadId);
    if (!lead) return res.status(404).json({ error: 'We could not find your plan.' });
    const community = await store.getCommunity(lead.communityId);
    if (!community) return res.status(404).json({ error: 'That community link is no longer active.' });

    const homes = await store.listHomes(community.id);
    const result = await sendPlanToBuyer({
      community: { ...community, homes }, lead, baseUrl: baseUrlOf(req),
    });
    if (!result.sent) {
      return res.status(503).json({
        error: 'We could not send that right now. You can still download it as a PDF.',
      });
    }
    await store.addActivity(req.leadId, 'Emailed their home plan to themselves');
    res.json({ sent: true, to: lead.email });
  });

  /** Live open slots, so a buyer with the dialog open does not book a stale one. */
  router.get('/c/:communityId/slots', async (req, res) => {
    const store = await getStore();
    res.json(await store.listOpenSlots(req.params.communityId));
  });

  router.post('/me/tour', requireLead, async (req, res) => {
    const store = await getStore();
    const slotId = String(req.body?.slotId ?? '').trim();
    const contact = CONTACT_METHOD_KEYS.includes(req.body?.contact) ? req.body.contact : 'phone';
    if (!slotId) return res.status(400).json({ error: 'Pick a time that works' });

    const slot = await store.getSlot(slotId);
    if (!slot) return res.status(404).json({ error: 'That time is no longer available.' });

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
      requestedAt: new Date().toISOString(),
    };
    const lead = await store.updateLead(req.leadId, { tour });
    await store.addActivity(
      req.leadId,
      `Booked ${describeTour(tour)}`,
    );

    // The request is already saved. Telling the builder is best-effort on top of
    // that — sendEmail never throws, so a mail outage cannot cost them the lead.
    const community = await store.getCommunity(lead.communityId);
    if (community) {
      const homes = await store.listHomes(community.id);
      const result = await notifyCallRequest({
        store, community: { ...community, homes }, lead, baseUrl: baseUrlOf(req),
      });
      if (result.sent) await store.addActivity(req.leadId, 'Builder emailed about the call request');
    }
    res.json(lead);
  });

  // ── photos ───────────────────────────────────────────────────────────────
  router.get('/photos/:id', async (req, res) => {
    const store = await getStore();
    const photo = await store.getPhotoData(req.params.id);
    if (!photo) return res.status(404).end();
    if (photo.url) return res.redirect(photo.url);
    if (!photo.data) return res.status(404).end();
    res.set('Content-Type', photo.content_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(photo.data, 'base64'));
  });

  return router;
}

/**
 * Inbound rate webhook — Zapier parses the lender's rate email and posts here.
 * Guarded by a shared secret so anyone with the community id can't move rates.
 */
export function ratesRouter() {
  const router = Router();

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
