import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ACTIONS, describeAction, isAction } from '../../shared/adminActivity.js';
import { OWNER_ONLY } from '../lib/access.js';
import { hashPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { GIF, backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; nothing here turns them on.
delete process.env.RATE_LIMITS;

const pad = (n) => String(n).padStart(2, '0');
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test('the labels: every key has a plain-English line, and the subject is written into it', () => {
  for (const [key, label] of Object.entries(ACTIONS)) {
    assert.match(key, /^[a-z]+\.[a-z]+$/, key);
    assert.ok(label.length > 3 && label[0] === label[0].toUpperCase(), `${key} reads as a sentence`);
    assert.ok(isAction(key));
  }
  assert.equal(describeAction('home.added', 'The Larch'), 'Added home The Larch');
  assert.equal(describeAction('team.invited', 'pat@example.com'), 'Invited pat@example.com');
  assert.equal(describeAction('report.sent', 'Willow Creek'), 'Sent the lead report', 'a label with no slot stands as it is');
  assert.equal(describeAction('guide.restored', 'Willow Creek'), 'Restored the default guides in Willow Creek');
  assert.equal(describeAction('home.added', ''), 'Added home …', 'a missing subject never leaves a hole');
  assert.equal(describeAction('something.new', 'x'), 'something.new', 'a key this client does not know still reads');
  assert.equal(isAction('something.new'), false);
});

for (const kind of backends()) {
  describe(`the activity log: what everyone did, for the owner to read (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let owner;
    let member;
    let memberId;
    let cid; // the community most of the lines are about
    let restoreMail = () => {};

    const admin = (path, token, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const activity = (query = '', token = owner) => admin(`/activity${query}`, token);
    const login = (email, password) => api('/api/admin/login', { method: 'POST', body: { email, password } });

    before(async () => {
      app = await startBackend(kind, 'activity');
      ({ api, store, token: owner } = app);
      memberId = (await store.createAdmin({ email: 'member@test.co', passwordHash: hashPassword('member-pw-1') })).id;
      member = (await login('member@test.co', 'member-pw-1')).body.token;
      // The report goes out through a fake transport, so report.sent can be written.
      restoreMail = setTransportForTests(async () => ({ id: 'x' }));
      process.env.RESEND_API_KEY = 'test-key';
      process.env.EMAIL_FROM = 'Touradoor <hello@activity.test>';
    });
    after(async () => {
      restoreMail();
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      await app.stop();
    });

    test('is the owner\'s to read', async () => {
      assert.equal((await api('/api/admin/activity')).status, 401);
      const res = await activity('', member);
      assert.equal(res.status, 403);
      assert.equal(res.body.error, OWNER_ONLY);
    });

    test('starts empty', async () => {
      const res = await activity();
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { entries: [], nextBefore: null });
    });

    // Every line the walk below should have written, oldest first: what, about what, where, and by whom.
    const expected = [];
    const OWNER = 'admin@test.co';
    const MEMBER = 'member@test.co';

    test('every change writes one line saying who did what, to what, and where', async () => {
      /** Makes the request, checks it went, and notes the line it should have written. */
      const did = async (token, method, path, body, status, line) => {
        const res = await admin(path, token, { method, body });
        assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(res.body)}`);
        expected.push({ email: token === owner ? OWNER : MEMBER, ...line });
        return res.body;
      };
      const asOwner = (...args) => did(owner, ...args);
      const asMember = (...args) => did(member, ...args);

      // The community, and its setup.
      const community = await asOwner('POST', '/communities', { name: 'Log Lake' }, 201, { action: 'community.created', subject: 'Log Lake' });
      cid = community.id;
      await asOwner('PATCH', `/communities/${cid}`, { name: 'Log Lake Estates', settings: { teamEmail: 'team@log.test' } }, 200,
        { action: 'community.updated', subject: 'Log Lake Estates', detail: /details, settings/ });
      const NAME = 'Log Lake Estates';
      await asOwner('POST', `/communities/${cid}/rates/check`, {}, 200, { action: 'community.updated', subject: NAME, detail: /rate inbox/ });
      await asOwner('POST', `/communities/${cid}/photos/logo`, { dataUrl: GIF }, 201, { action: 'community.updated', subject: NAME, detail: /changed the development logo/ });
      const { logo } = (await admin(`/communities/${cid}`, owner)).body;
      await asOwner('DELETE', `/photos/${logo.id}`, undefined, 204, { action: 'community.updated', subject: NAME, detail: /removed the development logo/ });

      // A home, worked on by the member too, once the owner has shared the community with them.
      await asOwner('PUT', `/team/${memberId}/communities`, { communityIds: [cid] }, 200,
        { action: 'team.assigned', subject: MEMBER, detail: new RegExp(`Now has access to: ${NAME}`), community: null });
      const home = await asOwner('POST', `/communities/${cid}/homes`, { name: 'The Larch', price: 450000 }, 201, { action: 'home.added', subject: 'The Larch' });
      await asMember('PATCH', `/homes/${home.id}`, { price: 500000, availability: 'Move-in ready' }, 200, { action: 'home.updated', subject: 'The Larch', detail: /price, availability/ });
      await asMember('PATCH', `/homes/${home.id}`, { videoLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, 200, { action: 'home.video', subject: 'The Larch', detail: /set a video link/ });
      const photo = await asOwner('POST', `/homes/${home.id}/photos`, { dataUrl: GIF }, 201, { action: 'home.photos', subject: 'The Larch', detail: /added a photo/ });
      await asOwner('PUT', `/homes/${home.id}/photos/order`, { ids: [photo.id] }, 200, { action: 'home.photos', subject: 'The Larch', detail: /reordered/ });
      await asOwner('DELETE', `/photos/${photo.id}`, undefined, 204, { action: 'home.photos', subject: 'The Larch', detail: /removed a photo/ });
      const plan = await asOwner('POST', `/homes/${home.id}/floorplans`, { dataUrl: GIF }, 201, { action: 'home.photos', subject: 'The Larch', detail: /added a floor plan/ });
      await asOwner('DELETE', `/photos/${plan.id}`, undefined, 204, { action: 'home.photos', subject: 'The Larch', detail: /removed a floor plan/ });
      await asOwner('DELETE', `/homes/${home.id}/video`, undefined, 204, { action: 'home.video', subject: 'The Larch', detail: /removed the walkthrough/ });

      // The area guide.
      const place = await asOwner('POST', `/communities/${cid}/highlights`, { name: 'Pine Park' }, 201, { action: 'highlight.added', subject: 'Pine Park' });
      await asOwner('PATCH', `/highlights/${place.id}`, { name: 'Pine Park Trail' }, 200, { action: 'highlight.updated', subject: 'Pine Park Trail' });
      await asOwner('POST', `/highlights/${place.id}/photos`, { dataUrl: GIF }, 201, { action: 'highlight.updated', subject: 'Pine Park Trail', detail: /changed the photo/ });
      await asOwner('DELETE', `/highlights/${place.id}`, undefined, 204, { action: 'highlight.deleted', subject: 'Pine Park Trail' });

      // Learn.
      const article = await asOwner('POST', `/communities/${cid}/resources`, { kind: 'article', title: 'Welcome', body: 'Hi.' }, 201, { action: 'resource.added', subject: 'Welcome', detail: /an article/ });
      await asOwner('PATCH', `/resources/${article.id}`, { title: 'Welcome home' }, 200, { action: 'resource.updated', subject: 'Welcome home' });
      await asOwner('DELETE', `/resources/${article.id}`, undefined, 204, { action: 'resource.deleted', subject: 'Welcome home' });

      // Realtors.
      const agent = await asOwner('POST', `/communities/${cid}/agents`, { name: 'Dana Realtor' }, 201, { action: 'agent.added', subject: 'Dana Realtor' });
      await asOwner('PATCH', `/agents/${agent.id}`, { brokerage: 'Lake Homes' }, 200, { action: 'agent.updated', subject: 'Dana Realtor' });
      await asOwner('POST', `/agents/${agent.id}/photo`, { dataUrl: GIF }, 201, { action: 'agent.updated', subject: 'Dana Realtor', detail: /changed the photo/ });
      await asOwner('POST', `/agents/${agent.id}/logo`, { dataUrl: GIF }, 201, { action: 'agent.updated', subject: 'Dana Realtor', detail: /changed the logo/ });
      await asOwner('DELETE', `/agents/${agent.id}`, undefined, 204, { action: 'agent.deleted', subject: 'Dana Realtor' });

      // Guides: one written, one supplied and then brought back.
      const guide = await asOwner('POST', `/communities/${cid}/guides`, { title: 'Moving in', published: false }, 201, { action: 'guide.added', subject: 'Moving in', detail: /draft/ });
      await asOwner('PATCH', `/guides/${guide.id}`, { published: true, body: 'Where the boxes go, and who to ask about the keys.' }, 200, { action: 'guide.updated', subject: 'Moving in', detail: /^published$/ });
      await asOwner('POST', `/guides/${guide.id}/image`, { dataUrl: GIF }, 201, { action: 'guide.updated', subject: 'Moving in', detail: /changed the picture/ });
      await asOwner('DELETE', `/guides/${guide.id}/image`, undefined, 200, { action: 'guide.updated', subject: 'Moving in', detail: /default picture/ });
      const supplied = (await admin(`/communities/${cid}`, owner)).body.guides.find((g) => g.defaultKey);
      await asOwner('DELETE', `/guides/${supplied.id}`, undefined, 204, { action: 'guide.deleted', subject: supplied.title });
      await asOwner('POST', `/communities/${cid}/guides/restore-defaults`, {}, 200, { action: 'guide.restored', subject: NAME, detail: /1 guide came back/ });

      // Times.
      const [d1, d2] = [futureDate(4), futureDate(5)];
      const { slots } = await asOwner('POST', `/communities/${cid}/slots`, { dates: [d1, d2], times: ['10:00'] }, 201, { action: 'slot.added', subject: '2 time slots', detail: new RegExp(`on ${d1}, ${d2}`) });
      await asOwner('DELETE', `/slots/${slots[0].id}`, undefined, 204, { action: 'slot.deleted', subject: `${slots[0].date} ${slots[0].time}` });

      // A lead, and the report about them.
      const signedUp = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { name: 'Pat Buyer', email: 'pat@log.test', phone: '' } });
      assert.equal(signedUp.status, 201);
      await asMember('PATCH', `/leads/${signedUp.body.lead.id}`, { status: 'contacted', notes: 'Rang them', archived: true }, 200,
        { action: 'lead.updated', subject: 'Pat Buyer', detail: /marked contacted, changed the notes, closed/ });
      await asOwner('PATCH', `/communities/${cid}`, { settings: { reportEmail: 'sales@log.test' } }, 200, { action: 'community.updated', subject: NAME, detail: /settings/ });
      await asOwner('POST', `/communities/${cid}/report`, {}, 200, { action: 'report.sent', subject: NAME, detail: /to sales@log\.test/ });

      // The team: these lines are about nobody's community.
      const invited = await asOwner('POST', '/team/invites', { email: 'newbie@test.co', communityIds: [cid] }, 200,
        { action: 'team.invited', subject: 'newbie@test.co', detail: new RegExp(`Given access to: ${NAME}`), community: null });
      await asOwner('POST', `/team/invites/${invited.admin.id}/resend`, {}, 200, { action: 'team.invited', subject: 'newbie@test.co', detail: /Sent the invite again/, community: null });
      await asOwner('PUT', `/team/${invited.admin.id}/communities`, { communityIds: [] }, 200, { action: 'team.assigned', subject: 'newbie@test.co', detail: /no communities/, community: null });
      await asOwner('DELETE', `/team/${invited.admin.id}`, undefined, 204, { action: 'team.removed', subject: 'newbie@test.co', community: null });

      // A community that comes and goes: its lines stay, and only forget which community they were about.
      const brief = await asOwner('POST', '/communities', { name: 'Short Lived' }, 201, { action: 'community.created', subject: 'Short Lived', community: null });
      await asOwner('DELETE', `/communities/${brief.id}`, undefined, 204, { action: 'community.deleted', subject: 'Short Lived', community: null });

      // And the member who wrote some of this is removed: their lines keep their address.
      await asOwner('DELETE', `/team/${memberId}`, undefined, 204, { action: 'team.removed', subject: MEMBER, community: null });

      const res = await activity('?limit=200');
      assert.equal(res.status, 200);
      const { entries } = res.body;
      assert.equal(entries.length, expected.length, 'one line per change, and nothing else');
      assert.equal(res.body.nextBefore, null);
      const oldestFirst = [...entries].reverse();
      oldestFirst.forEach((entry, i) => {
        const want = expected[i];
        const where = `line ${i + 1} (${want.action} ${want.subject})`;
        assert.equal(entry.action, want.action, where);
        assert.equal(entry.subject, want.subject, where);
        assert.equal(entry.admin.email, want.email, where);
        assert.ok(entry.admin.id, where);
        if (want.detail) assert.match(entry.detail, want.detail, `${where}: ${entry.detail}`);
        if (want.community === null) assert.equal(entry.community, null, where);
        else assert.deepEqual(entry.community, { id: cid, name: NAME }, where);
        assert.ok(isAction(entry.action), `${where}: a key the labels know`);
        assert.equal(typeof describeAction(entry.action, entry.subject), 'string');
        assert.ok(!Number.isNaN(new Date(entry.at).getTime()), `${where}: a readable time`);
        assert.deepEqual(Object.keys(entry).sort(), ['action', 'admin', 'at', 'community', 'detail', 'id', 'subject']);
      });
      for (let i = 1; i < entries.length; i += 1) {
        assert.ok(entries[i - 1].at >= entries[i].at, 'newest first');
      }
      const theirs = entries.filter((e) => e.admin.email === MEMBER);
      assert.equal(theirs.length, 3, 'the removed member\'s lines are still here');
      assert.ok(theirs.every((e) => e.admin.id === memberId));
    });

    test('filters by person and by community', async () => {
      const byPerson = (await activity(`?adminId=${memberId}`)).body.entries;
      assert.equal(byPerson.length, 3);
      assert.ok(byPerson.every((e) => e.admin.id === memberId));
      const inCommunity = (await activity(`?communityId=${cid}`)).body.entries;
      assert.ok(inCommunity.length > 20);
      assert.ok(inCommunity.every((e) => e.community?.id === cid));
      assert.ok(!inCommunity.some((e) => e.action.startsWith('team.') || e.action === 'community.deleted'));
      const both = (await activity(`?communityId=${cid}&adminId=${memberId}`)).body.entries;
      assert.equal(both.length, 3);
      assert.deepEqual((await activity('?adminId=nobody')).body, { entries: [], nextBefore: null });
      assert.deepEqual((await activity('?communityId=nowhere')).body, { entries: [], nextBefore: null });
    });

    test('pages newest first with a cursor, and the Today card takes the first five', async () => {
      const all = (await activity('?limit=200')).body.entries;
      const first = (await activity('?limit=5')).body;
      assert.equal(first.entries.length, 5);
      assert.deepEqual(first.entries.map((e) => e.id), all.slice(0, 5).map((e) => e.id));
      assert.equal(typeof first.nextBefore, 'string', 'there is more');

      const seen = [...first.entries];
      let cursor = first.nextBefore;
      let pages = 1;
      while (cursor) {
        const page = (await activity(`?limit=5&before=${encodeURIComponent(cursor)}`)).body;
        assert.ok(page.entries.length >= 1 && page.entries.length <= 5);
        seen.push(...page.entries);
        cursor = page.nextBefore;
        pages += 1;
        assert.ok(pages < 100, 'the cursor moves');
      }
      assert.deepEqual(seen.map((e) => e.id), all.map((e) => e.id), 'every line once, in the same order, across the pages');
      assert.equal(new Set(seen.map((e) => e.id)).size, all.length);
      // The cursor and a filter together.
      const mine = (await activity(`?adminId=${memberId}&limit=2`)).body;
      assert.equal(mine.entries.length, 2);
      const rest = (await activity(`?adminId=${memberId}&limit=2&before=${encodeURIComponent(mine.nextBefore)}`)).body;
      assert.equal(rest.entries.length, 1);
      assert.equal(rest.nextBefore, null);
      assert.ok(rest.entries[0].at <= mine.entries[1].at);

      for (const query of ['?limit=0', '?limit=x', '?limit=2.5', '?before=garbage']) {
        assert.equal((await activity(query)).status, 400, query);
      }
      assert.equal((await activity('?limit=5000')).status, 200, 'a page larger than the cap is simply capped');
    });

    test('a log that cannot be written does not fail the change it is about', async () => {
      const real = store.addAdminActivity;
      store.addAdminActivity = async () => { throw new Error('the log is down'); };
      let home;
      try {
        home = await admin(`/communities/${cid}/homes`, owner, { method: 'POST', body: { name: 'The Quiet One', price: 450000 } });
      } finally {
        store.addAdminActivity = real;
      }
      assert.equal(home.status, 201, 'the home was made');
      assert.ok((await admin(`/communities/${cid}`, owner)).body.homes.some((h) => h.name === 'The Quiet One'));
      assert.ok(!(await activity('?limit=5')).body.entries.some((e) => e.subject === 'The Quiet One'), 'and the line is simply missing');
    });
  });
}
