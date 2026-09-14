import { Router } from 'express';

import { PLAN_LABELS, TOOL_KEYS } from '../../shared/domain.js';
import { getStore } from '../db/index.js';
import { issueLeadToken, requireLead } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLAN_KEYS = new Set([...TOOL_KEYS, 'homes']);

const publicCommunity = (community, homes, heroPhoto, iconPhoto) => ({
  id: community.id,
  name: community.name,
  location: community.location,
  status: community.status,
  theme: community.theme,
  builder: community.builder,
  websiteUrl: community.websiteUrl,
  settings: community.settings,
  tools: community.tools,
  heroPhoto: heroPhoto?.url ?? null,
  iconPhoto: iconPhoto?.url ?? null,
  homes,
});

export function publicRouter() {
  const router = Router();

  /** Everything the buyer app needs to render a community. */
  router.get('/c/:communityId', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'That community link is no longer active.' });
    const [homes, heroes, icons] = await Promise.all([
      store.listHomes(community.id),
      store.listCommunityPhotos(community.id, 'hero'),
      store.listCommunityPhotos(community.id, 'icon'),
    ]);
    res.json(publicCommunity(community, homes, heroes[0], icons[0]));
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

    const existing = await store.findLeadByEmail(community.id, email);
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

  /** Behavioral tracking — price points tested, loan types explored, views. */
  router.post('/me/activity', requireLead, async (req, res) => {
    const text = String(req.body?.text ?? '').trim().slice(0, 300);
    if (!text) return res.status(400).json({ error: 'Nothing to log' });
    const store = await getStore();
    await store.addActivity(req.leadId, text);
    res.status(204).end();
  });

  router.post('/me/tour', requireLead, async (req, res) => {
    const time = String(req.body?.time ?? '').trim();
    if (!time) return res.status(400).json({ error: 'Pick a time that works' });
    const store = await getStore();
    const lead = await store.updateLead(req.leadId, { tour: { time, requestedAt: new Date().toISOString() } });
    await store.addActivity(req.leadId, `Requested to talk: ${time}`);
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
