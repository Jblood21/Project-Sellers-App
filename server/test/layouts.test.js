import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

import { DEFAULT_LAYOUT, LAYOUT_KEYS, LAYOUTS, normalizeLayout } from '../../shared/domain.js';
import { backends, startBackend } from './fixtures/harness.js';

const root = new URL('../../', import.meta.url);

test('there are four layouts, each with its own name, and the keys stored on communities did not change', () => {
  assert.deepEqual(LAYOUT_KEYS, ['cornerpost', 'saltgrass', 'foyer', 'keystone']);
  assert.equal(DEFAULT_LAYOUT, 'cornerpost', 'a community that never chose one keeps the first layout');
  const names = LAYOUTS.map((layout) => layout.name);
  assert.deepEqual(names, ['Porch', 'Ridgeline', 'Foyer', 'Keystone']);
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

    test('a layout that does not exist is ignored, not stored', async () => {
      await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: 'keystone' } });
      for (const bad of ['', 'keystone2', 'Foyer', 'touradoor-default', null, 3]) {
        const res = await api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { layout: bad } });
        assert.equal(res.status, 200);
        assert.equal(res.body.layout, 'keystone', `${JSON.stringify(bad)} did not change it`);
      }
    });
  });
}
