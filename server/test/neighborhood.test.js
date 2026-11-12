import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { HIGHLIGHT_CATEGORIES } from '../../shared/domain.js';
import { UTAH_SCHOOL_REPORT_URL, directionsUrl, driveLabel, pointOf, readPlaceExtras } from '../../shared/neighborhood.js';
import { hooks, geocode } from '../lib/geocode.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

describe('neighborhood (shared)', () => {
  test('the places a buyer asks about are all there, schools first', () => {
    const keys = HIGHLIGHT_CATEGORIES.map((c) => c.k);
    for (const k of ['schools', 'employment', 'shopping', 'grocery', 'parks', 'gym', 'parkride', 'golf', 'ski', 'other']) assert.ok(keys.includes(k), k);
    assert.equal(keys[0], 'schools');
    assert.match(UTAH_SCHOOL_REPORT_URL, /^https:\/\/reportcard\.schools\.utah\.gov/);
  });

  test('distance, link and position are checked', () => {
    assert.deepEqual(readPlaceExtras({ miles: '1.25 mi', minutes: '4 min', link: 'example.com/x', lat: '40.39', lng: '-111.85' }).data,
      { miles: 1.3, minutes: 4, link: 'https://example.com/x', lat: 40.39, lng: -111.85 });
    assert.deepEqual(readPlaceExtras({ miles: '', link: '' }).data, { miles: null, link: '' });
    assert.deepEqual(readPlaceExtras({}).data, {});
    for (const bad of [{ miles: 'far' }, { miles: -1 }, { minutes: 9999 }, { link: 'javascript:alert(1)' }, { link: 'https://u:p@x.com' }, { lat: 91, lng: 0 }, { lat: 40 }]) {
      assert.ok(readPlaceExtras(bad).error, JSON.stringify(bad));
    }
  });

  test('the drive line and the directions link', () => {
    assert.equal(driveLabel(1.2, 4), '1.2 mi · 4 min drive');
    assert.equal(driveLabel(3, null), '3 mi');
    assert.equal(driveLabel(null, null), '');
    assert.deepEqual(pointOf({ lat: '40.1', lng: '-111.2' }), { lat: 40.1, lng: -111.2 });
    assert.equal(pointOf({ lat: null, lng: null }), null);
    assert.equal(directionsUrl({ lat: 40.1, lng: -111.2 }), 'https://www.google.com/maps/dir/?api=1&destination=40.1%2C-111.2&travelmode=driving');
    assert.equal(directionsUrl({ lat: 40.1, lng: -111.2, apple: true }), 'https://maps.apple.com/?daddr=40.1%2C-111.2&dirflg=d');
    assert.match(directionsUrl({ address: '12 Oak St, Lehi UT' }), /destination=12%20Oak%20St%2C%20Lehi%20UT/);
    assert.equal(directionsUrl({}), null);
  });
});

describe('geocoding', () => {
  const real = hooks.fetch;
  after(() => { hooks.fetch = real; });

  test('reads the first match, and never throws', async () => {
    let asked;
    hooks.fetch = async (url, init) => {
      asked = { url: String(url), ua: init.headers['User-Agent'] };
      return new Response(JSON.stringify([{ lat: '40.3916172', lon: '-111.8507662', display_name: 'Lehi, Utah' }]), { status: 200 });
    };
    assert.deepEqual(await geocode('123 Maple St, Lehi UT'), { lat: 40.391617, lng: -111.850766, label: 'Lehi, Utah' });
    assert.match(asked.url, /nominatim\.openstreetmap\.org\/search/);
    assert.match(asked.ua, /Touradoor/);
    hooks.fetch = async () => new Response('[]', { status: 200 });
    assert.equal(await geocode('nowhere'), null);
    hooks.fetch = async () => { throw new Error('down'); };
    assert.equal(await geocode('anything'), null);
    assert.equal(await geocode('   '), null);
  });
});

for (const kind of backends()) {
  describe(`neighborhood (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let community;
    const real = hooks.fetch;

    before(async () => {
      app = await startBackend(kind, 'neighborhood');
      ({ api, token: owner } = app);
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Map Place', location: 'Lehi, UT' } })).body;
      hooks.fetch = async (url) => {
        const q = new URL(url).searchParams.get('q');
        if (/nowhere/i.test(q)) return new Response('[]', { status: 200 });
        return new Response(JSON.stringify([{ lat: '40.4', lon: '-111.9', display_name: q }]), { status: 200 });
      };
    });
    after(async () => { hooks.fetch = real; await app.stop(); });

    const add = (body) => api(`/api/admin/communities/${community.id}/highlights`, { token: owner, method: 'POST', body });

    test('a place keeps its distance, link and pin; the pin is found from the address', async () => {
      const made = await add({ category: 'schools', name: 'Lehi Elementary', address: '10 School Ln', miles: '0.8', minutes: 3, link: 'https://reportcard.schools.utah.gov/' });
      assert.equal(made.status, 201);
      assert.equal(made.body.miles, 0.8);
      assert.equal(made.body.minutes, 3);
      assert.equal(made.body.link, 'https://reportcard.schools.utah.gov/');
      assert.equal(made.body.lat, 40.4);
      assert.equal(made.body.lng, -111.9);
      const pub = (await api(`/api/c/${community.id}`)).body;
      const seen = pub.highlights.find((h) => h.name === 'Lehi Elementary');
      assert.equal(seen.miles, 0.8);
      assert.equal(seen.lat, 40.4);
    });

    test('new categories are accepted and bad extras are refused', async () => {
      for (const category of ['employment', 'grocery', 'gym', 'parkride', 'golf', 'ski']) {
        const r = await add({ category, name: `A ${category}` });
        assert.equal(r.body.category, category);
        assert.equal(r.body.lat, null, 'no address, no pin');
      }
      assert.equal((await add({ name: 'Bad', miles: 'far' })).status, 400);
      assert.equal((await add({ name: 'Bad', link: 'javascript:alert(1)' })).status, 400);
    });

    test('changing the address moves the pin, and one that cannot be found clears it', async () => {
      const made = (await add({ category: 'parks', name: 'City Park', address: '1 Park Rd' })).body;
      const edit = (body) => api(`/api/admin/highlights/${made.id}`, { token: owner, method: 'PATCH', body });
      assert.equal((await edit({ address: 'nowhere at all' })).body.lat, null);
      assert.equal((await edit({ address: '2 Park Rd' })).body.lat, 40.4);
      const placed = await edit({ lat: 41.5, lng: -112.5 });
      assert.equal(placed.body.lat, 41.5);
      assert.equal((await edit({ lat: 41.5 })).status, 400);
      assert.equal((await edit({ miles: '2', minutes: '6' })).body.minutes, 6);
    });

    test('finding the home on the map keeps its point in the settings', async () => {
      const r = await api(`/api/admin/communities/${community.id}/locate`, { token: owner, method: 'POST', body: {} });
      assert.equal(r.status, 200);
      assert.equal(r.body.lat, 40.4);
      const got = (await api(`/api/admin/communities/${community.id}`, { token: owner })).body;
      assert.equal(got.settings.mapLat, '40.4');
      assert.equal((await api(`/api/c/${community.id}`)).body.settings.mapLng, '-111.9');
      const none = await api(`/api/admin/communities/${community.id}/locate`, { token: owner, method: 'POST', body: { address: 'nowhere' } });
      assert.equal(none.status, 404);
      const bad = await api(`/api/admin/communities/${community.id}`, { token: owner, method: 'PATCH', body: { settings: { mapLat: '95' } } });
      assert.equal(bad.status, 400);
    });
  });
}
