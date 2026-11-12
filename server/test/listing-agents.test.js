import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { MAX_AGENTS, MAX_LISTING_AGENTS, TEAM_NAME_MAX, maxAgentsFor } from '../../shared/domain.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * Who shows a listing: one agent, several, or a team with a name. A listing takes more names than a community's realtors
 * (a team has more people), the mode is checked, and buyers get the mode and the team's name.
 */
describe('listing agents (shared)', () => {
  test('a listing takes more agents than a community', () => {
    assert.equal(maxAgentsFor({ settings: { siteKind: 'listing' } }), MAX_LISTING_AGENTS);
    assert.equal(maxAgentsFor({ settings: {} }), MAX_AGENTS);
    assert.ok(MAX_LISTING_AGENTS > MAX_AGENTS);
  });
});

for (const kind of backends()) {
  describe(`listing agents (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let listing;
    let community;

    before(async () => {
      app = await startBackend(kind, 'listing-agents');
      ({ api, token: owner } = app);
      listing = (await api('/api/admin/communities', {
        token: owner, method: 'POST', body: { kind: 'listing', address: '5 Team Way', price: '500000', agentName: 'Lead Agent' },
      })).body;
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Plain Place' } })).body;
    });
    after(async () => { await app.stop(); });

    const setSettings = (id, settings) => api(`/api/admin/communities/${id}`, { token: owner, method: 'PATCH', body: { settings } });
    const addAgent = (id, name) => api(`/api/admin/communities/${id}/agents`, { token: owner, method: 'POST', body: { name, phone: '801-555-0100' } });

    test('a listing starts with one agent shown', async () => {
      const got = (await api(`/api/admin/communities/${listing.id}`, { token: owner })).body;
      assert.equal(got.settings.agentMode, 'one');
      assert.equal(got.settings.teamName, '');
    });

    test('the mode is checked; a team has a name that is cleaned and capped', async () => {
      assert.equal((await setSettings(listing.id, { agentMode: 'army' })).status, 400);
      const ok = await setSettings(listing.id, { agentMode: 'team', teamName: `  The Whitcombe Group${'x'.repeat(200)}\n` });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.settings.agentMode, 'team');
      assert.ok(ok.body.settings.teamName.startsWith('The Whitcombe Group'));
      assert.ok(ok.body.settings.teamName.length <= TEAM_NAME_MAX);
      assert.ok(!/\n/.test(ok.body.settings.teamName));
    });

    test('a listing takes up to 8 agents and then says so; a community still takes 4', async () => {
      for (let i = 2; i <= MAX_LISTING_AGENTS; i += 1) assert.equal((await addAgent(listing.id, `Agent ${i}`)).status, 201, `agent ${i}`);
      const over = await addAgent(listing.id, 'One too many');
      assert.equal(over.status, 400);
      assert.equal(over.body.error, `Up to ${MAX_LISTING_AGENTS} agents per listing.`);
      for (let i = 1; i <= MAX_AGENTS; i += 1) assert.equal((await addAgent(community.id, `Realtor ${i}`)).status, 201);
      const full = await addAgent(community.id, 'Fifth');
      assert.equal(full.body.error, `Up to ${MAX_AGENTS} realtors per community.`);
    });

    test('buyers get the mode, the team name and every agent', async () => {
      const pub = (await api(`/api/c/${listing.id}`)).body;
      assert.equal(pub.settings.agentMode, 'team');
      assert.ok(pub.settings.teamName.startsWith('The Whitcombe'));
      assert.equal(pub.agents.length, MAX_LISTING_AGENTS);
    });

    test('going back to one agent keeps the others saved', async () => {
      assert.equal((await setSettings(listing.id, { agentMode: 'one' })).status, 200);
      const got = (await api(`/api/admin/communities/${listing.id}`, { token: owner })).body;
      assert.equal(got.settings.agentMode, 'one');
      assert.equal(got.agents.length, MAX_LISTING_AGENTS);
    });
  });
}
