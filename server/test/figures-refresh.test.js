import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { DEFAULT_SETTINGS } from '../../shared/domain.js';
import { FIGURES_REFRESH, refreshedSettings } from '../db/refresh.js';
import { loadDefaultGuides } from '../lib/guides.js';
import { backends, startBackend } from './fixtures/harness.js';

test('the refresh carries the current rates and down payment program, and only those, into a community', () => {
  const before = {
    id: 'somewhere-abcd',
    settings: {
      ...DEFAULT_SETTINGS, rateConv: '6.45', rateFha: '6.10', rateVa: '5.90', ratesUpdatedAt: null,
      dpaAmount: '15000', dpaPriceCap: '', dpaProgram: '', hoaMo: '99', lenderName: 'Acme Lending', notifyEmail: 'team@x.test',
    },
  };
  const after = refreshedSettings(before);
  for (const key of ['rateConv', 'rateFha', 'rateVa', 'ratesUpdatedAt', 'dpaAmount', 'dpaPriceCap', 'dpaProgram', 'dpaAsOf', 'dpaIncomeLimit', 'dpaMinCredit']) {
    assert.equal(after[key], DEFAULT_SETTINGS[key], key);
  }
  assert.equal(after.hoaMo, '99', 'a figure that is not refreshed stays as the builder set it');
  assert.equal(after.lenderName, 'Acme Lending');
  assert.equal(after.notifyEmail, 'team@x.test');
  assert.equal(before.settings.rateConv, '6.45', 'the community it was given is not changed');
});

test('a live community also gets its own researched figures, and no other community gets them', () => {
  const salt = refreshedSettings({ id: 'salt-grass-zoxa', settings: { ...DEFAULT_SETTINGS, hoaMo: '45' } });
  assert.deepEqual([salt.taxPctYr, salt.insuranceYr, salt.hoaMo], ['0.60', '650', '172']);
  const other = refreshedSettings({ id: 'not-listed-wxyz', settings: { ...DEFAULT_SETTINGS, hoaMo: '45' } });
  assert.deepEqual([other.taxPctYr, other.insuranceYr, other.hoaMo], [DEFAULT_SETTINGS.taxPctYr, DEFAULT_SETTINGS.insuranceYr, '45']);
  assert.match(FIGURES_REFRESH.version, /^\d{4}-\d{2}-\d{2}$/);
});

for (const kind of backends()) {
  describe(`the one-time figures refresh (${kind} store)`, () => {
    let app;
    let api;
    let token;

    before(async () => {
      app = await startBackend(kind, 'figures_refresh');
      ({ api, token } = app);
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const guide = async (cid, key) => (await admin(`/communities/${cid}`)).body.guides.find((g) => g.defaultKey === key);

    test('a community created now starts on the new defaults and is not refreshed over what the builder sets', async () => {
      const cid = (await admin('/communities', { method: 'POST', body: { name: 'Fresh Fields' } })).body.id;
      const created = (await admin(`/communities/${cid}`)).body.settings;
      assert.equal(created.rateConv, DEFAULT_SETTINGS.rateConv);
      assert.equal(created.dpaAmount, DEFAULT_SETTINGS.dpaAmount);
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { rateConv: '6.99' } } });
      // A server start runs the refresh again: this community already has it.
      assert.deepEqual(await app.store.applyFiguresRefresh(FIGURES_REFRESH), []);
      await app.store.init();
      assert.equal((await admin(`/communities/${cid}`)).body.settings.rateConv, '6.99');
    });

    test('an existing community is refreshed once: rates, program and the supplied guides, keeping what else it has', async () => {
      const cid = (await admin('/communities', { method: 'POST', body: { name: 'Older Acres' } })).body.id;
      const [first, second] = loadDefaultGuides();
      const g1 = await guide(cid, first.defaultKey);
      const g2 = await guide(cid, second.defaultKey);
      // How it looked before: old figures, an edited and a hidden guide, a deleted guide, a lender of its own.
      await admin(`/communities/${cid}`, {
        method: 'PATCH',
        body: { settings: { rateConv: '6.45', dpaAmount: '15000', hoaMo: '99', lenderName: 'Acme Lending' } },
      });
      await admin(`/guides/${g1.id}`, { method: 'PATCH', body: { body: 'Old words.', title: 'Old title', published: false } });
      await admin(`/guides/${g2.id}`, { method: 'DELETE' });

      const refresh = { ...FIGURES_REFRESH, version: `${FIGURES_REFRESH.version}-test`, byCommunity: { [cid]: { hoaMo: '201' } } };
      const done = await app.store.applyFiguresRefresh(refresh);
      assert.ok(done.includes(cid));

      const settings = (await admin(`/communities/${cid}`)).body.settings;
      assert.equal(settings.rateConv, DEFAULT_SETTINGS.rateConv);
      assert.equal(settings.dpaAmount, DEFAULT_SETTINGS.dpaAmount);
      assert.equal(settings.hoaMo, '201', 'its own researched figure');
      assert.equal(settings.lenderName, 'Acme Lending', 'everything else as it was');

      const listed = await guide(cid, first.defaultKey);
      assert.equal(listed.id, g1.id, 'the same guide, updated in place');
      const refreshed = (await admin(`/guides/${g1.id}`)).body;
      assert.equal(refreshed.title, first.title);
      assert.equal(refreshed.body, first.body);
      assert.equal(refreshed.published, false, 'a hidden guide stays hidden');
      assert.equal(refreshed.position, g1.position, 'and in its place');
      assert.equal(await guide(cid, second.defaultKey), undefined, 'a deleted guide is not brought back');

      // Once: a builder's change after the refresh survives the next start.
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { rateConv: '7.10' } } });
      assert.deepEqual(await app.store.applyFiguresRefresh(refresh), []);
      assert.equal((await admin(`/communities/${cid}`)).body.settings.rateConv, '7.10');
    });
  });
}
