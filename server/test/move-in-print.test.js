import assert from 'node:assert/strict';
import test from 'node:test';

import { dayLabel, printableMoveIn } from '../../shared/moveInPrint.js';

const TODAY = '2027-01-01';
const ASPEN = { name: 'The Aspen', availability: 'Move-in ready' };
const plan = (extra = {}) => ({ targetDate: '2027-09-20', payMethod: 'loan', drivers: [], done: [], ownSteps: [], ...extra });

test('dayLabel drops the year only for this year, and says so for a blank or bad date', () => {
  assert.equal(dayLabel('2027-09-20', 2027), 'Sep 20');
  assert.equal(dayLabel('2028-03-05', 2027), 'Mar 5, 2028');
  for (const bad of ['', null, undefined, 'soon', '2027-13']) assert.equal(dayLabel(bad, 2027), '—', String(bad));
});

test('without a date of their own there is no plan to print', () => {
  assert.equal(printableMoveIn(undefined, { today: TODAY }), null);
  assert.equal(printableMoveIn({}, { today: TODAY }), null);
  assert.equal(printableMoveIn(plan({ targetDate: '' }), { today: TODAY }), null, 'a preview is not their plan');
});

test('a loan plan prints the sentence, the choices and every step in date order', () => {
  const doc = printableMoveIn(plan(), { home: ASPEN, today: TODAY });
  assert.equal(doc.headline, 'To have keys on Sep 20, the offer needs to be in by Aug 9.');
  assert.deepEqual(doc.details, [['Keys', 'Sep 20'], ['Offer in by', 'Aug 9'], ['Home', 'The Aspen'], ['Paying', 'With a loan']]);
  assert.deepEqual(doc.steps.map((s) => [s.date, s.label, s.who]), [
    ['Jul 19', 'Get pre-approved', 'You'],
    ['Aug 9', 'Offer accepted & earnest money', 'You'],
    ['Aug 16', 'Home inspection', 'You'],
    ['Aug 23', 'Appraisal ordered', 'Your lender'],
    ['Sep 6', 'Loan underwriting & approval', 'Your lender'],
    ['Sep 13', 'Final walkthrough', 'You'],
    ['Sep 20', 'Closing day — keys', 'You'],
  ]);
  assert.equal(doc.total, 7);
  assert.equal(doc.done, 0);
  assert.deepEqual(doc.notes, [], 'nothing to warn about');
});

test('cash skips the loan steps, and the home may be undecided', () => {
  const doc = printableMoveIn(plan({ payMethod: 'cash' }), { today: TODAY });
  assert.deepEqual(doc.details.find(([k]) => k === 'Paying'), ['Paying', 'Paying cash']);
  assert.deepEqual(doc.details.find(([k]) => k === 'Home'), ['Home', 'Not decided yet']);
  const labels = doc.steps.map((s) => s.label);
  assert.ok(labels.includes('Gather proof of funds') && !labels.includes('Appraisal ordered') && !labels.includes('Get pre-approved'));
});

test('what is driving the date adds its steps, and a lease prints its end and the overlap', () => {
  const doc = printableMoveIn(
    plan({ drivers: ['lease', 'movers'], leaseEnd: '2027-10-20' }),
    { home: ASPEN, today: TODAY },
  );
  assert.deepEqual(doc.details.slice(-2), [['What is driving the date', 'My lease is ending, I need to book movers'], ['Lease ends', 'Oct 20']]);
  const labels = doc.steps.map((s) => s.label);
  assert.ok(labels.includes('Give notice to your landlord') && labels.includes('Book movers'));
  assert.equal(doc.notes.length, 1);
  assert.match(doc.notes[0], /^Your lease runs 30 days past your keys, which is about 1 month of paying for both places\./);

  const short = printableMoveIn(plan({ drivers: ['lease'], leaseEnd: '2027-10-05' }), { home: ASPEN, today: TODAY });
  assert.match(short.notes[0], /^Your lease runs 15 days past your keys, so you would pay for both places for that long\. /, 'no "15 days ... about 15 days"');
  const long = printableMoveIn(plan({ drivers: ['lease'], leaseEnd: '2027-11-24' }), { home: ASPEN, today: TODAY });
  assert.match(long.notes[0], /^Your lease runs 65 days past your keys, which is about 2 months of paying for both places\. /);

  const gap = printableMoveIn(plan({ drivers: ['lease'], leaseEnd: '2027-09-10' }), { home: ASPEN, today: TODAY });
  assert.match(gap.notes[0], /^Your lease ends 10 days before your keys, so you would need somewhere to stay in between\./);
  const same = printableMoveIn(plan({ drivers: ['lease'], leaseEnd: '2027-09-20' }), { home: ASPEN, today: TODAY });
  assert.match(same.notes[0], /^Your lease ends the same day you get keys\./);
  // A lease date left over after the driver was switched off is not printed.
  const stale = printableMoveIn(plan({ drivers: [], leaseEnd: '2027-10-20' }), { home: ASPEN, today: TODAY });
  assert.ok(!stale.details.some(([k]) => k === 'Lease ends') && stale.notes.length === 0);
});

test('their own steps are folded in by date, and done steps are counted', () => {
  const doc = printableMoveIn(
    plan({
      ownSteps: [{ id: 'a1', label: 'Transfer utilities', date: '2027-09-15' }, { id: 'b2', label: 'Change my address', date: '' }],
      done: ['preapproval', 'own:a1'],
    }),
    { home: ASPEN, today: TODAY },
  );
  const own = doc.steps.filter((s) => s.own);
  assert.deepEqual(own.map((s) => [s.date, s.label]), [['Sep 15', 'Transfer utilities'], ['', 'Change my address']]);
  assert.equal(doc.steps.at(-1).label, 'Change my address', 'an undated step goes last');
  assert.equal(doc.total, 9);
  assert.equal(doc.done, 2);
  assert.deepEqual(doc.steps.filter((s) => s.done).map((s) => s.label), ['Get pre-approved', 'Transfer utilities']);
});

test('a home still being built is said plainly, whether or not its date is known', () => {
  const unknown = printableMoveIn(plan(), { home: { name: 'The Birch', availability: 'Under construction' }, today: TODAY });
  assert.match(unknown.notes[0], /^The Birch is still being built and the team has not set a completion date yet\./);

  const late = printableMoveIn(
    plan({ targetDate: '2027-03-01' }),
    { home: { name: 'The Birch', availability: 'Under construction', readyOn: '2027-06-15' }, today: TODAY },
  );
  assert.match(late.notes[0], /^The earliest The Birch could hand over keys is Jun 15, because it is still being built\.$/);
  const soon = printableMoveIn(plan({ targetDate: '2027-01-10' }), { home: ASPEN, today: TODAY });
  assert.match(soon.notes[0], /^The earliest The Aspen could hand over keys is Feb 12\.$/, 'paperwork alone cannot be done by then');
});

test('dates in another year say so, and the same inputs always give the same page', () => {
  const doc = printableMoveIn(plan({ targetDate: '2028-02-14' }), { home: ASPEN, today: TODAY });
  assert.equal(doc.headline, 'To have keys on Feb 14, 2028, the offer needs to be in by Jan 3, 2028.');
  assert.deepEqual(printableMoveIn(plan(), { home: ASPEN, today: TODAY }), printableMoveIn(plan(), { home: ASPEN, today: TODAY }));
});
