import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  FEATURES, FEATURE_KEYS, hoaLabel, homeTaxAnnual, lotLabel, pricePerSqft, readHomeFacts,
} from '../../shared/homeFacts.js';
import { calcPayment } from '../../shared/domain.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

describe('home facts (shared rules)', () => {
  test('every pick has a unique key and a label', () => {
    assert.ok(FEATURES.length >= 100, 'a large variety of picks');
    assert.equal(new Set(FEATURE_KEYS).size, FEATURE_KEYS.length);
    assert.ok(FEATURES.every((f) => f.label.length > 2));
  });

  test('blank means not given, HOA none is 0, and bad figures are refused in words', () => {
    assert.deepEqual(readHomeFacts({}).data.yearBuilt, null);
    assert.equal(readHomeFacts({ hoaMonthly: 'none' }).data.hoaMonthly, 0);
    assert.equal(readHomeFacts({ hoaMonthly: '' }).data.hoaMonthly, null);
    assert.equal(readHomeFacts({ hoaMonthly: '$45' }).data.hoaMonthly, 45);
    assert.match(readHomeFacts({ yearBuilt: '1700' }).error, /Year built/);
    assert.match(readHomeFacts({ lotAcres: 'big' }).error, /Lot size/);
    assert.match(readHomeFacts({ taxPct: '9' }).error, /percent/);
    assert.match(readHomeFacts({ features: ['pool', 'nope'] }).error, /not on the list/);
    assert.match(readHomeFacts({ features: 'pool' }).error, /Pick the features/);
    assert.match(readHomeFacts({ features: FEATURE_KEYS.slice(0, 41) }).error, /up to 40/);
  });

  test('tax is a percent or a yearly amount, one at a time', () => {
    assert.deepEqual(readHomeFacts({ taxPct: '0.55' }).data, { yearBuilt: null, lotAcres: null, hoaMonthly: null, taxPct: 0.55, taxAnnual: null, features: [] });
    assert.equal(readHomeFacts({ taxAnnual: '2,400' }).data.taxAnnual, 2400);
    const both = readHomeFacts({ taxPct: '0.5', taxAnnual: '9999' }).data;
    assert.equal(both.taxPct, 0.5);
    assert.equal(both.taxAnnual, null, 'the percent wins so it follows a changed price');
  });

  test('what a buyer sees: price per square foot, tax, lot and HOA wording', () => {
    assert.equal(pricePerSqft({ price: 450000, sqft: 1800 }), 250);
    assert.equal(pricePerSqft({ price: 450000, sqft: 0 }), null);
    assert.equal(homeTaxAnnual({ taxPct: 0.55 }, 450000), 2475);
    assert.equal(homeTaxAnnual({ taxAnnual: 3100 }, 450000), 3100);
    assert.equal(homeTaxAnnual({}, 450000), null);
    assert.equal(lotLabel(0.25), '0.25 acres');
    assert.equal(lotLabel(1), '1 acre');
    assert.equal(lotLabel(null), '');
    assert.equal(hoaLabel(0), 'None');
    assert.equal(hoaLabel(45), '$45 / month');
    assert.equal(hoaLabel(null), '');
  });

  test("a home's own HOA and tax replace the community's in the payment, and only when it has them", () => {
    const settings = { taxPctYr: '0.6', insuranceYr: '1200', hoaMo: '45', rateConv: '6.5', rateFha: '6.5', rateVa: '6.5' };
    const base = calcPayment({ price: 400000, program: 'conv', downPct: 20, settings });
    const own = calcPayment({ price: 400000, program: 'conv', downPct: 20, settings, home: { taxAnnual: 3600, hoaMonthly: 0 } });
    assert.equal(Math.round(own.tax), 300);
    assert.equal(own.hoa, 0);
    assert.ok(Math.abs(base.tax - 200) < 1, 'the community rate is still used without one');
    assert.equal(base.hoa, 45);
    const pct = calcPayment({ price: 400000, program: 'conv', downPct: 20, settings, home: { taxPct: 1 } });
    assert.equal(Math.round(pct.tax), Math.round(400000 * 0.01 / 12));
    assert.equal(pct.hoa, 45, 'a home with no HOA figure keeps the community one');
  });
});

for (const kind of backends()) {
  describe(`home facts (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let communityId;
    let homeId;

    before(async () => {
      app = await startBackend(kind, 'home-facts');
      ({ api, token: owner } = app);
      communityId = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Facts Court' } })).body.id;
      homeId = (await api(`/api/admin/communities/${communityId}/homes`, {
        token: owner, method: 'POST',
        body: { name: 'The Birch', price: '450000', beds: 3, baths: 2, sqft: 1800, yearBuilt: 1999, lotAcres: '0.25', hoaMonthly: 'none', taxPct: '0.55', features: ['pool', 'solar'] },
      })).body.id;
    });
    after(async () => { await app.stop(); });

    const home = async () => (await api(`/api/admin/communities/${communityId}`, { token: owner })).body.homes.find((h) => h.id === homeId);

    test('facts made with a home are kept and shown back', async () => {
      const h = await home();
      assert.equal(h.yearBuilt, 1999);
      assert.equal(h.lotAcres, 0.25);
      assert.equal(h.hoaMonthly, 0);
      assert.equal(h.taxPct, 0.55);
      assert.equal(h.taxAnnual, null);
      assert.deepEqual(h.features, ['pool', 'solar']);
    });

    test('a home made without any has them as not given, never as zero', async () => {
      const bare = (await api(`/api/admin/communities/${communityId}/homes`, { token: owner, method: 'POST', body: { name: 'Bare', price: '300000' } })).body;
      assert.equal(bare.yearBuilt, null);
      assert.equal(bare.lotAcres, null);
      assert.equal(bare.hoaMonthly, null);
      assert.equal(bare.taxPct, null);
      assert.deepEqual(bare.features, []);
    });

    test('they can be changed, cleared, and a bad one is refused without changing anything', async () => {
      const bad = await api(`/api/admin/homes/${homeId}`, { token: owner, method: 'PATCH', body: { yearBuilt: '1700', hoaMonthly: 99 } });
      assert.equal(bad.status, 400);
      assert.equal((await home()).hoaMonthly, 0, 'nothing was saved');
      const ok = await api(`/api/admin/homes/${homeId}`, {
        token: owner, method: 'PATCH', body: { hoaMonthly: '75', taxPct: '', taxAnnual: '2,900', features: ['pool', 'mountain-view', 'pool'] },
      });
      assert.equal(ok.status, 200);
      const h = await home();
      assert.equal(h.hoaMonthly, 75);
      assert.equal(h.taxPct, null);
      assert.equal(h.taxAnnual, 2900);
      assert.deepEqual(h.features, ['pool', 'mountain-view'], 'a repeated pick is kept once');
      await api(`/api/admin/homes/${homeId}`, { token: owner, method: 'PATCH', body: { yearBuilt: '', lotAcres: '', hoaMonthly: '', taxPct: '', taxAnnual: '', features: [] } });
      const cleared = await home();
      assert.equal(cleared.yearBuilt, null);
      assert.equal(cleared.hoaMonthly, null);
      assert.equal(cleared.taxAnnual, null);
      assert.deepEqual(cleared.features, []);
    });

    test('an edit that sends only other fields leaves the facts alone', async () => {
      await api(`/api/admin/homes/${homeId}`, { token: owner, method: 'PATCH', body: { yearBuilt: 2005, features: ['solar'] } });
      await api(`/api/admin/homes/${homeId}`, { token: owner, method: 'PATCH', body: { description: 'Nice home.' } });
      const h = await home();
      assert.equal(h.yearBuilt, 2005);
      assert.deepEqual(h.features, ['solar']);
    });

    test('buyers get them from the public page', async () => {
      const pub = await api(`/api/c/${communityId}`);
      const h = pub.body.homes.find((x) => x.id === homeId);
      assert.equal(h.yearBuilt, 2005);
      assert.deepEqual(h.features, ['solar']);
    });
  });
}
