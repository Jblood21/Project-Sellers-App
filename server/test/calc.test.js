import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS, calcAffordability, calcPayment, creditRanges, pay30, planProgress,
  screenDpa, suggestPrograms,
} from '../../shared/domain.js';

const settings = DEFAULT_SETTINGS;

test('pay30 matches the 30-year amortisation formula', () => {
  // $400,000 at 6.45% for 360 months.
  assert.equal(Math.round(pay30(400000, 6.45)), 2515);
  // A 0% rate degrades to a straight-line payoff rather than dividing by zero.
  assert.equal(pay30(360000, 0), 1000);
});

test('payment breaks down into P&I, tax, insurance, MI and HOA', () => {
  const result = calcPayment({ price: 598000, program: 'fha', downPct: 3.5, settings });
  assert.equal(Math.round(result.loan), 577070); // 598,000 less 3.5% down
  assert.equal(Math.round(result.pi), 3497);
  assert.equal(Math.round(result.tax), 274);   // 598,000 × 0.55% / 12
  assert.equal(Math.round(result.insurance), 117); // 1,400 / 12
  assert.equal(Math.round(result.mi), 264);    // FHA: loan × 0.55% / 12
  assert.equal(result.hoa, 45);
  assert.equal(Math.round(result.total), 4197);
  assert.equal(Math.round(result.cashToClose), 35880); // 20,930 down + 2.5%
});

test('mortgage insurance follows the program and down payment', () => {
  const conv5 = calcPayment({ price: 500000, program: 'conv', downPct: 5, settings });
  assert.ok(conv5.mi > 0, 'conventional under 20% down carries MI');

  const conv20 = calcPayment({ price: 500000, program: 'conv', downPct: 20, settings });
  assert.equal(conv20.mi, 0, 'conventional at 20% down has no MI');

  const va = calcPayment({ price: 500000, program: 'va', downPct: 0, settings });
  assert.equal(va.mi, 0, 'VA never carries monthly MI');
});

test('affordability applies the credit rate adjustment', () => {
  const good = calcAffordability({ income: 85000, debts: 450, credit: 'good', settings });
  const excellent = calcAffordability({ income: 85000, debts: 450, credit: 'exc', settings });
  const fair = calcAffordability({ income: 85000, debts: 450, credit: 'fair', settings });

  assert.equal(Math.round(good.maxPayment), 2100); // 85,000/12 × 0.36 − 450
  assert.equal(good.rate, 6.45);
  assert.equal(Number(excellent.rate.toFixed(2)), 6.3);
  assert.equal(Number(fair.rate.toFixed(2)), 6.8);
  assert.ok(excellent.buyingPower > good.buyingPower);
  assert.ok(fair.buyingPower < good.buyingPower);
});

test('affordability never goes negative when debts swamp income', () => {
  const result = calcAffordability({ income: 20000, debts: 5000, credit: 'good', settings });
  assert.equal(result.maxPayment, 0);
  assert.equal(result.buyingPower, 0);
});

test('DPA screening follows the admin rules', () => {
  const base = { credit: 'good', firstTime: 'yes', military: 'no', settings };
  assert.equal(screenDpa({ ...base, income: 90000 }), 'likely');
  assert.equal(screenDpa({ ...base, income: 90000, firstTime: 'no' }), 'maybe');
  assert.equal(
    screenDpa({ ...base, income: 120000 }),
    'maybe',
    'within 115% of the limit is still worth a conversation',
  );
  assert.equal(screenDpa({ ...base, income: 200000 }), 'unlikely');
  assert.equal(
    screenDpa({ ...base, income: 90000, credit: 'poor' }),
    'unlikely',
    'a credit range below the minimum fails the screen',
  );
  assert.equal(screenDpa({ ...base, income: '' }), null, 'no income yet means no verdict');
});

test('military service qualifies without being a first-time buyer', () => {
  const result = screenDpa({
    income: 90000, credit: 'good', firstTime: 'no', military: 'yes', settings,
  });
  assert.equal(result, 'likely');
});

test('program suggestions cover the documented paths', () => {
  const veteran = suggestPrograms({ veteran: 'yes', downPct: 0, credit: 'fair' });
  assert.equal(veteran[0].k, 'va');

  const strong = suggestPrograms({ veteran: 'no', downPct: 10, credit: 'exc' });
  assert.equal(strong[0].k, 'conv');

  const fairCredit = suggestPrograms({ veteran: 'no', downPct: 10, credit: 'fair' });
  assert.equal(fairCredit[0].k, 'fha');

  assert.ok(suggestPrograms({ veteran: 'no', downPct: 10, credit: 'good' }).length >= 1);
  assert.ok(suggestPrograms({ veteran: 'yes', downPct: 0, credit: 'fair' }).length <= 2);
});

test('credit ranges are labelled from the admin cutoffs', () => {
  const [excellent, good, fair] = creditRanges(settings);
  assert.equal(excellent.label, 'Excellent 740+');
  assert.equal(good.label, 'Good 700–739');
  assert.equal(fair.label, 'Fair 660–699');
});

test('plan progress counts saved homes plus the seven tools', () => {
  assert.equal(planProgress({ savedHomeIds: [], plan: {} }), 0);
  assert.equal(planProgress({ savedHomeIds: ['h1'], plan: {} }), 13);
  assert.equal(
    planProgress({
      savedHomeIds: ['h1'],
      plan: { afford: 'x', payment: 'x', loans: 'x', compare: 'x', dpa: 'x', savings: 'x', movein: 'x' },
    }),
    100,
  );
});
