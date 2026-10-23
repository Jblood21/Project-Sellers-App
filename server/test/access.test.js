import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { NO_ACCESS, OWNER_ONLY, canAccess, loadAccess } from '../lib/access.js';
import { hashPassword } from '../lib/auth.js';
import { ensureAdmin } from '../index.js';
import { GIF, backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; nothing here turns them on.
delete process.env.RATE_LIMITS;

const pad = (n) => String(n).padStart(2, '0');
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test('canAccess: the owner sees any community, a member only those shared with them', () => {
  const owner = { role: 'owner', communityIds: new Set() };
  const member = { role: 'member', communityIds: new Set(['a']) };
  assert.equal(canAccess(owner, 'a'), true);
  assert.equal(canAccess(owner, 'zzz'), true);
  assert.equal(canAccess(member, 'a'), true);
  assert.equal(canAccess(member, 'b'), false);
  assert.equal(canAccess(member, undefined), false, 'a thing with no community is nobody\'s');
  assert.equal(canAccess(null, 'a'), false);
});

for (const kind of backends()) {
  describe(`who may see what: the owner and the members (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let owner; // the bootstrap account's session: the owner
    let member; // a member's session
    let memberId;
    let mine; // a community shared with the member
    let theirs; // one that is not

    const admin = (path, token, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const asOwner = (path, opts) => admin(path, owner, opts);
    const asMember = (path, opts) => admin(path, member, opts);
    const login = (email, password) => api('/api/admin/login', { method: 'POST', body: { email, password } });
    const share = (id, communityIds, token = owner) => admin(`/team/${id}/communities`, token, { method: 'PUT', body: { communityIds } });
    const signUp = async (cid, who) => {
      const res = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { phone: '', ...who } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.lead;
    };

    before(async () => {
      app = await startBackend(kind, 'access');
      ({ api, store, token: owner } = app);
      mine = (await asOwner('/communities', { method: 'POST', body: { name: 'Shared Springs' } })).body.id;
      theirs = (await asOwner('/communities', { method: 'POST', body: { name: 'Private Pines' } })).body.id;
      // Made straight in the store, as a member (the default role) with one community: the invite route is
      // covered by its own test below and by admin-team.test.js.
      memberId = (await store.createAdmin({ email: 'member@test.co', passwordHash: hashPassword('member-pw-1') })).id;
      await store.setAdminCommunities(memberId, [mine]);
      member = (await login('member@test.co', 'member-pw-1')).body.token;
      assert.ok(member, 'the member is signed in');
    });
    after(async () => {
      await app.stop();
    });

    /** One of everything a community holds, made by the owner, so every route class has a thing to point at. */
    const furnish = async (cid) => {
      const made = async (path, body, status = 201) => {
        const res = await asOwner(path, { method: 'POST', body });
        assert.equal(res.status, status, `${path}: ${JSON.stringify(res.body)}`);
        return res.body;
      };
      const home = await made(`/communities/${cid}/homes`, { name: 'The Fir' });
      const photo = await made(`/homes/${home.id}/photos`, { dataUrl: GIF });
      const highlight = await made(`/communities/${cid}/highlights`, { name: 'The Park' });
      const resource = await made(`/communities/${cid}/resources`, { kind: 'article', title: 'Welcome', body: 'Hello.' });
      const agent = await made(`/communities/${cid}/agents`, { name: 'Dana' });
      const guide = (await asOwner(`/communities/${cid}`)).body.guides[0];
      const { slots } = await made(`/communities/${cid}/slots`, { dates: [futureDate(3)], times: ['10:00'] });
      const lead = await signUp(cid, { name: 'Lee Buyer', email: `lee@${cid}.test` });
      return { home, photo, highlight, resource, agent, guide, slot: slots[0], lead };
    };

    /**
     * Every admin route that is about a community or something in it, with a body that passes and the status the
     * owner gets. The removals come last and each removes something made above, so one pass through the list
     * leaves a community the way it was found, give or take a second home. The report answers 400 because no
     * report address is saved: a refusal from inside the route, after the access check has let the caller in.
     */
    const routes = (cid, o) => [
      ['GET', `/communities/${cid}`, undefined, 200],
      ['PATCH', `/communities/${cid}`, { location: 'Up the hill' }, 200],
      ['POST', `/communities/${cid}/rates/check`, {}, 200],
      ['POST', `/communities/${cid}/homes`, { name: 'The Pine' }, 201],
      ['PATCH', `/homes/${o.home.id}`, { price: 425000 }, 200],
      ['PUT', `/homes/${o.home.id}/photos/order`, { ids: [o.photo.id] }, 200],
      ['POST', `/homes/${o.home.id}/photos`, { dataUrl: GIF }, 201],
      ['POST', `/homes/${o.home.id}/floorplans`, { dataUrl: GIF }, 201],
      ['DELETE', `/homes/${o.home.id}/video`, undefined, 204],
      ['POST', `/communities/${cid}/highlights`, { name: 'The Pool' }, 201],
      ['PATCH', `/highlights/${o.highlight.id}`, { detail: '2 min walk' }, 200],
      ['POST', `/highlights/${o.highlight.id}/photos`, { dataUrl: GIF }, 201],
      ['POST', `/communities/${cid}/resources`, { kind: 'article', title: 'Second', body: 'More.' }, 201],
      ['PATCH', `/resources/${o.resource.id}`, { title: 'Welcome!' }, 200],
      ['POST', `/communities/${cid}/agents`, { name: 'Kim' }, 201],
      ['PATCH', `/agents/${o.agent.id}`, { phone: '801-555-0100' }, 200],
      ['POST', `/agents/${o.agent.id}/photo`, { dataUrl: GIF }, 201],
      ['POST', `/agents/${o.agent.id}/logo`, { dataUrl: GIF }, 201],
      ['POST', `/communities/${cid}/photos/hero`, { dataUrl: GIF }, 201],
      ['GET', `/guides/${o.guide.id}`, undefined, 200],
      ['POST', `/communities/${cid}/guides`, { title: 'A new guide' }, 201],
      ['POST', `/communities/${cid}/guides/restore-defaults`, {}, 200],
      ['PATCH', `/guides/${o.guide.id}`, { note: 'Updated' }, 200],
      ['POST', `/guides/${o.guide.id}/image`, { dataUrl: GIF }, 201],
      ['DELETE', `/guides/${o.guide.id}/image`, undefined, 200],
      ['GET', `/communities/${cid}/slots`, undefined, 200],
      ['POST', `/communities/${cid}/slots`, { dates: [futureDate(5)], times: ['14:00'] }, 201],
      ['GET', `/communities/${cid}/leads`, undefined, 200],
      ['GET', `/leads/${o.lead.id}`, undefined, 200],
      ['GET', `/leads/${o.lead.id}/consents`, undefined, 200],
      ['PATCH', `/leads/${o.lead.id}`, { notes: 'Called back' }, 200],
      ['POST', `/communities/${cid}/report`, {}, 400],
      ['GET', `/communities/${cid}/reports/leads.pdf`, undefined, 200],
      ['GET', `/leads/${o.lead.id}/report.pdf`, undefined, 200],
      ['GET', `/leads/${o.lead.id}/mismo`, undefined, 200],
      ['DELETE', `/photos/${o.photo.id}`, undefined, 204],
      ['DELETE', `/slots/${o.slot.id}`, undefined, 204],
      ['DELETE', `/agents/${o.agent.id}`, undefined, 204],
      ['DELETE', `/resources/${o.resource.id}`, undefined, 204],
      ['DELETE', `/highlights/${o.highlight.id}`, undefined, 204],
      ['DELETE', `/guides/${o.guide.id}`, undefined, 204],
      ['DELETE', `/homes/${o.home.id}`, undefined, 204],
    ];

    test('/me and the sign-in answer say the role', async () => {
      const me = (await asOwner('/me')).body;
      assert.equal(me.role, 'owner');
      assert.equal(me.email, 'admin@test.co');
      assert.deepEqual(Object.keys(me).sort(), ['email', 'id', 'role']);
      const them = (await asMember('/me')).body;
      assert.equal(them.role, 'member');
      assert.equal(them.id, memberId);
      const signedIn = await login('member@test.co', 'member-pw-1');
      assert.deepEqual(signedIn.body.admin, { id: memberId, email: 'member@test.co', role: 'member' });
      assert.equal((await login('admin@test.co', 'pw123456')).body.admin.role, 'owner');
    });

    test('a member can read and change everything inside a community shared with them', async () => {
      const things = await furnish(mine);
      for (const [method, path, body, status] of routes(mine, things)) {
        const res = await asMember(path, { method, body });
        assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(res.body)}`);
      }
      // A thing that does not exist is still not found, for a member as for the owner.
      assert.equal((await asMember('/homes/no-such-home', { method: 'PATCH', body: { price: 1 } })).status, 404);
      assert.equal((await asOwner('/homes/no-such-home', { method: 'PATCH', body: { price: 1 } })).status, 404);
      assert.equal((await asMember('/leads/no-such-lead')).status, 404);
    });

    test('and is refused, with one sentence, on every route about another community', async () => {
      const things = await furnish(theirs);
      for (const [method, path, body] of routes(theirs, things)) {
        const res = await asMember(path, { method, body });
        assert.equal(res.status, 403, `${method} ${path}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error, NO_ACCESS, `${method} ${path}`);
      }
      // Nothing in the list above changed anything: the owner's pass below finds the community as furnished.
      assert.equal((await asOwner(`/communities/${theirs}`)).body.homes.length, 1);
      assert.equal((await asOwner(`/communities/${theirs}`)).body.homes[0].price, 450000, 'the member\'s PATCH did not land');
      // The owner passes everywhere.
      for (const [method, path, body, status] of routes(theirs, things)) {
        const res = await asOwner(path, { method, body });
        assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(res.body)}`);
      }
    });

    test('making and deleting a community, the team and the activity log are the owner\'s alone', async () => {
      for (const [method, path, body] of [
        ['POST', '/communities', { name: 'Not Allowed' }],
        ['DELETE', `/communities/${mine}`],
        ['GET', '/team'],
        ['POST', '/team/invites', { email: 'nope@test.co' }],
        ['POST', `/team/invites/${memberId}/resend`, {}],
        ['PUT', `/team/${memberId}/communities`, { communityIds: [theirs] }],
        ['DELETE', `/team/${memberId}`],
        ['GET', '/activity'],
      ]) {
        const res = await asMember(path, { method, body });
        assert.equal(res.status, 403, `${method} ${path}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error, OWNER_ONLY, `${method} ${path}`);
      }
      assert.equal((await asOwner(`/communities/${mine}`)).status, 200, 'the community the member may see is still there');
      assert.equal((await asOwner('/communities')).body.length, 2, 'and no community was made');
      assert.deepEqual(await store.listAdminCommunities(memberId), [mine], 'and the member still has theirs');
      assert.ok(await store.getAdminById(memberId), 'and their account');
    });

    test('a member\'s community list, and Today, hold only what is shared with them', async () => {
      // Someone in the other community who agreed to calls: on the owner's Today, never on the member's.
      await signUp(theirs, { name: 'Ready Rae', email: 'rae@private.test', phone: '(801) 555-0199', consent: true });
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [mine]);
      assert.deepEqual((await asOwner('/communities')).body.map((c) => c.id).sort(), [mine, theirs].sort());

      const ownerToday = (await asOwner('/today')).body;
      const memberToday = (await asMember('/today')).body;
      assert.equal(ownerToday.totals.communities, 2);
      assert.equal(ownerToday.totals.ready, 1);
      assert.deepEqual(memberToday.communities.map((c) => c.id), [mine]);
      assert.equal(memberToday.totals.communities, 1);
      assert.equal(memberToday.totals.ready, 0, 'the person in the other community is not counted');
      assert.ok(memberToday.totals.people < ownerToday.totals.people);
      assert.ok(!memberToday.ready.some((p) => p.communityId === theirs));
      assert.ok(!memberToday.calls.some((c) => c.communityId === theirs));
    });

    test('the Team page lists each person\'s role and communities', async () => {
      const rows = (await asOwner('/team')).body;
      const me = rows.find((r) => r.email === 'admin@test.co');
      const them = rows.find((r) => r.id === memberId);
      assert.equal(me.role, 'owner');
      assert.deepEqual(me.communityIds, []);
      assert.equal(them.role, 'member');
      assert.deepEqual(them.communityIds, [mine]);
      // The same facts, for a caller outside a request.
      assert.deepEqual(await loadAccess(memberId), { role: 'member', communityIds: new Set([mine]) });
      assert.deepEqual(await loadAccess(me.id), { role: 'owner', communityIds: new Set() });
      assert.equal(await loadAccess('no-such-admin'), null);
    });

    test('the owner replaces a member\'s communities, and the member sees the change at once', async () => {
      const put = await share(memberId, [theirs, 'no-such-community']);
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.deepEqual(put.body.communityIds, [theirs], 'an unknown id is ignored, and what was shared before is withdrawn');
      assert.equal(put.body.role, 'member');
      assert.equal((await asMember(`/communities/${theirs}`)).status, 200, 'the new one opens at once');
      const gone = await asMember(`/communities/${mine}`);
      assert.equal(gone.status, 403, 'and the withdrawn one is refused at once');
      assert.equal(gone.body.error, NO_ACCESS);
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [theirs]);
      assert.deepEqual(await store.listAdminCommunities(memberId), [theirs]);

      const both = await share(memberId, [theirs, mine]);
      assert.deepEqual(both.body.communityIds, [mine, theirs], 'in the order the communities were made, whatever order was sent');
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [mine, theirs]);

      const none = await share(memberId, []);
      assert.deepEqual(none.body.communityIds, []);
      assert.deepEqual((await asMember('/communities')).body, [], 'nothing shared, nothing listed');
      assert.equal((await asMember('/today')).body.totals.communities, 0);
      assert.equal((await asMember(`/communities/${mine}`)).status, 403);
      assert.equal((await asMember('/me')).status, 200, 'but still signed in');

      // Back to the one community for the tests below.
      assert.deepEqual((await share(memberId, [mine])).body.communityIds, [mine]);
      assert.equal((await asMember(`/communities/${mine}`)).status, 200);
    });

    test('a list that is not one, the owner\'s row and a missing row are refused', async () => {
      for (const body of [{}, { communityIds: mine }, { communityIds: [1] }, { communityIds: 'all' }]) {
        const res = await asOwner(`/team/${memberId}/communities`, { method: 'PUT', body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error, 'Send communityIds as a list of community ids.');
      }
      assert.deepEqual(await store.listAdminCommunities(memberId), [mine], 'nothing changed');
      const ownerId = (await asOwner('/me')).body.id;
      const own = await share(ownerId, [mine]);
      assert.equal(own.status, 400);
      assert.equal(own.body.error, 'The owner has every community already.');
      assert.equal((await share('no-such-admin', [mine])).status, 404);
    });

    test('an invite can share communities from the start', async () => {
      const res = await asOwner('/team/invites', { method: 'POST', body: { email: 'new@test.co', communityIds: [theirs, 'ghost'] } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.admin.role, 'member');
      assert.deepEqual(res.body.admin.communityIds, [theirs]);
      assert.deepEqual(await store.listAdminCommunities(res.body.admin.id), [theirs]);
      const listed = (await asOwner('/team')).body.find((r) => r.email === 'new@test.co');
      assert.deepEqual(listed.communityIds, [theirs]);

      const plain = await asOwner('/team/invites', { method: 'POST', body: { email: 'plain@test.co' } });
      assert.equal(plain.status, 200);
      assert.deepEqual(plain.body.admin.communityIds, [], 'an invite with no communities is fine');

      const bad = await asOwner('/team/invites', { method: 'POST', body: { email: 'bad@test.co', communityIds: 'theirs' } });
      assert.equal(bad.status, 400);
      assert.equal(await store.getAdminByEmail('bad@test.co'), null, 'and nothing was made for a list that is not one');
    });

    test('removing a member drops their assignments; deleting a community drops it from every member', async () => {
      const leaving = (await asOwner('/team/invites', { method: 'POST', body: { email: 'leaving@test.co', communityIds: [mine, theirs] } })).body.admin;
      assert.deepEqual(await store.listAdminCommunities(leaving.id), [mine, theirs]);
      assert.equal((await asOwner(`/team/${leaving.id}`, { method: 'DELETE' })).status, 204);
      assert.deepEqual(await store.listAdminCommunities(leaving.id), []);
      assert.ok(!(await store.listAdminAssignments()).some((a) => a.adminId === leaving.id), 'no assignment is left pointing at the row');

      const extra = (await asOwner('/communities', { method: 'POST', body: { name: 'Short Lived' } })).body.id;
      assert.deepEqual((await share(memberId, [mine, extra])).body.communityIds, [mine, extra]);
      assert.equal((await asMember(`/communities/${extra}`)).status, 200);
      assert.equal((await asOwner(`/communities/${extra}`, { method: 'DELETE' })).status, 204);
      assert.deepEqual(await store.listAdminCommunities(memberId), [mine]);
      assert.deepEqual((await asOwner('/team')).body.find((r) => r.id === memberId).communityIds, [mine]);
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [mine]);
      const gone = await asMember(`/communities/${extra}`);
      assert.equal(gone.status, 403, 'a community that was taken away answers as any other that is not theirs');
      assert.equal(gone.body.error, NO_ACCESS);
    });

    test('a removed member is signed out, and their session stays dead', async () => {
      const row = await store.createAdmin({ email: 'brief@test.co', passwordHash: hashPassword('brief-pw-123') });
      await store.setAdminCommunities(row.id, [mine]);
      const session = (await login('brief@test.co', 'brief-pw-123')).body.token;
      assert.equal((await admin(`/communities/${mine}`, session)).status, 200);
      assert.equal((await asOwner(`/team/${row.id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await admin(`/communities/${mine}`, session)).status, 401);
      assert.equal((await admin('/communities', session)).status, 401);
    });

    // Last: it changes who the owner is.
    test('at every start the ADMIN_EMAIL account is the owner; with none set, the oldest account is', async () => {
      const withEnv = async (email, password, fn) => {
        const was = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
        if (email) process.env.ADMIN_EMAIL = email; else delete process.env.ADMIN_EMAIL;
        if (password) process.env.ADMIN_PASSWORD = password; else delete process.env.ADMIN_PASSWORD;
        try {
          await ensureAdmin(store);
          return await fn();
        } finally {
          if (was.email === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = was.email;
          if (was.password === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = was.password;
        }
      };
      const ownerId = (await asOwner('/me')).body.id;
      // A member who cannot see the other community, then named in ADMIN_EMAIL: the owner from the next start, and
      // seeing everything at once, since the start clears what this instance had cached for them.
      assert.equal((await asMember(`/communities/${theirs}`)).status, 403);
      await withEnv('Member@Test.co', 'set-in-render-1', async () => {
        assert.equal((await store.getAdminById(memberId)).role, 'owner', 'as typed in the dashboard, whatever the case');
        assert.equal((await store.getAdminById(ownerId)).role, 'owner', 'and nobody is demoted');
        // ADMIN_PASSWORD was new, so the password changed and the old session ended, as it does for the owner.
        const fresh = (await login('member@test.co', 'set-in-render-1')).body.token;
        assert.equal((await admin('/me', fresh)).body.role, 'owner');
        assert.equal((await admin(`/communities/${theirs}`, fresh)).status, 200);
        assert.equal((await admin('/team', fresh)).status, 200);
      });
      // The same start again changes nothing.
      await withEnv('member@test.co', 'set-in-render-1', async () => {
        assert.equal((await store.getAdminById(memberId)).role, 'owner');
      });

      // Nobody is the owner (a store from before roles) and ADMIN_EMAIL is not set: the oldest account becomes it.
      for (const row of await store.listAdmins()) await store.updateAdmin(row.id, { role: 'member' });
      await withEnv(null, null, async () => {
        const admins = await store.listAdmins();
        assert.equal(admins[0].email, 'admin@test.co', 'the harness account is the oldest');
        assert.equal(admins[0].role, 'owner');
        assert.ok(admins.slice(1).every((a) => a.role === 'member'), 'and only it');
      });
      // With an owner in place and no ADMIN_EMAIL, a start leaves the roles as they are.
      await store.updateAdmin(memberId, { role: 'owner' });
      await store.updateAdmin(ownerId, { role: 'member' });
      await withEnv(null, null, async () => {
        assert.equal((await store.getAdminById(ownerId)).role, 'member');
        assert.equal((await store.getAdminById(memberId)).role, 'owner');
      });
      // ADMIN_EMAIL alone (no password) still names the owner.
      await withEnv('admin@test.co', null, async () => {
        assert.equal((await store.getAdminById(ownerId)).role, 'owner');
      });
    });
  });
}
