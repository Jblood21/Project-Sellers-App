import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  communitySlugCandidates, normalizeCommunitySlug, suggestCommunitySlug,
} from '../../shared/domain.js';
import { shapeCommunity } from '../db/shape.js';
import { createApp } from '../index.js';
import { backends, startBackend } from './fixtures/harness.js';

// What Vite writes, trimmed to what the head injector needs. The test does not depend on a built client.
const INDEX_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Homebuyer App</title></head><body><div id="root"></div></body></html>';

describe('the clean buyer link, as pure rules', () => {
  test('a community that predates slugs is addressed by its id', () => {
    const old = shapeCommunity({ id: 'old-timer-k4m2', name: 'Old Timer', status: 'Now selling', theme: 'navy', settings: {} });
    assert.equal(old.slug, null);
    assert.equal(old.urlKey, 'old-timer-k4m2');
    assert.equal(shapeCommunity({ id: 'a-b2c3', slug: 'a-b', name: 'A', settings: {} }).urlKey, 'a-b');
  });

  test('a name suggests an address, and a taken one gets a number', () => {
    assert.equal(suggestCommunitySlug('Salt Grass'), 'salt-grass');
    assert.equal(suggestCommunitySlug('  Willow  Creek!! '), 'willow-creek');
    assert.equal(suggestCommunitySlug('Café del Mar'), 'cafe-del-mar');
    assert.equal(suggestCommunitySlug('!!'), 'community', 'a name with nothing usable still gets an address');
    assert.equal(suggestCommunitySlug('x'.repeat(90)).length, 40);
    assert.deepEqual(communitySlugCandidates('Salt Grass', 3), ['salt-grass', 'salt-grass-2', 'salt-grass-3']);
    const long = communitySlugCandidates('y'.repeat(60), 3);
    assert.ok(long.every((slug) => slug.length <= 40), 'a suffix never pushes it past the limit');
  });

  test('what can be typed as an address, and what cannot', () => {
    assert.equal(normalizeCommunitySlug('Salt-Grass'), 'salt-grass');
    assert.equal(normalizeCommunitySlug('salt grass'), 'salt-grass');
    assert.equal(normalizeCommunitySlug('ab'), '', 'too short');
    assert.equal(normalizeCommunitySlug('a'.repeat(41)), '', 'too long');
    assert.equal(normalizeCommunitySlug('admin'), '', 'a word the site uses itself');
    assert.equal(normalizeCommunitySlug('api'), '');
    assert.equal(normalizeCommunitySlug('../etc'), 'etc'.length >= 3 ? 'etc' : '');
    assert.equal(normalizeCommunitySlug('---'), '');
  });
});

for (const kind of backends()) {
  describe(`the clean buyer link (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let community;

    before(async () => {
      app = await startBackend(kind, 'community_link');
      ({ api, token } = app);
      community = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Salt Grass' } })).body;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });

    test('a new community gets a clean address from its name; its id keeps the random letters', () => {
      assert.match(community.id, /^salt-grass-[a-z0-9]{4}$/);
      assert.equal(community.slug, 'salt-grass');
      assert.equal(community.urlKey, 'salt-grass');
    });

    test('a second community with the same name gets the next free address', async () => {
      const second = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Salt Grass' } })).body;
      assert.equal(second.slug, 'salt-grass-2');
      assert.notEqual(second.id, community.id);
    });

    test('the buyer page, the guides, the slots and the sign-up all work from the id, the slug or the id in capitals', async () => {
      for (const key of [community.id, community.slug, community.id.toUpperCase(), community.slug.toUpperCase()]) {
        const page = await api(`/api/c/${key}`);
        assert.equal(page.status, 200, key);
        assert.equal(page.body.id, community.id, `${key} is the same community`);
        assert.equal(page.body.urlKey, 'salt-grass', 'and says which address to show');
        assert.equal((await api(`/api/c/${key}/slots`)).status, 200, `slots by ${key}`);
        assert.equal((await api(`/api/c/${key}/guides/no-such-guide`)).status, 404, 'a missing guide is a 404, not a crash');
      }
      const gate = await api(`/api/c/${community.slug}/leads`, {
        method: 'POST', body: { name: 'Link Tester', email: 'link@test.co' },
      });
      assert.equal(gate.status, 201);
      assert.equal(gate.body.lead.communityId, community.id, 'the lead belongs to the real community');
      assert.equal((await api('/api/c/not-a-community')).status, 404);
    });

    test('the manifest starts at the clean address and its scope covers both', async () => {
      const byId = (await api(`/c/${community.id}/manifest.webmanifest`)).body;
      const bySlug = (await api(`/c/${community.slug}/manifest.webmanifest`)).body;
      assert.equal(byId.start_url, '/c/salt-grass');
      assert.deepEqual(bySlug, byId);
      assert.equal(byId.scope, '/c/');
      assert.ok(byId.start_url.startsWith(byId.scope));
    });

    test('the page head writes the clean address into the canonical link', async () => {
      // A second server on the same store, with a stand-in client bundle, so this needs no `npm run build`.
      const dist = mkdtempSync(join(tmpdir(), 'psa-link-dist-'));
      writeFileSync(join(dist, 'index.html'), INDEX_HTML);
      const ssr = createApp({ clientDist: dist }).listen(0);
      await new Promise((resolve) => ssr.once('listening', resolve));
      try {
        const html = await (await fetch(`http://127.0.0.1:${ssr.address().port}/c/${community.id}`)).text();
        assert.match(html, /<link rel="canonical" href="https?:\/\/[^"]+\/c\/salt-grass"/);
        assert.doesNotMatch(html, new RegExp(`rel="canonical" href="[^"]*${community.id}`));
      } finally {
        await new Promise((resolve) => ssr.close(resolve));
        rmSync(dist, { recursive: true, force: true });
      }
    });

    test('the builder can pick the address, an old one keeps working, and one that is taken is refused', async () => {
      const changed = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: 'Saltgrass Homes' } });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.slug, 'saltgrass-homes');
      assert.equal(changed.body.urlKey, 'saltgrass-homes');

      const detail = (await admin(`/communities/${community.id}`)).body;
      assert.equal(detail.slug, 'saltgrass-homes');
      assert.deepEqual(detail.formerSlugs, ['salt-grass'], 'the old address is remembered, and still resolves');
      assert.equal(detail.suggestedSlug, 'salt-grass');
      for (const key of ['salt-grass', 'saltgrass-homes', community.id]) {
        const page = await api(`/api/c/${key}`);
        assert.equal(page.body.id, community.id, key);
        assert.equal(page.body.urlKey, 'saltgrass-homes');
      }

      // Another community cannot take an address this one has or had.
      const other = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Different Place' } })).body;
      for (const taken of ['salt-grass', 'saltgrass-homes', community.id]) {
        const res = await admin(`/communities/${other.id}`, { method: 'PATCH', body: { slug: taken } });
        assert.equal(res.status, 409, `${taken} is taken`);
        assert.match(res.body.error, /already used/);
      }
      assert.equal((await admin(`/communities/${other.id}`)).body.slug, 'different-place', 'a refusal changes nothing');

      // And it can take a slug back that it once had.
      const back = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: 'salt-grass' } });
      assert.equal(back.status, 200);
      assert.equal(back.body.slug, 'salt-grass');
    });

    test('an address that cannot be one is refused with a reason', async () => {
      for (const bad of ['ab', 'admin', '!!!', 'x'.repeat(41)]) {
        const res = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: bad } });
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.match(res.body.error, /3 to 40/);
      }
      assert.equal((await admin(`/communities/${community.id}`)).body.slug, 'salt-grass');
    });

    test('saving other things with the same slug sent back changes nothing and is not a conflict', async () => {
      const res = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: 'salt-grass', location: 'Lehi, Utah' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.location, 'Lehi, Utah');
    });

    test('the rate webhook and every admin route still work from the id only', async () => {
      assert.equal((await admin(`/communities/${community.id}`)).status, 200);
      assert.equal((await admin(`/communities/${community.slug}`)).status, 404, 'admin routes are keyed on the id');
    });

    test('the page head names the clean address however the page was reached, and after the address was changed', async () => {
      const dist = mkdtempSync(join(tmpdir(), 'psa-link-dist-'));
      writeFileSync(join(dist, 'index.html'), INDEX_HTML);
      const ssr = createApp({ clientDist: dist }).listen(0);
      await new Promise((resolve) => ssr.once('listening', resolve));
      const head = async (key, rest = '') => (await fetch(`http://127.0.0.1:${ssr.address().port}/c/${key}${rest}`)).text();
      try {
        const detail = (await admin(`/communities/${community.id}`)).body;
        const current = detail.slug;
        assert.ok(detail.formerSlugs.length >= 0);
        // The id, the id in capitals, the clean address, in capitals, and a deeper page.
        for (const [key, rest] of [[community.id, ''], [community.id.toUpperCase(), ''], [current, ''], [current.toUpperCase(), ''], [community.id, '/guides']]) {
          const html = await head(key, rest);
          assert.match(html, /<html/, `${key}${rest} is a page`);
          assert.match(html, new RegExp(`rel="canonical" href="https?://[^"]+/c/${current}(/guides)?"`), `${key}${rest} canonical`);
          assert.match(html, new RegExp(`property="og:url" content="https?://[^"]+/c/${current}(/guides)?"`), `${key}${rest} og:url`);
          assert.doesNotMatch(html, new RegExp(`(canonical|og:url)[^>]*${community.id}`), `${key}${rest} does not name the id`);
        }
        // After the builder moves to another address, the address it used to have names the new one.
        const moved = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: 'salt-grass-lehi' } });
        assert.equal(moved.status, 200);
        for (const key of [current, community.id]) {
          const html = await head(key);
          assert.match(html, /rel="canonical" href="https?:\/\/[^"]+\/c\/salt-grass-lehi"/, `${key} after the move`);
        }
        const back = await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: current } });
        assert.equal(back.status, 200);
      } finally {
        await new Promise((resolve) => ssr.close(resolve));
        rmSync(dist, { recursive: true, force: true });
      }
    });

    test('the buyer page lists the addresses the community used to have, so the device can follow the buyer to the new one', async () => {
      await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: 'salt-grass-lehi' } });
      const page = (await api(`/api/c/${community.id}`)).body;
      assert.equal(page.slug, 'salt-grass-lehi');
      assert.ok(page.formerSlugs.includes(community.slug), 'the old clean address is listed');
      assert.ok(!page.formerSlugs.includes('salt-grass-lehi'), 'and the current one is not');
      await admin(`/communities/${community.id}`, { method: 'PATCH', body: { slug: community.slug } });
      const again = (await api(`/api/c/${community.id}`)).body;
      assert.ok(again.formerSlugs.includes('salt-grass-lehi'));
    });

    test('the rate webhook works from the id and not from the clean address', async () => {
      process.env.RATES_WEBHOOK_SECRET = 'hook-secret';
      try {
        const post = (key) => api(`/api/communities/${key}/rates`, {
          method: 'POST', body: { conv: '6.25' }, headers: { 'x-webhook-secret': 'hook-secret' },
        });
        const byId = await post(community.id);
        assert.equal(byId.status, 200, JSON.stringify(byId.body));
        assert.equal(byId.body.settings.rateConv, '6.25');
        assert.equal((await post(community.slug)).status, 404, 'the webhook is keyed on the id, as the README says');
      } finally {
        delete process.env.RATES_WEBHOOK_SECRET;
      }
    });

    test('both stores answer the same for an address with letters outside plain ASCII, and for a community that has just gone', async () => {
      assert.equal((await app.store.resolveCommunity('SALT-GRASS'))?.id, community.id, 'plain capitals still fold');
      for (const key of ['SALT-GRASS\u0130', 'salt-grass\u212a', 'ſalt-grass', 'salt grass', '']) {
        assert.equal(await app.store.resolveCommunity(key), null, JSON.stringify(key));
      }
      const gone = await app.store.setCommunitySlug('no-such-community-abcd', 'some-address');
      assert.deepEqual(gone, { error: 'missing' });
      const res = await admin('/communities/no-such-community-abcd', { method: 'PATCH', body: { slug: 'some-address' } });
      assert.equal(res.status, 404);
    });

    test('deleting a community frees its addresses', async () => {
      const gone = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Goes Away' } })).body;
      assert.equal(gone.slug, 'goes-away');
      assert.equal((await admin(`/communities/${gone.id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await api(`/api/c/${gone.slug}`)).status, 404);
      const again = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Goes Away' } })).body;
      assert.equal(again.slug, 'goes-away', 'the address is free again');
    });
  });
}
