import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { buildLeadsPdf, buildUserPdf } from '../lib/pdfReports.js';
import { pdfText, readPdf } from './fixtures/pdfText.js';

// The edges of the two PDF reports: counts that must agree with themselves, the cut for a period, the weekly
// chart, time zones, and text far longer than anything a form allows (older records were never capped).

const NOW = new Date('2026-10-16T18:00:00Z'); // Fri Oct 16 2026, noon in Denver
const ZONE = 'America/Denver';
const community = { id: 'edge-abcd', name: 'Edge Estates', location: 'Lehi, Utah', theme: 'navy', settings: { lenderName: 'Summit Home Loans' } };
const homes = [{ id: 'h1', name: 'The Aspen', price: 425000, beds: 4, baths: 2.5, sqft: 2100, lotNumber: '12' }, { id: 'h2', name: 'The Birch', price: 389900 }];
const flat = (buffer) => pdfText(buffer).replace(/\n/g, ' ');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

let counter = 0;
const lead = (extra = {}) => {
  counter += 1;
  return {
    id: `e${counter}`, communityId: community.id, name: `Edge Person ${counter}`, email: `e${counter}@test.co`, phone: '', status: 'new', notes: '',
    tour: null, savedHomeIds: [], extraEmails: [], openedAt: null, archivedAt: null, plan: {}, activity: [], moveIn: null, consent: null,
    firstVisitAt: '2026-10-01T12:00:00Z', ...extra,
  };
};
const leadsPdf = (leads, options = {}) => buildLeadsPdf({ community, leads, homes, now: NOW, timeZone: ZONE, ...options });
const userPdf = (person, options = {}) => buildUserPdf({ community, lead: person, homes, consents: [], now: NOW, timeZone: ZONE, ...options });
/** The figure in a summary tile: drawn on the line before its upper-case label. */
const tile = (text, label) => {
  const lines = text.split('\n');
  return lines[lines.indexOf(label.toUpperCase()) - 1];
};
/** Where on the page every piece of text sits, as PDF coordinates (the origin is the bottom left). */
const baselines = (buffer) => readPdf(buffer).flatMap((page, index) => [...page.ops.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm <([0-9A-F]*)> Tj/g)]
  .map((m) => ({ page: index + 1, x: Number(m[1]), y: Number(m[2]), text: Buffer.from(m[3], 'hex').toString('latin1') })));

describe('the period of the leads report', () => {
  test('"the last 7 days" is today and the six days before, cut at the builder\'s midnight, and the report says where', () => {
    // Fri Oct 16 noon in Denver: the cut is Sat Oct 10, 00:00 Denver (06:00 UTC).
    const justIn = lead({ name: 'Just In', firstVisitAt: '2026-10-10T06:30:00Z' });
    const justOut = lead({ name: 'Just Out', firstVisitAt: '2026-10-10T05:30:00Z' });
    const today = lead({ name: 'Today Tess', firstVisitAt: '2026-10-16T17:59:00Z' });
    const made = leadsPdf([justIn, justOut, today], { period: '7' });
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Just In') && text.includes('Today Tess'));
    assert.ok(!text.includes('Just Out'), 'one minute before the builder’s midnight is the day before');
    assert.ok(text.includes('Leads report · Signed up in the last 7 days (since Oct 10, 2026) · Lehi, Utah · Newest first'));
    assert.equal(made.people, 2);
  });

  test('30 and 90 days use the same rule, and a clock change does not move the cut', () => {
    const at = (iso) => lead({ name: `At ${iso}`, firstVisitAt: iso });
    // Oct 16 minus 29 days is Sep 17; minus 89 days is Jul 19 (Mountain Daylight Time, UTC-6, all of it).
    const days30 = pdfText(leadsPdf([at('2026-09-17T06:30:00Z'), at('2026-09-17T05:30:00Z')], { period: '30' }).buffer);
    assert.ok(days30.includes('At 2026-09-17T06:30:00Z') && !days30.includes('At 2026-09-17T05:30:00Z'));
    const days90 = pdfText(leadsPdf([at('2026-07-19T06:30:00Z'), at('2026-07-19T05:30:00Z')], { period: '90' }).buffer);
    assert.ok(days90.includes('At 2026-07-19T06:30:00Z') && !days90.includes('At 2026-07-19T05:30:00Z'));
    // Run just after a clock change: Nov 2 2026 is the first morning back on standard time (UTC-7).
    const after = buildLeadsPdf({ community, homes, timeZone: ZONE, now: new Date('2026-11-02T08:00:00Z'), period: '7',
      leads: [at('2026-10-27T07:30:00Z'), at('2026-10-27T05:30:00Z')] });
    const afterText = pdfText(after.buffer);
    assert.ok(afterText.includes('since Oct 27, 2026'));
    assert.ok(afterText.includes('At 2026-10-27T07:30:00Z') && !afterText.includes('At 2026-10-27T05:30:00Z'), 'the cut is still the builder’s midnight');
  });

  test('the summary counts only the people in the period, and says the calls are for everyone', () => {
    const inside = lead({ name: 'Inside Ida', firstVisitAt: daysAgo(2), phone: '1', plan: { afford: 'x', payment: 'y' }, savedHomeIds: ['h1'] });
    const outside = lead({ name: 'Outside Oz', firstVisitAt: daysAgo(40), plan: { afford: 'x', payment: 'y', loans: 'z', compare: 'a', dpa: 'b' }, savedHomeIds: ['h1', 'h2'] });
    const closedInside = lead({ name: 'Closed In', firstVisitAt: daysAgo(1), archivedAt: daysAgo(0), phone: '9', plan: { afford: 'x', payment: 'y', loans: 'z', compare: 'a', dpa: 'b' }, savedHomeIds: ['h1', 'h2'] });
    const waitingOutside = lead({ name: 'Waiting Wes', firstVisitAt: daysAgo(60), plan: { afford: 'x' }, savedHomeIds: ['h1'], tour: { date: '2026-10-21', time: '10:00', contact: 'phone' } });
    const made = leadsPdf([inside, outside, waitingOutside, closedInside], { period: '7' });
    const text = pdfText(made.buffer);
    assert.equal(made.figures.people, 1, 'one of the people in the period');
    assert.equal(made.figures.everyone, 3, 'three open people altogether; the closed person is neither');
    assert.ok(flat(made.buffer).includes('of 3 in all'));
    assert.ok(!text.includes('Closed In'));
    assert.equal(made.figures.averagePlan, 38, 'only the person in the period: 3 of 8 tools');
    assert.equal(made.figures.waiting, 1, 'everyone’s calls, as the note says');
    assert.ok(flat(leadsPdf([inside, waitingOutside], { period: '7' }).buffer).includes('Calls waiting and Past their day count everyone, not only the people in this period.'));
    assert.ok(!flat(leadsPdf([inside]).buffer).includes('count everyone, not only'), 'no note when the report is everyone');
  });

  test('a period with no one in it still shows the weekly trend, and only that', () => {
    const text = pdfText(leadsPdf([lead({ firstVisitAt: '2026-09-20T12:00:00Z', phone: '1', savedHomeIds: ['h1'] })], { period: '7' }).buffer);
    assert.ok(text.includes('SIGN-UPS PER WEEK'), 'the trend is of everyone, so it is still drawn');
    assert.equal((text.match(/No one in this period\./g) ?? []).length, 2, 'the two panels about this period’s people say so');
    assert.ok(!/My Price Range\n0 of/.test(text), 'and draw no bars of nothing');
    assert.ok(text.includes('No one signed up in this period.'));
    assert.ok(!pdfText(leadsPdf([], { period: '7' }).buffer).includes('SIGN-UPS PER WEEK'), 'no one at all: no panels');
  });

  test('a period key that is not one is everyone, and never prints "undefined"', () => {
    for (const period of ['__proto__', 'constructor', 'toString', undefined, null, '']) {
      const text = pdfText(leadsPdf([lead()], { period }).buffer);
      assert.ok(!text.includes('undefined'), String(period));
      assert.ok(text.includes('EVERYONE (1)') && text.includes('Leads report · Everyone · Lehi, Utah'), String(period));
    }
  });

  test('a person with no readable sign-up time is in everyone, never in a period, and does not break the order', () => {
    const odd = [lead({ name: 'No Date', firstVisitAt: null }), lead({ name: 'Bad Date', firstVisitAt: 'not a date' }), lead({ name: 'Real Date', firstVisitAt: daysAgo(2) })];
    const all = pdfText(leadsPdf(odd).buffer);
    assert.ok(all.includes('No Date') && all.includes('Bad Date') && all.includes('Real Date'));
    assert.ok(all.indexOf('Real Date') < all.indexOf('No Date'), 'the dated one is newest');
    const week = pdfText(leadsPdf(odd, { period: '7' }).buffer);
    assert.ok(week.includes('Real Date') && !week.includes('No Date') && !week.includes('Bad Date'));
  });
});

describe('closed (archived) people', () => {
  const closed = (extra = {}) => lead({
    name: 'Closed Cleo', email: 'cleo@closed.test', phone: '(801) 555-0199', firstVisitAt: daysAgo(1), archivedAt: daysAgo(0),
    consent: { granted: true, at: daysAgo(1) }, notes: 'Do not include me', savedHomeIds: ['h2'], plan: { afford: 'x', payment: 'y' },
    tour: { date: '2026-10-21', time: '10:00', contact: 'phone', topic: 'lender' }, ...extra,
  });

  test('are nowhere in the leads report: not the roster, the calls, the tiles, the charts or the file', () => {
    const open = lead({ name: 'Open Olive', firstVisitAt: daysAgo(1), phone: '1', savedHomeIds: ['h1'] });
    const made = leadsPdf([open, closed()]);
    const text = pdfText(made.buffer);
    assert.ok(!/Closed Cleo|cleo@closed\.test|Do not include|555-0199/.test(text), 'nothing about them is printed');
    assert.ok(!/closed/i.test(text), 'and the word does not appear at all');
    assert.equal(made.people, 1);
    assert.equal(made.figures.people, 1);
    assert.equal(made.figures.waiting, 0, 'a closed person is not waiting for a call');
    assert.equal(made.figures.doNotCall, 1, 'and their consent is not counted (open Olive was never asked)');
    assert.ok(text.includes('SCHEDULED CALLS WAITING (0)') && text.includes('EVERYONE (1)'));
    assert.ok(/The Aspen\n1 save\n/.test(text) && !text.includes('The Birch'), 'their saved home is not counted in the most-saved list');
    assert.ok(/My Payment\n0 of 1\n/.test(text), 'nor are their tools');
    const thisWeek = text.split('\n');
    assert.equal(thisWeek[thisWeek.indexOf('Oct 12 (this wk)') + 1], '1', 'nor their sign-up in the weekly count');
  });

  test('stay out however the report is asked for: every period, and an unknown one', () => {
    for (const period of ['all', '7', '30', '90', 'nonsense']) {
      const text = pdfText(leadsPdf([lead({ name: 'Open Ola' }), closed()], { period }).buffer);
      assert.ok(!text.includes('Closed Cleo'), period);
    }
  });

  test('are back when the app reopens them (it clears the closed date when they book again)', () => {
    const text = pdfText(leadsPdf([closed({ archivedAt: null })]).buffer);
    assert.ok(text.includes('Closed Cleo') && text.includes('SCHEDULED CALLS WAITING (1)'));
  });

  test('can still have their own person report, which says plainly that they are closed', () => {
    const text = pdfText(userPdf(closed()).buffer);
    assert.ok(text.includes('Closed Cleo'));
    assert.equal(tile(text, 'Status'), 'Closed');
  });
});

describe('the weekly sign-ups chart', () => {
  const week = (text, label) => {
    const lines = text.split('\n');
    const at = lines.indexOf(label);
    return { label: lines[at], count: lines[at + 1] };
  };

  test('weeks start on Monday in the builder’s day, count the right people, and stop at eight', () => {
    const at = (iso, name) => lead({ name, firstVisitAt: iso });
    const text = pdfText(leadsPdf([
      at('2026-10-12T06:05:00Z', 'Mon Oct 12 00:05 Denver'), // this week
      at('2026-10-12T05:55:00Z', 'Sun Oct 11 23:55 Denver'), // last week: by UTC it would be this week
      at('2026-10-16T17:00:00Z', 'Fri this week'),
      at('2026-10-05T06:00:00Z', 'Mon Oct 5 00:00 Denver'),
      at('2026-08-24T06:00:00Z', 'Mon Aug 24 00:00 Denver'), // the first of the eight
      at('2026-08-24T05:59:00Z', 'Sun Aug 23 23:59 Denver'), // before the eight
    ]).buffer);
    assert.deepEqual(week(text, 'Oct 12 (this wk)'), { label: 'Oct 12 (this wk)', count: '2' });
    assert.deepEqual(week(text, 'Oct 5'), { label: 'Oct 5', count: '2' });
    assert.deepEqual(week(text, 'Aug 24'), { label: 'Aug 24', count: '1' });
    assert.equal((text.match(/^(Aug|Sep|Oct) \d+( \(this wk\))?$/gm) ?? []).length, 8);
    assert.ok(!text.split('\n').includes('Aug 17'));
    assert.deepEqual(week(text, 'Sep 14'), { label: 'Sep 14', count: '0' });
  });

  test('a Sunday-night sign-up in another zone falls in the builder’s week, not the server’s', () => {
    const lateSunday = lead({ name: 'Late Sunday', firstVisitAt: '2026-10-12T04:30:00Z' }); // Sun Oct 11 22:30 Denver
    const denver = pdfText(leadsPdf([lateSunday]).buffer);
    assert.equal(week(denver, 'Oct 5').count, '1');
    const utc = pdfText(leadsPdf([lateSunday], { timeZone: 'UTC' }).buffer);
    assert.equal(week(utc, 'Oct 12 (this wk)').count, '1');
    const honolulu = pdfText(buildLeadsPdf({ community, homes, leads: [lateSunday], timeZone: 'Pacific/Honolulu', now: NOW }).buffer);
    assert.equal(week(honolulu, 'Oct 5').count, '1');
  });
});

describe('numbers that must agree with themselves', () => {
  test('a saved home that was deleted is counted nowhere, in either report', () => {
    const gone = lead({ name: 'Gone Gus', phone: '1', savedHomeIds: ['deleted'] });
    const mixed = lead({ name: 'Mixed Mia', phone: '1', savedHomeIds: ['h1', 'deleted'] });
    const made = leadsPdf([gone, mixed]);
    const text = pdfText(made.buffer);
    assert.equal(made.figures.savedHome, 1, 'only the person with a home that still exists');
    assert.ok(text.includes('1 saved: The Aspen'), 'the deleted one is not counted in a row either');
    assert.ok(!text.includes('2 saved'));
    const person = pdfText(userPdf(mixed).buffer);
    assert.equal(tile(person, 'Homes saved'), '1');
    assert.ok(person.includes('Homes saved (1)'));
    const none = pdfText(userPdf(gone).buffer);
    assert.equal(tile(none, 'Homes saved'), '0');
    assert.ok(none.includes('Homes saved (0)') && none.includes('No homes saved.'));
  });

  test('percentages round, not floor', () => {
    const made = leadsPdf([lead({ phone: '1' }), lead({ phone: '2' }), lead()]);
    assert.equal(made.figures.gavePhone, 2);
    assert.ok(pdfText(made.buffer).split('\n').includes('67%'), '2 of 3 is 67%, not 66%');
    assert.equal(made.figures.averagePlan, 0);
    const average = leadsPdf([lead({ plan: { afford: 'x' } }), lead({ plan: { afford: 'x' } }), lead({ plan: { afford: 'x', payment: 'y' } })]);
    assert.equal(average.figures.averagePlan, 17, '(13% + 13% + 25%) / 3 = 17%: each person rounded first, then averaged and rounded');
    assert.ok(pdfText(average.buffer).includes('17%'));
  });

  test('the waiting-calls and past-their-day tiles agree with the table', () => {
    const upcoming = lead({ name: 'Up One', tour: { date: '2026-10-20', time: '10:00', contact: 'phone' } });
    const upcoming2 = lead({ name: 'Up Two', tour: { time: 'Tuesday afternoon', contact: 'phone' } });
    const past = lead({ name: 'Past One', tour: { date: '2026-10-01', time: '10:00', contact: 'phone' } });
    const made = leadsPdf([upcoming, upcoming2, past]);
    const text = pdfText(made.buffer);
    assert.equal(made.figures.waiting, 3);
    assert.equal(made.figures.overdue, 1);
    assert.ok(text.includes('SCHEDULED CALLS WAITING (3)'));
    assert.ok(text.includes('Tuesday afternoon · Tour') || text.includes('Tuesday afternoon'), 'a request from before slots existed shows its own words');
    assert.equal((flat(made.buffer).match(/call waiting/g) ?? []).length, 3, 'and every one of them says so in the list');
  });

  test('the consent column says Declined for a no and Never asked for no record, each on its own person', () => {
    const said = lead({ name: 'Zed Said No', phone: '1', consent: { granted: false, at: daysAgo(1) }, firstVisitAt: daysAgo(1) });
    const never = lead({ name: 'Yan Never Asked', phone: '2', firstVisitAt: daysAgo(2) });
    const yes = lead({ name: 'Xia Said Yes', phone: '3', consent: { granted: true, at: daysAgo(1) }, firstVisitAt: daysAgo(3) });
    const lines = pdfText(leadsPdf([yes, never, said]).buffer).split('\n');
    const at = (name) => lines.findIndex((line) => line === name);
    const between = (from, to, word) => lines.slice(at(from), to ? at(to) : undefined).includes(word);
    assert.ok(between('Zed Said No', 'Yan Never Asked', 'DO NOT CALL · DECLINED') && !between('Zed Said No', 'Yan Never Asked', 'DO NOT CALL · NEVER ASKED'));
    assert.ok(between('Yan Never Asked', 'Xia Said Yes', 'DO NOT CALL · NEVER ASKED') && !between('Yan Never Asked', 'Xia Said Yes', 'DO NOT CALL · DECLINED'));
    assert.ok(between('Xia Said Yes', null, 'Agreed') && !between('Xia Said Yes', null, 'DO NOT CALL · DECLINED'));
  });

  test('the person report counts actions, and marks a full log as 200 or more', () => {
    const some = Array.from({ length: 199 }, (_, i) => ({ text: `a${i}`, createdAt: daysAgo(1) }));
    assert.equal(tile(pdfText(userPdf(lead({ activity: some })).buffer), 'Actions in the app'), '199');
    const full = Array.from({ length: 200 }, (_, i) => ({ text: `a${i}`, createdAt: daysAgo(1) }));
    const text = pdfText(userPdf(lead({ activity: full })).buffer);
    assert.equal(tile(text, 'Actions in the app'), '200+');
    assert.ok(text.includes('Activity (latest 200)'));
  });
});

describe('time zones', () => {
  const withZone = (value, run) => {
    const before = process.env.REPORT_TIME_ZONE;
    if (value === undefined) delete process.env.REPORT_TIME_ZONE;
    else process.env.REPORT_TIME_ZONE = value;
    try {
      return run();
    } finally {
      if (before === undefined) delete process.env.REPORT_TIME_ZONE;
      else process.env.REPORT_TIME_ZONE = before;
    }
  };
  const stampOf = (options) => flat(buildLeadsPdf({ community, homes, leads: [], now: NOW, ...options }).buffer).match(/Generated .*?\d{4} \d+:\d{2} [AP]M [A-Z]{3,4}/)?.[0];

  test('with nothing set the day is Mountain Time; REPORT_TIME_ZONE moves it; a bad name falls back', () => {
    assert.equal(withZone(undefined, () => stampOf({})), 'Generated Fri, Oct 16, 2026 12:00 PM MDT');
    assert.equal(withZone('Pacific/Honolulu', () => stampOf({})), 'Generated Fri, Oct 16, 2026 8:00 AM HST');
    assert.equal(withZone('Not/AZone', () => stampOf({})), 'Generated Fri, Oct 16, 2026 12:00 PM MDT');
  });

  test('the file is named for the builder’s day, not the server’s', () => {
    const late = new Date('2026-10-17T03:00:00Z'); // Oct 16, 9 PM in Denver
    assert.equal(buildLeadsPdf({ community, homes, leads: [], now: late, timeZone: ZONE }).filename, 'edge-estates-leads-2026-10-16.pdf');
    assert.equal(buildLeadsPdf({ community, homes, leads: [], now: late, timeZone: 'UTC' }).filename, 'edge-estates-leads-2026-10-17.pdf');
    assert.equal(buildUserPdf({ community, lead: lead({ name: 'Day Namer' }), homes, now: late, timeZone: ZONE }).filename, 'day-namer-report-2026-10-16.pdf');
  });

  test('a narrow no-break space before AM or PM (newer ICU builds write one) still prints as a space', () => {
    const original = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
    // Simulate an ICU that puts U+202F between the time and AM/PM.
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      configurable: true,
      get() {
        const format = original.get.call(this);
        return (value) => format(value).replace(/ (AM|PM)/, '\u202f$1');
      },
    });
    try {
      const probe = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).format(NOW);
      assert.ok(probe.includes('\u202f'), 'the simulation is in place');
      const text = flat(buildUserPdf({ community, lead: lead({ name: 'Space Test', phone: '1', consent: { granted: true, at: '2026-09-20T16:00:00Z' } }), homes, now: NOW, timeZone: ZONE }).buffer);
      assert.ok(text.includes('on Sun, Sep 20, 2026 at 10:00 AM.'), 'a space, not a question mark');
      assert.ok(!text.includes('?'));
    } finally {
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', original);
    }
  });
});

describe('text far longer than a form allows (records from before the limits)', () => {
  const long = (n, ch = 'A') => ch.repeat(n);
  const fast = (run, ms = 3000) => {
    const started = Date.now();
    const result = run();
    assert.ok(Date.now() - started < ms, `took ${Date.now() - started} ms`);
    return result;
  };
  /** Nothing drawn lower than the bottom margin except the footer, and nothing off either side. */
  const insidePages = (buffer) => {
    for (const item of baselines(buffer)) {
      assert.ok(item.x >= 0 && item.x <= 612, `x ${item.x}`);
      assert.ok(item.y > 0 && item.y <= 792, `y ${item.y}`);
      if (!/^(Confidential\.|Page \d+ of \d+)/.test(item.text)) {
        assert.ok(item.y >= 792 - 720 - 4, `"${item.text.slice(0, 30)}" at ${item.y} is over the footer`);
      }
    }
  };

  test('an 8,000-character name, note, home name, plan result and legacy call time build in moments and stay on the page', () => {
    // Long enough that a quadratic wrap would take many seconds and fail the clock below, short enough to fail fast.
    const big = long(8000);
    const homeBig = { id: 'big', name: big, price: 1, beds: 1, baths: 1, sqft: 1 };
    const person = lead({
      name: big, notes: big, phone: '1', savedHomeIds: ['big'], plan: { afford: big, payment: big }, email: `${long(250)}@test.co`,
      tour: { time: big, contact: 'phone', topic: 'community' }, activity: [{ text: big, createdAt: daysAgo(1) }],
    });
    const leads = fast(() => buildLeadsPdf({ community, leads: [person], homes: [homeBig], now: NOW, timeZone: ZONE }));
    insidePages(leads.buffer);
    const user = fast(() => buildUserPdf({ community, lead: person, homes: [homeBig], now: NOW, timeZone: ZONE }));
    insidePages(user.buffer);
    assert.ok(user.pages <= 30, `${user.pages} pages: a note is long but not a book`);
  });

  test('a 3,000-character community name, lender name and location still make a title band and a page', () => {
    const wild = { ...community, name: long(3000, 'N'), location: long(3000, 'L'), settings: { lenderName: long(3000, 'S') } };
    const made = fast(() => buildLeadsPdf({ community: wild, leads: [lead({ tour: { date: '2026-10-20', time: '10:00', contact: 'phone', topic: 'lender' } })], homes, now: NOW, timeZone: ZONE }));
    insidePages(made.buffer);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Leads report'));
    assert.match(made.filename, /^n+-leads-2026-10-16\.pdf$/);
    assert.ok(made.filename.length < 200);
  });

  test('a free-text legacy call time is cut, not printed in full, and the rest of the row is intact', () => {
    const made = leadsPdf([lead({ name: 'Legacy Lee', phone: '1', tour: { time: long(5000, 'T'), contact: 'phone' } })]);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Legacy Lee'));
    assert.ok(!text.includes(long(400, 'T')), 'not 400 in a row, let alone 5,000');
    insidePages(made.buffer);
  });
});
