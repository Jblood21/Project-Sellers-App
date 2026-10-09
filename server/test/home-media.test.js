import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { GIF, PNG, backends, startBackend } from './fixtures/harness.js';

const ftyp = (brand) => [0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from(brand), 0, 0, 2, 0, ...Buffer.from('isomiso2'), 1, 2, 3, 4];
const dataUrl = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

for (const kind of backends()) {
  describe(`a home's hero, photo order and video tour (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let home;
    let other;

    before(async () => {
      app = await startBackend(kind, 'home_media');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Media Test' } })).body.id;
      home = (await api(`/api/admin/communities/${cid}/homes`, { method: 'POST', token, body: { name: 'The Aspen', price: 400000 } })).body;
      other = (await api(`/api/admin/communities/${cid}/homes`, { method: 'POST', token, body: { name: 'The Birch', price: 410000 } })).body;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const photosOf = async (id) => (await api(`/api/c/${cid}`)).body.homes.find((h) => h.id === id).photos.map((p) => p.id);
    const addPhoto = async (id, dataUrlValue = GIF) =>
      (await admin(`/homes/${id}/photos`, { method: 'POST', body: { dataUrl: dataUrlValue } })).body;

    test('the first photo is the hero, and the builder can put any photo first', async () => {
      const a = await addPhoto(home.id);
      const b = await addPhoto(home.id, PNG);
      const c = await addPhoto(home.id);
      const foreign = await addPhoto(other.id);
      assert.deepEqual(await photosOf(home.id), [a.id, b.id, c.id], 'upload order to begin with');

      const moved = await admin(`/homes/${home.id}/photos/order`, { method: 'PUT', body: { ids: [c.id, a.id, b.id] } });
      assert.equal(moved.status, 200);
      assert.deepEqual(moved.body.photos.map((p) => p.id), [c.id, a.id, b.id]);
      assert.deepEqual(await photosOf(home.id), [c.id, a.id, b.id], 'and that is what buyers get');

      // A photo added later goes last, not first.
      const d = await addPhoto(home.id);
      assert.deepEqual(await photosOf(home.id), [c.id, a.id, b.id, d.id]);

      // The other home was not touched.
      assert.deepEqual(await photosOf(other.id), [foreign.id]);
    });

    test('an order that is not exactly this home\'s photos, once each, is refused', async () => {
      const [first, second, third, fourth] = await photosOf(home.id);
      const foreign = (await photosOf(other.id))[0];
      const bad = [
        { ids: [first, second] },
        { ids: [first, second, third, fourth, foreign] },
        { ids: [first, second, third, foreign] },
        { ids: [first, first, second, third] },
        { ids: 'nope' },
        { ids: [first, second, third, 5] },
        {},
      ];
      for (const body of bad) {
        const res = await admin(`/homes/${home.id}/photos/order`, { method: 'PUT', body });
        assert.equal(res.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(await photosOf(home.id), [first, second, third, fourth], 'a refusal changes nothing');
      assert.equal((await admin('/homes/no-such-home/photos/order', { method: 'PUT', body: { ids: [] } })).status, 404);
      const anon = await api(`/api/admin/homes/${home.id}/photos/order`, { method: 'PUT', body: { ids: [] } });
      assert.equal(anon.status, 401);
    });

    test('floor plans are not part of the gallery order', async () => {
      const plan = (await admin(`/homes/${home.id}/floorplans`, { method: 'POST', body: { dataUrl: PNG } })).body;
      assert.ok(plan?.id, 'a plan was added');
      const before = await photosOf(home.id);
      const reversed = [...before].reverse();
      assert.equal((await admin(`/homes/${home.id}/photos/order`, { method: 'PUT', body: { ids: reversed } })).status, 200);
      const detail = (await api(`/api/c/${cid}`)).body.homes.find((h) => h.id === home.id);
      assert.deepEqual(detail.photos.map((p) => p.id), reversed);
      assert.deepEqual(detail.floorPlans.map((p) => p.id), [plan.id], 'the plans are where they were');
    });

    test('a video tour can be a YouTube or Vimeo link, and a bad link is refused', async () => {
      assert.equal((await api(`/api/c/${cid}`)).body.homes.find((h) => h.id === home.id).videoLink, '');
      const saved = await admin(`/homes/${home.id}`, { method: 'PATCH', body: { videoLink: 'https://youtu.be/dQw4w9WgXcQ' } });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.videoLink, 'https://youtu.be/dQw4w9WgXcQ');
      assert.equal((await api(`/api/c/${cid}`)).body.homes.find((h) => h.id === home.id).videoLink, 'https://youtu.be/dQw4w9WgXcQ');
      assert.equal((await admin(`/homes/${home.id}`, { method: 'PATCH', body: { videoLink: 'https://vimeo.com/123456789' } })).status, 200);

      for (const bad of ['https://example.com/video.mp4', 'javascript:alert(1)', 'not a link', 'https://youtube.com/watch']) {
        const res = await admin(`/homes/${home.id}`, { method: 'PATCH', body: { videoLink: bad } });
        assert.equal(res.status, 400, bad);
        assert.match(res.body.error, /YouTube or Vimeo/);
      }
      const cleared = await admin(`/homes/${home.id}`, { method: 'PATCH', body: { videoLink: '' } });
      assert.equal(cleared.body.videoLink, '');
    });

    test('a home has one video source: a link replaces an uploaded file, and an uploaded file replaces a link', async () => {
      const upload = await admin(`/homes/${home.id}/video`, { method: 'PUT', body: { dataUrl: dataUrl('video/mp4', ftyp('isom')) } });
      assert.equal(upload.status, 200);
      assert.match(upload.body.videoUrl, /^\/api\/homes\/.+\/video\?v=/);
      assert.equal(upload.body.videoLink, '');

      const linked = await admin(`/homes/${home.id}`, { method: 'PATCH', body: { videoLink: 'https://youtu.be/dQw4w9WgXcQ' } });
      assert.equal(linked.body.videoUrl, '', 'the file is gone');
      assert.equal(linked.body.videoLink, 'https://youtu.be/dQw4w9WgXcQ');
      const streamed = await api(`/api/homes/${home.id}/video`, { raw: true });
      assert.equal(streamed.status, 404, 'and no longer served');

      const again = await admin(`/homes/${home.id}/video`, { method: 'PUT', body: { dataUrl: dataUrl('video/mp4', ftyp('isom')) } });
      assert.equal(again.status, 200);
      assert.equal(again.body.videoLink, '', 'the link is gone');
      assert.ok(again.body.videoUrl);
    });
  });
}
