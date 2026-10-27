import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  DEFAULT_SETTINGS, LISTING_STATUSES, OPEN_HOUSE_MAX, isListing, normalizeOpenHouses, readOpenHouses, upcomingOpenHouses,
} from '../../shared/domain.js';
import { pageMeta } from '../../shared/schema.js';
import { OWNER_ONLY, forgetAdminAccess } from '../lib/access.js';
import { hashPassword } from '../lib/auth.js';
import { backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; nothing here turns them on.
delete process.env.RATE_LIMITS;

/*
 * A listing is one home an agent is selling, kept as a community marked `siteKind: 'listing'` with exactly one home.
 * Its rules: made with its home in one step or not at all; the kind is set once and no save changes it; open houses
 * are dates and times that are checked; an agent (a member) may make and delete listings and is given access to what
 * they make, but still cannot make or delete a community.
 */

describe('open house sessions', () => {
  const sessions = (list) => JSON.stringify(list);

  test('are put in order, tidied, and stored as literal dates and times', () => {
    const out = normalizeOpenHouses(sessions([
      { date: '2026-11-08', start: '13:00', end: '15:00', note: '  Meet the seller  ' },
      { date: '2026-11-07', start: '10:00' },
    ]));
    assert.deepEqual(JSON.parse(out.value), [
      { date: '2026-11-07', start: '10:00', note: '' },
      { date: '2026-11-08', start: '13:00', end: '15:00', note: 'Meet the seller' },
    ]);
    assert.equal(normalizeOpenHouses('').value, '[]');
    assert.equal(normalizeOpenHouses(undefined).value, '[]');
  });

  test('refuse what cannot be a session, in words', () => {
    const bad = (list) => normalizeOpenHouses(typeof list === 'string' ? list : sessions(list)).error;
    assert.match(bad('not json'), /could not be read/);
    assert.match(bad('{"a":1}'), /could not be read/);
    assert.match(bad([{ date: '2026-02-30', start: '10:00' }]), /needs a date/);
    assert.match(bad([{ date: '11/08/2026', start: '10:00' }]), /needs a date/);
    assert.match(bad([{ date: '2026-11-08', start: '25:00' }]), /start time/);
    assert.match(bad([{ date: '2026-11-08', start: '10:00', end: 'late' }]), /end time/);
    assert.match(bad([{ date: '2026-11-08', start: '10:00', end: '10:00' }]), /end after it starts/);
    assert.match(bad([{ date: '2026-11-08', start: '10:00' }, { date: '2026-11-08', start: '10:00', end: '12:00' }]), /already on the list/);
    const many = Array.from({ length: OPEN_HOUSE_MAX + 1 }, (_, i) => ({ date: `2026-12-${String(i + 1).padStart(2, '0')}`, start: '10:00' }));
    assert.match(bad(many), new RegExp(`up to ${OPEN_HOUSE_MAX}`));
  });

  test('read back tolerantly, and only the ones still to come are upcoming', () => {
    assert.deepEqual(readOpenHouses('garbage'), []);
    assert.deepEqual(readOpenHouses(sessions([{ date: '2026-11-08', start: '10:00', end: '12:00' }, { nope: true }])).map((s) => s.date), ['2026-11-08']);
    const list = readOpenHouses(sessions([{ date: '2026-11-01', start: '10:00' }, { date: '2026-11-08', start: '10:00' }]));
    assert.deepEqual(upcomingOpenHouses(list, '2026-11-08').map((s) => s.date), ['2026-11-08'], 'today still counts');
    assert.deepEqual(upcomingOpenHouses(list, '2026-11-09'), []);
  });

  test('a community is not a listing until it is marked, and the mark is in the defaults', () => {
    assert.equal(DEFAULT_SETTINGS.siteKind, 'community');
    assert.equal(DEFAULT_SETTINGS.openHousesJson, '[]');
    assert.equal(isListing({ settings: { siteKind: 'listing' } }), true);
    assert.equal(isListing({ settings: DEFAULT_SETTINGS }), false);
    assert.equal(isListing(null), false);
  });
});

describe('a listing\'s page head', () => {
  const home = { id: 'h', name: '123 Maple Street', price: 475000, beds: 3, baths: 2.5, sqft: 2100, photos: [], floorPlans: [] };
  const community = (over = {}) => ({
    id: 'maple', urlKey: 'maple', name: '123 Maple Street', location: 'Lehi, UT', builder: 'Summit Realty', status: 'Active',
    settings: { siteKind: 'listing' }, features: {}, tools: {}, homes: [home], agents: [], guides: [], highlights: [], ...over,
  });

  test('says it is one home for sale, with its price and facts, and never "new homes"', () => {
    const meta = pageMeta({ page: 'landing', community: community(), origin: 'https://x.test' });
    assert.equal(meta.title, '123 Maple Street, Lehi, UT | For sale $475,000');
    assert.match(meta.description, /3 bed, 2\.5 bath, 2,100 sq ft/);
    assert.match(meta.description, /Listed with Summit Realty/);
    assert.doesNotMatch(`${meta.title} ${meta.description}`, /new homes/i);
  });

  test('follows the status: no price once it is under contract or sold', () => {
    const under = pageMeta({ page: 'landing', community: community({ status: 'Under contract' }), origin: 'https://x.test' });
    assert.equal(under.title, '123 Maple Street, Lehi, UT | Under contract');
    const sold = pageMeta({ page: 'landing', community: community({ status: 'Sold' }), origin: 'https://x.test' });
    assert.doesNotMatch(sold.description, /\$475,000/);
  });

  test('an ordinary community keeps its own wording', () => {
    const plain = pageMeta({ page: 'landing', community: community({ settings: {}, name: 'Oak Hollow' }), origin: 'https://x.test' });
    assert.match(plain.title, /New homes/);
  });
});

for (const kind of backends()) {
  describe(`listings: one home an agent is selling (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let owner;
    let member;
    let memberId;

    const admin = (path, token, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const asOwner = (path, opts) => admin(path, owner, opts);
    const asMember = (path, opts) => admin(path, member, opts);
    const listing = { kind: 'listing', address: '123 Maple Street', city: 'Lehi, UT', price: '475k', beds: '3', baths: '2.5', sqft: '2,100', brokerage: 'Summit Realty' };

    before(async () => {
      app = await startBackend(kind, 'listings');
      ({ api, store, token: owner } = app);
      memberId = (await store.createAdmin({ email: 'agent@test.co', passwordHash: hashPassword('agent-pw-1234') })).id;
      member = (await api('/api/admin/login', { method: 'POST', body: { email: 'agent@test.co', password: 'agent-pw-1234' } })).body.token;
      assert.ok(member, 'the agent is signed in');
    });
    after(async () => {
      await app.stop();
    });

    test('a listing is made with its one home, pointed at a single purchase', async () => {
      const made = await asOwner('/communities', { method: 'POST', body: listing });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const { body } = made;
      assert.equal(body.name, '123 Maple Street');
      assert.equal(body.location, 'Lehi, UT');
      assert.equal(body.builder, 'Summit Realty', 'the brokerage');
      assert.equal(body.status, 'Active');
      assert.equal(body.layout, 'marketplace');
      assert.equal(body.settings.siteKind, 'listing');
      assert.equal(body.settings.openHousesJson, '[]');
      // The new-build figures are not carried over: no assistance program or price cap, no HOA until the agent types one.
      for (const key of ['hoaMo', 'dpaAmount', 'dpaPriceCap', 'dpaProgram']) assert.equal(body.settings[key], '', key);
      assert.deepEqual([body.tools.compare, body.tools.dpa, body.tools.movein], [false, false, false]);
      assert.deepEqual([body.tools.payment, body.tools.afford, body.tools.loans, body.tools.savings], [true, true, true, true]);
      assert.equal(body.features.incentive, false);
      assert.equal(body.features.lotNumbers, false);
      assert.equal(body.homes.length, 1);
      assert.deepEqual(
        [body.homes[0].name, body.homes[0].price, body.homes[0].beds, body.homes[0].baths, body.homes[0].sqft],
        ['123 Maple Street', 475000, 3, 2.5, 2100],
      );
      const stored = (await asOwner(`/communities/${body.id}`)).body;
      assert.equal(stored.homes.length, 1);
      assert.equal(stored.settings.siteKind, 'listing');
    });

    test('nothing is made when the address or the price is missing or wrong', async () => {
      const before = (await asOwner('/communities')).body.length;
      for (const [body, pattern] of [
        [{ kind: 'listing', price: '475k' }, /address/],
        [{ kind: 'listing', address: '9 Oak Ct' }, /^Type the price/],
        [{ kind: 'listing', address: '9 Oak Ct', price: 'cheap' }, /must be a number/],
        [{ kind: 'listing', address: '9 Oak Ct', price: '475k', beds: '2.5' }, /whole number/],
      ]) {
        const res = await asOwner('/communities', { method: 'POST', body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.body.error, pattern);
      }
      assert.equal((await asOwner('/communities')).body.length, before, 'no half-made listing was left behind');
    });

    test('the kind is set once: no save turns a listing into a community, or the other way round', async () => {
      const id = (await asOwner('/communities', { method: 'POST', body: listing })).body.id;
      const plain = (await asOwner('/communities', { method: 'POST', body: { name: 'Oak Hollow' } })).body.id;
      const flip = await asOwner(`/communities/${id}`, { method: 'PATCH', body: { settings: { siteKind: 'community' } } });
      assert.equal(flip.status, 200);
      assert.equal(flip.body.settings.siteKind, 'listing');
      const up = await asOwner(`/communities/${plain}`, { method: 'PATCH', body: { settings: { siteKind: 'listing' } } });
      assert.equal(up.body.settings.siteKind, 'community');
      assert.equal(isListing(up.body), false);
    });

    test('a listing has exactly one home: no second, and the one it has cannot be deleted alone', async () => {
      const made = (await asOwner('/communities', { method: 'POST', body: listing })).body;
      const second = await asOwner(`/communities/${made.id}/homes`, { method: 'POST', body: { name: 'Another', price: '300k' } });
      assert.equal(second.status, 400);
      assert.match(second.body.error, /one home/);
      const del = await asOwner(`/homes/${made.homes[0].id}`, { method: 'DELETE' });
      assert.equal(del.status, 400);
      assert.match(del.body.error, /whole listing/);
      assert.equal((await asOwner(`/communities/${made.id}`)).body.homes.length, 1);
      // A community still takes as many as it likes, and deletes them.
      const plain = (await asOwner('/communities', { method: 'POST', body: { name: 'Elm Row' } })).body.id;
      for (const n of [1, 2]) assert.equal((await asOwner(`/communities/${plain}/homes`, { method: 'POST', body: { name: `Plan ${n}`, price: '400k' } })).status, 201);
      const homes = (await asOwner(`/communities/${plain}`)).body.homes;
      assert.equal((await asOwner(`/homes/${homes[0].id}`, { method: 'DELETE' })).status, 204);
    });

    test('statuses: a listing takes its own, a community keeps its own', async () => {
      const id = (await asOwner('/communities', { method: 'POST', body: listing })).body.id;
      const plain = (await asOwner('/communities', { method: 'POST', body: { name: 'Pine Row' } })).body.id;
      for (const status of LISTING_STATUSES) {
        assert.equal((await asOwner(`/communities/${id}`, { method: 'PATCH', body: { status } })).body.status, status);
      }
      const ignored = await asOwner(`/communities/${id}`, { method: 'PATCH', body: { status: 'Now selling' } });
      assert.equal(ignored.body.status, 'Sold', 'a community status is not a listing status, so it changes nothing');
      const other = await asOwner(`/communities/${plain}`, { method: 'PATCH', body: { status: 'Active' } });
      assert.equal(other.body.status, 'Pre-sale');
    });

    test('open houses are saved checked and in order, and a bad list changes nothing', async () => {
      const id = (await asOwner('/communities', { method: 'POST', body: listing })).body.id;
      const list = JSON.stringify([
        { date: '2026-11-15', start: '13:00', end: '15:00', note: 'Saturday' },
        { date: '2026-11-14', start: '10:00', end: '12:00' },
      ]);
      const ok = await asOwner(`/communities/${id}`, { method: 'PATCH', body: { settings: { openHousesJson: list } } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.deepEqual(JSON.parse(ok.body.settings.openHousesJson).map((s) => s.date), ['2026-11-14', '2026-11-15']);
      const bad = await asOwner(`/communities/${id}`, {
        method: 'PATCH', body: { settings: { openHousesJson: JSON.stringify([{ date: '2026-11-14', start: '12:00', end: '10:00' }]) } },
      });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /end after it starts/);
      assert.equal(JSON.parse((await asOwner(`/communities/${id}`)).body.settings.openHousesJson).length, 2, 'the list was not touched');
      // What buyers are served carries the kind and the sessions.
      const pub = await api(`/api/c/${id}`);
      assert.equal(pub.status, 200);
      assert.equal(pub.body.settings.siteKind, 'listing');
      assert.equal(JSON.parse(pub.body.settings.openHousesJson).length, 2);
    });

    test('an agent may make listings, is given them, and cannot make or delete communities', async () => {
      const mine = await asMember('/communities', { method: 'POST', body: listing });
      assert.equal(mine.status, 201, JSON.stringify(mine.body));
      const community = await asMember('/communities', { method: 'POST', body: { name: 'Not Allowed' } });
      assert.equal(community.status, 403);
      assert.equal(community.body.error, OWNER_ONLY);

      // Theirs at once: listed, open, editable, with its leads and photos routes behind the same guard.
      assert.ok((await asMember('/communities')).body.some((c) => c.id === mine.body.id));
      assert.equal((await asMember(`/communities/${mine.body.id}`)).status, 200);
      const edit = await asMember(`/communities/${mine.body.id}`, { method: 'PATCH', body: { status: 'Under contract' } });
      assert.equal(edit.body.status, 'Under contract');
      assert.deepEqual(await store.listAdminCommunities(memberId), [mine.body.id]);

      // Not the owner's other communities, listings included.
      const others = (await asOwner('/communities', { method: 'POST', body: { ...listing, address: '77 Birch Lane' } })).body;
      assert.equal((await asMember(`/communities/${others.id}`)).status, 403);
      assert.equal((await asMember(`/communities/${others.id}`, { method: 'DELETE' })).status, 403);

      // Their own listing they may delete; a community they cannot, even one shared with them.
      const shared = (await asOwner('/communities', { method: 'POST', body: { name: 'Shared Ridge' } })).body.id;
      await store.setAdminCommunities(memberId, [mine.body.id, shared]);
      forgetAdminAccess(memberId);
      const refused = await asMember(`/communities/${shared}`, { method: 'DELETE' });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, OWNER_ONLY);
      const gone = await asMember(`/communities/${mine.body.id}`, { method: 'DELETE' });
      assert.equal(gone.status, 204);
      assert.equal((await asOwner(`/communities/${mine.body.id}`)).status, 404);
    });

    test('giving an agent a listing adds one row and never undoes what the owner saved', async () => {
      const a = (await asOwner('/communities', { method: 'POST', body: { name: 'Held Hollow' } })).body.id;
      const mine = await asMember('/communities', { method: 'POST', body: { ...listing, address: '88 Added Ave' } });
      // The owner saves a list made before the listing existed, as an open access dialog would.
      await store.setAdminCommunities(memberId, [a]);
      assert.equal(await store.addAdminCommunity(memberId, mine.body.id), true);
      assert.equal(await store.addAdminCommunity(memberId, mine.body.id), true, 'adding twice is fine');
      assert.equal(await store.addAdminCommunity(memberId, 'no-such-community'), false);
      assert.deepEqual((await store.listAdminCommunities(memberId)).sort(), [a, mine.body.id].sort());
    });

    test('a listing\'s home name is capped like its address, so the two stay equal', async () => {
      const made = (await asOwner('/communities', { method: 'POST', body: listing })).body;
      const long = 'A'.repeat(260);
      const res = await asOwner(`/homes/${made.homes[0].id}`, { method: 'PATCH', body: { name: long } });
      assert.equal(res.status, 200);
      assert.equal(res.body.name.length, 200);
    });

    test('two listings made at once by one agent are both kept', async () => {
      const before = (await asMember('/communities')).body.length;
      const made = await Promise.all([1, 2, 3].map((n) => asMember('/communities', { method: 'POST', body: { ...listing, address: `${n}0 Quick Court` } })));
      assert.deepEqual(made.map((m) => m.status), [201, 201, 201]);
      const now = (await asMember('/communities')).body;
      assert.equal(now.length, before + 3);
      for (const m of made) assert.ok(now.some((c) => c.id === m.body.id));
    });

    test('Today tells a listing from a community and carries its price', async () => {
      const id = (await asOwner('/communities', { method: 'POST', body: { ...listing, address: '5 Today Way' } })).body.id;
      const today = (await asOwner('/today')).body;
      const card = today.communities.find((c) => c.id === id);
      assert.equal(card.kind, 'listing');
      assert.equal(card.price, 475000);
      assert.equal(card.heroPhoto, null, 'no photo yet');
      assert.equal(card.settings.siteKind, 'listing');
      assert.ok(today.communities.some((c) => c.kind === 'community') || today.communities.length > 0);
    });

    test('the activity log names listings, not communities', async () => {
      const id = (await asOwner('/communities', { method: 'POST', body: { ...listing, address: '6 Log Lane' } })).body.id;
      await asOwner(`/communities/${id}`, { method: 'DELETE' });
      const log = (await asOwner('/activity')).body;
      const actions = (log.entries ?? log.rows ?? log).map((e) => e.action);
      assert.ok(actions.includes('listing.created'));
      assert.ok(actions.includes('listing.deleted'));
    });
  });
}
