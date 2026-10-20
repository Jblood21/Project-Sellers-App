import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { DEFAULT_LAYOUT, HOME_SORTS, LAYOUT_KEYS, LAYOUTS, listHomes, normalizeLayout, priceSteps } from '../../shared/domain.js';
import { backends, startBackend } from './fixtures/harness.js';

const root = new URL('../../', import.meta.url);

test('there are four layouts, each with its own name, and the keys stored on communities did not change', () => {
  assert.deepEqual(LAYOUT_KEYS, ['cornerpost', 'saltgrass', 'foyer', 'marketplace']);
  assert.equal(DEFAULT_LAYOUT, 'cornerpost', 'a community that never chose one keeps the first layout');
  const names = LAYOUTS.map((layout) => layout.name);
  assert.deepEqual(names, ['Porch', 'Ridgeline', 'Foyer', 'Marketplace']);
  assert.equal(new Set(names).size, names.length, 'no two layouts share a name');
  assert.ok(!names.includes('Touradoor Default') && !names.includes('Salt Grass'), 'the old names are gone');
  for (const layout of LAYOUTS) {
    assert.match(layout.note, /\S{3,}/, `${layout.k} says what it looks like`);
    assert.ok(layout.note.length <= 260, `${layout.k}'s note fits its card`);
  }
});

test('every layout is a real folder and a stylesheet, so a key cannot be listed without being built', () => {
  for (const key of LAYOUT_KEYS) {
    assert.ok(existsSync(new URL(`client/src/buyer/layouts/${key}/index.js`, root)), `${key} has a layout folder`);
    assert.ok(existsSync(new URL(`client/src/styles/layouts/${key}.css`, root)), `${key} has a stylesheet`);
  }
  assert.ok(!existsSync(new URL('client/src/buyer/layouts/keystone', root)), 'Keystone is gone, folder and all');
  assert.ok(!existsSync(new URL('client/src/styles/layouts/keystone.css', root)), 'and its stylesheet');
});

test('a community still storing Keystone is shown Marketplace, not the default', () => {
  assert.equal(normalizeLayout('keystone'), 'marketplace');
  assert.ok(!LAYOUT_KEYS.includes('keystone'), 'it cannot be chosen any more');
  for (const near of ['Keystone', 'keystone ', 'toString', '__proto__', 'constructor']) {
    assert.equal(normalizeLayout(near), DEFAULT_LAYOUT, `${near} is not a retired key`);
  }
});

test('an unknown or missing layout falls back to the default, a known one is kept', () => {
  for (const key of LAYOUT_KEYS) assert.equal(normalizeLayout(key), key);
  for (const bad of [undefined, null, '', 'bogus', 'SALTGRASS', 'foyer ', 7, {}]) {
    assert.equal(normalizeLayout(bad), DEFAULT_LAYOUT, JSON.stringify(bad));
  }
});

for (const kind of backends()) {
  describe(`choosing a layout over the API (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'layouts_api');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Layout Choice' } })).body.id;
    });
    after(() => app.stop());

    test('each layout can be chosen, is told to the buyer app and can be changed back', async () => {
      for (const key of [...LAYOUT_KEYS, 'cornerpost']) {
        const res = await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: key } });
        assert.equal(res.status, 200, key);
        assert.equal(res.body.layout, key);
        assert.equal((await api(`/api/c/${cid}`)).body.layout, key, `the buyer app is told ${key}`);
      }
    });

    test('a layout that does not exist, Keystone included, is ignored, not stored', async () => {
      await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: 'foyer' } });
      for (const bad of ['', 'keystone', 'keystone2', 'Foyer', 'touradoor-default', null, 3]) {
        const res = await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: bad } });
        assert.equal(res.status, 200);
        assert.equal(res.body.layout, 'foyer', `${JSON.stringify(bad)} did not change it`);
      }
    });

    test('a community stored on Keystone before it was retired reads back as Marketplace, to the admin and to buyers', async () => {
      // Planted in the store: the API no longer accepts the key, but a community saved before can still hold it.
      await app.store.updateCommunity(cid, { layout: 'keystone' });
      assert.equal((await api(`/api/admin/communities/${cid}`, { token })).body.layout, 'marketplace');
      assert.equal((await api(`/api/c/${cid}`)).body.layout, 'marketplace');
      // Saving Setup with what it was shown keeps it there rather than failing or moving it.
      const res = await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: 'marketplace' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.layout, 'marketplace');
    });
  });
}

// ── Marketplace's filter bar ──────────────────────────────────────────────

const home = (id, price, beds, createdAt) => ({ id, name: id, price, beds, createdAt });
const homes = [
  home('aspen', 425000, 3, '2026-09-01T00:00:00Z'),
  home('birch', 389900, 4, '2026-10-01T00:00:00Z'),
  home('cedar', 0, 2, '2026-10-10T00:00:00Z'),
  home('dune', 512000, 5, '2026-08-01T00:00:00Z'),
];
const ids = (list) => list.map((h) => h.id);

test('homes are listed newest first, or by price either way with an unpriced home last', () => {
  assert.equal(HOME_SORTS[0].k, 'newest');
  assert.deepEqual(ids(listHomes(homes)), ['cedar', 'birch', 'aspen', 'dune']);
  assert.deepEqual(ids(listHomes(homes, { sort: 'price-asc' })), ['birch', 'aspen', 'dune', 'cedar']);
  assert.deepEqual(ids(listHomes(homes, { sort: 'price-desc' })), ['dune', 'aspen', 'birch', 'cedar']);
  assert.deepEqual(ids(listHomes(homes, { sort: 'bogus' })), ids(listHomes(homes)), 'an unknown order is the first');
  // No dates at all (an older payload): the builder's own order.
  const undated = homes.map(({ createdAt, ...rest }) => rest);
  assert.deepEqual(ids(listHomes(undated)), ['aspen', 'birch', 'cedar', 'dune']);
  assert.deepEqual(ids(homes), ['aspen', 'birch', 'cedar', 'dune'], 'the list it was given is untouched');
});

test('price and bedroom filters keep only matching homes, and a price limit leaves out a home with no price', () => {
  assert.deepEqual(ids(listHomes(homes, { minPrice: 400000 })), ['aspen', 'dune']);
  assert.deepEqual(ids(listHomes(homes, { maxPrice: '430000', sort: 'price-asc' })), ['birch', 'aspen']);
  assert.deepEqual(ids(listHomes(homes, { minBeds: 4, sort: 'price-asc' })), ['birch', 'dune']);
  assert.deepEqual(ids(listHomes(homes, { minPrice: 600000 })), []);
  assert.deepEqual(ids(listHomes(homes, { minBeds: 0 })), ids(listHomes(homes)), 'no filter, everyone');
});

test('the price steps run round figures from just under the cheapest home to just over the dearest', () => {
  assert.deepEqual(priceSteps(homes), [375000, 400000, 425000, 450000, 475000, 500000, 525000]);
  assert.deepEqual(priceSteps([home('x', 0, 2)]), [], 'no prices, no steps');
  assert.deepEqual(priceSteps([home('x', 410000, 2)]), [410000], 'one home, one step');
  for (const steps of [priceSteps(homes), priceSteps([home('a', 250000, 2), home('b', 1900000, 5)])]) {
    assert.ok(steps.length <= 9, `${steps.length} steps`);
  }
});
