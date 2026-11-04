import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * A new visitor signing in is told to chosen team members in Slack: only those the owner switched on, only those who can
 * see that community or listing, never the visitor's own request failing because Slack did. Slack is a stub server here.
 */
for (const kind of backends()) {
  describe(`slack alerts (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let stub;
    const calls = [];
    // What the stub answers for a lookup: an email -> a Slack id, or an error for one that is unknown.
    const slackIds = { 'one@agent.test': 'U1', 'two@agent.test': 'U2', 'admin@test.co': 'UOWNER' };
    let community;
    let one;
    let two;

    before(async () => {
      stub = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
          const url = new URL(req.url, 'http://x');
          calls.push({ path: url.pathname, email: url.searchParams.get('email'), auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
          res.setHeader('content-type', 'application/json');
          if (url.pathname.endsWith('users.lookupByEmail')) {
            const id = slackIds[url.searchParams.get('email')];
            return res.end(JSON.stringify(id ? { ok: true, user: { id } } : { ok: false, error: 'users_not_found' }));
          }
          return res.end(JSON.stringify({ ok: true }));
        });
      });
      await new Promise((resolve) => stub.listen(0, resolve));
      process.env.SLACK_API_URL = `http://127.0.0.1:${stub.address().port}`;
      process.env.AGENT_SIGNUP_CODE = 'open-sesame';
      app = await startBackend(kind, 'slack');
      ({ api, token: owner } = app);
      const mk = async (email) => (await api('/api/admin/signup', { method: 'POST', body: { email, password: 'agent-pass-1234', code: 'open-sesame' } })).body;
      one = (await mk('one@agent.test')).admin;
      two = (await mk('two@agent.test')).admin;
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Slack Court' } })).body;
      // The first member can see it; the second cannot.
      await api(`/api/admin/team/${one.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [community.id] } });
    });
    after(async () => {
      delete process.env.SLACK_API_URL;
      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.AGENT_SIGNUP_CODE;
      await new Promise((resolve) => stub.close(resolve));
      await app.stop();
    });

    const visit = (email) => api(`/api/c/${community.id}/leads`, { method: 'POST', body: { name: 'Visitor V', email } });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
    const messages = () => calls.filter((c) => c.path.endsWith('chat.postMessage'));

    test('is quiet and says so while no Slack token is set', async () => {
      delete process.env.SLACK_BOT_TOKEN;
      assert.deepEqual((await api('/api/admin/team/slack', { token: owner })).body, { configured: false });
      await api(`/api/admin/team/${one.id}/slack`, { token: owner, method: 'PUT', body: { enabled: true } });
      calls.length = 0;
      assert.equal((await visit('v0@buyer.test')).status, 201);
      await settle();
      assert.equal(calls.length, 0, 'no call to Slack');
      const test = await api(`/api/admin/team/${one.id}/slack/test`, { token: owner, method: 'POST', body: {} });
      assert.equal(test.body.ok, false);
      assert.match(test.body.error, /SLACK_BOT_TOKEN/);
    });

    test('only the owner may change who is alerted', async () => {
      const member = (await api('/api/admin/login', { method: 'POST', body: { email: 'one@agent.test', password: 'agent-pass-1234' } })).body.token;
      const put = await api(`/api/admin/team/${one.id}/slack`, { token: member, method: 'PUT', body: { enabled: false } });
      assert.equal(put.status, 403);
      assert.equal((await api(`/api/admin/team/${one.id}/slack`, { token: owner, method: 'PUT', body: { enabled: 'yes' } })).status, 400);
      assert.equal((await api('/api/admin/team/nobody/slack', { token: owner, method: 'PUT', body: { enabled: true } })).status, 404);
    });

    test('a new visitor messages the chosen people who can see the community, once', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-test';
      assert.deepEqual((await api('/api/admin/team/slack', { token: owner })).body, { configured: true });
      // Switched on for the first member (can see it) and the second (cannot); not for the owner.
      await api(`/api/admin/team/${one.id}/slack`, { token: owner, method: 'PUT', body: { enabled: true } });
      await api(`/api/admin/team/${two.id}/slack`, { token: owner, method: 'PUT', body: { enabled: true } });
      const team = (await api('/api/admin/team', { token: owner })).body;
      assert.equal(team.find((m) => m.id === one.id).slackAlerts, true);
      assert.equal(team.find((m) => m.email === 'admin@test.co').slackAlerts, false);

      calls.length = 0;
      assert.equal((await visit('v1@buyer.test')).status, 201);
      await settle();
      const sent = messages();
      assert.equal(sent.length, 1, JSON.stringify(sent));
      assert.equal(sent[0].body.channel, 'U1');
      assert.equal(sent[0].auth, 'Bearer xoxb-test');
      assert.match(sent[0].body.text, /Visitor V/);
      assert.match(sent[0].body.text, /Slack Court/);

      // The same visitor coming back is not a new visitor.
      calls.length = 0;
      const again = await visit('v1@buyer.test');
      assert.equal(again.body.returning, true);
      await settle();
      assert.equal(messages().length, 0);
    });

    test('the owner is messaged once switched on, and switching off stops it', async () => {
      const ownerId = (await api('/api/admin/team', { token: owner })).body.find((m) => m.role === 'owner').id;
      await api(`/api/admin/team/${ownerId}/slack`, { token: owner, method: 'PUT', body: { enabled: true } });
      calls.length = 0;
      await visit('v2@buyer.test');
      await settle();
      assert.deepEqual(messages().map((m) => m.body.channel).sort(), ['U1', 'UOWNER']);
      await api(`/api/admin/team/${ownerId}/slack`, { token: owner, method: 'PUT', body: { enabled: false } });
      await api(`/api/admin/team/${one.id}/slack`, { token: owner, method: 'PUT', body: { enabled: false } });
      calls.length = 0;
      await visit('v3@buyer.test');
      await settle();
      assert.equal(messages().length, 0);
    });

    test('a person Slack cannot find never breaks the sign-in, and the test message says why', async () => {
      slackIds['two@agent.test'] = undefined;
      await api(`/api/admin/team/${one.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [community.id] } });
      await api(`/api/admin/team/${two.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [community.id] } });
      const test = await api(`/api/admin/team/${two.id}/slack/test`, { token: owner, method: 'POST', body: {} });
      assert.equal(test.body.ok, false);
      assert.match(test.body.error, /No one in your Slack workspace/);
      await api(`/api/admin/team/${two.id}/slack`, { token: owner, method: 'PUT', body: { enabled: true } });
      const res = await visit('v4@buyer.test');
      assert.equal(res.status, 201, 'the visitor signs in whatever Slack says');
      await settle();
      const good = await api(`/api/admin/team/${one.id}/slack/test`, { token: owner, method: 'POST', body: {} });
      assert.deepEqual(good.body, { ok: true });
    });
  });
}
