import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { setTransportForTests } from '../lib/email.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * Every new person who signs in to a community is emailed to the team members the owner switched on, whether or not they
 * booked a time, and only to those who can open that community (through its branch, or given to them directly).
 */
for (const kind of backends()) {
  describe(`new-visitor email alerts (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let restore;
    const sent = [];
    let community;
    let other;
    let branch;
    let inBranch;
    let outside;

    before(async () => {
      process.env.AGENT_SIGNUP_CODE = 'open-sesame';
      app = await startBackend(kind, 'visitor-email');
      ({ api, token: owner } = app);
      restore = setTransportForTests(async (payload) => { sent.push(payload); return {}; });
      const mk = async (email) => (await api('/api/admin/signup', { method: 'POST', body: { email, password: 'agent-pass-1234', code: 'open-sesame' } })).body.admin;
      inBranch = await mk('in@branch.test');
      outside = await mk('out@branch.test');
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Mail Court' } })).body;
      other = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Elsewhere' } })).body;
      branch = (await api('/api/admin/branches', { token: owner, method: 'POST', body: { name: 'Summit Homes' } })).body;
      await api(`/api/admin/branches/${branch.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [community.id] } });
      await api(`/api/admin/branches/${branch.id}/members`, { token: owner, method: 'PUT', body: { adminIds: [inBranch.id] } });
    });
    after(async () => {
      restore?.();
      delete process.env.RESEND_API_KEY;
      delete process.env.AGENT_SIGNUP_CODE;
      await app.stop();
    });

    const visit = (cid, email, extra = {}) => api(`/api/c/${cid}/leads`, { method: 'POST', body: { name: 'Pat Buyer', email, ...extra } });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
    const emailAlerts = (id, enabled) => api(`/api/admin/team/${id}/email-alerts`, { token: owner, method: 'PUT', body: { enabled } });

    test('reports whether email is set up, and sends nothing while it is not', async () => {
      delete process.env.RESEND_API_KEY;
      assert.equal((await api('/api/admin/team/email', { token: owner })).body.configured, false);
      await emailAlerts(inBranch.id, true);
      sent.length = 0;
      assert.equal((await visit(community.id, 'a0@buyer.test')).status, 201);
      await settle();
      assert.equal(sent.length, 0);
      const test = await api(`/api/admin/team/${inBranch.id}/email-alerts/test`, { token: owner, method: 'POST', body: {} });
      assert.equal(test.body.ok, false);
      assert.match(test.body.error, /RESEND_API_KEY/);
      await emailAlerts(inBranch.id, false);
    });

    test('only the owner may switch alerts, and a bad request is refused', async () => {
      const member = (await api('/api/admin/login', { method: 'POST', body: { email: 'in@branch.test', password: 'agent-pass-1234' } })).body.token;
      assert.equal((await api(`/api/admin/team/${inBranch.id}/email-alerts`, { token: member, method: 'PUT', body: { enabled: false } })).status, 403);
      assert.equal((await api(`/api/admin/team/${inBranch.id}/email-alerts`, { token: owner, method: 'PUT', body: { enabled: 'yes' } })).status, 400);
      assert.equal((await api('/api/admin/team/nobody/email-alerts', { token: owner, method: 'PUT', body: { enabled: true } })).status, 404);
      assert.equal((await api('/api/admin/team/email-alerts/branch', { token: owner, method: 'PUT', body: { branchId: 'gone', enabled: true } })).status, 404);
    });

    test('switching a whole branch on emails everyone in it, and only people who can open the community', async () => {
      process.env.RESEND_API_KEY = 're_test';
      const bulk = await api('/api/admin/team/email-alerts/branch', { token: owner, method: 'PUT', body: { branchId: branch.id, enabled: true } });
      assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
      assert.deepEqual(bulk.body.changed, [inBranch.id]);
      const team = (await api('/api/admin/team', { token: owner })).body;
      assert.equal(team.find((m) => m.id === inBranch.id).emailAlerts, true);
      assert.equal(team.find((m) => m.id === outside.id).emailAlerts, false);
      // Also switched on for someone who is not in the branch and cannot open this community.
      await emailAlerts(outside.id, true);

      sent.length = 0;
      // Without a phone or any booking: every new person counts.
      assert.equal((await visit(community.id, 'a1@buyer.test')).status, 201);
      await settle();
      assert.equal(sent.length, 1, JSON.stringify(sent.map((m) => m.to)));
      assert.deepEqual(sent[0].to, ['in@branch.test']);
      assert.match(sent[0].subject, /Pat Buyer/);
      assert.match(sent[0].subject, /Mail Court/);
      assert.match(sent[0].text, /a1@buyer\.test/);
      assert.match(sent[0].text, /not given/, 'no phone was given');
      assert.equal(sent[0].reply_to, 'a1@buyer.test');

      // A returning visitor is not a new person.
      sent.length = 0;
      assert.equal((await visit(community.id, 'a1@buyer.test')).body.returning, true);
      await settle();
      assert.equal(sent.length, 0);

      // A community outside the branch reaches only people given it directly.
      await api(`/api/admin/team/${outside.id}/communities`, { token: owner, method: 'PUT', body: { communityIds: [other.id] } });
      sent.length = 0;
      await visit(other.id, 'a2@buyer.test');
      await settle();
      assert.deepEqual(sent.map((m) => m.to[0]), ['out@branch.test']);
    });

    test('switching the branch off stops it, and the test email reaches the person', async () => {
      await api('/api/admin/team/email-alerts/branch', { token: owner, method: 'PUT', body: { branchId: branch.id, enabled: false } });
      sent.length = 0;
      await visit(community.id, 'a3@buyer.test');
      await settle();
      assert.equal(sent.length, 0);
      const test = await api(`/api/admin/team/${inBranch.id}/email-alerts/test`, { token: owner, method: 'POST', body: {} });
      assert.deepEqual(test.body, { ok: true });
      assert.deepEqual(sent.at(-1).to, ['in@branch.test']);
    });
  });
}
