import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
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

  const tour = await api('/api/me/tour', { method: 'POST', token: leadToken, body: { time: 'This weekend' } });
  assert.equal(tour.body.tour.time, 'This weekend');

  // The admin sees all of it on the lead.
  const leads = await api(`/api/admin/communities/${communityId}/leads`, { token });
  assert.equal(leads.body.length, 1);
  const lead = await api(`/api/admin/leads/${leads.body[0].id}`, { token });
  assert.equal(lead.body.plan.payment, 'The Oak · FHA · 5% down');
  assert.equal(lead.body.tour.time, 'This weekend');
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

  await api('/api/me/tour', { method: 'POST', token: leadToken, body: { time: 'This weekend' } });

  list = await api('/api/admin/communities', { token });
  assert.equal(
    list.body.find((c) => c.id === cid).pendingTours, 1,
    'the communities list surfaces the pending request',
  );
  const leads = await api(`/api/admin/communities/${cid}/leads`, { token });
  assert.equal(leads.body[0].tour.time, 'This weekend');
  assert.equal(leads.body[0].tour.handledAt, undefined);

  // marking it handled clears the count but keeps the request on the record
  const handled = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', token, body: { tourHandled: true },
  });
  assert.ok(handled.body.tour.handledAt, 'handled stamp is recorded');
  assert.equal(handled.body.tour.time, 'This weekend', 'the original request is preserved');

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

  await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { time: 'This weekend' } });
  await api(`/api/admin/leads/${entered.body.lead.id}`, { method: 'PATCH', token, body: { tourHandled: true } });

  // they ask again — this must count as pending, not stay buried under the old stamp
  await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { time: 'A phone call first' } });
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
