import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { consentText } from '../../shared/domain.js';
import { createApp } from '../index.js';

let server;
let base;
let dir;
let adminToken;
let communityId;
let sent;
let restoreMail = () => {};

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

const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Publishes one time of day on two dates and hands back just those slots, so tests never share one. */
const slotsFor = async (times) => (await api(`/api/admin/communities/${communityId}/slots`, {
  method: 'POST', token: adminToken, body: { dates: [futureDate(2), futureDate(3)], times },
})).body.slots.filter((slot) => times.includes(slot.time));

const enter = (body) => api(`/api/c/${communityId}/leads`, { method: 'POST', body });
const consentsOf = async (leadId) => (await api(`/api/admin/leads/${leadId}/consents`, { token: adminToken })).body;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-phone-'));
  process.env.SESSION_SECRET = 'test-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } })).body.token;
  communityId = (await api('/api/admin/communities', {
    method: 'POST', token: adminToken, body: { name: 'Phone Test', builder: 'Acme Homes' },
  })).body.id;
  sent = [];
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  process.env.RESEND_API_KEY = 'test-key';
});

after(async () => {
  restoreMail();
  delete process.env.RESEND_API_KEY;
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

test('sign-in: a name and an email are enough, and no consent is recorded for a number nobody gave', async () => {
  const res = await enter({ name: 'No Phone', email: 'nophone@test.co' });
  assert.equal(res.status, 201);
  assert.equal(res.body.lead.phone, '');
  assert.deepEqual(await consentsOf(res.body.lead.id), [], 'nothing to agree to without a number');
});

test('sign-in: ticking the box with no number does not record a yes', async () => {
  const res = await enter({ name: 'Box Only', email: 'boxonly@test.co', phone: '', consent: true });
  assert.equal(res.status, 201);
  assert.deepEqual(await consentsOf(res.body.lead.id), []);
});

test('sign-in: a number that is given still has to look like one', async () => {
  const res = await enter({ name: 'Too Short', email: 'short@test.co', phone: '555' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /too short/);
  assert.equal((await enter({ name: '', email: 'x@test.co' })).status, 400);
  assert.equal((await enter({ name: 'Bad Email', email: 'nope' })).status, 400);
});

test('sign-in: a buyer with no number gets the same record back, and one with a number is not mistaken for them', async () => {
  const first = await enter({ name: 'Back Again', email: 'again@test.co' });
  const again = await enter({ name: 'Back Again', email: 'again@test.co' });
  assert.equal(again.status, 200);
  assert.equal(again.body.returning, true);
  assert.equal(again.body.lead.id, first.body.lead.id);

  // Same name and email with a number is somebody else until the whole identity matches.
  const withNumber = await enter({ name: 'Back Again', email: 'again@test.co', phone: '(801) 555-0170', consent: true });
  assert.equal(withNumber.status, 201);
  assert.notEqual(withNumber.body.lead.id, first.body.lead.id);

  // And the other way round: a record that has a number is not opened by leaving it blank.
  const blank = await enter({ name: 'Back Again', email: 'again@test.co' });
  assert.equal(blank.body.lead.id, first.body.lead.id);
  assert.notEqual(blank.body.lead.id, withNumber.body.lead.id);
});

test('booking: someone with no number is asked for one, and nothing is booked without it', async () => {
  const buyer = await enter({ name: 'Needs Number', email: 'needs@test.co' });
  const slots = await slotsFor(['09:00']);
  const refused = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token, body: { slotId: slots[0].id, contact: 'phone' },
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /cell number/);

  const tooShort = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token, body: { slotId: slots[0].id, contact: 'phone', phone: '12' },
  });
  assert.equal(tooShort.status, 400);

  // The time was not taken by either attempt.
  const open = (await api(`/api/c/${communityId}`)).body.slots;
  assert.ok(open.some((slot) => slot.id === slots[0].id), 'the time is still on offer');
  const me = await api('/api/me', { token: buyer.body.token });
  assert.equal(me.body.tour, null);
});

test('booking: the number is saved on the lead with the answer, in the words the server shows', async () => {
  const buyer = await enter({ name: 'Gives Number', email: 'gives@test.co' });
  const slots = await slotsFor(['10:00']);
  const booked = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token,
    body: { slotId: slots[0].id, contact: 'phone', phone: '(801) 555-0188', consent: true, text: 'whatever the client says' },
  });
  assert.equal(booked.status, 200);
  assert.equal(booked.body.phone, '(801) 555-0188');
  assert.equal(booked.body.tour.slotId, slots[0].id);

  const records = await consentsOf(buyer.body.lead.id);
  assert.equal(records.length, 1);
  assert.equal(records[0].granted, true);
  assert.equal(records[0].text, consentText('Acme Homes'));

  const lead = (await api(`/api/admin/leads/${buyer.body.lead.id}`, { token: adminToken })).body;
  assert.equal(lead.phone, '(801) 555-0188');
  assert.ok(lead.activity.some((entry) => entry.text === 'Gave a cell number and agreed to calls and texts'));

  const alert = sent.find((mail) => /555-0188/.test(`${mail.text ?? ''}${mail.html ?? ''}`));
  assert.ok(alert, 'the builder is emailed the number they can now call');
});

test('booking: giving a number and leaving the box unticked is recorded as a no', async () => {
  const buyer = await enter({ name: 'Number No Texts', email: 'notexts@test.co' });
  const slots = await slotsFor(['11:00']);
  const booked = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token,
    body: { slotId: slots[0].id, contact: 'email', phone: '8015550123' },
  });
  assert.equal(booked.status, 200);
  const records = await consentsOf(buyer.body.lead.id);
  assert.equal(records.length, 1);
  assert.equal(records[0].granted, false);
});

test('booking: a number sent for someone who already has one is ignored', async () => {
  const buyer = await enter({ name: 'Has Number', email: 'has@test.co', phone: '(801) 555-0199', consent: true });
  const slots = await slotsFor(['13:00']);
  const booked = await api('/api/me/tour', {
    method: 'POST', token: buyer.body.token,
    body: { slotId: slots[0].id, contact: 'phone', phone: '(999) 999-9999', consent: false },
  });
  assert.equal(booked.status, 200);
  assert.equal(booked.body.phone, '(801) 555-0199', 'a request cannot swap the number on file');
  const records = await consentsOf(buyer.body.lead.id);
  assert.equal(records.length, 1, 'and cannot rewrite what they agreed to');
  assert.equal(records[0].granted, true);
});

test('the lead list and the plan email cope with a lead who has no number', async () => {
  const buyer = await enter({ name: 'Email Only', email: 'emailonly@test.co' });
  const leads = await api(`/api/admin/communities/${communityId}/leads`, { token: adminToken });
  const mine = leads.body.find((lead) => lead.id === buyer.body.lead.id);
  assert.equal(mine.phone, '');
  const detail = await api(`/api/admin/leads/${buyer.body.lead.id}`, { token: adminToken });
  assert.equal(detail.status, 200);
});
