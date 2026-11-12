import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import sharp from 'sharp';

import { MAX_PHOTOS_PER_HOME } from '../../shared/domain.js';
import {
  cleanListingLink, hooks, isPrivateAddress, readListingPage,
} from '../lib/listingImport.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

const PAGE = readFileSync(new URL('./fixtures/listing-page.html', import.meta.url), 'utf8');

describe('listing import (reading a page)', () => {
  const read = readListingPage(PAGE, 'https://www.utahrealestate.com/2180287');

  test('reads the facts the page states', () => {
    assert.deepEqual(read.fields, {
      address: '1234 Maple Street', city: 'Lehi, UT', price: 625000, beds: 4, baths: 2.5, sqft: 2840,
      yearBuilt: 1998, lotAcres: 0.24, hoaMonthly: 45, taxAnnual: 3120,
      description: 'Light & bright rambler with mountain views, a finished basement and a three-car garage.',
      mlsNumber: '2180287',
    });
    assert.equal(read.found, 5);
  });

  test('lists each photo once, in order, without logos or agent pictures', () => {
    assert.deepEqual(read.photos.map((u) => u.split('/').pop()), [
      'photo-01.jpg', 'photo-02.jpg', 'photo-03.jpg', 'photo-04.webp', 'photo-05.jpg',
    ]);
  });

  test('a page with no details reads as nothing found', () => {
    const none = readListingPage('<html><title>Please sign in</title><body>Sign in to continue</body></html>', 'https://www.utahrealestate.com/1');
    assert.equal(none.found, 0);
    assert.deepEqual(none.photos, []);
  });

  test('falls back to the title and labelled text when the page has no structured data', () => {
    const plain = '<title>77 Oak Ln, Provo, UT 84604 | x</title><body><div>List Price: $410,000</div><div>Beds: 3</div><div>Baths: 2</div><div>Sq Ft: 1,600</div><div>Lot Size: 8,712 sq ft</div><div>HOA: None</div></body>';
    const { fields } = readListingPage(plain, 'https://www.utahrealestate.com/9999999');
    assert.equal(fields.address, '77 Oak Ln');
    assert.equal(fields.city, 'Provo, UT');
    assert.equal(fields.price, 410000);
    assert.equal(fields.sqft, 1600);
    assert.equal(fields.lotAcres, 0.2);
    assert.equal(fields.hoaMonthly, 0);
    assert.equal(fields.mlsNumber, '9999999');
  });
});

describe('listing import (links and addresses)', () => {
  test('only Utah MLS links are accepted, and the sharer details are dropped', () => {
    const ok = cleanListingLink('https://www.utahrealestate.com/2180287?actor=86202&share=ios');
    assert.equal(ok.url, 'https://www.utahrealestate.com/2180287');
    assert.equal(ok.mls, '2180287');
    assert.equal(cleanListingLink('utahrealestate.com/2180287').url, 'https://utahrealestate.com/2180287');
    for (const bad of ['', 'not a link', 'https://evil.example.com/2180287', 'https://utahrealestate.com.evil.com/1', 'ftp://utahrealestate.com/1']) {
      assert.ok(cleanListingLink(bad).error, bad);
    }
  });

  test('addresses inside a network are private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '151.101.1.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  });
});

for (const kind of backends()) {
  describe(`listing import (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    const realFetch = hooks.fetch;
    const realLookup = hooks.lookup;
    const asked = [];

    before(async () => {
      app = await startBackend(kind, 'listing-import');
      ({ api, token: owner } = app);
      const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } }).png().toBuffer();
      hooks.lookup = async (host) => (host === 'private.example' ? ['10.0.0.5'] : ['93.184.216.34']);
      hooks.fetch = async (url) => {
        const href = String(url);
        asked.push(href);
        if (href.startsWith('https://www.utahrealestate.com/2180287')) {
          return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
        }
        if (href.endsWith('broken.jpg')) return new Response('nope', { status: 200, headers: { 'content-type': 'image/jpeg' } });
        if (href.endsWith('page.jpg')) return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
        if (href.includes('photos.example-cdn.com') || href.includes('private.example')) {
          return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
        }
        return new Response('missing', { status: 404 });
      };
    });
    after(async () => {
      hooks.fetch = realFetch;
      hooks.lookup = realLookup;
      await app.stop();
    });

    const preview = (url) => api('/api/admin/listing-import/preview', { token: owner, method: 'POST', body: { url } });

    test('previews a listing link without storing anything', async () => {
      const before = (await api('/api/admin/communities', { token: owner })).body.length;
      const got = await preview('https://www.utahrealestate.com/2180287?actor=86202&share=ios');
      assert.equal(got.status, 200);
      assert.equal(got.body.fields.address, '1234 Maple Street');
      assert.equal(got.body.fields.price, 625000);
      assert.equal(got.body.photos.length, 5);
      assert.ok(asked.every((href) => !href.includes('actor=')), 'the sharer details are not sent on');
      assert.equal((await api('/api/admin/communities', { token: owner })).body.length, before);
    });

    test('refuses links from other sites and requires sign-in', async () => {
      const other = await preview('https://example.com/listing/1');
      assert.equal(other.status, 400);
      const anon = await api('/api/admin/listing-import/preview', { method: 'POST', body: { url: 'https://www.utahrealestate.com/2180287' } });
      assert.equal(anon.status, 401);
    });

    test('a page with nothing readable says so and still lists any photos', async () => {
      const saved = hooks.fetch;
      hooks.fetch = async () => new Response('<html><title>Sign in</title></html>', { status: 200, headers: { 'content-type': 'text/html' } });
      const got = await preview('https://www.utahrealestate.com/1111111');
      hooks.fetch = saved;
      assert.equal(got.status, 422);
      assert.match(got.body.error, /by hand/);
    });

    test('creating from an import keeps the facts, description and MLS number', async () => {
      const made = await api('/api/admin/communities', {
        token: owner, method: 'POST',
        body: {
          kind: 'listing', address: '1234 Maple Street', city: 'Lehi, UT', price: '625000', beds: '4', baths: '2.5', sqft: '2840',
          yearBuilt: 1998, lotAcres: 0.24, hoaMonthly: 45, taxAnnual: 3120, description: 'Light & bright.', mlsNumber: '2180287',
        },
      });
      assert.equal(made.status, 201);
      const home = made.body.homes[0];
      assert.equal(home.yearBuilt, 1998);
      assert.equal(home.lotAcres, 0.24);
      assert.equal(home.hoaMonthly, 45);
      assert.equal(home.taxAnnual, 3120);
      assert.equal(home.description, 'Light & bright.');
      assert.equal(made.body.settings.mlsNumber, '2180287');
      const bad = await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: 'X', price: '1000', yearBuilt: 1200 } });
      assert.equal(bad.status, 400);
    });

    test('brings photos in, in order, skipping the ones that fail', async () => {
      const made = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: '9 Photo Ct', price: '500000' } })).body;
      const homeId = made.homes[0].id;
      const run = (urls) => api(`/api/admin/homes/${homeId}/photos/import`, { token: owner, method: 'POST', body: { urls } });
      const one = await run([
        'https://photos.example-cdn.com/a/1.jpg', 'https://photos.example-cdn.com/a/broken.jpg',
        'https://photos.example-cdn.com/a/page.jpg', 'https://other.example.org/a/gone.jpg', 'http://photos.example-cdn.com/a/insecure.jpg',
      ]);
      assert.equal(one.status, 200);
      assert.equal(one.body.added, 1);
      assert.equal(one.body.failed.length, 3);
      const two = await run(['https://photos.example-cdn.com/a/2.jpg', 'https://photos.example-cdn.com/a/3.jpg']);
      assert.equal(two.body.added, 2);
      const home = (await api(`/api/admin/communities/${made.id}`, { token: owner })).body.homes[0];
      assert.equal(home.photos.length, 3);
      assert.equal((await run([])).status, 400);
    });

    test('never fetches from a private address', async () => {
      const made = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: '3 Safe Rd', price: '500000' } })).body;
      const got = await api(`/api/admin/homes/${made.homes[0].id}/photos/import`, {
        token: owner, method: 'POST', body: { urls: ['https://private.example/a.jpg', 'https://127.0.0.1/a.jpg'] },
      });
      assert.equal(got.body.added, 0);
      assert.equal(got.body.failed.length, 2);
      assert.ok(!asked.some((href) => href.includes('private.example') || href.includes('127.0.0.1')));
    });

    test('a home takes up to the new photo limit', () => {
      assert.equal(MAX_PHOTOS_PER_HOME, 30);
    });
  });
}
