import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { createApp } from '../index.js';

let server;
let base;
let dir;

const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

/** 'YYYY-MM-DD' a few days out, so published slots are never in the past. */
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Publishes availability and hands back the slots a buyer could pick. */
const publishSlots = async (token, communityId, times = ['10:00', '14:00']) => {
  const res = await api(`/api/admin/communities/${communityId}/slots`, {
    method: 'POST', token, body: { dates: [futureDate(2), futureDate(3)], times },
  });
  assert.equal(res.status, 201, 'slots published');
  return res.body.slots;
};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-test-'));
  process.env.SESSION_SECRET = 'test-secret';
  process.env.RATES_WEBHOOK_SECRET = 'hook-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

test('admin endpoints reject anonymous callers', async () => {
  assert.equal((await api('/api/admin/communities')).status, 401);
  assert.equal((await api('/api/admin/communities', { method: 'POST', body: { name: 'X' } })).status, 401);
});

test('bad credentials do not issue a token', async () => {
  const res = await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'wrong' } });
  assert.equal(res.status, 401);
  assert.equal(res.body.token, undefined);
});

test('a buyer walks from the QR link to a plan the admin can see', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST',
    body: { email: 'admin@test.co', password: 'pw123456' },
  });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const created = await api('/api/admin/communities', {
    method: 'POST', token, body: { name: 'Test Ridge', location: 'Provo, Utah' },
  });
  assert.equal(created.status, 201);
  const communityId = created.body.id;

  const home = await api(`/api/admin/communities/${communityId}/homes`, {
    method: 'POST', token, body: { name: 'The Oak', price: 500000, beds: 3, baths: 2, sqft: 2000 },
  });
  assert.equal(home.status, 201);

  // The buyer side needs no auth to read the community.
  const publicView = await api(`/api/c/${communityId}`);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.body.homes.length, 1);

  // The gate validates before creating a lead.
  const bad = await api(`/api/c/${communityId}/leads`, {
    method: 'POST', body: { name: '', email: 'nope', phone: '1' },
  });
  assert.equal(bad.status, 400);

  const entered = await api(`/api/c/${communityId}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'sam@test.co', phone: '(801) 555-0111' },
  });
  assert.equal(entered.status, 201);
  const leadToken = entered.body.token;
  assert.equal(entered.body.lead.activity[0].text, 'Scanned QR — entered the app');

  // Re-entering the same email returns the same lead rather than duplicating it.
  const again = await api(`/api/c/${communityId}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'SAM@test.co', phone: '(801) 555-0111' },
  });
  assert.equal(again.body.returning, true);
  assert.equal(again.body.lead.id, entered.body.lead.id);

  // Saving a home toggles, and logs the save.
  const saved = await api('/api/me/saves', { method: 'POST', token: leadToken, body: { homeId: home.body.id } });
  assert.equal(saved.body.saved, true);
  assert.deepEqual(saved.body.savedHomeIds, [home.body.id]);
  const unsaved = await api('/api/me/saves', { method: 'POST', token: leadToken, body: { homeId: home.body.id } });
  assert.equal(unsaved.body.saved, false);

  await api('/api/me/saves', { method: 'POST', token: leadToken, body: { homeId: home.body.id } });
  const plan = await api('/api/me/plan/payment', {
    method: 'PUT', token: leadToken, body: { summary: 'The Oak · FHA · 5% down' },
  });
  assert.equal(plan.status, 200);
  assert.equal(plan.body.plan.payment, 'The Oak · FHA · 5% down');

  assert.equal((await api('/api/me/plan/bogus', { method: 'PUT', token: leadToken, body: { summary: 'x' } })).status, 400);

  const slots = await publishSlots(token, communityId);
  const tour = await api('/api/me/tour', {
    method: 'POST', token: leadToken, body: { slotId: slots[0].id, contact: 'email' },
  });
  assert.equal(tour.body.tour.time, slots[0].time);
  assert.equal(tour.body.tour.date, slots[0].date);
  assert.equal(tour.body.tour.contact, 'email');

  // The admin sees all of it on the lead.
  const leads = await api(`/api/admin/communities/${communityId}/leads`, { token });
  assert.equal(leads.body.length, 1);
  const lead = await api(`/api/admin/leads/${leads.body[0].id}`, { token });
  assert.equal(lead.body.plan.payment, 'The Oak · FHA · 5% down');
  assert.equal(lead.body.tour.time, slots[0].time, 'the admin sees the booked time');
  assert.equal(lead.body.tour.contact, 'email', 'and how the buyer wants to be reached');
  assert.ok(lead.body.activity.some((entry) => entry.text.includes('Saved The Oak')));
});

test('one buyer cannot read another buyer with a forged token', async () => {
  assert.equal((await api('/api/me', { token: 'not.a.token' })).status, 401);
  assert.equal((await api('/api/me')).status, 401);
});

test('the rates webhook needs the shared secret and sane values', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Rate Test' } });
  const id = community.body.id;

  const unauthorized = await fetch(`${base}/api/communities/${id}/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conv: '6.10' }),
  });
  assert.equal(unauthorized.status, 401);

  const post = (payload) =>
    fetch(`${base}/api/communities/${id}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'hook-secret' },
      body: JSON.stringify(payload),
    });

  assert.equal((await post({ conv: '99' })).status, 400, 'a 99% rate is a parse error, not a rate');
  assert.equal((await post({})).status, 400);

  const ok = await post({ conv: '6.10', fha: '5.95' });
  assert.equal(ok.status, 200);
  const updated = await api(`/api/c/${id}`);
  assert.equal(updated.body.settings.rateConv, '6.10');
  assert.equal(updated.body.settings.rateFha, '5.95');
  assert.ok(updated.body.settings.ratesUpdatedAt);
});

test('disabled tools are reflected in the buyer payload', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Tool Test' } });
  await api(`/api/admin/communities/${community.body.id}`, {
    method: 'PATCH', token, body: { tools: { compare: false } },
  });
  const publicView = await api(`/api/c/${community.body.id}`);
  assert.equal(publicView.body.tools.compare, false);
  assert.equal(publicView.body.tools.payment, true);
});

test('a call request stays pending until an admin marks it handled', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Tour Test' } });
  const cid = community.body.id;

  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Robin Vale', email: 'robin@test.co', phone: '(801) 555-0144' },
  });
  const leadToken = entered.body.token;
  const leadId = entered.body.lead.id;

  // no request yet — nothing pending anywhere
  let list = await api('/api/admin/communities', { token });
  assert.equal(list.body.find((c) => c.id === cid).pendingTours, 0);

  const pendSlots = await publishSlots(token, cid);
  await api('/api/me/tour', { method: 'POST', token: leadToken, body: { slotId: pendSlots[0].id } });

  list = await api('/api/admin/communities', { token });
  assert.equal(
    list.body.find((c) => c.id === cid).pendingTours, 1,
    'the communities list surfaces the pending request',
  );
  const leads = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(leads.body[0].tour.time, pendSlots[0].time);
  assert.equal(leads.body[0].tour.handledAt, undefined);

  // marking it handled clears the count but keeps the request on the record
  const handled = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { tourHandled: true },
  });
  assert.ok(handled.body.tour.handledAt, 'handled stamp is recorded');
  assert.equal(handled.body.tour.time, pendSlots[0].time, 'the original booking is preserved');

  list = await api('/api/admin/communities', { token });
  assert.equal(list.body.find((c) => c.id === cid).pendingTours, 0, 'handled requests stop counting');

  // and it can be reopened
  const reopened = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { tourHandled: false },
  });
  assert.ok(!reopened.body.tour.handledAt);
  list = await api('/api/admin/communities', { token });
  assert.equal(list.body.find((c) => c.id === cid).pendingTours, 1, 'reopening restores the count');
});

test('a second request from the same lead reopens a handled one', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Repeat Test' } });
  const cid = community.body.id;
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Ada Reyes', email: 'ada@test.co', phone: '(801) 555-0155' },
  });

  const repeatSlots = await publishSlots(token, cid);
  await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { slotId: repeatSlots[0].id } });
  await api(`/api/admin/leads/${entered.body.lead.id}`, { method: 'PATCH', token, body: { tourHandled: true } });

  // they ask again — this must count as pending, not stay buried under the old stamp
  await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { slotId: repeatSlots[1].id } });
  const list = await api('/api/admin/communities', { token });
  assert.equal(
    list.body.find((c) => c.id === cid).pendingTours, 1,
    'asking again puts the lead back in the queue',
  );
});

test('area highlights: the admin writes them, the buyer reads them', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Area Test' } });
  const cid = community.body.id;

  // A nameless place is not a place.
  assert.equal(
    (await api(`/api/admin/communities/${cid}/highlights`, { method: 'POST', token, body: { name: ' ' } })).status,
    400,
  );

  const school = await api(`/api/admin/communities/${cid}/highlights`, {
    method: 'POST', token,
    body: {
      category: 'schools', name: 'Oakridge Elementary', detail: '4 min drive',
      description: 'K–6, bus stops at the entrance.',
    },
  });
  assert.equal(school.status, 201);
  assert.equal(school.body.category, 'schools');
  assert.equal(school.body.photo, null);

  // An unknown category falls back rather than being stored as-is.
  const odd = await api(`/api/admin/communities/${cid}/highlights`, {
    method: 'POST', token, body: { category: 'nightlife', name: 'The Creamery' },
  });
  assert.equal(odd.body.category, 'other');

  // A 1×1 GIF — enough to prove the photo round-trips onto the highlight.
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const photo = await api(`/api/admin/highlights/${school.body.id}/photos`, {
    method: 'POST', token, body: { dataUrl: gif },
  });
  assert.equal(photo.status, 201);

  // Uploading again replaces rather than accumulates: one photo per place.
  await api(`/api/admin/highlights/${school.body.id}/photos`, { method: 'POST', token, body: { dataUrl: gif } });

  const buyerView = await api(`/api/c/${cid}`);
  assert.equal(buyerView.status, 200, 'no auth needed — this is behind the QR code');
  assert.equal(buyerView.body.highlights.length, 2);
  const seen = buyerView.body.highlights.find((h) => h.name === 'Oakridge Elementary');
  assert.equal(seen.detail, '4 min drive');
  assert.ok(seen.photo?.url, 'the photo reaches the buyer');
  assert.equal(seen.photo.url, `/api/photos/${seen.photo.id}`, 'served from the database, not the disk');

  // Ordering is stable, so the admin's arrangement is what buyers get.
  assert.deepEqual(
    buyerView.body.highlights.map((h) => h.name),
    ['Oakridge Elementary', 'The Creamery'],
  );

  const edited = await api(`/api/admin/highlights/${school.body.id}`, {
    method: 'PATCH', token, body: { detail: '6 min drive', category: 'other' },
  });
  assert.equal(edited.body.detail, '6 min drive');
  assert.equal(edited.body.category, 'other');
  assert.ok(edited.body.photo, 'editing the text keeps the photo');

  // Deleting takes the photo with it.
  const photoId = seen.photo.id;
  assert.equal((await api(`/api/admin/highlights/${school.body.id}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await api(`/api/photos/${photoId}`)).status, 404, 'the orphaned photo is gone too');
  assert.equal((await api(`/api/c/${cid}`)).body.highlights.length, 1);
});

test('deleting a community takes its highlights with it', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Sweep Test' } });
  const cid = community.body.id;
  const made = await api(`/api/admin/communities/${cid}/highlights`, {
    method: 'POST', token, body: { category: 'parks', name: 'Riverside Park' },
  });

  await api(`/api/admin/communities/${cid}`, { method: 'DELETE', token });
  assert.equal(
    (await api(`/api/admin/highlights/${made.body.id}`, { method: 'PATCH', token, body: { name: 'x' } })).status,
    404,
    'the highlight does not outlive its community',
  );
});

test('lot numbers, floor plans and the site map are gated by their toggles', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Lot Test' } });
  const cid = community.body.id;

  const home = await api(`/api/admin/communities/${cid}/homes`, {
    method: 'POST', token, body: { name: 'The Willow', price: 400000, lotNumber: 'Lot 14' },
  });
  assert.equal(home.status, 201);
  assert.equal(home.body.lotNumber, 'Lot 14');
  assert.deepEqual(home.body.floorPlans, [], 'a new home has no plans');

  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  assert.equal(
    (await api(`/api/admin/homes/${home.body.id}/floorplans`, { method: 'POST', token, body: { dataUrl: gif } })).status,
    201,
  );
  assert.equal(
    (await api(`/api/admin/communities/${cid}/photos/sitemap`, { method: 'POST', token, body: { dataUrl: gif } })).status,
    201,
  );

  // A plan must not leak into the photo carousel — both hang off the same home.
  const withPlan = await api(`/api/admin/communities/${cid}`, { token });
  const adminHome = withPlan.body.homes[0];
  assert.equal(adminHome.floorPlans.length, 1, 'the plan is on the home');
  assert.equal(adminHome.photos.length, 0, 'and not in the gallery');
  assert.ok(withPlan.body.siteMap, 'the admin sees the site map');

  // Defaults are on, so a builder who uploads something sees it without hunting.
  let buyer = await api(`/api/c/${cid}`);
  assert.equal(buyer.body.homes[0].lotNumber, 'Lot 14');
  assert.equal(buyer.body.homes[0].floorPlans.length, 1);
  assert.ok(buyer.body.siteMap);

  // Each toggle is independent, and switching one off removes the data from the
  // payload rather than merely hiding it in the client.
  await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { features: { lotNumbers: false } } });
  buyer = await api(`/api/c/${cid}`);
  assert.equal(buyer.body.homes[0].lotNumber, '', 'lot number withheld');
  assert.equal(buyer.body.homes[0].floorPlans.length, 1, 'plans unaffected');
  assert.ok(buyer.body.siteMap, 'site map unaffected');

  await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { features: { floorPlans: false } } });
  buyer = await api(`/api/c/${cid}`);
  assert.deepEqual(buyer.body.homes[0].floorPlans, [], 'plans withheld');

  await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { features: { siteMap: false } } });
  buyer = await api(`/api/c/${cid}`);
  assert.equal(buyer.body.siteMap, null, 'site map withheld');

  // The admin still has everything — the toggle governs publication, not storage.
  const stillThere = await api(`/api/admin/communities/${cid}`, { token });
  assert.equal(stillThere.body.homes[0].lotNumber, 'Lot 14');
  assert.equal(stillThere.body.homes[0].floorPlans.length, 1);
  assert.ok(stillThere.body.siteMap);

  // Turning one back on republishes it.
  await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { features: { lotNumbers: true } } });
  buyer = await api(`/api/c/${cid}`);
  assert.equal(buyer.body.homes[0].lotNumber, 'Lot 14', 'and comes back when switched on');
});

test('a call request is recorded even when the email provider is down', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Outage Test' } });
  const cid = community.body.id;
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Pat Vale', email: 'pat@test.co', phone: '(801) 555-0190' },
  });

  const outageSlots = await publishSlots(token, cid);
  process.env.RESEND_API_KEY = 'test-key';
  const restore = setTransportForTests(async () => { throw new Error('provider exploded'); });
  try {
    const tour = await api('/api/me/tour', {
      method: 'POST', token: entered.body.token, body: { slotId: outageSlots[0].id },
    });
    // This is the property worth protecting: the buyer's request survives the
    // failure of the thing that merely announces it.
    assert.equal(tour.status, 200, 'the request still succeeds');
    assert.equal(tour.body.tour.time, outageSlots[0].time);
  } finally {
    restore();
    delete process.env.RESEND_API_KEY;
  }

  const list = await api('/api/admin/communities', { token });
  assert.equal(
    list.body.find((c) => c.id === cid).pendingTours, 1,
    'and it is still in the builder queue',
  );
});

test('a call request emails the builder, and says so on the lead', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', {
    method: 'POST', token, body: { name: 'Alert Test' },
  });
  const cid = community.body.id;
  await api(`/api/admin/communities/${cid}`, {
    method: 'PATCH', token, body: { settings: { notifyEmail: 'sales@builder.co' } },
  });
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Rae Lin', email: 'rae@test.co', phone: '(801) 555-0191' },
  });

  const alertSlots = await publishSlots(token, cid);
  const sent = [];
  process.env.RESEND_API_KEY = 'test-key';
  const restore = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  try {
    await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { slotId: alertSlots[0].id } });
  } finally {
    restore();
    delete process.env.RESEND_API_KEY;
  }

  assert.equal(sent.length, 1, 'one alert per request');
  assert.deepEqual(sent[0].to, ['sales@builder.co']);
  assert.match(sent[0].text, /\(801\) 555-0191/);

  const lead = await api(`/api/admin/leads/${entered.body.lead.id}`, { token });
  assert.ok(
    lead.body.activity.some((a) => a.text === 'Builder emailed about the call request'),
    'the activity log records that the builder was told',
  );
});

test('a buyer can email themselves their plan, and only when asked', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Plan Mail' } });
  const cid = community.body.id;
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Sky Osei', email: 'sky@test.co', phone: '(801) 555-0192' },
  });
  const leadToken = entered.body.token;
  await api('/api/me/plan/afford', { method: 'PUT', token: leadToken, body: { summary: 'Looking at $300k' } });

  // Nothing is sent just by building a plan.
  const sent = [];
  process.env.RESEND_API_KEY = 'test-key';
  const restore = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  try {
    assert.equal(sent.length, 0, 'no email until the buyer asks');
    const res = await api('/api/me/plan/email', { method: 'POST', token: leadToken, body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.to, 'sky@test.co');
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ['sky@test.co']);
    assert.match(sent[0].text, /\$300k/);
  } finally {
    restore();
    delete process.env.RESEND_API_KEY;
  }

  // Unconfigured, it fails honestly rather than pretending to have sent.
  const unconfigured = await api('/api/me/plan/email', { method: 'POST', token: leadToken, body: {} });
  assert.equal(unconfigured.status, 503);
  assert.match(unconfigured.body.error, /still download it as a PDF/);

  assert.equal(
    (await api('/api/me/plan/email', { method: 'POST', body: {} })).status, 401,
    'and it needs the buyer token',
  );
});

test('slots: the builder publishes times and only those reach buyers', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Slot Test' } });
  const cid = community.body.id;

  // Nothing published means nothing offered — the buyer app has to cope with this.
  assert.deepEqual((await api(`/api/c/${cid}`)).body.slots, []);

  assert.equal(
    (await api(`/api/admin/communities/${cid}/slots`, { method: 'POST', token, body: { dates: [], times: ['10:00'] } })).status,
    400, 'a date is required',
  );
  assert.equal(
    (await api(`/api/admin/communities/${cid}/slots`, { method: 'POST', token, body: { dates: [futureDate(1)], times: [] } })).status,
    400, 'a time is required',
  );
  // Junk is filtered rather than stored.
  assert.equal(
    (await api(`/api/admin/communities/${cid}/slots`, {
      method: 'POST', token, body: { dates: ['not-a-date'], times: ['25:99'] },
    })).status,
    400,
  );

  const made = await api(`/api/admin/communities/${cid}/slots`, {
    method: 'POST', token, body: { dates: [futureDate(2), futureDate(3)], times: ['10:00', '14:00'] },
  });
  assert.equal(made.status, 201);
  assert.equal(made.body.created, 4, 'two days times two times');

  // Re-publishing the same availability adds nothing rather than duplicating.
  const again = await api(`/api/admin/communities/${cid}/slots`, {
    method: 'POST', token, body: { dates: [futureDate(2)], times: ['10:00'] },
  });
  assert.equal(again.body.created, 0, 'already-published times are left alone');
  assert.equal(again.body.slots.length, 4);

  // A past date is stored but never offered.
  await api(`/api/admin/communities/${cid}/slots`, {
    method: 'POST', token, body: { dates: [futureDate(-5)], times: ['10:00'] },
  });
  const open = (await api(`/api/c/${cid}`)).body.slots;
  assert.equal(open.length, 4, 'yesterday is not on the menu');
  assert.ok(open.every((s) => s.date >= futureDate(0)));
  assert.ok(open.every((s) => s.leadId === undefined || s.leadId === null));
});

test('slots: two buyers cannot take the same time', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Clash Test' } });
  const cid = community.body.id;
  const slots = await publishSlots(token, cid, ['09:00']);

  const first = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'First Buyer', email: 'first@test.co', phone: '(801) 555-0001' },
  });
  const second = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Second Buyer', email: 'second@test.co', phone: '(801) 555-0002' },
  });

  const booked = await api('/api/me/tour', {
    method: 'POST', token: first.body.token, body: { slotId: slots[0].id, contact: 'phone' },
  });
  assert.equal(booked.status, 200);

  // The losing buyer is told plainly, not handed a silent overwrite.
  const clash = await api('/api/me/tour', {
    method: 'POST', token: second.body.token, body: { slotId: slots[0].id, contact: 'phone' },
  });
  assert.equal(clash.status, 409);
  assert.match(clash.body.error, /just took that time/);

  // And the slot disappears from what is on offer.
  const open = (await api(`/api/c/${cid}`)).body.slots;
  assert.ok(!open.some((s) => s.id === slots[0].id), 'a booked time is no longer offered');

  // The second buyer can still take a different one.
  const other = await api('/api/me/tour', {
    method: 'POST', token: second.body.token, body: { slotId: slots[1].id, contact: 'email' },
  });
  assert.equal(other.status, 200);
  assert.equal(other.body.tour.contact, 'email');
});

test('slots: rescheduling frees the old time and never leaves a buyer with none', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Move Test' } });
  const cid = community.body.id;
  const slots = await publishSlots(token, cid, ['09:00', '11:00']);
  const buyer = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Mover', email: 'mover@test.co', phone: '(801) 555-0003' },
  });

  await api('/api/me/tour', { method: 'POST', token: buyer.body.token, body: { slotId: slots[0].id } });
  const moved = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token, body: { slotId: slots[1].id },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.tour.slotId, slots[1].id);

  const open = (await api(`/api/c/${cid}`)).body.slots;
  assert.ok(open.some((s) => s.id === slots[0].id), 'the time they left is offered again');
  assert.ok(!open.some((s) => s.id === slots[1].id), 'and the new one is taken');

  // Confirming the same time twice must not 409 them off their own booking.
  const same = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token, body: { slotId: slots[1].id, contact: 'email' },
  });
  assert.equal(same.status, 200, 'reconfirming your own slot is not a clash');
  assert.equal(same.body.tour.contact, 'email', 'and it can change how they are contacted');

  // A slot that never existed is a clear 404, not a crash.
  assert.equal(
    (await api('/api/me/tour', { method: 'POST', token: buyer.body.token, body: { slotId: 's_nope' } })).status,
    404,
  );
});

test('slots: removing a published time takes it off the menu', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Remove Test' } });
  const cid = community.body.id;
  const slots = await publishSlots(token, cid, ['09:00']);

  assert.equal((await api(`/api/admin/slots/${slots[0].id}`, { method: 'DELETE', token })).status, 204);
  const open = (await api(`/api/c/${cid}`)).body.slots;
  assert.ok(!open.some((s) => s.id === slots[0].id));

  // And a buyer holding a stale list gets a clear answer rather than a 500.
  const buyer = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Late', email: 'late@test.co', phone: '(801) 555-0004' },
  });
  const gone = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token, body: { slotId: slots[0].id },
  });
  assert.equal(gone.status, 404);
  assert.match(gone.body.error, /no longer available/);
});

test('slots: deleting a community takes its slots with it', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Sweep Slots' } });
  const cid = community.body.id;
  await publishSlots(token, cid, ['09:00']);
  await api(`/api/admin/communities/${cid}`, { method: 'DELETE', token });
  assert.deepEqual(await (await api(`/api/admin/communities/${cid}/slots`, { token })).body, []);
});

test('a lead is unread until an admin opens it, and never goes back', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Unread Test' } });
  const cid = community.body.id;
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Unseen Person', email: 'unseen@test.co', phone: '(801) 555-0210' },
  });
  const leadId = entered.body.lead.id;

  // Appearing in the list is not the same as being read.
  let listed = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(listed.body[0].openedAt, null, 'still unread after merely listing it');

  const opened = await api(`/api/admin/leads/${leadId}`, { token });
  assert.ok(opened.body.openedAt, 'opening the lead marks it read');

  listed = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.ok(listed.body[0].openedAt, 'and the list agrees');

  // Re-opening must not move the stamp — otherwise "unread" would mean
  // "not open right now", which is useless.
  const firstStamp = opened.body.openedAt;
  const reopened = await api(`/api/admin/leads/${leadId}`, { token });
  assert.equal(reopened.body.openedAt, firstStamp, 'the stamp is set once and left alone');

  // Buyer activity does not make it unread again either.
  await api('/api/me/plan/afford', {
    method: 'PUT', token: entered.body.token, body: { summary: 'Looking at $300k' },
  });
  const after = await api(`/api/admin/leads/${leadId}`, { token });
  assert.equal(after.body.openedAt, firstStamp);
});

test('marking contacted sticks, and the list reflects it', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Status Test' } });
  const cid = community.body.id;
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Status Person', email: 'status@test.co', phone: '(801) 555-0211' },
  });
  const leadId = entered.body.lead.id;

  const marked = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { status: 'contacted' },
  });
  assert.equal(marked.body.status, 'contacted');

  // This is the assertion that matters: a fresh read of the LIST, not the lead.
  // The reported bug was the list still showing the old value.
  const listed = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(listed.body[0].status, 'contacted', 'the list carries the change');

  const back = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { status: 'new' },
  });
  assert.equal(back.body.status, 'new', 'and it can be undone');
  assert.equal(
    (await api(`/api/admin/communities/${cid}/leads`, { token })).body[0].status, 'new',
  );
});

test('archiving files a lead away without deleting it, and retires its call request', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Archive Test' } });
  const cid = community.body.id;
  const slots = await publishSlots(token, cid, ['09:00']);
  const entered = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Gone Quiet', email: 'quiet@test.co', phone: '(801) 555-0212' },
  });
  const leadId = entered.body.lead.id;
  await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { slotId: slots[0].id } });

  let list = await api('/api/admin/communities', { token });
  assert.equal(list.body.find((c) => c.id === cid).pendingTours, 1, 'they are waiting for a call');

  const archived = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { archived: true },
  });
  assert.ok(archived.body.archivedAt, 'archived');

  // Someone you are done with must stop nagging you from the call queue, even
  // though their request was never explicitly marked handled.
  list = await api('/api/admin/communities', { token });
  assert.equal(list.body.find((c) => c.id === cid).pendingTours, 0, 'and stop counting as waiting');
  assert.ok(archived.body.tour, 'the request itself is still on the record');

  // Nothing is deleted — the lead is still there, still readable.
  const leads = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(leads.body.length, 1, 'the lead still exists');
  assert.ok(leads.body[0].archivedAt);
  assert.equal(leads.body[0].name, 'Gone Quiet');

  const restored = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { archived: false },
  });
  assert.equal(restored.body.archivedAt, null, 'and they come back');
  list = await api('/api/admin/communities', { token });
  assert.equal(
    list.body.find((c) => c.id === cid).pendingTours, 1,
    'with their unanswered request intact',
  );
});

test('the gate signs a returning buyer back in, and only when everything matches', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const community = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Identity Test' } });
  const cid = community.body.id;

  const first = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'sam@test.co', phone: '(801) 555-0111' },
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.returning, false);
  const samId = first.body.lead.id;

  // Give them something to lose, so "signed back in" can be proved rather than assumed.
  await api('/api/me/plan/afford', {
    method: 'PUT', token: first.body.token, body: { summary: 'Looking at $420k' },
  });

  const again = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'sam@test.co', phone: '(801) 555-0111' },
  });
  assert.equal(again.body.returning, true);
  assert.equal(again.body.lead.id, samId);
  assert.equal(again.body.lead.plan.afford, 'Looking at $420k', 'their plan comes back with them');

  // Same information, typed differently. This is the case that decides whether
  // the feature works: a buyer who omits the brackets must not get a duplicate.
  for (const [label, body] of [
    ['casing and spacing', { name: 'sam  rivera', email: 'SAM@Test.co', phone: '(801) 555-0111' }],
    ['bare digits', { name: 'Sam Rivera', email: 'sam@test.co', phone: '8015550111' }],
    ['dashes', { name: 'Sam Rivera', email: 'sam@test.co', phone: '801-555-0111' }],
    ['surrounding space', { name: '  Sam Rivera  ', email: '  sam@test.co  ', phone: ' (801) 555-0111 ' }],
  ]) {
    const res = await api(`/api/c/${cid}/leads`, { method: 'POST', body });
    assert.equal(res.body.returning, true, `${label} should be the same buyer`);
    assert.equal(res.body.lead.id, samId, `${label} should not create a duplicate`);
  }

  // Any detail genuinely different is somebody else — including someone who
  // shares the email, which is why email alone can no longer decide identity.
  const partner = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Jo Rivera', email: 'sam@test.co', phone: '(801) 555-0222' },
  });
  assert.equal(partner.status, 201);
  assert.equal(partner.body.returning, false, 'a different person on a shared email is a new lead');
  assert.notEqual(partner.body.lead.id, samId);

  const sameNameNewPhone = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'sam@test.co', phone: '(801) 555-0333' },
  });
  assert.equal(sameNameNewPhone.body.returning, false, 'a different phone is a new lead');

  const sameNewEmail = await api(`/api/c/${cid}/leads`, {
    method: 'POST', body: { name: 'Sam Rivera', email: 'sam2@test.co', phone: '(801) 555-0111' },
  });
  assert.equal(sameNewEmail.body.returning, false, 'a different email is a new lead');

  const leads = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(leads.body.length, 4, 'one returning buyer, three distinct people');
  assert.equal(
    leads.body.filter((l) => l.email.toLowerCase() === 'sam@test.co').length, 3,
    'three leads share the one email, which is now allowed',
  );

  // Coming back does not overwrite the plan of whoever matched.
  const reread = await api(`/api/admin/leads/${samId}`, { token });
  assert.equal(reread.body.plan.afford, 'Looking at $420k');
  assert.ok(
    reread.body.activity.some((a) => a.text === 'Return visit'),
    'return visits are logged on the original record',
  );
});

test('a buyer in another community is a separate lead', async () => {
  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });
  const token = login.body.token;
  const a = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Community A' } });
  const b = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Community B' } });
  const details = { name: 'Kit Shaw', email: 'kit@test.co', phone: '(801) 555-0444' };

  const inA = await api(`/api/c/${a.body.id}/leads`, { method: 'POST', body: details });
  const inB = await api(`/api/c/${b.body.id}/leads`, { method: 'POST', body: details });
  assert.equal(inB.body.returning, false, 'identity is scoped to the community');
  assert.notEqual(inB.body.lead.id, inA.body.lead.id);
});
