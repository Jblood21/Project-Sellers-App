import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { cleanExtraEmails } from '../../shared/domain.js';
import { createApp } from '../index.js';

let server;
let base;
let dir;
let adminToken;
let communityId;
let sent;
let restoreMail = () => {};
let counter = 0;

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

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-extra-'));
  process.env.SESSION_SECRET = 'test-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } })).body.token;
  communityId = (await api('/api/admin/communities', { method: 'POST', token: adminToken, body: { name: 'Extra Email Test' } })).body.id;
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

/** A buyer with a number, so booking never stops to ask for one. */
const buyer = async () => {
  counter += 1;
  sent.length = 0;
  const res = await api(`/api/c/${communityId}/leads`, {
    method: 'POST', body: { name: 'Pat Vale', email: `pat${counter}@test.co`, phone: '(801) 555-0101' },
  });
  return { token: res.body.token, lead: res.body.lead };
};
const planMails = () => sent.filter((mail) => /home plan/i.test(mail.subject));

test('an extra email: lower-cased, one at most, never your own, and blank clears it', () => {
  assert.deepEqual(cleanExtraEmails('Sam@Test.CO', 'pat@test.co'), { emails: ['sam@test.co'] });
  assert.deepEqual(cleanExtraEmails('', 'pat@test.co'), { emails: [] });
  assert.deepEqual(cleanExtraEmails(undefined, 'pat@test.co'), { emails: [] });
  assert.deepEqual(cleanExtraEmails('PAT@test.co', 'pat@test.co'), { emails: [] }, 'your own address is dropped, not refused');
  assert.deepEqual(cleanExtraEmails(['a@b.co', 'A@B.CO'], 'x@y.co'), { emails: ['a@b.co'] }, 'repeats are dropped');
  for (const bad of ['no-at', 'a@b.co, c@d.co', 'a@b.co;c@d.co', 'a b@c.co', 'a@b.co?bcc=x@y.z', 'a@b', 'a@b.co\r\nBcc: x@y.z', 5, {}]) {
    assert.ok(cleanExtraEmails(bad, 'x@y.co').error, `${JSON.stringify(bad)} is refused`);
  }
  assert.ok(cleanExtraEmails(['a@b.co', 'c@d.co'], 'x@y.co').error, 'one more, not two');
  assert.ok(cleanExtraEmails(`${'x'.repeat(250)}@b.co`, 'x@y.co').error, 'and not a very long one');
});

test('the plan goes to the extra email too, said as theirs, and the buyer sees it was kept', async () => {
  const { token } = await buyer();
  const res = await api('/api/me/plan/email', { method: 'POST', token, body: { also: 'Spouse@Test.co' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.also, [{ to: 'spouse@test.co', sent: true }]);
  assert.deepEqual(res.body.lead.extraEmails, ['spouse@test.co'], 'the buyer’s own record carries it');

  const mails = planMails();
  assert.equal(mails.length, 2);
  const own = mails.find((mail) => /^Your home plan/.test(mail.subject));
  const shared = mails.find((mail) => /Pat Vale’s home plan/.test(mail.subject));
  assert.ok(own && shared);
  assert.deepEqual(own.to, [res.body.to]);
  assert.deepEqual(shared.to, ['spouse@test.co']);
  assert.match(shared.text, /^Hi,\n\nPat Vale shared the home plan/);
  assert.equal(shared.reply_to, res.body.to, 'a reply goes to the buyer who shared it');
  assert.match(shared.text, /Equal Housing Lender|NMLS/i, 'it carries the same lender identity and disclosures');
});

test('next time it is sent without typing the address again; blank removes it', async () => {
  const { token } = await buyer();
  await api('/api/me/plan/email', { method: 'POST', token, body: { also: 'spouse@test.co' } });
  sent.length = 0;
  const again = await api('/api/me/plan/email', { method: 'POST', token, body: {} });
  assert.equal(again.status, 200);
  assert.equal(planMails().length, 2, 'the saved address is used');

  sent.length = 0;
  const cleared = await api('/api/me/plan/email', { method: 'POST', token, body: { also: '' } });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.lead.extraEmails, []);
  assert.equal(planMails().length, 1, 'only the buyer’s own address now');
});

test('a bad extra address is refused with nothing sent and nothing saved', async () => {
  const { token } = await buyer();
  const bad = await api('/api/me/plan/email', { method: 'POST', token, body: { also: 'not an email' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'also');
  assert.equal(planMails().length, 0);
  assert.deepEqual((await api('/api/me', { token })).body.extraEmails, []);
  const twice = await api('/api/me/plan/email', { method: 'POST', token, body: { also: 'a@b.co, c@d.co' } });
  assert.equal(twice.status, 400, 'two addresses in one box');
});

test('when the first send fails, nothing goes to the second address either', async () => {
  const { token } = await buyer();
  const ok = restoreMail;
  restoreMail = setTransportForTests(async () => { throw new Error('down'); });
  const down = await api('/api/me/plan/email', { method: 'POST', token, body: { also: 'spouse@test.co' } });
  assert.equal(down.status, 503);
  restoreMail();
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  void ok;
  assert.equal(planMails().length, 0);
});

test('booking can carry the extra email: saved, shown to the team, and a bad one takes no time', async () => {
  const { token, lead } = await buyer();
  const slots = (await api(`/api/admin/communities/${communityId}/slots`, {
    method: 'POST', token: adminToken, body: { dates: [futureDate(2)], times: ['09:00', '10:00'] },
  })).body.slots;

  const refused = await api('/api/me/tour', { method: 'POST', token, body: { slotId: slots[0].id, contact: 'email', extraEmail: 'nope' } });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.field, 'extraEmail');
  assert.ok((await api(`/api/c/${communityId}/slots`)).body.some((slot) => slot.id === slots[0].id), 'the time is still free');

  const booked = await api('/api/me/tour', { method: 'POST', token, body: { slotId: slots[0].id, contact: 'email', extraEmail: 'partner@test.co' } });
  assert.equal(booked.status, 200);
  assert.deepEqual(booked.body.extraEmails, ['partner@test.co']);
  const alert = sent.find((mail) => /booked/i.test(mail.subject));
  assert.match(alert.text, /Also email: partner@test\.co/);

  const detail = (await api(`/api/admin/leads/${lead.id}`, { token: adminToken })).body;
  assert.deepEqual(detail.extraEmails, ['partner@test.co'], 'the builder sees it on the lead');
  assert.ok(detail.activity.some((entry) => entry.text === 'Added a second email'));

  // A booking that does not mention it leaves it alone.
  const second = await api('/api/me/tour', { method: 'POST', token, body: { slotId: slots[1].id, contact: 'phone' } });
  assert.deepEqual(second.body.extraEmails, ['partner@test.co']);
});
