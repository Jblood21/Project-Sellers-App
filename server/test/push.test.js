import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { allowedEndpoint, forgetPushKeysForTests, setPushSenderForTests } from '../lib/push.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * Phone notifications: a team member turns their own phone on, the owner decides who is sent them, and a new person
 * signing in notifies those people (and only those who can open the community) on every phone they turned on.
 */
const sub = (n) => ({
  endpoint: `https://web.push.apple.com/test-${n}`,
  keys: { p256dh: `BPk${'a'.repeat(40)}${n}`, auth: `au${'b'.repeat(20)}${n}` },
});

describe('push addresses', () => {
  test('only a push service of a phone maker is accepted', () => {
    assert.equal(allowedEndpoint('https://web.push.apple.com/abc'), true);
    assert.equal(allowedEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
    assert.equal(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
    assert.equal(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'), true);
    for (const bad of ['http://web.push.apple.com/abc', 'https://169.254.169.254/latest', 'https://evil.example.com/push', 'https://localhost/x', 'https://web.push.apple.com.evil.test/x', 'https://web.push.apple.com:8443/x', 'nonsense', '']) {
      assert.equal(allowedEndpoint(bad), false, bad);
    }
  });
});

for (const kind of backends()) {
  describe(`phone notifications (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let restore;
    const sent = [];
    let failWith = null;
    let community;
    let one;
    let two;
    let oneToken;
    let twoToken;

    before(async () => {
      process.env.AGENT_SIGNUP_CODE = 'open-sesame';
      forgetPushKeysForTests();
      app = await startBackend(kind, 'push');
      ({ api, token: owner } = app);
      restore = setPushSenderForTests(async (subscription, payload, options) => {
        if (failWith) throw Object.assign(new Error('gone'), { statusCode: failWith });
        sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
        return {};
      });
      const mk = async (email) => (await api('/api/admin/signup', { method: 'POST', body: { email, password: 'agent-pass-1234', code: 'open-sesame' } })).body;
      const a = await mk('one@phone.test');
      const b = await mk('two@phone.test');
      one = a.admin; oneToken = a.token;
      two = b.admin; twoToken = b.token;
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Push Court' } })).body;
      await api(`/api/admin/team/${one.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [community.id] } });
    });
    after(async () => {
      restore?.();
      delete process.env.AGENT_SIGNUP_CODE;
      await app.stop();
    });

    const visit = (email) => api(`/api/c/${community.id}/leads`, { method: 'POST', body: { name: 'Pat Buyer', email } });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
    const subscribe = (token, n) => api('/api/admin/me/push/subscribe', { token, method: 'POST', body: { subscription: sub(n) } });

    test('gives a public key that stays the same, and takes phones on and off', async () => {
      const first = (await api('/api/admin/me/push', { token: oneToken })).body;
      assert.ok(first.publicKey && first.publicKey.length > 40);
      assert.equal(first.devices, 0);
      assert.equal((await api('/api/admin/me/push', { token: oneToken })).body.publicKey, first.publicKey, 'one key pair, kept');
      assert.equal((await subscribe(oneToken, 1)).status, 201);
      assert.equal((await subscribe(oneToken, 1)).body.devices, 1, 'the same phone twice is one phone');
      assert.equal((await subscribe(oneToken, 2)).body.devices, 2);
      const bad = await api('/api/admin/me/push/subscribe', { token: oneToken, method: 'POST', body: { subscription: { endpoint: 'https://evil.example.com/x', keys: sub(3).keys } } });
      assert.equal(bad.status, 400);
      const noKeys = await api('/api/admin/me/push/subscribe', { token: oneToken, method: 'POST', body: { subscription: { endpoint: sub(3).endpoint, keys: { p256dh: '', auth: '' } } } });
      assert.equal(noKeys.status, 400);
      // Another person cannot take off this person's phone.
      assert.equal((await api('/api/admin/me/push/unsubscribe', { token: twoToken, method: 'POST', body: { endpoint: sub(1).endpoint } })).body.devices, 0);
      assert.equal((await api('/api/admin/me/push', { token: oneToken })).body.devices, 2);
      assert.equal((await api('/api/admin/me/push/unsubscribe', { token: oneToken, method: 'POST', body: { endpoint: sub(2).endpoint } })).body.devices, 1);
    });

    test('only the owner decides who is sent notifications', async () => {
      assert.equal((await api(`/api/admin/team/${one.id}/push`, { token: oneToken, method: 'PUT', body: { enabled: true } })).status, 403);
      assert.equal((await api(`/api/admin/team/${one.id}/push`, { token: owner, method: 'PUT', body: { enabled: 'yes' } })).status, 400);
      assert.equal((await api('/api/admin/team/nobody/push', { token: owner, method: 'PUT', body: { enabled: true } })).status, 404);
      assert.equal((await api('/api/admin/team/push', { token: oneToken })).status, 403);
      const counts = (await api('/api/admin/team/push', { token: owner })).body.counts;
      assert.equal(counts[one.id], 1);
    });

    test('a new person notifies the chosen people who can open the community, on their phones, once', async () => {
      await api(`/api/admin/team/${one.id}/push`, { token: owner, method: 'PUT', body: { enabled: true } });
      await api(`/api/admin/team/${two.id}/push`, { token: owner, method: 'PUT', body: { enabled: true } });
      await subscribe(twoToken, 9); // switched on and has a phone, but cannot open this community
      assert.equal((await api('/api/admin/team', { token: owner })).body.find((m) => m.id === one.id).pushAlerts, true);
      await subscribe(oneToken, 4); // a second phone for the first person
      sent.length = 0;
      assert.equal((await visit('p1@buyer.test')).status, 201);
      await settle();
      assert.deepEqual(sent.map((m) => m.endpoint).sort(), [sub(1).endpoint, sub(4).endpoint].sort(), 'both phones of the first person only');
      const note = sent[0].payload;
      assert.match(note.body, /Pat Buyer/);
      assert.match(note.body, /Push Court/);
      assert.match(note.url, new RegExp(`^/admin/communities/${community.id}/leads/`));
      assert.equal(sent[0].options.urgency, 'high');

      sent.length = 0;
      assert.equal((await visit('p1@buyer.test')).body.returning, true);
      await settle();
      assert.equal(sent.length, 0, 'a returning visitor is not new');

      await api(`/api/admin/team/${one.id}/push`, { token: owner, method: 'PUT', body: { enabled: false } });
      await visit('p2@buyer.test');
      await settle();
      assert.equal(sent.length, 0, 'switched off');
    });

    test('a phone the push service says is gone is forgotten, and a failure never breaks the sign-in', async () => {
      await api(`/api/admin/team/${one.id}/push`, { token: owner, method: 'PUT', body: { enabled: true } });
      failWith = 410;
      const res = await visit('p3@buyer.test');
      assert.equal(res.status, 201);
      await settle();
      assert.equal((await api('/api/admin/me/push', { token: oneToken })).body.devices, 0, 'both of the first person\'s phones were dropped');
      failWith = 500;
      assert.equal((await visit('p4@buyer.test')).status, 201);
      failWith = null;
    });

    test('test notifications say whether anything could be sent', async () => {
      const none = await api(`/api/admin/team/${one.id}/push/test`, { token: owner, method: 'POST', body: {} });
      assert.equal(none.body.ok, false);
      assert.match(none.body.error, /No phone/);
      await subscribe(oneToken, 7);
      sent.length = 0;
      assert.deepEqual((await api(`/api/admin/team/${one.id}/push/test`, { token: owner, method: 'POST', body: {} })).body, { ok: true, sent: 1 });
      assert.equal(sent.length, 1);
      assert.deepEqual((await api('/api/admin/me/push/test', { token: oneToken, method: 'POST', body: {} })).body, { ok: true, sent: 1 });
      assert.equal((await api('/api/admin/team/nobody/push/test', { token: owner, method: 'POST', body: {} })).status, 404);
    });
  });
}
