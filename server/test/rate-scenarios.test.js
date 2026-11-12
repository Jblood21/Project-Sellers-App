import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { MOVE_IN_STEPS, closingWeeks, moveInSchedule } from '../../shared/domain.js';
import {
  MAX_SCENARIOS, RATE_SCENARIOS, cleanPicks, percentLabel, picksOf, scenariosOf, validEffectiveDate,
} from '../../shared/rateScenarios.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

describe('sample loan rates (shared)', () => {
  test('five solutions, three shown at most', () => {
    assert.deepEqual(RATE_SCENARIOS.map((s) => s.k), ['fha35', 'conv3', 'conv5', 'conv20', 'dpa100']);
    assert.equal(MAX_SCENARIOS, 3);
  });

  test('picks are known keys, each once, no more than three', () => {
    assert.deepEqual(picksOf('conv3, fha35,conv3,nope'), ['conv3', 'fha35']);
    assert.equal(cleanPicks('conv3,conv5,fha35').value, 'conv3,conv5,fha35');
    assert.ok(cleanPicks('conv3,conv5,fha35,conv20').error);
    assert.ok(cleanPicks('conv3,bogus').error);
    assert.equal(cleanPicks('').value, '');
  });

  test('the effective date is a real calendar day', () => {
    assert.equal(validEffectiveDate('2026-11-12').value, '2026-11-12');
    assert.equal(validEffectiveDate('').value, '');
    assert.ok(validEffectiveDate('2026-02-30').error);
    assert.ok(validEffectiveDate('soon').error);
  });

  test('a visitor sees picked solutions that have a rate, with the APR when given', () => {
    const view = scenariosOf({
      scenarioPicks: 'fha35,conv3,conv5', scenarioEffective: '2026-11-12', scenarioAssumptions: ' Based on a buyer. ',
      scRate_fha35: '6.250', scApr_fha35: '6.9', scRate_conv3: '6.5', scRate_conv5: '',
    });
    assert.deepEqual(view.rows.map((r) => [r.k, r.rate, r.apr]), [['fha35', 6.25, 6.9], ['conv3', 6.5, null]]);
    assert.equal(view.effective, '2026-11-12');
    assert.equal(view.assumptions, 'Based on a buyer.');
    assert.deepEqual(scenariosOf({}).rows, [], 'nothing shows until it is filled in');
    assert.equal(percentLabel(6.25), '6.250%');
  });
});

describe('offer to keys steps', () => {
  test('carries the Utah contract steps in order, and the loan-only ones drop for cash', () => {
    const keys = MOVE_IN_STEPS.map((s) => s.key);
    for (const k of ['agent', 'tours', 'escrow', 'disclosures', 'diligence', 'insurance', 'fa', 'cd', 'funds', 'utilities']) assert.ok(keys.includes(k), k);
    const cash = moveInSchedule({ target: '2027-03-01', payMethod: 'cash', home: { availability: 'Move-in ready' }, today: '2026-09-18' }).steps.map((s) => s.key);
    for (const k of ['appraisal', 'fa', 'cd', 'underwriting', 'preapproval']) assert.ok(!cash.includes(k), `cash skips ${k}`);
    assert.equal(closingWeeks('loan'), 6);
    assert.equal(closingWeeks('cash'), 3);
  });

  test('no step comes after closing, and the dates run in order', () => {
    for (const method of ['loan', 'cash']) {
      const steps = moveInSchedule({ target: '2027-03-01', payMethod: method, home: { availability: 'Move-in ready' }, today: '2026-09-18' }).steps;
      const dates = steps.map((s) => s.date);
      assert.deepEqual(dates, [...dates].sort(), method);
      assert.equal(steps.at(-1).key, 'closing');
    }
  });
});

for (const kind of backends()) {
  describe(`sample loan rates (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let community;
    let listing;

    before(async () => {
      app = await startBackend(kind, 'rate-scenarios');
      ({ api, token: owner } = app);
      community = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Rate Place' } })).body;
      listing = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: '8 Rate Rd', price: '400000' } })).body;
    });
    after(async () => { await app.stop(); });

    const save = (id, settings) => api(`/api/admin/communities/${id}`, { token: owner, method: 'PATCH', body: { settings } });

    test('start empty, on a community and on a listing alike', async () => {
      for (const c of [community, listing]) {
        const got = (await api(`/api/admin/communities/${c.id}`, { token: owner })).body;
        assert.equal(got.settings.scenarioPicks, '');
        assert.match(got.settings.scenarioAssumptions, /780\+/);
      }
    });

    test('saves picks, date, assumptions and rates; buyers get them', async () => {
      for (const c of [community, listing]) {
        const r = await save(c.id, {
          scenarioPicks: 'fha35,conv3,dpa100', scenarioEffective: '2026-11-12', scenarioAssumptions: 'First-time buyer, 780+.',
          scRate_fha35: '6.25%', scApr_fha35: '6.91', scRate_conv3: '6.5', scRate_dpa100: '6.75',
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.settings.scRate_fha35, '6.25');
        const pub = (await api(`/api/c/${c.id}`)).body;
        assert.equal(pub.settings.scenarioPicks, 'fha35,conv3,dpa100');
        assert.equal(pub.settings.scenarioEffective, '2026-11-12');
      }
    });

    test('refuses a fourth pick, an unknown one, a bad date and a rate that is not one', async () => {
      assert.equal((await save(community.id, { scenarioPicks: 'fha35,conv3,conv5,conv20' })).status, 400);
      assert.equal((await save(community.id, { scenarioPicks: 'va' })).status, 400);
      assert.equal((await save(community.id, { scenarioEffective: '2026-13-01' })).status, 400);
      assert.equal((await save(community.id, { scRate_conv5: 'six' })).status, 400);
      assert.equal((await save(community.id, { scApr_conv5: '99' })).status, 400);
      assert.equal((await save(community.id, { scRate_conv5: '' })).status, 200, 'a blank is allowed');
    });
  });
}
