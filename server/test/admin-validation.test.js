import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { DEFAULT_SETTINGS, calcPayment, incentiveWritten, pay30, ratesOf } from '../../shared/domain.js';
import {
  HOME_NUMBER_RULES, SETTING_NUMBER_RULES, creditOrderProblem, priceFromTyped, readHomeNumbers, readNumber, readSetting,
} from '../../shared/numberInput.js';
import { backends, startBackend } from './fixtures/harness.js';

/*
 * The content-safety rules: what a home's price and counts, a community's rates and costs, a new guide and the
 * builder incentive may hold before a buyer can see them. The reading of a typed number is one module shared with
 * the admin's boxes (shared/numberInput.js), so it is tested directly as well as through the routes.
 */

describe('reading a typed number', () => {
  const price = (text) => readNumber(text, HOME_NUMBER_RULES.price);

  test('a price takes k and m shorthand, a dollar sign, commas and plain dollars', () => {
    for (const [typed, value] of [
      ['475k', 475000], ['475K', 475000], ['1.2m', 1200000], ['$475,000', 475000], ['475,000', 475000],
      ['475000', 475000], [' $ 475 000 ', 475000], ['475000.60', 475001], [500000, 500000], ['12M', 12000000],
    ]) {
      assert.deepEqual(price(typed), { value, text: String(value) }, String(typed));
    }
  });

  test('a price that is not a number is refused in words, never turned into a smaller one', () => {
    for (const typed of ['abc', 'four hundred', '-475000', '4.75e5', '1,2', '1.2.3', '$$', 'k', {}, ['475000'], true]) {
      assert.match(price(typed).error, /must be a number/, JSON.stringify(typed));
    }
    for (const typed of ['', '   ', null, undefined]) assert.match(price(typed).error, /^Type the price/, JSON.stringify(typed));
    // A typed "475" is the lost k of "475k", not a $475 home; and a zero or a stray extra zero is no price either.
    for (const typed of ['475', '0', '9999']) assert.match(price(typed).error, /too low/, typed);
    assert.match(price('9m9').error, /must be a number/);
    assert.match(price('5000m').error, /too high/);
  });

  test('a count may be left blank, which means it was not given', () => {
    assert.deepEqual(readNumber('', HOME_NUMBER_RULES.beds), { value: null, text: '' });
    assert.deepEqual(readNumber('  ', HOME_NUMBER_RULES.sqft), { value: null, text: '' });
    assert.deepEqual(readNumber('2,400', HOME_NUMBER_RULES.sqft), { value: 2400, text: '2400' });
    assert.deepEqual(readNumber('2.5', HOME_NUMBER_RULES.baths), { value: 2.5, text: '2.5' });
    assert.match(readNumber('2.5', HOME_NUMBER_RULES.beds).error, /whole number/);
    assert.match(readNumber('three', HOME_NUMBER_RULES.beds).error, /must be a number/);
    assert.match(readNumber('99', HOME_NUMBER_RULES.beds).error, /too many/);
  });

  test('a home\'s numbers: price required, the rest 0 when blank, and only what was sent when it is a change', () => {
    assert.deepEqual(readHomeNumbers({ price: '475k', beds: '', baths: undefined, sqft: null }).data, { price: 475000, beds: 0, baths: 0, sqft: 0 });
    assert.match(readHomeNumbers({}).error, /^Type the price/);
    assert.deepEqual(readHomeNumbers({ beds: '4' }, { partial: true }).data, { beds: 4 });
    assert.deepEqual(readHomeNumbers({ name: 'x' }, { partial: true }).data, {});
    assert.match(readHomeNumbers({ price: '' }, { partial: true }).error, /^Type the price/);
    assert.equal(priceFromTyped('1.2m'), '$1,200,000');
    assert.equal(priceFromTyped('abc'), '');
  });

  test('a rate drops a stray % or $ or comma, and refuses words, a minus sign and anything out of range', () => {
    const rate = (text) => readSetting('rateConv', text);
    assert.deepEqual(rate('7.5%'), { value: 7.5, text: '7.5' });
    assert.deepEqual(rate('7.5%%'), { value: 7.5, text: '7.5' });
    assert.deepEqual(rate('.5'), { value: 0.5, text: '0.5' });
    assert.deepEqual(rate('6.875'), { value: 6.875, text: '6.875' });
    for (const typed of ['six and a half', '-3', '0', '20.5', '6,5', '7..5']) {
      assert.match(rate(typed).error, /^Type a rate between 0\.5 and 20, like 6\.75\.$/, JSON.stringify(typed));
    }
    for (const typed of ['', '   ']) assert.equal(rate(typed).error, 'Type a rate, like 6.75.', 'a blank rate is not 0%');
  });

  test('every box on the rates and costs has a range that fits what it is', () => {
    const ok = (key, typed) => assert.equal(readSetting(key, typed).error, undefined, `${key} ${typed}`);
    const bad = (key, typed) => assert.ok(readSetting(key, typed).error, `${key} ${typed}`);
    ok('taxPctYr', '0.55'); bad('taxPctYr', '5.1'); bad('taxPctYr', '-1'); bad('taxPctYr', '');
    ok('insuranceYr', '$1,400'); ok('insuranceYr', '1.4k'); bad('insuranceYr', '60000'); bad('insuranceYr', 'a lot');
    ok('hoaMo', '45'); ok('hoaMo', ''); ok('hoaMo', '0'); bad('hoaMo', '5001'); bad('hoaMo', '45/mo');
    ok('dpaIncomeLimit', '162,500'); ok('dpaIncomeLimit', ''); bad('dpaIncomeLimit', '50');
    ok('dpaMinCredit', '660'); ok('dpaMinCredit', ''); bad('dpaMinCredit', '299'); bad('dpaMinCredit', '851'); bad('dpaMinCredit', '660.5');
    ok('dpaPriceCap', '450k'); ok('dpaPriceCap', ''); bad('dpaPriceCap', '450');
    ok('dpaAmount', '20000'); ok('dpaAmount', ''); bad('dpaAmount', '2000000');
    ok('dpaPct', '6'); ok('dpaPct', ''); bad('dpaPct', '60'); bad('dpaPct', 'six');
    for (const key of ['creditExcellentMin', 'creditGoodMin', 'creditFairMin']) {
      ok(key, '700'); bad(key, ''); bad(key, '200'); bad(key, '900');
    }
    // Every key with a rule is a real setting, so the server's loop reaches it.
    for (const key of Object.keys(SETTING_NUMBER_RULES)) assert.ok(key in DEFAULT_SETTINGS, key);
    // And the starting values satisfy their own rules, so a fresh community can be saved untouched.
    for (const key of Object.keys(SETTING_NUMBER_RULES)) {
      assert.equal(readSetting(key, DEFAULT_SETTINGS[key]).error, undefined, `default ${key}`);
    }
  });

  test('the credit cutoffs have to step down: Excellent, then Good, then Fair', () => {
    assert.equal(creditOrderProblem({ creditExcellentMin: '740', creditGoodMin: '700', creditFairMin: '660' }), '');
    assert.match(creditOrderProblem({ creditExcellentMin: '700', creditGoodMin: '740', creditFairMin: '660' }), /Excellent above Good/);
    assert.match(creditOrderProblem({ creditExcellentMin: '740', creditGoodMin: '700', creditFairMin: '700' }), /Good above Fair/);
  });
});

describe('a rate that is not a number never reaches the payment figures', () => {
  test('an old saved "six and a half" is not counted as 0%; the starting rate stands in', () => {
    const settings = { ...DEFAULT_SETTINGS, rateConv: 'six and a half', rateFha: '-3', rateVa: '' };
    assert.deepEqual(ratesOf(settings), { conv: 7.4, fha: 7.02, va: 7.04 });
    const total = calcPayment({ price: 400000, program: 'conv', downPct: 20, settings }).pi;
    assert.ok(Math.abs(total - pay30(320000, 7.4)) < 0.01, `about $2,216 a month, not ${Math.round(pay30(320000, 0))}`);
  });

  test('a real rate, with or without a stray %, is used as it is', () => {
    assert.deepEqual(ratesOf({ ...DEFAULT_SETTINGS, rateConv: '6.875', rateFha: '6.5%', rateVa: 6.25 }), { conv: 6.875, fha: 6.5, va: 6.25 });
  });

  test('an old saved tax, insurance or HOA that is not a number is not counted as 0 either; the starting figure stands in', () => {
    const quote = (settings) => calcPayment({ price: 450000, program: 'conv', downPct: 5, settings: { ...DEFAULT_SETTINGS, ...settings } });
    const clean = quote({});
    const garbled = quote({ taxPctYr: 'abc', insuranceYr: 'x', hoaMo: 'y' });
    assert.equal(garbled.total, clean.total, 'the payment is not shown too low');
    assert.deepEqual([garbled.tax, garbled.insurance, garbled.hoa], [clean.tax, clean.insurance, clean.hoa]);
    // A figure out of its range is as unreadable as a word, and a stray $ or comma is simply dropped.
    assert.equal(quote({ insuranceYr: '-1400' }).insurance, clean.insurance);
    assert.equal(quote({ insuranceYr: '$1,400', taxPctYr: '0.55%', hoaMo: '$45' }).total, clean.total);
    // A blank HOA means there is none, and a real one is used as typed.
    assert.equal(quote({ hoaMo: '' }).hoa, 0);
    assert.equal(quote({ hoaMo: '120' }).hoa, 120);
  });
});

describe('the builder incentive is written before it is shown', () => {
  test('it starts blank, and counts as written only with both a headline and details', () => {
    assert.equal(DEFAULT_SETTINGS.incentiveTitle, '');
    assert.equal(DEFAULT_SETTINGS.incentiveBody, '');
    assert.equal(incentiveWritten(DEFAULT_SETTINGS), false);
    assert.equal(incentiveWritten({ incentiveTitle: 'Headline', incentiveBody: '' }), false);
    assert.equal(incentiveWritten({ incentiveTitle: '  ', incentiveBody: 'Details' }), false);
    assert.equal(incentiveWritten({ incentiveTitle: 'Headline', incentiveBody: 'Details' }), true);
  });
});

for (const kind of backends()) {
  describe(`homes, rates, guides and the incentive refuse what is not real (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'admin_validation');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Validation Ridge' } })).body.id;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const addHome = (body) => admin(`/communities/${cid}/homes`, { method: 'POST', body });
    const patchHome = (id, body) => admin(`/homes/${id}`, { method: 'PATCH', body });
    const patchSettings = (settings) => admin(`/communities/${cid}`, { method: 'PATCH', body: { settings } });
    const settingsNow = async () => (await admin(`/communities/${cid}`)).body.settings;
    const publicHomes = async () => (await api(`/api/c/${cid}`)).body.homes;

    describe('homes', () => {
      test('a home with only a name is refused, so nothing is invented and nothing goes live', async () => {
        const before = (await publicHomes()).length;
        const res = await addHome({ name: 'Just A Name' });
        assert.equal(res.status, 400);
        assert.match(res.body.error, /^Type the price, like 475000 or 475k\.$/);
        assert.equal((await publicHomes()).length, before, 'no home was made');
        assert.equal((await addHome({ price: 450000 })).status, 400, 'a price alone is no home either');
        assert.match((await addHome({ name: '  ', price: 450000 })).body.error, /name/);
      });

      test('the price takes 475k, 1.2m, $475,000, 475,000 and plain dollars, and is stored as dollars', async () => {
        for (const [typed, stored] of [['475k', 475000], ['1.2m', 1200000], ['$475,000', 475000], ['475,000', 475000], ['499900', 499900], [510000, 510000]]) {
          const res = await addHome({ name: `Home ${typed}`, price: typed });
          assert.equal(res.status, 201, String(typed));
          assert.equal(res.body.price, stored, String(typed));
        }
      });

      test('a price that is not a number, or not a real one, is refused with a plain sentence and stores nothing', async () => {
        const count = (await publicHomes()).length;
        for (const [price, pattern] of [
          ['abc', /must be a number/], ['', /^Type the price/], ['-5', /must be a number/], ['0', /too low/], [0, /too low/],
          ['475', /too low/], [-475000, /must be a number/], [{}, /must be a number/], [null, /^Type the price/],
        ]) {
          const res = await addHome({ name: 'Refused', price });
          assert.equal(res.status, 400, JSON.stringify(price));
          assert.match(res.body.error, pattern, JSON.stringify(price));
        }
        assert.equal((await publicHomes()).length, count);
      });

      test('a blank bed, bath or square-foot box is "not given" (0), never 3, 2 and 2,000; and nothing is written for the description', async () => {
        const res = await addHome({ name: 'Plain Plan', price: '420k' });
        assert.equal(res.status, 201);
        assert.deepEqual([res.body.price, res.body.beds, res.body.baths, res.body.sqft, res.body.description], [420000, 0, 0, 0, '']);
        const given = await addHome({ name: 'Full Plan', price: '420k', beds: '4', baths: '2.5', sqft: '2,400', description: ' Lovely. ' });
        assert.deepEqual([given.body.beds, given.body.baths, given.body.sqft, given.body.description], [4, 2.5, 2400, 'Lovely.']);
        for (const [field, value] of [['beds', 'many'], ['baths', 'two'], ['sqft', 'big'], ['beds', '2.5'], ['beds', '99']]) {
          const bad = await addHome({ name: 'Bad count', price: '420k', [field]: value });
          assert.equal(bad.status, 400, `${field} ${value}`);
        }
      });

      test('an edit that sends a bad price is refused and the old price stays; a clean one is saved', async () => {
        const home = (await addHome({ name: 'Edit Me', price: 400000, beds: 3, baths: 2, sqft: 1800 })).body;
        for (const price of ['abc', '', '-1', '475', 0]) {
          const res = await patchHome(home.id, { price });
          assert.equal(res.status, 400, JSON.stringify(price));
        }
        assert.equal((await admin(`/communities/${cid}`)).body.homes.find((h) => h.id === home.id).price, 400000, 'the old price stayed');
        const saved = await patchHome(home.id, { price: '475k' });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.price, 475000);
        assert.equal((await patchHome(home.id, { name: '   ' })).status, 400, 'a name cannot be blanked');
        assert.equal((await patchHome(home.id, { beds: 'x' })).status, 400);
        // A blank count clears it back to "not given"; the rest of the home is as it was.
        const cleared = await patchHome(home.id, { beds: '', baths: '', sqft: '' });
        assert.deepEqual([cleared.body.beds, cleared.body.baths, cleared.body.sqft, cleared.body.price, cleared.body.name], [0, 0, 0, 475000, 'Edit Me']);
      });

      test('a home saved before these rules keeps its figures, and still saves when other things are edited', async () => {
        // Written straight to the store, past the route: an old row with a price the rules would not take.
        const old = await app.store.createHome(cid, {
          name: 'Old Row', price: 1, beds: 3, baths: 2, sqft: 2000, description: 'Old.', availability: 'Planning',
        });
        const res = await patchHome(old.id, { description: 'Reworded.', availability: 'Move-in ready' });
        assert.equal(res.status, 200);
        assert.deepEqual([res.body.price, res.body.beds, res.body.baths, res.body.sqft], [1, 3, 2, 2000], 'untouched');
        assert.equal(res.body.description, 'Reworded.');
      });

      test('the edit form sends every box back, and a figure equal to the stored one is not judged, even an old one the rules refuse', async () => {
        const old = await app.store.createHome(cid, {
          name: 'Old Figures', price: 475, beds: 2.5, baths: 2, sqft: 2000, description: 'Old.', availability: 'Planning',
        });
        // As the dialog sends it: untouched boxes as the numbers or text they were opened with, a blank count as ''.
        const same = await patchHome(old.id, { price: '475', beds: 2.5, baths: '2', sqft: 2000, description: 'Reworded.' });
        assert.equal(same.status, 200);
        assert.deepEqual([same.body.price, same.body.beds, same.body.baths, same.body.sqft], [475, 2.5, 2, 2000], 'left as they were');
        // Only a figure that moves is checked, and it is checked in full.
        const worse = await patchHome(old.id, { price: '475', beds: '3.5' });
        assert.equal(worse.status, 400);
        assert.match(worse.body.error, /whole number/);
        const better = await patchHome(old.id, { price: '475k', beds: 2.5 });
        assert.equal(better.status, 200);
        assert.deepEqual([better.body.price, better.body.beds], [475000, 2.5]);
        // A blank price is never "the same", and "475k" is a change, not a match for 475.
        const blank = await app.store.createHome(cid, { name: 'Zero Price', price: 0, beds: 0, baths: 0, sqft: 0, description: '', availability: 'Planning' });
        assert.equal((await patchHome(blank.id, { price: '' })).status, 400);
        assert.equal((await patchHome(blank.id, { price: 0 })).status, 200, 'a stored 0 sent back as 0 is left alone');
        assert.equal((await patchHome(blank.id, { beds: '', baths: null, sqft: '' })).status, 200, 'blank counts equal a stored "not given"');
      });

      test('the buyer is served exactly the figures stored, with no beds, baths or sq ft for a home that has none', async () => {
        const home = (await publicHomes()).find((h) => h.name === 'Plain Plan');
        assert.deepEqual([home.price, home.beds, home.baths, home.sqft], [420000, 0, 0, 0]);
      });
    });

    describe('rates and costs', () => {
      test('a rate is a number in a sensible range; a stray % or $ or comma is dropped; the reason is a plain sentence', async () => {
        const saved = await patchSettings({ rateConv: '7.5%', rateFha: ' 6.5 ', rateVa: '$6.25' });
        assert.equal(saved.status, 200);
        assert.deepEqual([saved.body.settings.rateConv, saved.body.settings.rateFha, saved.body.settings.rateVa], ['7.5', '6.5', '6.25']);

        for (const [settings, pattern] of [
          [{ rateConv: 'six and a half' }, /^Check the conventional rate: type a rate between 0\.5 and 20, like 6\.75\.$/],
          [{ rateFha: '-3' }, /FHA rate/],
          [{ rateVa: '25' }, /VA rate/],
          [{ rateConv: '' }, /conventional rate: type a rate, like 6\.75/],
          [{ taxPctYr: 'lots' }, /property tax/],
          [{ insuranceYr: '-1' }, /yearly insurance/],
          [{ hoaMo: '9999' }, /monthly HOA/],
          [{ dpaIncomeLimit: 'none' }, /income limit/],
          [{ dpaMinCredit: '1000' }, /minimum credit score/],
          [{ dpaPriceCap: '12' }, /price cap/],
          [{ dpaAmount: 'a lot' }, /assistance amount/],
          [{ dpaPct: '75' }, /assistance percentage/],
          [{ creditGoodMin: 'good' }, /Good cutoff/],
        ]) {
          const res = await patchSettings(settings);
          assert.equal(res.status, 400, JSON.stringify(settings));
          assert.match(res.body.error, pattern, JSON.stringify(settings));
        }
        // Nothing from a refused save got in.
        const now = await settingsNow();
        assert.deepEqual([now.rateConv, now.rateFha, now.rateVa], ['7.5', '6.5', '6.25']);
      });

      test('a refused box refuses the whole save: a good rate sent with a bad one is not stored either', async () => {
        const res = await patchSettings({ rateConv: '6.1', taxPctYr: 'x' });
        assert.equal(res.status, 400);
        assert.equal((await settingsNow()).rateConv, '7.5');
      });

      test('the optional boxes can be cleared, and costs take dollar signs and k', async () => {
        const res = await patchSettings({ hoaMo: '', dpaPct: '', dpaPriceCap: '', dpaAmount: '15k', insuranceYr: '$1,500', dpaMinCredit: '' });
        assert.equal(res.status, 200);
        const now = res.body.settings;
        assert.deepEqual([now.hoaMo, now.dpaPct, now.dpaPriceCap, now.dpaAmount, now.insuranceYr, now.dpaMinCredit], ['', '', '', '15000', '1500', '']);
      });

      test('the credit cutoffs have to step down, checked when one of them is part of the save', async () => {
        const res = await patchSettings({ creditGoodMin: '760' });
        assert.equal(res.status, 400);
        assert.match(res.body.error, /Excellent above Good/);
        assert.equal((await patchSettings({ creditExcellentMin: '780', creditGoodMin: '740', creditFairMin: '680' })).status, 200);
      });

      test('a figure the person did not touch never makes a save fail, even if it is not a number', async () => {
        const cid2 = (await admin('/communities', { method: 'POST', body: { name: 'Old Figures' } })).body.id;
        const community = (await admin(`/communities/${cid2}`)).body;
        // What was saved before the rules: words in a rate, a minus sign in the tax, a % left in a cutoff.
        await app.store.updateCommunity(cid2, {
          settings: { ...community.settings, rateConv: 'six and a half', taxPctYr: '-3', hoaMo: '45/mo', creditFairMin: '660%' },
        });
        const saved = await admin(`/communities/${cid2}`, {
          method: 'PATCH',
          body: {
            // The form sends back what it loaded, bad figures and all, with one real change.
            settings: { rateConv: 'six and a half', taxPctYr: '-3', hoaMo: '45/mo', creditFairMin: '660%', teamPhone: '(801) 555-0100', notifyEmail: 'a@b.co' },
          },
        });
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        assert.equal(saved.body.settings.teamPhone, '(801) 555-0100');
        assert.equal(saved.body.settings.rateConv, 'six and a half', 'left exactly as it was');
        // The moment the person does touch it, it has to be a real one.
        assert.equal((await admin(`/communities/${cid2}`, { method: 'PATCH', body: { settings: { rateConv: 'seven' } } })).status, 400);
        assert.equal((await admin(`/communities/${cid2}`, { method: 'PATCH', body: { settings: { rateConv: '6.9' } } })).body.settings.rateConv, '6.9');
        // The buyer's payment figure is worked out from a real rate in the meantime, never a 0% one.
        const served = (await api(`/api/c/${cid2}`)).body.settings;
        assert.equal(ratesOf(served).conv, 6.9);
      });

      test('the rate webhook holds a rate to the same range', async () => {
        process.env.RATES_WEBHOOK_SECRET = 'hook-secret';
        try {
          const post = (body) => api(`/api/communities/${cid}/rates`, { method: 'POST', body, headers: { 'x-webhook-secret': 'hook-secret' } });
          assert.equal((await post({ conv: '6.95%' })).status, 200);
          assert.equal((await settingsNow()).rateConv, '6.95');
          assert.equal((await post({ conv: '21' })).status, 400);
          assert.equal((await post({ conv: '0.2' })).status, 400);
          assert.equal((await post({ conv: 'high' })).status, 400);
        } finally {
          delete process.env.RATES_WEBHOOK_SECRET;
        }
      });

      test('checking for new rates does not make old rates look fresh unless a rate inbox is connected', async () => {
        const check = () => admin(`/communities/${cid}/rates/check`, { method: 'POST', body: {} });
        const before = (await settingsNow()).ratesUpdatedAt;
        delete process.env.RATES_WEBHOOK_SECRET;
        const idle = await check();
        assert.equal(idle.status, 200);
        assert.equal(idle.body.webhookConfigured, false);
        assert.equal(idle.body.settings.ratesUpdatedAt, before, 'the answer carries the date as it was');
        assert.equal((await settingsNow()).ratesUpdatedAt, before, 'and nothing was stamped');
        process.env.RATES_WEBHOOK_SECRET = 'hook-secret';
        try {
          const connected = await check();
          assert.equal(connected.body.webhookConfigured, true);
          assert.notEqual(connected.body.settings.ratesUpdatedAt, before);
          assert.equal((await settingsNow()).ratesUpdatedAt, connected.body.settings.ratesUpdatedAt, 'the date was stamped');
        } finally {
          delete process.env.RATES_WEBHOOK_SECRET;
        }
      });
    });

    describe('guides', () => {
      const guides = async () => (await admin(`/communities/${cid}`)).body.guides;

      test('a guide a builder adds starts as a draft and is not served to buyers until it is published', async () => {
        const made = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'What To Expect At Your Walkthrough' } });
        assert.equal(made.status, 201);
        assert.equal(made.body.published, false);
        const slug = made.body.slug;
        assert.ok(!(await api(`/api/c/${cid}`)).body.guides.some((g) => g.slug === slug), 'not in the buyer list');
        assert.equal((await api(`/api/c/${cid}/guides/${slug}`)).status, 404, 'not at its address either');
        assert.equal((await guides()).find((g) => g.slug === slug).published, false, 'but the builder sees it');

        const live = await admin(`/guides/${made.body.id}`, { method: 'PATCH', body: { published: true, body: 'Text.' } });
        assert.equal(live.body.published, true);
        assert.ok((await api(`/api/c/${cid}`)).body.guides.some((g) => g.slug === slug), 'published, it is served');
      });

      test('a draft with no text cannot be switched to published by any request, but one with text, or one already live, can', async () => {
        const made = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Empty One' } });
        const slug = made.body.slug;
        // The guide list's switch sends exactly this, with no body at all.
        const bare = await admin(`/guides/${made.body.id}`, { method: 'PATCH', body: { published: true } });
        assert.equal(bare.status, 400);
        assert.equal(bare.body.error, 'Write the guide text before you publish it.');
        const blank = await admin(`/guides/${made.body.id}`, { method: 'PATCH', body: { published: true, body: '   ' } });
        assert.equal(blank.status, 400, 'a body of spaces is no text');
        assert.equal((await guides()).find((g) => g.slug === slug).published, false, 'still a draft');
        assert.equal((await api(`/api/c/${cid}/guides/${slug}`)).status, 404, 'and still hidden from buyers');

        // Text saved earlier counts, so the switch works once there is something to read.
        assert.equal((await admin(`/guides/${made.body.id}`, { method: 'PATCH', body: { body: 'Something to read.' } })).status, 200);
        const live = await admin(`/guides/${made.body.id}`, { method: 'PATCH', body: { published: true } });
        assert.equal(live.status, 200);
        assert.equal(live.body.published, true);

        // A guide that is already live and empty (made so before this rule) can still be edited.
        const old = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Old And Empty', published: true } });
        assert.equal(old.body.published, true);
        const edit = await admin(`/guides/${old.body.id}`, { method: 'PATCH', body: { summary: 'A line.', published: true } });
        assert.equal(edit.status, 200);
        assert.equal(edit.body.summary, 'A line.');
      });

      test('a request that says published outright is honoured, and the 13 supplied guides stay live', async () => {
        const live = await admin(`/communities/${cid}/guides`, { method: 'POST', body: { title: 'Say So', published: true } });
        assert.equal(live.body.published, true);
        const all = await guides();
        const supplied = all.filter((g) => g.defaultKey);
        assert.equal(supplied.length, 13);
        assert.ok(supplied.every((g) => g.published), 'every supplied guide is published');
        const fresh = (await admin('/communities', { method: 'POST', body: { name: 'Another Ridge' } })).body.id;
        const theirs = (await admin(`/communities/${fresh}`)).body.guides;
        assert.equal(theirs.filter((g) => g.published).length, 13, 'a new community starts with all 13 live, as before');
      });
    });

    describe('the builder incentive', () => {
      const served = async () => (await api(`/api/c/${cid}`)).body;

      test('a new community has the incentive blank, and switching it on shows buyers nothing', async () => {
        const fresh = (await admin(`/communities/${cid}`)).body.settings;
        assert.deepEqual([fresh.incentiveTitle, fresh.incentiveBody], ['', '']);
        assert.equal((await admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { incentive: true } } })).status, 200);
        const body = await served();
        assert.equal(body.features.incentive, false, 'on, but nothing written: the buyer app is told it is off');
        assert.ok(!Object.keys(body.settings).some((key) => key.startsWith('incentive')), 'and no incentive wording is sent');
        // The builder still sees their switch as they left it.
        assert.equal((await admin(`/communities/${cid}`)).body.features.incentive, true);
      });

      test('a headline alone is not enough; a headline and details are', async () => {
        await patchSettings({ incentiveTitle: 'Closing-cost help' });
        assert.equal((await served()).features.incentive, false);
        await patchSettings({ incentiveBody: 'With our preferred lender at {community}.' });
        const body = await served();
        assert.equal(body.features.incentive, true);
        assert.equal(body.settings.incentiveTitle, 'Closing-cost help');
        // Switched off, it is gone again whatever is written.
        await admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { incentive: false } } });
        assert.equal((await served()).features.incentive, false);
        await admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { incentive: true } } });
      });

      test('"Find out if you qualify" mail is not available while the incentive is unwritten', async () => {
        await patchSettings({ incentiveBody: '' });
        const lead = await api(`/api/c/${cid}/leads`, {
          method: 'POST', body: { name: 'Pat Vale', email: `pat-${kind}@qualify.test`, phone: '', consent: true },
        });
        const res = await api('/api/me/incentive/email', { method: 'POST', token: lead.body.token, body: { message: 'hello' } });
        assert.equal(res.status, 404);
      });

      test('the wording the incentive used to start with, saved as if chosen, reads back as blank', async () => {
        await patchSettings({
          incentiveTitle: 'Preferred lender incentive',
          incentiveBody: 'Buy a home at {community} with our preferred lender and ask what you could save.',
        });
        const now = await settingsNow();
        assert.deepEqual([now.incentiveTitle, now.incentiveBody], ['', '']);
        assert.equal((await served()).features.incentive, false);
        // Wording the builder wrote themselves is never touched.
        await patchSettings({ incentiveTitle: 'Preferred lender incentive: $5,000', incentiveBody: 'Details.' });
        assert.equal((await settingsNow()).incentiveTitle, 'Preferred lender incentive: $5,000');
      });
    });
  });
}
