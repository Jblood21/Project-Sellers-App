import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword, readToken } from '../lib/auth.js';
import { bootWarnings } from '../lib/bootcheck.js';
import { clientKey, tooMany } from '../lib/limits.js';
import { setTransportForTests } from '../lib/email.js';
import { createApp } from '../index.js';

// The limits are off under `node --test` so the other suites can reuse one address and a few
// emails freely; this file is about the limits, so it turns them on for its own process.
process.env.RATE_LIMITS = 'on';

const here = dirname(fileURLToPath(import.meta.url));
let server;
let base;
let dir;
let port;

/** fetch cannot be trusted to send an arbitrary Host or X-Forwarded-Host, so this talks HTTP itself. */
const raw = (path, { method = 'GET', body, token, headers = {} } = {}) => new Promise((resolve, reject) => {
  const payload = body === undefined ? null : JSON.stringify(body);
  const req = http.request({
    host: '127.0.0.1',
    port,
    path,
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  }, (res) => {
    let text = '';
    res.on('data', (chunk) => { text += chunk; });
    res.on('end', () => {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      resolve({ status: res.statusCode, body: parsed, headers: res.headers });
    });
  });
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});

const api = (path, options) => raw(path, options);

const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let adminToken;
let sent;
let restoreMail = () => {};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-hardening-'));
  process.env.SESSION_SECRET = 'test-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  adminToken = (await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } })).body.token;
  sent = [];
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  process.env.RESEND_API_KEY = 'test-key';
});

after(async () => {
  restoreMail();
  delete process.env.RESEND_API_KEY;
  delete process.env.PUBLIC_ORIGIN;
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.PUBLIC_ORIGIN;
  sent.length = 0;
});

let counter = 0;
/** A community with a home and published slots, and one buyer in it. */
async function scene(name = 'Hardening Test') {
  counter += 1;
  const community = (await api('/api/admin/communities', { method: 'POST', token: adminToken, body: { name: `${name} ${counter}` } })).body;
  const slots = (await api(`/api/admin/communities/${community.id}/slots`, {
    method: 'POST', token: adminToken, body: { dates: [futureDate(2), futureDate(3)], times: ['10:00', '14:00'] },
  })).body.slots;
  const enter = (extra = {}) => api(`/api/c/${community.id}/leads`, {
    method: 'POST',
    body: { name: 'Sam Rivera', email: `sam${counter}@test.co`, phone: '(801) 555-0111', ...extra },
  });
  const entered = await enter();
  return { community, slots, enter, lead: entered.body.lead, token: entered.body.token };
}

test('a buyer is shown their own record, never the builder\'s notes on it', async () => {
  const { community, slots, enter, lead, token } = await scene();
  const NOTE = 'INTERNAL: low budget, tire kicker; do not call after 5';
  const patched = await api(`/api/admin/leads/${lead.id}`, { method: 'PATCH', token: adminToken, body: { notes: NOTE, status: 'contacted' } });
  assert.equal(patched.status, 200);

  const responses = {
    'GET /me': await api('/api/me', { token }),
    'the gate on a return visit': await enter(),
    'PUT /me/plan': await api('/api/me/plan/payment', { method: 'PUT', token, body: { summary: 'The Oak · FHA' } }),
    'PUT /me/movein': await api('/api/me/movein', { method: 'PUT', token, body: { targetDate: futureDate(120), payMethod: 'loan', drivers: [], done: [], ownSteps: [] } }),
    'POST /me/tour': await api('/api/me/tour', { method: 'POST', token, body: { slotId: slots[0].id, contact: 'phone' } }),
  };
  for (const [where, res] of Object.entries(responses)) {
    assert.ok(res.status === 200, `${where}: ${res.status}`);
    const lead = res.body.lead ?? res.body;
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(NOTE), `${where} leaks the builder's note`);
    for (const key of ['notes', 'status', 'openedAt', 'archivedAt', 'activity', 'firstVisitAt', 'updatedAt']) {
      assert.equal(lead[key], undefined, `${where} carries ${key}`);
    }
    assert.ok(lead.consent == null || JSON.stringify(Object.keys(lead.consent).sort()) === '["at","granted"]',
      `${where}: the consent record is the builder's evidence (its wording, version and IP), not the buyer's view`);
    assert.equal(lead.id, responses['GET /me'].body.id);
    assert.equal(lead.email, `sam${counter}@test.co`);
  }
  // The buyer still gets what the app reads: the plan, the move-in plan, the booked time.
  assert.equal(responses['PUT /me/plan'].body.plan.payment, 'The Oak · FHA');
  assert.equal(responses['PUT /me/movein'].body.moveIn.payMethod, 'loan');
  assert.equal(responses['POST /me/tour'].body.tour.time, slots[0].time);
  // And the builder still sees all of it.
  const admin = (await api(`/api/admin/communities/${community.id}/leads`, { token: adminToken })).body[0];
  assert.equal(admin.notes, NOTE);
  assert.equal(admin.status, 'contacted');
});

test('the call alert links to a page the admin app really has', async () => {
  const client = (file) => readFileSync(join(here, '../../client/src/admin', file), 'utf8');
  assert.match(client('AdminApp.jsx'), /path="communities\/:communityId\/\*"/);
  assert.match(client('screens/CommunityDetail.jsx'), /path="leads\/:leadId"/);

  process.env.PUBLIC_ORIGIN = 'https://touradoor.example';
  const { community, slots, token, lead } = await scene();
  const booked = await api('/api/me/tour', { method: 'POST', token, body: { slotId: slots[0].id, contact: 'phone' } });
  assert.equal(booked.status, 200);
  const alert = sent.find((mail) => /booked/.test(mail.subject));
  assert.ok(alert, 'the builder was emailed');
  assert.match(alert.text, new RegExp(`Open the lead: https://touradoor\\.example/admin/communities/${community.id}/leads/${lead.id}$`, 'm'));
});

test('links in emails come from PUBLIC_ORIGIN, or the Host header, and never from a header the caller picks', async () => {
  const hostile = { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'http' };
  const linkOf = (mail) => /Open the lead: (\S+)/.exec(mail.text)?.[1];

  // Pinned: the pinned address wins over every header.
  process.env.PUBLIC_ORIGIN = 'https://touradoor.example';
  let s = await scene();
  await raw('/api/me/tour', { method: 'POST', token: s.token, body: { slotId: s.slots[0].id }, headers: { Host: 'old.example', ...hostile } });
  assert.match(linkOf(sent.at(-1)), /^https:\/\/touradoor\.example\/admin\//);

  // Not pinned: the Host the platform routed on, but never X-Forwarded-Host.
  delete process.env.PUBLIC_ORIGIN;
  sent.length = 0;
  s = await scene();
  await raw('/api/me/tour', { method: 'POST', token: s.token, body: { slotId: s.slots[0].id }, headers: { Host: 'touradoor.example', ...hostile } });
  assert.match(linkOf(sent.at(-1)), /^https?:\/\/touradoor\.example\/admin\//, 'the forged forwarded host is ignored');
  assert.doesNotMatch(sent.at(-1).text, /evil\.example/);

  // In production the scheme is https whatever X-Forwarded-Proto claims.
  sent.length = 0;
  const wasEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    s = await scene();
    await raw('/api/me/tour', { method: 'POST', token: s.token, body: { slotId: s.slots[0].id }, headers: { Host: 'touradoor.example', ...hostile } });
    assert.match(linkOf(sent.at(-1)), /^https:\/\/touradoor\.example\/admin\//);
  } finally {
    if (wasEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = wasEnv;
  }

  // A Host that is not a plausible host name leaves the link out rather than printing it.
  sent.length = 0;
  s = await scene();
  await raw('/api/me/tour', { method: 'POST', token: s.token, body: { slotId: s.slots[0].id }, headers: { Host: 'a b/c' } }).catch(() => null);

  // The plan email follows the same rule.
  sent.length = 0;
  process.env.PUBLIC_ORIGIN = 'https://touradoor.example';
  s = await scene();
  await raw('/api/me/plan/email', { method: 'POST', token: s.token, body: {}, headers: hostile });
  assert.match(sent.at(-1).text, /https:\/\/touradoor\.example\/c\//);
  assert.doesNotMatch(sent.at(-1).text, /evil\.example/);
});

test('the community payload says where the site lives when it is pinned, so the browser agrees with the server', async () => {
  const { community } = await scene();
  assert.equal((await api(`/api/c/${community.id}`)).body.siteOrigin, '');
  process.env.PUBLIC_ORIGIN = 'https://touradoor.example/some/path';
  assert.equal((await api(`/api/c/${community.id}`)).body.siteOrigin, 'https://touradoor.example', 'just the origin');
  process.env.PUBLIC_ORIGIN = 'touradoor.example';
  assert.equal((await api(`/api/c/${community.id}`)).body.siteOrigin, '', 'a value without https:// is ignored, as everywhere else');
});

test('the gate refuses what no real form sends', async () => {
  const { community } = await scene();
  const post = (body) => api(`/api/c/${community.id}/leads`, { method: 'POST', body: { name: 'Pat Lee', email: 'pat@test.co', phone: '801-555-0101', ...body } });
  assert.equal((await post({ name: 'x'.repeat(121) })).status, 400, 'a very long name');
  assert.equal((await post({ email: `${'x'.repeat(250)}@test.co` })).status, 400, 'a very long email');
  assert.equal((await post({ phone: '8'.repeat(41) })).status, 400, 'a very long phone');
  assert.equal((await post({ name: 'Pat\u0000Lee' })).status, 400, 'a NUL byte');
  assert.equal((await post({ email: 'pat@test.co\r\nBcc: x@y.z' })).status, 400, 'a line break in the email');
  assert.equal((await post({ name: 'x'.repeat(120) })).status, 201, 'and the longest allowed name still works');

  // A public body is small: a sign-up is a few hundred bytes.
  const big = await post({ name: 'y'.repeat(200 * 1024) });
  assert.equal(big.status, 413);
});

test('plan items and activity text are bounded and free of control characters', async () => {
  const { token } = await scene();
  const saved = await api('/api/me/plan/payment', { method: 'PUT', token, body: { summary: `${'a'.repeat(900)}\u0000` } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.plan.payment.length, 500);
  assert.ok(!saved.body.plan.payment.includes('\u0000'));
  // Move-in lists carry no duplicates, however many a caller sends.
  const plan = await api('/api/me/movein', {
    method: 'PUT', token, body: { targetDate: futureDate(100), payMethod: 'cash', drivers: Array(2000).fill('lease'), done: Array(2000).fill('offer'), ownSteps: [] },
  });
  assert.deepEqual(plan.body.moveIn.drivers, ['lease']);
  assert.ok(plan.body.moveIn.done.length <= 1);
});

test('a buyer cannot book another community\'s appointment', async () => {
  const mine = await scene('Mine');
  const other = await scene('Other');
  const stolen = await api('/api/me/tour', { method: 'POST', token: mine.token, body: { slotId: other.slots[0].id, contact: 'phone' } });
  assert.equal(stolen.status, 404);
  const slots = (await api(`/api/c/${other.community.id}/slots`)).body;
  assert.ok(slots.some((slot) => slot.id === other.slots[0].id && !slot.leadId), 'and it is still free');
  assert.equal((await api('/api/me/tour', { method: 'POST', token: mine.token, body: { slotId: mine.slots[0].id, contact: 'phone' } })).status, 200);
});

test('wrong passwords are counted, and a locked-out guesser cannot lock out the owner', async () => {
  const wrong = (email, ip) => raw('/api/admin/login', {
    method: 'POST', body: { email, password: 'nope' }, headers: ip ? { 'X-Forwarded-For': ip } : {},
  });
  // trust proxy is 1, so the address behind the proxy is the last X-Forwarded-For entry; a test
  // client has no proxy in front of it, so every request here is one address (the loopback).
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    assert.equal((await wrong('someone@test.co')).status, 401, `attempt ${attempt}`);
  }
  const locked = await wrong('someone@test.co');
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many sign-in attempts/);
  assert.ok(Number(locked.headers['retry-after']) > 0, 'it says when to come back');
  // Even the right password is refused for that email from that address while locked...
  const right = await raw('/api/admin/login', { method: 'POST', body: { email: 'someone@test.co', password: 'pw123456' } });
  assert.equal(right.status, 429);
  // ...and it is that email from that address only: the owner's own sign-in is unaffected.
  const owner = await raw('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } });
  assert.equal(owner.status, 200);
});

test('the sign-up form and "email me my plan" are limited per person', async () => {
  const { community, token, enter } = await scene();
  // Five plan emails a day for one buyer.
  for (let n = 1; n <= 5; n += 1) {
    assert.equal((await api('/api/me/plan/email', { method: 'POST', token, body: {} })).status, 200, `send ${n}`);
  }
  const sixth = await api('/api/me/plan/email', { method: 'POST', token, body: {} });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.error, /Too many plan emails/);
  assert.equal(sent.filter((mail) => /Your home plan/.test(mail.subject)).length, 5, 'the sixth was not sent');

  // The same person coming back to the gate over and over is told to slow down; someone else is not.
  for (let n = 1; n <= 8; n += 1) assert.equal((await enter({ email: 'repeat@test.co' })).status, n === 1 ? 201 : 200, `entry ${n}`);
  assert.equal((await enter({ email: 'repeat@test.co' })).status, 429);
  assert.equal((await api(`/api/c/${community.id}/leads`, {
    method: 'POST', body: { name: 'Different Person', email: 'different@test.co', phone: '801-555-0188' },
  })).status, 201);
});

test('a visitor is one address, however many an IPv6 block hands out', async () => {
  const key = (ip) => clientKey({ ip });
  assert.equal(key('203.0.113.9'), '203.0.113.9');
  assert.equal(key('::ffff:203.0.113.9'), '203.0.113.9', 'an IPv4 address wrapped in IPv6 is the IPv4 address');
  assert.equal(key('::ffff:cb00:7109'), '203.0.113.9', 'in either spelling');
  assert.equal(key('2001:db8:abcd:12::1'), key('2001:db8:abcd:12:ffff:ffff:ffff:ffff'), 'one /64 is one visitor');
  assert.equal(key('2001:db8:abcd:12::1'), '2001:db8:abcd:12::/64');
  assert.notEqual(key('2001:db8:abcd:12::1'), key('2001:db8:abcd:13::1'), 'the next /64 is somebody else');
  assert.equal(key('2001:db8::1'), '2001:db8:0:0::/64', 'a :: that hides zero groups is expanded first');
  assert.equal(key('::1'), '0:0:0:0::/64');
  assert.equal(key('fe80::1%eth0'), 'fe80:0:0:0::/64', 'a zone id is ignored');
  assert.equal(key(undefined), '');
});

test('guessing the owner\'s password from many addresses of one IPv6 block is still guessing from one address', async () => {
  for (let n = 1; n <= 8; n += 1) {
    const res = await raw('/api/admin/login', {
      method: 'POST', body: { email: 'blockguess@test.co', password: 'nope' },
      headers: { 'X-Forwarded-For': `2001:db8:feed:1::${n}` },
    });
    assert.equal(res.status, 401, `guess ${n}`);
  }
  const ninth = await raw('/api/admin/login', {
    method: 'POST', body: { email: 'blockguess@test.co', password: 'nope' },
    headers: { 'X-Forwarded-For': '2001:db8:feed:1::99' },
  });
  assert.equal(ninth.status, 429, 'a new address in the same block does not start a new count');
});

test('a caller who is not signed in cannot make the server read a big body', async () => {
  const big = { filler: 'x'.repeat(1024 * 1024) };
  // The sign-in form takes the small parser: over 64 KB is refused before it is parsed.
  const login = await raw('/api/admin/login', { method: 'POST', body: big });
  assert.equal(login.status, 413);
  // Everything else under /api/admin is refused for want of a token before the body is read.
  const noToken = await raw('/api/admin/communities', { method: 'POST', body: big });
  assert.equal(noToken.status, 401);
  // Over the 6 MB limit the old arrangement said 413, having read the lot; now it never looks.
  const enormous = await raw('/api/admin/communities', { method: 'POST', body: { filler: 'x'.repeat(7 * 1024 * 1024) } });
  assert.equal(enormous.status, 401);
  const badToken = await raw('/api/admin/communities', { method: 'POST', token: 'not.valid', body: big });
  assert.equal(badToken.status, 401);
  // A signed-in admin still gets the larger parser: this body is far over 64 KB and is accepted.
  const signedIn = await raw('/api/admin/communities', {
    method: 'POST', token: adminToken, body: { name: 'Big Body Test', filler: 'x'.repeat(200 * 1024) },
  });
  assert.equal(signedIn.status, 201);
});

test('a plan email that could not be sent does not use up the buyer\'s five for the day', async () => {
  const { token } = await scene('Failing Send');
  const ok = restoreMail;
  restoreMail = setTransportForTests(async () => { throw new Error('provider down'); });
  for (let n = 1; n <= 6; n += 1) {
    const down = await api('/api/me/plan/email', { method: 'POST', token, body: {} });
    assert.equal(down.status, 503, `attempt ${n} says it could not send, never "too many"`);
  }
  restoreMail();
  restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
  void ok;
  for (let n = 1; n <= 5; n += 1) {
    assert.equal((await api('/api/me/plan/email', { method: 'POST', token, body: {} })).status, 200, `send ${n} once it is back`);
  }
  assert.equal((await api('/api/me/plan/email', { method: 'POST', token, body: {} })).status, 429);
});

test('one inbox gets five plan emails a day however many sign-ups point at it', async () => {
  const { community } = await scene('Victim Inbox');
  const tokens = [];
  for (let n = 1; n <= 4; n += 1) {
    const res = await api(`/api/c/${community.id}/leads`, {
      method: 'POST', body: { name: `Stranger ${n}`, email: 'victim@example.org', phone: `(801) 555-02${n}0` },
    });
    assert.equal(res.status, 201);
    tokens.push(res.body.token);
  }
  let delivered = 0;
  let refused = 0;
  for (const token of tokens) {
    for (let n = 1; n <= 3; n += 1) {
      const res = await api('/api/me/plan/email', { method: 'POST', token, body: {} });
      if (res.status === 200) delivered += 1;
      else if (res.status === 429) refused += 1;
    }
  }
  assert.equal(delivered, 5, 'twelve requests, five delivered');
  assert.equal(refused, 7);
  assert.equal(sent.filter((mail) => /victim@example.org/.test(String(mail.to))).length, 5);
});

test('a wait is described honestly, whether minutes, hours or days', () => {
  assert.match(tooMany('things', 30), /in a minute/);
  assert.match(tooMany('things', 20 * 60), /in about 20 minutes/);
  assert.match(tooMany('things', 5 * 3600), /in about 5 hours/);
  assert.match(tooMany('things', 86400), /tomorrow/);
  assert.doesNotMatch(tooMany('things', 86400), /later today/);
});

test('a forged token with multibyte characters is turned away, not an error', async () => {
  const body = Buffer.from(JSON.stringify({ lead: 'l_1', exp: Date.now() + 1e6 })).toString('base64url');
  const bad = `${body}.${'é'.repeat(43)}`; // 43 characters, like a real signature, but 86 bytes
  assert.equal(readToken(bad), null);
  const res = await api('/api/me', { token: bad });
  assert.equal(res.status, 401);
});

test('the server says at boot what an unset variable will quietly cost', () => {
  const saved = { ...process.env };
  const reset = () => {
    for (const key of ['NODE_ENV', 'PUBLIC_ORIGIN', 'SESSION_SECRET', 'DATABASE_URL', 'RESEND_API_KEY', 'EMAIL_FROM']) delete process.env[key];
  };
  try {
    reset();
    process.env.NODE_ENV = 'production';
    const bare = bootWarnings().join('\n');
    assert.match(bare, /PUBLIC_ORIGIN is not set/);
    assert.match(bare, /SESSION_SECRET is not set/);
    assert.match(bare, /DATABASE_URL is not set/);
    assert.match(bare, /Email is off/);

    process.env.PUBLIC_ORIGIN = 'touradoor.com';
    assert.match(bootWarnings().join('\n'), /needs the https:\/\/ in front/);

    Object.assign(process.env, { PUBLIC_ORIGIN: 'https://touradoor.com', SESSION_SECRET: 's', DATABASE_URL: 'postgres://x', RESEND_API_KEY: 'k' });
    assert.match(bootWarnings().join('\n'), /EMAIL_FROM is not set/);

    process.env.EMAIL_FROM = 'Touradoor <hello@touradoor.com>';
    assert.deepEqual(bootWarnings(), [], 'a fully configured deployment says nothing');

    // Development has none of these set and is not told off for it, except about email.
    reset();
    assert.deepEqual(bootWarnings().map((w) => w.slice(0, 8)), ['Email is']);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
