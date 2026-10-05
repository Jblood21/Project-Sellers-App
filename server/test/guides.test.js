import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  DEFAULT_GUIDE_IMAGE, DEFAULT_GUIDE_IMAGE_ALT, GUIDE_TEXT_MAX,
} from '../../shared/domain.js';
import { createFileStore } from '../db/file.js';
import { DEFAULT_GUIDE_ORDER } from '../lib/guides.js';
import { GIF, PNG, backends, startBackend } from './fixtures/harness.js';

const SVG = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
const settle = () => new Promise((resolve) => setImmediate(resolve));

for (const kind of backends()) {
  describe(`buyer guides (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'guides_api');
      ({ api, token } = app);
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const newCommunity = async (name = 'Guide Ridge') =>
      (await api('/api/admin/communities', { method: 'POST', token, body: { name } })).body.id;
    const adminGuides = async (id = cid) => (await admin(`/communities/${id}`)).body.guides;
    const byKey = async (key, id = cid) => (await adminGuides(id)).find((g) => g.defaultKey === key);
    const removeAll = async (id = cid) => {
      for (const g of await adminGuides(id)) await admin(`/guides/${g.id}`, { method: 'DELETE' });
    };

    before(async () => { cid = await newCommunity(); });

    test('a new community is given exactly the 13 supplied guides, in the buyer-journey order', async () => {
      const guides = await adminGuides();
      assert.equal(guides.length, 13);
      assert.deepEqual(guides.map((g) => g.slug), DEFAULT_GUIDE_ORDER);
      assert.deepEqual(guides.map((g) => g.defaultKey), DEFAULT_GUIDE_ORDER, 'each remembers where it came from');
      assert.deepEqual(guides.map((g) => g.position), guides.map((_, i) => i));
      assert.ok(guides.every((g) => g.published), 'all published');
      assert.ok(guides.every((g) => g.title && g.category && g.summary), 'with a title, category and summary');
      assert.ok(guides.every((g) => !('body' in g)), 'the list carries no article bodies');
      assert.equal(guides[0].image, DEFAULT_GUIDE_IMAGE);
      assert.equal(guides[0].imageAlt, DEFAULT_GUIDE_IMAGE_ALT);
    });

    test('a guide opens whole, with the supplied wording and dated line intact', async () => {
      const [first] = await adminGuides();
      const full = await admin(`/guides/${first.id}`);
      assert.equal(full.status, 200);
      assert.ok(full.body.body.length > 500, 'the article is there');
      assert.match(full.body.body, /Figures shown are current as of 8\/27\/26/);
      assert.equal((await admin('/guides/g_missing')).status, 404);
    });

    test('two communities each get their own copy, so editing one leaves the other alone', async () => {
      const other = await newCommunity('Second Ridge');
      const mine = await byKey(DEFAULT_GUIDE_ORDER[0]);
      await admin(`/guides/${mine.id}`, { method: 'PATCH', body: { title: 'Edited only here' } });
      assert.equal((await byKey(DEFAULT_GUIDE_ORDER[0], other)).title !== 'Edited only here', true);
      assert.equal((await adminGuides(other)).length, 13);
      await admin(`/guides/${mine.id}`, { method: 'PATCH', body: { title: mine.title } });
    });

    test('a guide is created from a title, with a unique slug and the default category', async () => {
      const first = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'What About Taxes?' } });
      assert.equal(first.status, 201);
      assert.equal(first.body.slug, 'what-about-taxes');
      assert.equal(first.body.category, 'Guide');
      assert.equal(first.body.published, true);
      assert.equal(first.body.body, '', 'a new guide starts empty');
      assert.equal(first.body.defaultKey, '', 'and is not mistaken for a supplied one');

      const second = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'What about taxes' } });
      assert.equal(second.body.slug, 'what-about-taxes-2', 'the same title gets a suffix, not a clash');
      const third = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'WHAT ABOUT TAXES!!' } });
      assert.equal(third.body.slug, 'what-about-taxes-3');
      for (const g of [first, second, third]) await admin(`/guides/${g.body.id}`, { method: 'DELETE' });
    });

    test('a title with no letters still gets a usable slug', async () => {
      const made = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: '!!!' } });
      assert.equal(made.status, 201);
      assert.match(made.body.slug, /^guide(-\d+)?$/);
      await admin(`/guides/${made.body.id}`, { method: 'DELETE' });
    });

    test('creating a guide validates on the server', async () => {
      const refuse = async (body, pattern) => {
        const res = await admin(`/communities/${cid}/guides`, { method: 'POST', body });
        assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
        assert.match(res.body.error, pattern);
      };
      await refuse({}, /title/i);
      await refuse({ title: '   ' }, /title/i);
      await refuse({ title: 'x'.repeat(GUIDE_TEXT_MAX.title + 1) }, /title.*too long/i);
      await refuse({ title: 'ok', body: 'x'.repeat(GUIDE_TEXT_MAX.body + 1) }, /body.*too long/i);
      await refuse({ title: 'ok', summary: 'x'.repeat(GUIDE_TEXT_MAX.summary + 1) }, /summary/i);
      await refuse({ title: 'ok', category: 'x'.repeat(GUIDE_TEXT_MAX.category + 1) }, /category/i);
      await refuse({ title: 'ok', slug: DEFAULT_GUIDE_ORDER[0] }, /already uses/i);
      await refuse({ title: 'ok', slug: '???' }, /address/i);
      assert.equal((await admin('/communities/nope/guides', { method: 'POST', body: { title: 'x' } })).status, 404);
      assert.equal((await adminGuides()).length, 13, 'nothing was stored');
    });

    test('a guide can be edited, and its slug is normalised and kept unique', async () => {
      const guide = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Editable' } })).body;
      const edited = await admin(`/guides/${guide.id}`, {
        method: 'PATCH',
        body: {
          title: 'Edited Title', category: 'Costs', byline: 'By Someone', note: 'A note', summary: 'Short.',
          body: '## Heading\n\nText.', imageAlt: 'A picture', slug: 'My New Address!', published: false, position: 40,
        },
      });
      assert.equal(edited.status, 200);
      assert.deepEqual(
        [edited.body.title, edited.body.category, edited.body.byline, edited.body.note, edited.body.summary,
          edited.body.body, edited.body.imageAlt, edited.body.slug, edited.body.published, edited.body.position],
        ['Edited Title', 'Costs', 'By Someone', 'A note', 'Short.', '## Heading\n\nText.', 'A picture',
          'my-new-address', false, 40],
      );

      const clash = await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { slug: DEFAULT_GUIDE_ORDER[2] } });
      assert.equal(clash.status, 400);
      assert.match(clash.body.error, /already uses/i);
      const same = await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { slug: 'my-new-address' } });
      assert.equal(same.status, 200, 'keeping its own slug is not a clash');
      assert.equal((await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { slug: '!!!' } })).status, 400);
      assert.equal((await admin(`/guides/${guide.id}`)).body.slug, 'my-new-address', 'a refused slug changes nothing');
      await admin(`/guides/${guide.id}`, { method: 'DELETE' });
    });

    test('a title is never left blank and over-long text is refused', async () => {
      const guide = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Keep Me' } })).body;
      assert.equal((await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { title: '  ' } })).status, 400);
      assert.equal((await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { body: 'x'.repeat(GUIDE_TEXT_MAX.body + 1) } })).status, 400);
      const blankCategory = await admin(`/guides/${guide.id}`, { method: 'PATCH', body: { category: '' } });
      assert.equal(blankCategory.body.category, 'Guide', 'a blank category falls back so the list never groups under nothing');
      assert.equal((await admin(`/guides/${guide.id}`)).body.title, 'Keep Me');
      assert.equal((await admin('/guides/g_missing', { method: 'PATCH', body: { title: 'x' } })).status, 404);
      await admin(`/guides/${guide.id}`, { method: 'DELETE' });
    });

    test('a guide is deleted, with its picture', async () => {
      const guide = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Short Lived' } })).body;
      const photo = (await admin(`/guides/${guide.id}/image`, { method: 'POST', body: { dataUrl: GIF } })).body;
      assert.equal((await api(`/api/photos/${photo.id}`, { raw: true })).status, 200);
      assert.equal((await admin(`/guides/${guide.id}`, { method: 'DELETE' })).status, 204);
      assert.equal(await app.store.getGuide(guide.id), null);
      assert.equal((await api(`/api/photos/${photo.id}`, { raw: true })).status, 404, 'the picture went too');
    });

    test('a picture replaces rather than stacks, and clearing returns the default', async () => {
      const guide = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Pictured' } })).body;
      const first = (await admin(`/guides/${guide.id}/image`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const second = (await admin(`/guides/${guide.id}/image`, { method: 'POST', body: { dataUrl: PNG } })).body;
      assert.equal((await api(`/api/photos/${first.id}`, { raw: true })).status, 404, 'the first was replaced');
      assert.equal((await app.store.listGuidePhotos(guide.id)).length, 1);

      let shown = (await admin(`/guides/${guide.id}`)).body;
      assert.equal(shown.image, `/api/photos/${second.id}`);
      assert.equal(shown.imageAlt, 'Pictured', 'an own picture with no description falls back to the title, not the default text');

      const cleared = await admin(`/guides/${guide.id}/image`, { method: 'DELETE' });
      assert.equal(cleared.status, 200);
      shown = (await admin(`/guides/${guide.id}`)).body;
      assert.equal(shown.image, DEFAULT_GUIDE_IMAGE);
      assert.equal(shown.imageAlt, DEFAULT_GUIDE_IMAGE_ALT);
      assert.equal((await api(`/api/photos/${second.id}`, { raw: true })).status, 404);
      await admin(`/guides/${guide.id}`, { method: 'DELETE' });
    });

    test('a guide picture refuses SVG, oversized and non-image files', async () => {
      const guide = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Strict' } })).body;
      const big = `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`;
      for (const dataUrl of [SVG, big, 'data:text/html;base64,PGI+PC9iPg==', 'nope']) {
        const res = await admin(`/guides/${guide.id}/image`, { method: 'POST', body: { dataUrl } });
        assert.equal(res.status, 400);
      }
      assert.equal((await app.store.listGuidePhotos(guide.id)).length, 0);
      assert.equal((await admin('/guides/g_missing/image', { method: 'POST', body: { dataUrl: GIF } })).status, 404);
      await admin(`/guides/${guide.id}`, { method: 'DELETE' });
    });

    describe('restore-defaults', () => {
      test('does nothing when every supplied guide is still there, and says so', async () => {
        const res = await admin(`/communities/${cid}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.status, 200);
        assert.equal(res.body.restored, 0);
        assert.equal(res.body.guides.length, 13);
      });

      test('brings back only the ones that are missing, once', async () => {
        const id = await newCommunity('Restore Ridge');
        const gone = await byKey(DEFAULT_GUIDE_ORDER[3], id);
        const gone2 = await byKey(DEFAULT_GUIDE_ORDER[9], id);
        await admin(`/guides/${gone.id}`, { method: 'DELETE' });
        await admin(`/guides/${gone2.id}`, { method: 'DELETE' });
        assert.equal((await adminGuides(id)).length, 11);

        const res = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.body.restored, 2);
        assert.equal(res.body.guides.length, 13);
        const again = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(again.body.restored, 0, 'idempotent');
        assert.equal((await adminGuides(id)).length, 13);
        const back = await byKey(DEFAULT_GUIDE_ORDER[3], id);
        assert.equal((await admin(`/guides/${back.id}`)).body.body.includes('8/27/26'), true, 'restored with its article');
        assert.notEqual(back.id, gone.id, 'a fresh copy, since the old row is gone');
      });

      test('never overwrites a guide the builder has edited', async () => {
        const id = await newCommunity('Edited Ridge');
        const mine = await byKey(DEFAULT_GUIDE_ORDER[1], id);
        await admin(`/guides/${mine.id}`, {
          method: 'PATCH', body: { title: 'My own title', body: 'My own words.', published: false },
        });
        const res = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.body.restored, 0);
        const kept = (await admin(`/guides/${mine.id}`)).body;
        assert.equal(kept.title, 'My own title');
        assert.equal(kept.body, 'My own words.');
        assert.equal(kept.published, false, 'even an unpublished one counts as present');
      });

      test('matches by default_key even after the slug was changed', async () => {
        const id = await newCommunity('Renamed Ridge');
        const mine = await byKey(DEFAULT_GUIDE_ORDER[4], id);
        await admin(`/guides/${mine.id}`, { method: 'PATCH', body: { slug: 'totally-different', title: 'Renamed' } });
        const res = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.body.restored, 0, 'no second copy of a guide that was merely renamed');
        const all = await adminGuides(id);
        assert.equal(all.length, 13);
        assert.equal(all.filter((g) => g.defaultKey === DEFAULT_GUIDE_ORDER[4]).length, 1);
      });

      test('a restored guide whose address is now taken gets a suffix instead of failing', async () => {
        const id = await newCommunity('Taken Ridge');
        const original = await byKey(DEFAULT_GUIDE_ORDER[5], id);
        await admin(`/guides/${original.id}`, { method: 'DELETE' });
        const squatter = await admin(`/communities/${id}/guides`, {
          method: 'POST', body: { title: 'Mine now', slug: DEFAULT_GUIDE_ORDER[5] },
        });
        assert.equal(squatter.status, 201);
        const res = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.body.restored, 1);
        const restored = await byKey(DEFAULT_GUIDE_ORDER[5], id);
        assert.equal(restored.slug, `${DEFAULT_GUIDE_ORDER[5]}-2`);
        assert.equal((await adminGuides(id)).find((g) => g.id === squatter.body.id).slug, DEFAULT_GUIDE_ORDER[5], 'the builder\'s own is untouched');
      });

      test('a builder who deleted every guide gets them back only by asking', async () => {
        const id = await newCommunity('Empty Ridge');
        await removeAll(id);
        assert.equal((await adminGuides(id)).length, 0);
        await app.store.init(); // a restart
        assert.equal((await adminGuides(id)).length, 0, 'boot does not undo a deletion');
        const res = await admin(`/communities/${id}/guides/restore-defaults`, { method: 'POST', body: {} });
        assert.equal(res.body.restored, 13);
      });

      test('an unknown community is a 404', async () => {
        assert.equal((await admin('/communities/nope/guides/restore-defaults', { method: 'POST', body: {} })).status, 404);
      });
    });

    describe('what a buyer sees', () => {
      let pub;
      before(async () => {
        pub = await newCommunity('Public Ridge');
      });

      test('the payload lists published guides as summaries, never the article', async () => {
        const { guides } = (await api(`/api/c/${pub}`)).body;
        assert.equal(guides.length, 13);
        assert.deepEqual(Object.keys(guides[0]).sort(), [
          'byline', 'category', 'createdAt', 'id', 'image', 'imageAlt', 'note', 'slug', 'summary', 'title',
          'updatedAt',
        ]);
        assert.deepEqual(guides.map((g) => g.slug), DEFAULT_GUIDE_ORDER);
      });

      test('an unpublished guide is left out of the list and 404s by slug', async () => {
        const target = await byKey(DEFAULT_GUIDE_ORDER[6], pub);
        await admin(`/guides/${target.id}`, { method: 'PATCH', body: { published: false } });
        const { guides } = (await api(`/api/c/${pub}`)).body;
        assert.equal(guides.length, 12);
        assert.ok(!guides.some((g) => g.slug === target.slug));
        assert.equal((await api(`/api/c/${pub}/guides/${target.slug}`)).status, 404);
        assert.equal((await adminGuides(pub)).length, 13, 'the builder still sees it');
        await admin(`/guides/${target.id}`, { method: 'PATCH', body: { published: true } });
        assert.equal((await api(`/api/c/${pub}/guides/${target.slug}`)).status, 200, 'and it returns when published');
      });

      test('one guide opens by slug without signing in, body included', async () => {
        const res = await api(`/api/c/${pub}/guides/${DEFAULT_GUIDE_ORDER[0]}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.slug, DEFAULT_GUIDE_ORDER[0]);
        assert.ok(res.body.body.includes('8/27/26'));
        assert.ok(res.body.title && res.body.byline && res.body.image && res.body.imageAlt);
        assert.equal(res.body.published, undefined, 'no admin-only fields');
        assert.equal(res.body.communityId, undefined);
        assert.equal(res.body.defaultKey, undefined);
      });

      test('an unknown slug or community is a 404', async () => {
        assert.equal((await api(`/api/c/${pub}/guides/not-a-guide`)).status, 404);
        assert.equal((await api('/api/c/no-such-community/guides/anything')).status, 404);
      });

      test('a renamed slug serves under the new address only', async () => {
        const target = await byKey(DEFAULT_GUIDE_ORDER[7], pub);
        await admin(`/guides/${target.id}`, { method: 'PATCH', body: { slug: 'moved-here' } });
        assert.equal((await api(`/api/c/${pub}/guides/moved-here`)).status, 200);
        assert.equal((await api(`/api/c/${pub}/guides/${DEFAULT_GUIDE_ORDER[7]}`)).status, 404);
      });

      test('switching Buyer guides off removes the list and every guide from the buyer', async () => {
        await admin(`/communities/${pub}`, { method: 'PATCH', body: { features: { guides: false } } });
        assert.deepEqual((await api(`/api/c/${pub}`)).body.guides, []);
        assert.equal((await api(`/api/c/${pub}/guides/${DEFAULT_GUIDE_ORDER[0]}`)).status, 404);
        assert.equal((await adminGuides(pub)).length, 13, 'the builder keeps them');
        await admin(`/communities/${pub}`, { method: 'PATCH', body: { features: { guides: true } } });
        assert.equal((await api(`/api/c/${pub}/guides/${DEFAULT_GUIDE_ORDER[0]}`)).status, 200);
      });

      test('an uploaded guide picture reaches the buyer as a URL', async () => {
        const target = await byKey(DEFAULT_GUIDE_ORDER[8], pub);
        const photo = (await admin(`/guides/${target.id}/image`, { method: 'POST', body: { dataUrl: GIF } })).body;
        const list = (await api(`/api/c/${pub}`)).body.guides.find((g) => g.id === target.id);
        assert.equal(list.image, `/api/photos/${photo.id}`);
        const one = (await api(`/api/c/${pub}/guides/${target.slug}`)).body;
        assert.equal(one.image, `/api/photos/${photo.id}`);
      });
    });
  });
}

describe('the file store seeds guides on its own', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'psa-guides-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const legacyFile = () => {
    const path = join(dir, `legacy-${Math.random().toString(36).slice(2)}.json`);
    // A database written before guides, agents or layouts existed: no flag, no
    // collections, and not a single new key on the community.
    writeFileSync(path, JSON.stringify({
      admins: [], homes: [], highlights: [], photos: [], slots: [], leads: [],
      communities: [{
        id: 'old-1', name: 'Old Ridge', location: 'Provo', status: 'Now selling', theme: 'navy',
        builder: '', websiteUrl: null, settings: {}, tools: {}, features: {},
        createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
      }],
    }));
    return path;
  };

  test('an existing community with no guides is backfilled exactly once', async () => {
    const store = createFileStore(legacyFile());
    await store.init();
    assert.equal((await store.listGuides('old-1', { includeUnpublished: true })).length, 13);
    await store.init();
    await store.init();
    assert.equal((await store.listGuides('old-1', { includeUnpublished: true })).length, 13, 'booting again adds nothing');
    assert.equal((await store.getCommunity('old-1')).layout, 'cornerpost', 'and it reads as the default layout');
  });

  test('a builder who deletes every guide does not get them back on the next boot', async () => {
    const path = legacyFile();
    const store = createFileStore(path);
    await store.init();
    for (const g of await store.listGuides('old-1', { includeUnpublished: true })) await store.deleteGuide(g.id);
    await settle();
    await store.init();
    assert.equal((await store.listGuides('old-1', { includeUnpublished: true })).length, 0);
    const restarted = createFileStore(path); // a different process reading the same file
    await settle();
    await restarted.init();
    assert.equal((await restarted.listGuides('old-1', { includeUnpublished: true })).length, 0);
  });

  test('a community created after the guides shipped is not seeded a second time on boot', async () => {
    const path = join(dir, 'fresh.json');
    const store = createFileStore(path);
    await store.init();
    const made = await store.createCommunity({ name: 'Fresh Ridge' });
    assert.equal((await store.listGuides(made.id, { includeUnpublished: true })).length, 13);
    await settle();
    await store.init();
    assert.equal((await store.listGuides(made.id, { includeUnpublished: true })).length, 13);

    // Seeding is idempotent by default key, so only the flag stops a deleted set
    // coming back. Deleted before the boot that would otherwise set it.
    const second = await store.createCommunity({ name: 'Flagged Ridge' });
    for (const g of await store.listGuides(second.id, { includeUnpublished: true })) await store.deleteGuide(g.id);
    await settle();
    await store.init();
    assert.equal((await store.listGuides(second.id, { includeUnpublished: true })).length, 0);
  });
});

for (const kind of backends()) {
  describe(`buyer guides under overlapping and unusual requests (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'guides_edge');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Edge Ridge' } })).body.id;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const guides = async () => (await admin(`/communities/${cid}`)).body.guides;
    const full = async (id) => (await admin(`/guides/${id}`)).body;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    test('eight guides created at once from one title all get a suffixed address', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () =>
        admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Same title' } })));
      assert.deepEqual(results.map((r) => r.status), Array(8).fill(201));
      const slugs = results.map((r) => r.body.slug);
      assert.equal(new Set(slugs).size, 8);
      assert.ok(slugs.every((s) => /^same-title(-\d+)?$/.test(s)), slugs.join());
      const positions = results.map((r) => r.body.position);
      assert.equal(new Set(positions).size, 8, 'no two share a position');
    });

    test('an address the builder typed still loses a race with a 400, not a suffix', async () => {
      const [a, b] = await Promise.all([
        admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'One', slug: 'typed-slug' } }),
        admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Two', slug: 'typed-slug' } }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 400]);
      assert.equal((await guides()).filter((g) => g.slug === 'typed-slug').length, 1);
    });

    test('an edit that changes nothing leaves updatedAt alone, and a real edit moves it', async () => {
      const created = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Stamp' } })).body;
      const before = (await full(created.id)).updatedAt;
      await wait(15);
      assert.equal((await admin(`/guides/${created.id}`, { method: 'PATCH', body: {} })).status, 200);
      assert.equal((await full(created.id)).updatedAt, before, 'an empty patch is not an edit');
      await wait(15);
      await admin(`/guides/${created.id}`, { method: 'PATCH', body: { summary: 'Now it changed' } });
      assert.notEqual((await full(created.id)).updatedAt, before);
    });

    test('guides with the same position keep one order, whichever of them was edited last', async () => {
      // A community of its own, so what the other tests have done to the rows
      // cannot change where they sit on disk.
      const tieId = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Tie Ridge' } })).body.id;
      const tied_ = async () => (await admin(`/communities/${tieId}`)).body.guides;
      // Two guides whose creation order and id order disagree, so a tie that
      // fell back to either one would show.
      const seeded = await tied_();
      const [first, second] = seeded.flatMap((g, i) => seeded.slice(i + 1).filter((h) => g.id > h.id).map((h) => [g, h]))[0];
      await admin(`/guides/${first.id}`, { method: 'PATCH', body: { position: 500 } });
      await admin(`/guides/${second.id}`, { method: 'PATCH', body: { position: 500 } });
      const expected = [first.id, second.id].sort();
      for (const edited of [first, second, first, second]) {
        await admin(`/guides/${edited.id}`, { method: 'PATCH', body: { note: `edit ${Math.random()}` } });
        const tied = (await tied_()).filter((g) => g.position === 500).map((g) => g.id);
        assert.deepEqual(tied, expected);
      }
    });

    test('a new picture does not keep the stock picture\'s description, but an own one is kept', async () => {
      const seeded = (await guides()).find((g) => g.imageAlt === DEFAULT_GUIDE_IMAGE_ALT);
      assert.ok(seeded, 'a guide on the stock picture');
      assert.equal((await admin(`/guides/${seeded.id}/image`, { method: 'POST', body: { dataUrl: PNG } })).status, 201);
      const after = await full(seeded.id);
      assert.notEqual(after.imageAlt, DEFAULT_GUIDE_IMAGE_ALT);
      assert.equal(after.imageAlt, after.title, 'falls back to the title until the builder writes one');

      await admin(`/guides/${seeded.id}`, { method: 'PATCH', body: { imageAlt: 'The model kitchen' } });
      await admin(`/guides/${seeded.id}/image`, { method: 'POST', body: { dataUrl: GIF } });
      assert.equal((await full(seeded.id)).imageAlt, 'The model kitchen', 'a description they wrote stays');
    });

    test('published takes a real boolean only: the string "false" is not accepted as true', async () => {
      const g = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Flag' } })).body;
      for (const published of ['false', 'no', 0, null, {}]) {
        const res = await admin(`/guides/${g.id}`, { method: 'PATCH', body: { published } });
        assert.equal(res.status, 400, JSON.stringify(published));
      }
      assert.equal((await full(g.id)).published, true, 'unchanged by the refused edits');
      assert.equal((await admin(`/guides/${g.id}`, { method: 'PATCH', body: { published: false } })).body.published, false);
      const bad = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Bad flag', published: 'false' } });
      assert.equal(bad.status, 400);
      const draft = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Real draft', published: false } });
      assert.equal(draft.body.published, false);
    });

    test('guide text that is not text is refused rather than stored as "[object Object]"', async () => {
      const bad = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: { a: 1 } } });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /must be text/);
      const g = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Typed' } })).body;
      const res = await admin(`/guides/${g.id}`, { method: 'PATCH', body: { summary: ['a', 'b'] } });
      assert.equal(res.status, 400);
      assert.equal((await full(g.id)).summary, '');
    });

    test('a guide address with a NUL or any odd character is a plain 404 and the server stays up', async () => {
      const publish = (await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Public one' } })).body;
      assert.equal((await api(`/api/c/${cid}/guides/${publish.slug}`)).status, 200);
      for (const slug of ['a%00b', '%00', 'Has%20Space', 'UPPER', 'a_b', 'x'.repeat(101)]) {
        assert.equal((await api(`/api/c/${cid}/guides/${slug}`)).status, 404, slug);
      }
      assert.equal((await admin(`/communities/${cid}/guides`, {
        method: 'POST', body: { title: 'Ti\u0000tle' },
      })).body.title, 'Title');
      assert.equal((await api('/api/health')).status, 200, 'the server is still up');
    });
  });
}
