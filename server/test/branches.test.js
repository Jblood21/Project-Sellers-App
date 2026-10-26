import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ACTIONS } from '../../shared/adminActivity.js';
import { NO_ACCESS, OWNER_ONLY, loadAccess } from '../lib/access.js';
import { hashPassword } from '../lib/auth.js';
import { backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; nothing here turns them on.
delete process.env.RATE_LIMITS;

const ONLY_OWNER_MOVES = 'Only the owner can move a community between branches.';
const OWNER = 'admin@test.co';

test('the log has a line for each thing done to a branch', () => {
  assert.equal(ACTIONS['branch.created'], 'Created branch {subject}');
  assert.equal(ACTIONS['branch.updated'], 'Changed branch {subject}');
  assert.equal(ACTIONS['branch.deleted'], 'Deleted branch {subject}');
});

for (const kind of backends()) {
  describe(`branches: companies or groups of communities, and who is in them (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let owner; // the bootstrap account's session: the owner
    let ownerId;
    let member; // a member's session
    let memberId;
    let alpine; let birch; let willow; let oaks; // communities, in the order they were made
    let summit; let ivory; // branches

    const admin = (path, token, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const asOwner = (path, opts) => admin(path, owner, opts);
    const asMember = (path, opts) => admin(path, member, opts);
    const login = (email, password) => api('/api/admin/login', { method: 'POST', body: { email, password } });
    const makeBranch = (name) => asOwner('/branches', { method: 'POST', body: { name } });
    const rename = (id, name) => asOwner(`/branches/${id}`, { method: 'PATCH', body: { name } });
    const setCommunities = (id, communityIds) => asOwner(`/branches/${id}/communities`, { method: 'PUT', body: { communityIds } });
    const setMembers = (id, adminIds) => asOwner(`/branches/${id}/members`, { method: 'PUT', body: { adminIds } });
    const setAccess = (id, body) => asOwner(`/team/${id}/access`, { method: 'PUT', body });
    const move = (cid, branchId, token = owner) => admin(`/communities/${cid}`, token, { method: 'PATCH', body: { branchId } });
    /** Whether the member can open the community right now: 200, or the one sentence for anything that is not theirs. */
    const opens = async (cid, status) => {
      const res = await asMember(`/communities/${cid}`);
      assert.equal(res.status, status, `${cid}: ${JSON.stringify(res.body)}`);
      if (status === 403) assert.equal(res.body.error, NO_ACCESS);
    };
    const branchRow = async (id) => (await asOwner('/branches')).body.find((b) => b.id === id);
    const teamRow = async (id) => (await asOwner('/team')).body.find((r) => r.id === id);
    /** The log's lines for one action, newest first. */
    const lines = async (action) => (await asOwner('/activity?limit=200')).body.entries.filter((e) => e.action === action);

    before(async () => {
      app = await startBackend(kind, 'branches');
      ({ api, store, token: owner } = app);
      ownerId = (await asOwner('/me')).body.id;
      const community = async (name) => (await asOwner('/communities', { method: 'POST', body: { name } })).body.id;
      alpine = await community('Summit Alpine');
      birch = await community('Summit Birch');
      willow = await community('Willow Creek');
      oaks = await community('Ivory Oaks');
      // Made straight in the store, as a member (the default role) with nothing yet: invites are covered below.
      memberId = (await store.createAdmin({ email: 'member@test.co', passwordHash: hashPassword('member-pw-1') })).id;
      member = (await login('member@test.co', 'member-pw-1')).body.token;
      assert.ok(member, 'the member is signed in');
    });
    after(async () => {
      await app.stop();
    });

    test('there are none to begin with, and they are the owner\'s alone', async () => {
      const res = await asOwner('/branches');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
      assert.equal((await api('/api/admin/branches')).status, 401);
      for (const [method, path, body] of [
        ['GET', '/branches'],
        ['POST', '/branches', { name: 'Nope' }],
        ['PATCH', '/branches/any', { name: 'Nope' }],
        ['DELETE', '/branches/any'],
        ['PUT', '/branches/any/communities', { communityIds: [] }],
        ['PUT', '/branches/any/members', { adminIds: [] }],
      ]) {
        const refused = await asMember(path, { method, body });
        assert.equal(refused.status, 403, `${method} ${path}: ${JSON.stringify(refused.body)}`);
        assert.equal(refused.body.error, OWNER_ONLY, `${method} ${path}`);
      }
      assert.deepEqual((await asOwner('/branches')).body, [], 'and nothing was made');
    });

    test('a branch has a name of 1 to 80 characters, its own in any letter case', async () => {
      const made = await makeBranch('Summit Homes');
      assert.equal(made.status, 201, JSON.stringify(made.body));
      assert.deepEqual(Object.keys(made.body).sort(), ['communityIds', 'createdAt', 'id', 'memberIds', 'name']);
      assert.equal(made.body.name, 'Summit Homes');
      assert.deepEqual(made.body.communityIds, []);
      assert.deepEqual(made.body.memberIds, []);
      assert.ok(made.body.id && made.body.createdAt, 'an id and when it was made');
      summit = made.body.id;
      for (const [name, error] of [
        ['', 'Give the branch a name.'],
        ['   ', 'Give the branch a name.'],
        ['x'.repeat(81), 'The branch name is too long (up to 80 characters).'],
        [42, 'The branch name must be text.'],
        ['summit HOMES', 'There is already a branch called summit HOMES.'],
      ]) {
        const res = await makeBranch(name);
        assert.equal(res.status, 400, JSON.stringify(name));
        assert.equal(res.body.error, error);
      }
      assert.equal((await asOwner('/branches', { method: 'POST', body: {} })).status, 400, 'no name at all');
      const trimmed = await makeBranch('  Ivory  ');
      assert.equal(trimmed.status, 201);
      assert.equal(trimmed.body.name, 'Ivory', 'trimmed');
      ivory = trimmed.body.id;
      const spare = await makeBranch('x'.repeat(80));
      assert.equal(spare.status, 201, 'eighty is fine');
      assert.deepEqual((await asOwner('/branches')).body.map((b) => b.name), ['Ivory', 'Summit Homes', 'x'.repeat(80)],
        'in name order, whatever order they were made in');
      assert.equal((await store.getBranchByName('IVORY')).id, ivory);
      assert.equal(await store.getBranchByName('Ivory Homes'), null);
      // An empty one goes as any other does; the one line it leaves says nothing was in it.
      assert.equal((await asOwner(`/branches/${spare.body.id}`, { method: 'DELETE' })).status, 204);
      assert.deepEqual((await asOwner('/branches')).body.map((b) => b.id), [ivory, summit]);
      const made3 = await lines('branch.created');
      assert.deepEqual(made3.map((e) => e.subject).reverse(), ['Summit Homes', 'Ivory', 'x'.repeat(80)]);
      assert.ok(made3.every((e) => e.community === null && e.admin.email === OWNER), 'about no community, by the owner');
      const [gone] = await lines('branch.deleted');
      assert.equal(gone.subject, 'x'.repeat(80));
      assert.equal(gone.detail, 'Kept its 0 communities and 0 people');
    });

    test('a rename keeps the same rules, and alone changes nobody\'s access', async () => {
      const res = await rename(ivory, 'Ivory Homes');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.name, 'Ivory Homes');
      assert.equal(res.body.id, ivory);
      assert.equal((await rename(ivory, 'Ivory Homes')).status, 200, 'the same name again is not a clash with itself');
      const taken = await rename(ivory, 'SUMMIT homes');
      assert.equal(taken.status, 400);
      assert.equal(taken.body.error, 'There is already a branch called SUMMIT homes.');
      assert.equal((await rename(ivory, '')).status, 400);
      assert.equal((await rename(ivory, 'y'.repeat(81))).status, 400);
      assert.equal((await rename('no-such-branch', 'Anything')).status, 404);
      assert.deepEqual((await asOwner('/branches')).body.map((b) => b.name), ['Ivory Homes', 'Summit Homes']);
      const log = await lines('branch.updated');
      assert.equal(log.length, 1, 'one line for the one rename, none for the same name again');
      assert.equal(log[0].subject, 'Ivory Homes');
      assert.equal(log[0].detail, 'Renamed from Ivory');
    });

    test('the communities of a branch are replaced whole, and a community is in one branch at most', async () => {
      const res = await setCommunities(summit, [birch, alpine, 'ghost']);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.communityIds, [alpine, birch], 'an unknown id is ignored; in the order the communities were made');
      assert.equal(res.body.name, 'Summit Homes');
      const rows = (await asOwner('/communities')).body;
      const row = (id) => rows.find((c) => c.id === id);
      assert.equal(row(alpine).branchId, summit);
      assert.equal(row(alpine).branchName, 'Summit Homes');
      assert.equal(row(birch).branchId, summit);
      assert.equal(row(willow).branchId, null);
      assert.equal(row(willow).branchName, null);
      const one = (await asOwner(`/communities/${birch}`)).body;
      assert.equal(one.branchId, summit);
      assert.equal(one.branchName, 'Summit Homes');
      // Ticked in another branch, a community leaves the one it was in.
      assert.deepEqual((await setCommunities(ivory, [birch])).body.communityIds, [birch]);
      assert.deepEqual((await branchRow(summit)).communityIds, [alpine]);
      assert.deepEqual((await branchRow(ivory)).communityIds, [birch]);
      assert.equal((await asOwner(`/communities/${birch}`)).body.branchName, 'Ivory Homes');
      // Unticked, it is in no branch.
      assert.deepEqual((await setCommunities(ivory, [])).body.communityIds, []);
      assert.equal((await asOwner(`/communities/${birch}`)).body.branchId, null);
      for (const body of [{}, { communityIds: alpine }, { communityIds: [1] }]) {
        const bad = await asOwner(`/branches/${summit}/communities`, { method: 'PUT', body });
        assert.equal(bad.status, 400, JSON.stringify(body));
        assert.equal(bad.body.error, 'Send communityIds as a list of community ids.');
      }
      assert.equal((await setCommunities('no-such-branch', [alpine])).status, 404);
      assert.deepEqual((await branchRow(summit)).communityIds, [alpine], 'nothing changed');
      const log = await lines('branch.updated');
      assert.equal(log[0].detail, 'Communities: none');
      assert.equal(log[1].detail, 'Communities: Summit Birch');
      assert.equal(log[2].detail, 'Communities: Summit Alpine, Summit Birch');
      assert.equal(log[2].subject, 'Summit Homes');
    });

    test('being in a branch is access to its communities, now and whenever one is added', async () => {
      await opens(alpine, 403);
      const res = await setMembers(summit, [memberId, ownerId, 'ghost']);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.memberIds, [memberId], 'the owner has every community by role, so is not listed; an unknown id is ignored');
      await opens(alpine, 200);
      await opens(birch, 403);
      const row = await teamRow(memberId);
      assert.deepEqual(row.branchIds, [summit]);
      assert.deepEqual(row.communityIds, []);
      assert.deepEqual((await teamRow(ownerId)).branchIds, []);
      assert.deepEqual(await loadAccess(memberId), { role: 'member', communityIds: new Set([alpine]) });
      // A community put in the branch later reaches them at once, whichever way it is put in.
      assert.deepEqual((await setCommunities(summit, [alpine, birch])).body.communityIds, [alpine, birch]);
      await opens(birch, 200);
      const moved = await move(willow, summit);
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      assert.equal(moved.body.branchId, summit);
      assert.equal(moved.body.branchName, 'Summit Homes');
      await opens(willow, 200);
      const theirs = (await asMember('/communities')).body;
      assert.deepEqual(theirs.map((c) => c.id), [alpine, birch, willow]);
      assert.deepEqual(theirs.map((c) => c.branchName), ['Summit Homes', 'Summit Homes', 'Summit Homes'], 'a member reads the branch name');
      // And one taken out, or moved elsewhere, is gone for them at once.
      const out = await move(willow, null);
      assert.equal(out.status, 200, JSON.stringify(out.body));
      assert.equal(out.body.branchId, null);
      assert.equal(out.body.branchName, null);
      await opens(willow, 403);
      assert.equal((await move(birch, ivory)).body.branchName, 'Ivory Homes');
      await opens(birch, 403);
      assert.deepEqual((await asOwner('/branches')).body.map((b) => b.communityIds), [[birch], [alpine]]);
      for (const body of [{}, { adminIds: memberId }, { adminIds: [1] }]) {
        const bad = await asOwner(`/branches/${summit}/members`, { method: 'PUT', body });
        assert.equal(bad.status, 400, JSON.stringify(body));
        assert.equal(bad.body.error, 'Send adminIds as a list of account ids.');
      }
      assert.equal((await setMembers('no-such-branch', [memberId])).status, 404);
      const moves = (await lines('community.updated')).filter((e) => /branch/.test(e.detail));
      assert.deepEqual(moves.map((e) => [e.subject, e.detail]), [
        ['Summit Birch', 'Moved to branch Ivory Homes'],
        ['Willow Creek', 'Taken out of branch Summit Homes'],
        ['Willow Creek', 'Moved to branch Summit Homes'],
      ]);
      assert.ok(moves.every((e) => e.community?.id), 'a move is a line about the community');
      assert.ok((await lines('branch.updated')).some((e) => e.subject === 'Summit Homes' && e.detail === 'People: member@test.co'));
    });

    test('Today carries the branches to group the cards under: all of them for the owner, their own for a member', async () => {
      const mine = (await asOwner('/today')).body;
      assert.deepEqual(mine.branches, [{ id: ivory, name: 'Ivory Homes' }, { id: summit, name: 'Summit Homes' }]);
      const card = (body, id) => body.communities.find((c) => c.id === id);
      assert.equal(card(mine, alpine).branchId, summit);
      assert.equal(card(mine, alpine).branchName, 'Summit Homes');
      assert.equal(card(mine, birch).branchName, 'Ivory Homes');
      assert.equal(card(mine, willow).branchId, null);
      assert.equal(card(mine, willow).branchName, null);
      const theirs = (await asMember('/today')).body;
      assert.deepEqual(theirs.communities.map((c) => c.id), [alpine]);
      assert.deepEqual(theirs.branches, [{ id: summit, name: 'Summit Homes' }], 'only the branch their communities are in');
      assert.equal(theirs.totals.communities, 1);
    });

    test('communities ticked for a person add to their branches, and leaving a branch takes only the branch\'s away', async () => {
      const put = await asOwner(`/team/${memberId}/communities`, { method: 'PUT', body: { communityIds: [willow] } });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.deepEqual(put.body.communityIds, [willow]);
      assert.deepEqual(put.body.branchIds, [summit], 'the communities route leaves the branches as they are');
      await opens(alpine, 200);
      await opens(willow, 200);
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [alpine, willow]);
      assert.deepEqual(await store.listAdminCommunities(memberId), [willow], 'the list of their own is only their own');
      assert.deepEqual(await store.listAccessibleCommunities(memberId), [alpine, willow]);
      // Out of the branch: its community goes at once, the one ticked for them stays.
      assert.deepEqual((await setMembers(summit, [])).body.memberIds, []);
      await opens(alpine, 403);
      await opens(willow, 200);
      assert.deepEqual((await teamRow(memberId)).branchIds, []);
      // Back in, through the person's own row rather than the branch's: the same thing, both parts at once.
      const back = await setAccess(memberId, { branchIds: [summit, 'ghost'], communityIds: [oaks, willow] });
      assert.equal(back.status, 200, JSON.stringify(back.body));
      assert.deepEqual(back.body.branchIds, [summit]);
      assert.deepEqual(back.body.communityIds, [willow, oaks], 'in the order the communities were made');
      assert.equal(back.body.role, 'member');
      await opens(alpine, 200);
      await opens(oaks, 200);
      assert.deepEqual((await branchRow(summit)).memberIds, [memberId]);
      // Both lists are needed: one alone would have to mean "and clear the other".
      for (const [body, error] of [
        [{ communityIds: [willow] }, 'Send branchIds as a list of branch ids.'],
        [{ branchIds: [summit] }, 'Send communityIds as a list of community ids.'],
        [{ branchIds: summit, communityIds: [] }, 'Send branchIds as a list of branch ids.'],
        [{ branchIds: [], communityIds: [2] }, 'Send communityIds as a list of community ids.'],
      ]) {
        const bad = await setAccess(memberId, body);
        assert.equal(bad.status, 400, JSON.stringify(body));
        assert.equal(bad.body.error, error);
      }
      const own = await setAccess(ownerId, { branchIds: [], communityIds: [] });
      assert.equal(own.status, 400);
      assert.equal(own.body.error, 'The owner has every community already.');
      assert.equal((await setAccess('no-such-admin', { branchIds: [], communityIds: [] })).status, 404);
      assert.deepEqual(await loadAccess(memberId), { role: 'member', communityIds: new Set([alpine, willow, oaks]) }, 'nothing changed');
      const log = await lines('team.assigned');
      assert.equal(log[0].detail, 'Now has access to: the Summit Homes branch, and Willow Creek, Ivory Oaks');
      assert.equal(log[1].detail, 'Now has access to: the Summit Homes branch, and Willow Creek');
      assert.ok(log.every((e) => e.subject === 'member@test.co' && e.community === null));
    });

    test('an invite can put the person in branches from the start', async () => {
      const res = await asOwner('/team/invites', { method: 'POST', body: { email: 'new@test.co', branchIds: [ivory, 'ghost'], communityIds: [willow] } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.admin.branchIds, [ivory]);
      assert.deepEqual(res.body.admin.communityIds, [willow]);
      const listed = await teamRow(res.body.admin.id);
      assert.deepEqual(listed.branchIds, [ivory]);
      assert.deepEqual(listed.communityIds, [willow]);
      assert.deepEqual(await store.listAccessibleCommunities(res.body.admin.id), [birch, willow]);
      assert.deepEqual((await branchRow(ivory)).memberIds, [res.body.admin.id]);
      assert.equal((await lines('team.invited'))[0].detail, 'Given access to: the Ivory Homes branch, and Willow Creek');
      const plain = await asOwner('/team/invites', { method: 'POST', body: { email: 'plain@test.co' } });
      assert.equal(plain.status, 200, JSON.stringify(plain.body));
      assert.deepEqual(plain.body.admin.branchIds, [], 'an invite with no branches is fine');
      assert.equal((await lines('team.invited'))[0].detail, 'Given access to: no communities');
      const bad = await asOwner('/team/invites', { method: 'POST', body: { email: 'bad@test.co', branchIds: ivory } });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error, 'Send branchIds as a list of branch ids.');
      assert.equal(await store.getAdminByEmail('bad@test.co'), null, 'and nothing was made for a list that is not one');
      // Removing them takes them out of their branches, as it takes their communities.
      assert.equal((await asOwner(`/team/${res.body.admin.id}`, { method: 'DELETE' })).status, 204);
      assert.deepEqual((await branchRow(ivory)).memberIds, []);
      assert.ok(!(await store.listAdminBranchAssignments()).some((a) => a.adminId === res.body.admin.id), 'no membership is left pointing at the row');
    });

    test('a member cannot move a community between branches, even one they may see', async () => {
      await opens(willow, 200);
      for (const branchId of [ivory, null, summit]) {
        const res = await move(willow, branchId, member);
        assert.equal(res.status, 400, JSON.stringify(res.body));
        assert.equal(res.body.error, ONLY_OWNER_MOVES);
      }
      assert.equal((await asOwner(`/communities/${willow}`)).body.branchId, null, 'nothing moved');
      const missing = await move(willow, 'no-such-branch');
      assert.equal(missing.status, 400);
      assert.equal(missing.body.error, 'That branch is no longer here.');
      assert.equal((await move(willow, 7)).status, 400, 'an id is a string or null');
      assert.equal((await asOwner(`/communities/${willow}`)).body.branchId, null);
      const same = await asMember(`/communities/${willow}`, { method: 'PATCH', body: { location: 'Up the hill' } });
      assert.equal(same.status, 200, 'everything else about the community is still theirs to change');
      assert.equal(same.body.location, 'Up the hill');
    });

    test('a save from the Edit community pop-up logs only what changed, so a move alone reads as a move', async () => {
      // The pop-up sends back every field it loaded, changed or not, the way a form does.
      const row = (await asOwner(`/communities/${willow}`)).body;
      const form = { name: row.name, location: row.location, builder: row.builder, websiteUrl: row.websiteUrl ?? '', status: row.status };
      const save = (body) => asOwner(`/communities/${willow}`, { method: 'PATCH', body });
      const latest = async () => (await lines('community.updated'))[0].detail;
      assert.equal((await save({ ...form, branchId: ivory })).status, 200);
      assert.equal(await latest(), 'Moved to branch Ivory Homes');
      assert.equal((await save({ ...form, name: 'Willow Creek Estates', branchId: null })).status, 200);
      assert.equal(await latest(), 'Changed details; taken out of branch Ivory Homes');
      assert.equal((await save({ ...form, branchId: null })).status, 200, 'the name back, and no move');
      assert.equal(await latest(), 'Changed details');
      const after = (await asOwner(`/communities/${willow}`)).body;
      assert.equal(after.name, 'Willow Creek');
      assert.equal(after.branchId, null);
    });

    test('deleting a branch keeps its communities and people, and drops only the access that came through it', async () => {
      // The member is in Summit Homes, which gets both Summit communities, and has Willow Creek and Ivory Oaks on their own.
      assert.deepEqual((await setCommunities(summit, [alpine, birch])).body.communityIds, [alpine, birch]);
      await opens(birch, 200);
      assert.deepEqual((await branchRow(summit)).memberIds, [memberId]);
      const res = await asOwner(`/branches/${summit}`, { method: 'DELETE' });
      assert.equal(res.status, 204);
      assert.equal(await branchRow(summit), undefined);
      assert.equal(await store.getBranch(summit), null);
      for (const cid of [alpine, birch]) {
        const row = (await asOwner(`/communities/${cid}`)).body;
        assert.equal(row.branchId, null, 'the community stays, in no branch');
        assert.equal(row.branchName, null);
      }
      assert.ok(await store.getAdminById(memberId), 'the person stays');
      const row = await teamRow(memberId);
      assert.deepEqual(row.branchIds, []);
      assert.deepEqual(row.communityIds, [willow, oaks], 'with what was ticked for them on their own');
      await opens(alpine, 403);
      await opens(birch, 403);
      await opens(willow, 200);
      await opens(oaks, 200);
      assert.deepEqual(await loadAccess(memberId), { role: 'member', communityIds: new Set([willow, oaks]) });
      assert.equal((await asOwner(`/branches/${summit}`, { method: 'DELETE' })).status, 404, 'a second removal finds nothing');
      assert.equal((await setCommunities(summit, [])).status, 404);
      assert.equal((await setMembers(summit, [])).status, 404);
      assert.equal((await move(alpine, summit)).status, 400, 'nor can a community be moved into it');
      const [gone] = await lines('branch.deleted');
      assert.equal(gone.subject, 'Summit Homes');
      assert.equal(gone.detail, 'Kept its 2 communities and 1 person');
      assert.equal(gone.community, null);
    });

    test('a community deleted out of a branch is gone for the branch\'s people at once', async () => {
      assert.deepEqual((await setCommunities(ivory, [birch, oaks])).body.communityIds, [birch, oaks]);
      assert.deepEqual((await setMembers(ivory, [memberId])).body.memberIds, [memberId]);
      await opens(birch, 200);
      assert.equal((await asOwner(`/communities/${birch}`, { method: 'DELETE' })).status, 204);
      await opens(birch, 403);
      assert.deepEqual((await branchRow(ivory)).communityIds, [oaks]);
      assert.deepEqual((await asMember('/communities')).body.map((c) => c.id), [willow, oaks]);
      assert.deepEqual((await asMember('/today')).body.branches, [{ id: ivory, name: 'Ivory Homes' }]);
    });

    test('the log has every branch action, about no community', async () => {
      const entries = (await asOwner('/activity?limit=200')).body.entries;
      const aboutBranches = entries.filter((e) => e.action.startsWith('branch.'));
      assert.ok(aboutBranches.length >= 10, `${aboutBranches.length} lines`);
      assert.ok(aboutBranches.every((e) => e.community === null && e.admin.email === OWNER));
      assert.deepEqual([...new Set(aboutBranches.map((e) => e.action))].sort(), ['branch.created', 'branch.deleted', 'branch.updated']);
      const details = aboutBranches.filter((e) => e.action === 'branch.updated').map((e) => e.detail);
      assert.ok(details.some((d) => d.startsWith('Renamed from ')), 'a rename');
      assert.ok(details.some((d) => d.startsWith('Communities: ')), 'its communities');
      assert.ok(details.some((d) => d.startsWith('People: ')), 'its people');
    });
  });
}
