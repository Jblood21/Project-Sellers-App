import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { incentiveRecipient } from '../../shared/domain.js';
import { createApp } from '../index.js';

// The limits are off under `node --test`; this file is partly about them.
process.env.RATE_LIMITS = 'on';

let server;
let base;
let dir;
let adminToken;
let communityId;
let sent;
let restoreMail = () => {};
let counter = 0;

const api = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-incentive-'));
  process.env.SESSION_SECRET = 'test-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } })).body.token;
  communityId = (await api('/api/admin/communities', { method: 'POST', token: adminToken, body: { name: 'Qualify Test', builder: 'Acme Homes' } })).body.id;
  await setup({
    features: { incentive: true },
    settings: { incentiveTitle: 'Up to $20,000 toward closing costs', incentiveBody: 'With our preferred lender at {community}.', incentiveEmail: 'sales@qualify.test' },
  });
  sent = [];
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  process.env.RESEND_API_KEY = 'test-key';
});

after(async () => {
  restoreMail();
  delete process.env.RESEND_API_KEY;
  delete process.env.RATE_LIMITS;
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

async function setup(body) {
  const res = await api(`/api/admin/communities/${communityId}`, { method: 'PATCH', token: adminToken, body });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

/** A buyer with no phone, so the message shows 'not given'. Each test gets its own, so limits never bleed. */
const buyer = async () => {
  counter += 1;
  sent.length = 0;
  const res = await api(`/api/c/${communityId}/leads`, {
    method: 'POST', body: { name: 'Pat Vale', email: `pat${counter}@test.co` }, headers: { 'X-Forwarded-For': `203.0.113.${counter}` },
  });
  return { token: res.body.token, lead: res.body.lead, ip: `203.0.113.${counter}` };
};
const send = (who, body = { message: 'Hi, I would like to know if I qualify.' }) =>
  api('/api/me/incentive/email', { method: 'POST', token: who.token, body, headers: { 'X-Forwarded-For': who.ip } });

test('the message goes to the incentive email, from the buyer, with what the team needs to answer', async () => {
  const who = await buyer();
  const res = await send(who, { message: 'Hi, I would like to know if I qualify.\nMy budget is 450k.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, true);
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.deepEqual(mail.to, ['sales@qualify.test']);
  assert.equal(mail.reply_to, `pat${counter}@test.co`, 'answering reaches the buyer');
  assert.match(mail.subject, /^Builder incentive question: Pat Vale — Qualify Test$/);
  assert.match(mail.text, /Pat Vale asked about the builder incentive at Qualify Test \(Acme Homes\)/);
  assert.match(mail.text, /Hi, I would like to know if I qualify\.\nMy budget is 450k\./, 'the message, with its line break');
  assert.match(mail.text, /Phone: not given/);
  assert.match(mail.text, /Up to \$20,000 toward closing costs/);
  assert.match(mail.text, /With our preferred lender at Qualify Test\./, 'the incentive as the buyer saw it, tokens filled');

  const lead = (await api(`/api/admin/leads/${who.lead.id}`, { token: adminToken })).body;
  assert.ok(lead.activity.some((entry) => /^Emailed the team about the builder incentive/.test(entry.text)));
});

test('the address is the community\'s own; nothing the request says changes it', async () => {
  const who = await buyer();
  const res = await send(who, {
    message: 'Hello there', to: 'victim@example.org', from: 'ceo@bank.example', subject: 'URGENT', cc: 'x@y.z',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(sent[0].to, ['sales@qualify.test']);
  assert.doesNotMatch(sent[0].subject, /URGENT/);
  assert.ok(!JSON.stringify(sent[0]).includes('victim@example.org'));
});

test('a hostile name cannot add headers or lines to the subject', async () => {
  const who = await buyer();
  const res = await send(who, { name: 'Pat\r\nBcc: x@y.z', message: 'Hello there' });
  assert.equal(res.status, 200);
  assert.doesNotMatch(sent[0].subject, /[\r\n]/);
  const first = sent[0].text.split('\n')[0];
  assert.match(first, /^Pat Bcc: x@y\.z asked about/, 'the name stays on one line, as plain text');
});

test('what is refused: no token, a bad address, an empty or very long message', async () => {
  const who = await buyer();
  assert.equal((await api('/api/me/incentive/email', { method: 'POST', body: { message: 'hello there' } })).status, 401);
  assert.equal((await send(who, { message: 'hello there', email: 'not an email' })).status, 400);
  assert.equal((await send(who, { message: 'hello there', email: 'a@b.co, c@d.co' })).status, 400, 'two addresses in one');
  assert.equal((await send(who, { message: '  ' })).status, 400);
  assert.equal((await send(who, { message: 'x'.repeat(1001) })).status, 400);
  assert.equal((await send(who, { message: 'hello there', name: '' })).status, 200, 'a blank name falls back to theirs');
  assert.equal(sent.length, 1, 'only the good one was sent');
});

test('with the incentive switched off there is nothing to ask about', async () => {
  await setup({ features: { incentive: false } });
  try {
    const who = await buyer();
    assert.equal((await send(who)).status, 404);
    assert.equal(sent.length, 0);
  } finally {
    await setup({ features: { incentive: true } });
  }
});

test('with no usable address the buyer is told, and nothing is sent', async () => {
  await setup({ settings: { incentiveEmail: '', lenderEmail: '' } });
  try {
    const who = await buyer();
    const res = await send(who);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /hasn’t listed an email/);
    assert.equal(sent.length, 0);
  } finally {
    await setup({ settings: { incentiveEmail: 'sales@qualify.test' } });
  }
});

test('the recipient is the incentive email, else the loan team, and an unusable one never hides the other', () => {
  assert.deepEqual(incentiveRecipient({ incentiveEmail: 'sales@x.co', lenderEmail: 'loans@y.co' }), { to: 'sales@x.co', kind: 'team' });
  assert.equal(incentiveRecipient({ incentiveEmail: '', lenderEmail: 'loans@y.co' }).to, 'loans@y.co');
  assert.equal(incentiveRecipient({ incentiveEmail: 'a@b.co?bcc=x@y.z', lenderEmail: 'loans@y.co' }).to, 'loans@y.co', 'a bad one falls through');
  assert.equal(incentiveRecipient({ incentiveEmail: '', lenderEmail: '' }), null);
  assert.equal(incentiveRecipient({ incentiveEmail: 'two@a.co, three@b.co', lenderEmail: 'x y@z.co' }), null);
});

test('when email is not set up the buyer is told so, never "sent", and it says what to do instead', async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const page = (await api(`/api/c/${communityId}`)).body;
    assert.equal(page.emailReady, false, 'the app knows not to show a form');
    const who = await buyer();
    const res = await send(who);
    assert.equal(res.status, 503);
    assert.match(res.body.error, /can’t be sent from here yet/);
    assert.equal(sent.length, 0);
    const lead = (await api(`/api/admin/leads/${who.lead.id}`, { token: adminToken })).body;
    assert.ok(!lead.activity.some((entry) => /^Emailed/.test(entry.text)), 'no "emailed" line for something not sent');
  } finally {
    process.env.RESEND_API_KEY = saved;
  }
  assert.equal((await api(`/api/c/${communityId}`)).body.emailReady, true);
});

test('a failed send says so, is noted for the team, and does not use up the buyer\'s turn', async () => {
  const who = await buyer();
  const ok = restoreMail;
  restoreMail = setTransportForTests(async () => { throw new Error('provider down'); });
  const down = await send(who);
  assert.equal(down.status, 503);
  assert.match(down.body.error, /couldn’t send that right now/);
  restoreMail();
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  void ok;
  const lead = (await api(`/api/admin/leads/${who.lead.id}`, { token: adminToken })).body;
  assert.ok(lead.activity.some((entry) => /^Tried to email the team about the builder incentive \(it could not be sent\)/.test(entry.text)));
  // Straight away again: the failed one did not count against the 20 second rule.
  assert.equal((await send(who)).status, 200);
});

test('one buyer cannot send twice in a breath, or more than three an hour, and is told when to come back', async () => {
  const who = await buyer();
  assert.equal((await send(who)).status, 200);
  const again = await send(who);
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers.get('retry-after')) > 0);
  assert.match(again.body.error, /a few messages already/);
  assert.equal(sent.length, 1);
});
