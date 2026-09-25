import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS, DEFAULT_THEME, THEMES, THEME_CHIPS, THEME_COLORS, affordabilityLevers,
  calcAffordability, calcPayment, creditRanges,
  MAX_VIDEO_BYTES, base64Bytes, daysBetween, leaseOverlap, mapsUrl, megabytes, moveInSchedule,
  moveInTimeline, normalizeTheme, pay30, videoEmbed,
  planProgress, screenDpa, shiftDate, suggestPrograms,
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

test('affordability reports the range a lender actually works in', () => {
  const r = calcAffordability({ income: 85000, debts: 450, credit: 'good', settings });

  // the conservative end is unchanged, so nothing downstream silently shifted
  assert.equal(Math.round(r.comfortable.maxPayment), 2100); // 85,000/12 × 0.36 − 450
  assert.equal(Math.round(r.buyingPower), Math.round(r.comfortable.price));

  // 43% DTI is the Qualified Mortgage ceiling
  assert.equal(Math.round(r.lenderMax.maxPayment), 2596); // 85,000/12 × 0.43 − 450
  assert.ok(r.lenderMax.price > r.comfortable.price, 'the top of the range is higher');
});

test('a bigger down payment reaches a higher price for the same loan', () => {
  const five = calcAffordability({ income: 85000, debts: 300, credit: 'good', settings, downPct: 5 });
  const twenty = calcAffordability({ income: 85000, debts: 300, credit: 'good', settings, downPct: 20 });
  assert.equal(Math.round(five.loan), Math.round(twenty.loan), 'the loan is set by the payment, not the down payment');
  assert.ok(twenty.buyingPower > five.buyingPower, 'more cash in means a higher reachable price');
});

test('levers are real deltas, and never promise what is not there', () => {
  const levers = affordabilityLevers({
    income: 65000, debts: 450, credit: 'fair', settings, dpaAmount: 15000,
  });
  const keys = levers.map((l) => l.key);
  assert.ok(keys.includes('debt'), 'clearing debt is offered when there is debt');
  assert.ok(keys.includes('dpa'), 'assistance is offered when the community has a programme');
  assert.ok(keys.includes('credit'), 'a credit step is offered below the top range');
  assert.ok(levers.every((l) => l.delta > 0), 'every lever moves the number up');
  assert.deepEqual([...levers].sort((a, b) => b.delta - a.delta), levers, 'biggest lever first');

  // nothing to clear, nothing to improve, no programme -> no empty promises
  const none = affordabilityLevers({ income: 200000, debts: 0, credit: 'exc', settings, dpaAmount: 0 });
  assert.equal(none.length, 0);

  // and no income means no speculation at all
  assert.deepEqual(affordabilityLevers({ income: '', debts: 0, credit: 'good', settings }), []);
});

test('the debt lever matches what clearing the debt actually produces', () => {
  const base = calcAffordability({ income: 65000, debts: 450, credit: 'fair', settings });
  const cleared = calcAffordability({ income: 65000, debts: 0, credit: 'fair', settings });
  const lever = affordabilityLevers({ income: 65000, debts: 450, credit: 'fair', settings })
    .find((l) => l.key === 'debt');
  assert.equal(Math.round(lever.delta), Math.round(cleared.buyingPower - base.buyingPower));
});

test('retired themes still resolve so old communities keep rendering', () => {
  // Every palette that has ever shipped. A community carrying one of these
  // renders with no colour variables at all if it resolves to nothing — white
  // text on a white page — so each retired key has to land somewhere real.
  for (const retired of ['classic', 'modern', 'lux', 'blueprint', 'slate', 'estate']) {
    const now = normalizeTheme(retired);
    assert.ok(THEMES[now], `${retired} maps to a theme that exists, got ${now}`);
  }
  assert.equal(normalizeTheme('slate'), 'ice', 'Midnight Blue becomes the nearest dark navy');
  assert.equal(normalizeTheme('estate'), 'clay', 'Warm Umber becomes the warm real-estate palette');

  assert.equal(normalizeTheme('nonsense'), DEFAULT_THEME, 'an unknown theme falls back, never undefined');
  assert.equal(normalizeTheme(undefined), DEFAULT_THEME);
  for (const key of Object.keys(THEMES)) {
    assert.equal(normalizeTheme(key), key, `${key} survives normalization`);
  }
});

test('every theme carries the five colours its stylesheet is built from', () => {
  const hex = /^#[0-9A-Fa-f]{6}$/;
  assert.equal(Object.keys(THEMES).length, 10);
  for (const [key, t] of Object.entries(THEMES)) {
    assert.ok(t.name && t.note, `${key} is labelled for the admin picker`);
    for (const field of ['primary', 'secondary', 'accent', 'background', 'text']) {
      assert.match(t[field], hex, `${key}.${field} is a full hex colour`);
    }
    // The swatch and the phone's status bar are derived, not hand-kept lists —
    // three copies of the same palette is how they drift apart.
    assert.deepEqual(THEME_CHIPS[key], [t.primary, t.accent, t.background]);
    assert.equal(THEME_COLORS[key], t.primary);
  }
  assert.ok(THEMES[DEFAULT_THEME], 'the default names a theme that exists');
});

// ── the move-in plan ───────────────────────────────────────────────────────

test('the timeline works backwards from the date the buyer wants to be in', () => {
  const s = moveInSchedule({
    target: '2027-03-01', payMethod: 'loan', home: { availability: 'Move-in ready' }, today: '2026-09-18',
  });
  // Six weeks of paperwork before the keys, so the offer has to be in by then.
  assert.equal(s.keys, '2027-03-01');
  assert.equal(s.offerBy, '2027-01-18');
  assert.equal(daysBetween(s.offerBy, s.keys), 42);
  const closing = s.steps.find((step) => step.key === 'closing');
  assert.equal(closing.date, '2027-03-01', 'the last step lands on the date they asked for');
});

test('paying cash drops the lender steps and pulls the keys forward', () => {
  const loan = moveInSchedule({ target: '', payMethod: 'loan', home: null, today: '2026-09-18' });
  const cash = moveInSchedule({ target: '', payMethod: 'cash', home: null, today: '2026-09-18' });

  const keys = (s) => s.steps.map((step) => step.key);
  assert.ok(keys(loan).includes('underwriting') && keys(loan).includes('appraisal'));
  assert.ok(!keys(cash).includes('underwriting'), 'cash has nothing to underwrite');
  assert.ok(!keys(cash).includes('appraisal'), 'cash needs no lender appraisal');
  assert.ok(cash.keys < loan.keys, 'and gets keys sooner');
  assert.equal(daysBetween(cash.keys, loan.keys), 21);
});

test('an unfinished home is not told six weeks', () => {
  const today = '2026-09-18';
  // The bug this replaces: every home got the same six-week schedule, so a home
  // that is still being built told the buyer they would have keys by November.
  const built = moveInSchedule({ target: '', home: { availability: 'Move-in ready' }, today });
  const later = moveInSchedule({
    target: '', home: { availability: 'Under Construction', readyOn: '2027-06-01' }, today,
  });
  assert.equal(built.earliest, '2026-10-30');
  assert.equal(later.earliest, '2027-06-01', 'the build, not the paperwork, sets the earliest date');
  assert.ok(later.earliest > built.earliest);
});

test('a target the home cannot meet is reported, not quietly accepted', () => {
  const s = moveInSchedule({
    target: '2027-01-15', home: { availability: 'Under Construction', readyOn: '2027-02-01' }, today: '2026-09-18',
  });
  assert.equal(s.feasible, false);
  assert.equal(s.earliest, '2027-02-01');

  const ok = moveInSchedule({
    target: '2027-04-01', home: { availability: 'Under Construction', readyOn: '2027-02-01' }, today: '2026-09-18',
  });
  assert.equal(ok.feasible, true);
});

test('a home with no completion date says so rather than inventing one', () => {
  const s = moveInSchedule({
    target: '2027-01-15', home: { availability: 'Under Construction' }, today: '2026-09-18',
  });
  assert.equal(s.unknownReady, true);
  assert.equal(s.earliest, '', 'no date is better than a made-up one');
});

test('the lease overlap is the number a renter actually needs', () => {
  assert.deepEqual(leaseOverlap('2027-03-31', '2027-03-01'), { days: 30, kind: 'overlap' });
  assert.deepEqual(leaseOverlap('2027-02-01', '2027-03-01'), { days: -28, kind: 'gap' });
  assert.deepEqual(leaseOverlap('2027-03-01', '2027-03-01'), { days: 0, kind: 'same' });
  assert.equal(leaseOverlap('', '2027-03-01'), null);
});

test('drivers and the buyer\'s own steps land in date order with the rest', () => {
  const plan = {
    targetDate: '2027-03-01', payMethod: 'loan', drivers: ['lease'],
    done: ['preapproval'],
    ownSteps: [{ id: 'x1', label: 'Transfer utilities', date: '2027-02-27' }],
  };
  const t = moveInTimeline(plan, { home: { availability: 'Move-in ready' }, today: '2026-09-18' });

  const labels = t.items.map((i) => i.label);
  assert.ok(labels.includes('Give notice to your landlord'), 'the lease driver added its step');
  assert.ok(labels.includes('Transfer utilities'), 'their own step is in the list');

  const dates = t.items.map((i) => i.date);
  assert.deepEqual(dates, [...dates].sort(), 'everything is in date order');

  assert.equal(t.items.find((i) => i.key === 'preapproval').done, true);
  assert.equal(t.items.find((i) => i.key === 'own:x1').done, false);
});

test('literal date arithmetic does not drift across a month or a year', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2027-03-01', -1), '2027-02-28');
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29', 'leap year');
  assert.equal(shiftDate('', 5), '');
  assert.equal(daysBetween('2026-09-18', '2026-09-18'), 0);
});

test('a place with an address becomes a map link, and one without does not', () => {
  assert.equal(
    mapsUrl('1234 N Center St, Lehi, UT 84043'),
    'https://www.google.com/maps/search/?api=1&query=1234%20N%20Center%20St%2C%20Lehi%2C%20UT%2084043',
  );

  // The builder types this by hand, so the characters that would break the URL
  // — the ampersand above all — have to survive as part of the query.
  assert.equal(
    mapsUrl('Smith & Jones Park'),
    'https://www.google.com/maps/search/?api=1&query=Smith%20%26%20Jones%20Park',
  );

  // Nothing to search means no link rather than a link to nowhere: the buyer
  // screen renders the row only when this returns a URL.
  assert.equal(mapsUrl(''), null);
  assert.equal(mapsUrl('   '), null, 'whitespace is not an address');
  assert.equal(mapsUrl(undefined), null, 'a highlight saved before addresses existed');
  assert.equal(mapsUrl(null), null);
});

test('a video link becomes an embeddable one, whatever shape it was pasted in', () => {
  const yt = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
  // All four are the same video; a builder pastes whichever their browser gave.
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), yt);
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), yt, 'the share link');
  assert.equal(videoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ'), yt, 'a short');
  assert.equal(videoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ'), yt, 'already an embed');
  // A watch link carries a playlist and a timestamp; only the id matters.
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx&t=42s'), yt);
  assert.equal(videoEmbed('youtube.com/watch?v=dQw4w9WgXcQ'), yt, 'no scheme typed');

  assert.equal(videoEmbed('https://vimeo.com/76979871'), 'https://player.vimeo.com/video/76979871');
  assert.equal(videoEmbed('https://player.vimeo.com/video/76979871'), 'https://player.vimeo.com/video/76979871');

  // Anything else is null, and null is what stops an iframe being pointed at
  // an arbitrary page inside the buyer app.
  assert.equal(videoEmbed('https://example.com/video.mp4'), null);
  assert.equal(videoEmbed('https://youtube.evil.com/watch?v=x'), null, 'a lookalike host');
  assert.equal(videoEmbed('javascript:alert(1)'), null);
  assert.equal(videoEmbed('https://vimeo.com/channels/staffpicks'), null, 'not a video id');
  assert.equal(videoEmbed('https://www.youtube.com/watch?v='), null, 'no id');
  assert.equal(videoEmbed(''), null);
  assert.equal(videoEmbed(undefined), null);
});

test('a base64 payload reports the size of the file behind it', () => {
  // 4 characters carry 3 bytes; padding says how many of the last 3 are real.
  assert.equal(base64Bytes(Buffer.from('abc').toString('base64')), 3, 'no padding');
  assert.equal(base64Bytes(Buffer.from('ab').toString('base64')), 2, 'one pad character');
  assert.equal(base64Bytes(Buffer.from('a').toString('base64')), 1, 'two pad characters');
  assert.equal(base64Bytes(Buffer.alloc(1000).toString('base64')), 1000);
  assert.equal(base64Bytes(''), 0);
  assert.equal(base64Bytes(undefined), 0);

  // The number the cap is actually compared against, at the boundary.
  const atCap = 'A'.repeat(Math.ceil((MAX_VIDEO_BYTES * 4) / 3));
  assert.ok(base64Bytes(atCap) >= MAX_VIDEO_BYTES, 'a file at the cap is measured as such');
  assert.equal(megabytes(MAX_VIDEO_BYTES), '25.0 MB', 'and the cap reads the way the UI says it');
});
