import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { autoLocate, autoLocateAll, options, queryFor } from '../lib/autoLocate.js';
import { hooks } from '../lib/geocode.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

describe('what is looked up', () => {
  test('a listing by its address and city, a community by its name and location, and not on a placeholder', () => {
    assert.equal(queryFor({ name: '123 Maple St', location: 'Lehi, UT', settings: { siteKind: 'listing' } }), '123 Maple St, Lehi, UT');
    assert.equal(queryFor({ name: '123 Maple St', location: '', settings: { siteKind: 'listing' } }), '123 Maple St');
    assert.equal(queryFor({ name: 'Willow Creek', location: 'Lehi, UT', settings: {} }), 'Willow Creek, Lehi, UT');
    assert.equal(queryFor({ name: 'Willow Creek', location: 'Location TBD', settings: {} }), '');
    assert.equal(queryFor({ name: 'Willow Creek', location: '', settings: {} }), '');
    assert.equal(queryFor({ name: '', location: 'Lehi, UT', settings: {} }), '');
  });
});

for (const kind of backends()) {
  describe(`putting things on the map by themselves (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let store;
    const real = hooks.fetch;
    let asked = [];
    const prior = process.env.AUTO_LOCATE;

    before(async () => {
      process.env.AUTO_LOCATE = 'on';
      app = await startBackend(kind, 'auto-locate');
      ({ api, token: owner, store } = app);
      hooks.fetch = async (url) => {
        const u = new URL(url);
        asked.push(u.searchParams.get('q') ?? u.searchParams.get('address'));
        if (u.hostname.includes('census')) return new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 });
        if (/nowhere/i.test(u.searchParams.get('q'))) return new Response('[]', { status: 200 });
        return new Response(JSON.stringify([{ lat: '40.4', lon: '-111.9', display_name: 'x' }]), { status: 200 });
      };
    });
    after(async () => {
      hooks.fetch = real;
      if (prior === undefined) delete process.env.AUTO_LOCATE; else process.env.AUTO_LOCATE = prior;
      await app.stop();
    });
    const settleFor = async (id, tries = 40) => {
      for (let i = 0; i < tries; i += 1) {
        const c = (await api(`/api/admin/communities/${id}`, { token: owner })).body;
        if (c.settings.mapLat) return c;
        await new Promise((r) => setTimeout(r, 50));
      }
      return (await api(`/api/admin/communities/${id}`, { token: owner })).body;
    };

    test('a new listing is on the map a moment after it is made, with nobody pressing anything', async () => {
      const made = await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: '12 Pine Way', city: 'Lehi, UT', price: 500000, beds: 3, baths: 2, sqft: 1800, agentName: 'Ann Agent', agentPhone: '801-555-0100', agentEmail: 'ann@t.test' } });
      assert.equal(made.status, 201);
      const c = await settleFor(made.body.id);
      assert.equal(c.settings.mapLat, '40.4');
      assert.equal(c.settings.mapLng, '-111.9');
      assert.ok(asked.some((q) => /12 Pine Way/.test(q)));
    });

    test('a new community is looked up by name and location, and one with no location yet is not', async () => {
      const a = await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Auto Place', location: 'Lehi, UT' } });
      assert.equal((await settleFor(a.body.id)).settings.mapLat, '40.4');
      asked = [];
      const b = await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'No Where Yet' } });
      await new Promise((r) => setTimeout(r, 300));
      assert.equal((await api(`/api/admin/communities/${b.body.id}`, { token: owner })).body.settings.mapLat, '');
      assert.deepEqual(asked, [], 'nothing was asked for a placeholder location');
    });

    test('a point somebody set is never replaced, and a failed look-up waits out the cool-down', async () => {
      const made = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Hand Placed', location: 'Lehi, UT' } })).body;
      await settleFor(made.id);
      const c = (await api(`/api/admin/communities/${made.id}`, { token: owner })).body;
      await api(`/api/admin/communities/${made.id}`, { token: owner, method: 'PATCH', body: { settings: { ...c.settings, mapLat: '41.5', mapLng: '-112.5' } } });
      asked = [];
      assert.equal(await autoLocate(store, (await store.getCommunity(made.id)), { force: true }), false);
      assert.deepEqual(asked, []);
      assert.equal((await api(`/api/admin/communities/${made.id}`, { token: owner })).body.settings.mapLat, '41.5');

      const lost = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Nowhere Town', location: 'Nowhere, ZZ' } })).body;
      // The geocoder spaces its requests a second apart, so the first one may take a moment.
      for (let i = 0; i < 60 && !asked.length; i += 1) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1300));
      const first = asked.length;
      assert.ok(first > 0, 'it tried');
      assert.equal(await autoLocate(store, await store.getCommunity(lost.id)), false);
      assert.equal(asked.length, first, 'and does not try again inside the cool-down');
      options.cooldownMs = 0;
      try {
        await autoLocate(store, await store.getCommunity(lost.id));
        assert.ok(asked.length > first, 'but does after it');
      } finally { options.cooldownMs = 6 * 60 * 60 * 1000; }
    });

    test('opening one that is not on the map looks it up, and the sweep at start-up covers what was there', async () => {
      const made = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Quiet Cove', location: 'Lehi, UT' } })).body;
      await settleFor(made.id);
      // Clear its point, as for something made before this existed.
      const c = (await api(`/api/admin/communities/${made.id}`, { token: owner })).body;
      await api(`/api/admin/communities/${made.id}`, { token: owner, method: 'PATCH', body: { settings: { ...c.settings, mapLat: '', mapLng: '' } } });
      assert.equal((await api(`/api/admin/communities/${made.id}`, { token: owner })).body.settings.mapLat, '');
      options.cooldownMs = 0;
      try {
        const pub = await api(`/api/c/${made.id}`);
        assert.equal(pub.status, 200);
        const again = await settleFor(made.id);
        assert.equal(again.settings.mapLat, '40.4', 'looked up on its first view');
        await api(`/api/admin/communities/${made.id}`, { token: owner, method: 'PATCH', body: { settings: { ...again.settings, mapLat: '', mapLng: '' } } });
        const n = await autoLocateAll(store);
        assert.ok(n >= 1, 'the sweep put it back');
      } finally { options.cooldownMs = 6 * 60 * 60 * 1000; }
    });
  });
}
