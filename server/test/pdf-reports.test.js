import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { MAX_PEOPLE, PERIODS, buildLeadsPdf, buildUserPdf } from '../lib/pdfReports.js';
import { backends, startBackend } from './fixtures/harness.js';
import { pdfText, readPdf } from './fixtures/pdfText.js';

const NOW = new Date('2026-10-16T18:00:00Z'); // Fri Oct 16 2026, noon in Denver
const ZONE = 'America/Denver';
const community = {
  id: 'willow-creek-abcd', name: 'Willow Creek', location: 'Lehi, Utah', theme: 'forest', settings: { lenderName: 'Summit Home Loans' },
};
const homes = [
  { id: 'h1', name: 'The Aspen', price: 425000, beds: 4, baths: 2.5, sqft: 2100, lotNumber: '12' },
  { id: 'h2', name: 'The Birch', price: 389900, beds: 3, baths: 2, sqft: 1750, lotNumber: '' },
];
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

let counter = 0;
const lead = (extra = {}) => {
  counter += 1;
  return {
    id: `l${counter}`, communityId: community.id, name: `Person ${counter}`, email: `p${counter}@test.co`, phone: '', status: 'new', notes: '',
    tour: null, savedHomeIds: [], extraEmails: [], openedAt: null, archivedAt: null, plan: {}, activity: [], moveIn: null, consent: null,
    firstVisitAt: daysAgo(counter), ...extra,
  };
};
const leadsPdf = (leads, options = {}) => buildLeadsPdf({ community, leads, homes, now: NOW, timeZone: ZONE, ...options });
const userPdf = (person, options = {}) => buildUserPdf({ community, lead: person, homes, consents: [], now: NOW, timeZone: ZONE, ...options });

/** The text with its line breaks as spaces, for a sentence the page wrapped. */
const flat = (buffer) => pdfText(buffer).replace(/\n/g, ' ');

const poppler = (() => {
  try {
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('the leads report PDF', () => {
  test('a title band, the summary and the headings are there, and the file is named for the community and the day', () => {
    const made = leadsPdf([lead({ phone: '(801) 555-0100', consent: { granted: true, at: daysAgo(1) } }), lead()]);
    const text = pdfText(made.buffer);
    assert.equal(made.filename, 'willow-creek-leads-2026-10-16.pdf');
    assert.equal(made.people, 2);
    for (const wanted of ['Willow Creek', 'Leads report', 'Everyone · Lehi, Utah', 'What people did', 'Scheduled calls waiting (0)', 'Everyone (2)']) {
      assert.ok(text.includes(wanted), `${wanted}`);
    }
    assert.ok(text.includes('Generated Fri, Oct 16, 2026 at 12:00 PM MDT'), 'stamped in the builder’s day, with the zone');
    assert.ok(text.includes('No scheduled calls are waiting.'));
  });

  test('with no one yet it still builds, and says so', () => {
    const made = leadsPdf([]);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('No one has signed up yet.'));
    assert.ok(!text.includes('What people did'), 'no charts for nobody');
    assert.equal(made.pages, 1);
  });

  test('the period keeps only people who signed up in it, and says which', () => {
    const recent = lead({ name: 'Recent Rae', firstVisitAt: daysAgo(3) });
    const month = lead({ name: 'Monthly Max', firstVisitAt: daysAgo(20) });
    const quarter = lead({ name: 'Quarterly Quinn', firstVisitAt: daysAgo(60) });
    const old = lead({ name: 'Ancient Ada', firstVisitAt: daysAgo(200) });
    const all = [recent, month, quarter, old];
    const names = (period) => {
      const text = pdfText(leadsPdf(all, { period }).buffer);
      return ['Recent Rae', 'Monthly Max', 'Quarterly Quinn', 'Ancient Ada'].filter((name) => text.includes(name));
    };
    assert.deepEqual(names('all'), ['Recent Rae', 'Monthly Max', 'Quarterly Quinn', 'Ancient Ada']);
    assert.deepEqual(names('7'), ['Recent Rae']);
    assert.deepEqual(names('30'), ['Recent Rae', 'Monthly Max']);
    assert.deepEqual(names('90'), ['Recent Rae', 'Monthly Max', 'Quarterly Quinn']);
    assert.deepEqual(names('nonsense'), ['Recent Rae', 'Monthly Max', 'Quarterly Quinn', 'Ancient Ada'], 'an unknown period is everyone');
    const thirty = pdfText(leadsPdf(all, { period: '30' }).buffer);
    assert.ok(thirty.includes(PERIODS['30'].label));
    assert.ok(thirty.includes('PEOPLE (OF 4 IN ALL)'), 'the summary says how many there are altogether');
    assert.ok(thirty.includes('Signed up in the last 30 days (2)'));
    assert.equal(leadsPdf(all, { period: '7' }).people, 1);
  });

  test('a period with no one in it says so rather than printing an empty table', () => {
    const text = pdfText(leadsPdf([lead({ firstVisitAt: daysAgo(100) })], { period: '7' }).buffer);
    assert.ok(text.includes('No one signed up in this period.'));
  });

  test('people are listed newest first', () => {
    const text = pdfText(leadsPdf([
      lead({ name: 'Older Olive', firstVisitAt: daysAgo(10) }), lead({ name: 'Newest Nell', firstVisitAt: daysAgo(1) }), lead({ name: 'Middle Mo', firstVisitAt: daysAgo(5) }),
    ]).buffer);
    const where = (name) => text.indexOf(name);
    assert.ok(where('Newest Nell') < where('Middle Mo') && where('Middle Mo') < where('Older Olive'));
  });

  test('scheduled calls: waiting ones with who, when, about what, and how to reach them; past their day in red wording; closed and handled left out', () => {
    const soon = lead({ name: 'Soon Sam', phone: '(801) 555-0100', consent: { granted: true, at: daysAgo(2) }, tour: { date: '2026-10-20', time: '14:00', contact: 'phone', topic: 'lender' } });
    const past = lead({ name: 'Past Pat', tour: { date: '2026-10-12', time: '09:30', contact: 'email', topic: 'lender' } });
    const handled = lead({ name: 'Handled Hal', tour: { date: '2026-10-20', time: '10:00', contact: 'phone', handledAt: daysAgo(1) } });
    const closed = lead({ name: 'Closed Cleo', archivedAt: daysAgo(1), tour: { date: '2026-10-21', time: '10:00', contact: 'phone' } });
    const made = leadsPdf([soon, past, handled, closed]);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Scheduled calls waiting (2)'));
    assert.ok(text.includes('Tue, Oct 20, 2026') && text.includes('2:00 PM'));
    assert.ok(flat(made.buffer).includes('Financing (Summit Home Loans)'));
    assert.ok(text.includes('Past their day'));
    assert.ok(text.includes('by email') && text.includes('by phone'));
    assert.ok(text.includes('Do not call · never asked'), 'a person who never agreed is marked, not just left blank');
    const calls = text.slice(text.indexOf('Scheduled calls waiting'), text.indexOf('Everyone ('));
    assert.ok(calls.includes('Soon Sam') && calls.includes('Past Pat'));
    assert.ok(!calls.includes('Handled Hal') && !calls.includes('Closed Cleo'));
    assert.ok(calls.indexOf('Soon Sam') < calls.indexOf('Past Pat'), 'upcoming before past their day');
  });

  test('the calls waiting do not depend on the period chosen', () => {
    const waiting = lead({ name: 'Waiting Wes', firstVisitAt: daysAgo(150), tour: { date: '2026-10-22', time: '10:00', contact: 'phone' } });
    const text = pdfText(leadsPdf([waiting], { period: '7' }).buffer);
    assert.ok(text.includes('Scheduled calls waiting (1)') && text.includes('Waiting Wes'));
  });

  test('each person: contact, notes, saved homes, plan progress, status and what they agreed to', () => {
    const text = pdfText(leadsPdf([
      lead({
        name: 'Dana Reyes', email: 'dana@test.co', phone: '(801) 555-0111', extraEmails: ['dana.home@test.co'], notes: 'Wants a corner lot.\nPre-approved elsewhere.',
        savedHomeIds: ['h1', 'h2'], plan: { afford: 'Up to $400,000', payment: '$2,400 a month' }, status: 'contacted', consent: { granted: true, at: daysAgo(3) },
      }),
      lead({ name: 'Nia Park', phone: '(801) 555-0122', consent: { granted: false, at: daysAgo(3) } }),
      lead({ name: 'Old Oscar', archivedAt: daysAgo(1) }),
    ]).buffer);
    for (const wanted of [
      'Dana Reyes', 'dana@test.co', 'also dana.home@test.co', '(801) 555-0111', 'Note: Wants a corner lot. Pre-approved elsewhere.',
      '2 saved', 'The Aspen, The Birch', '38%', 'Contacted', 'Agreed', 'Declined', 'Closed',
    ]) assert.ok(text.includes(wanted), wanted);
  });

  test('the summary counts: open and closed, phones, agreed, saved and the average plan', () => {
    const text = pdfText(leadsPdf([
      lead({ phone: '1', consent: { granted: true, at: daysAgo(1) }, savedHomeIds: ['h1'], plan: { afford: 'x', payment: 'y', loans: 'z', compare: 'a' } }),
      lead({ phone: '2', consent: { granted: false, at: daysAgo(1) } }),
      lead({ archivedAt: daysAgo(1) }),
      lead(),
    ]).buffer);
    const lines = text.split('\n');
    const value = (label) => lines[lines.indexOf(label.toUpperCase()) - 1];
    assert.equal(value('People'), '4');
    assert.equal(value('Open · closed'), '3 · 1');
    assert.equal(value('Gave a phone · 50%'), '2');
    assert.equal(value('Agreed to calls · 25%'), '1');
    assert.equal(value('Saved a home · 25%'), '1');
    assert.equal(value('Average plan progress'), '16%', '(5 of 8 is 63% for one person, none for three) / 4');
  });

  test('what people did: the most saved homes, the tools used and the sign-ups for each of the last eight weeks', () => {
    const text = pdfText(leadsPdf([
      lead({ savedHomeIds: ['h1', 'h2'], plan: { afford: 'x' } }), lead({ savedHomeIds: ['h1'], plan: { afford: 'x', payment: 'y' } }), lead({ savedHomeIds: ['h1'] }),
    ]).buffer);
    assert.ok(/The Aspen\n3 saves\nThe Birch\n1 save\n/.test(text), 'most saved first, singular for one');
    assert.ok(/My Price Range\n2 of 3\nMy Payment\n1 of 3\n/.test(text), 'the tool most used first');
    assert.equal((text.match(/Week of /g) ?? []).length, 8);
    assert.ok(text.includes('(this week)'));
  });

  test('a name or note with a quote, accent, symbol or PDF syntax comes out as the text it is', () => {
    const tricky = [
      lead({ name: 'José Núñez', notes: 'He said “yes” — then asked about the € price…' }),
      lead({ name: ') Tj ET /Evil (', notes: '\\ << /AA >> endstream' }),
      lead({ name: 'Zoë O’Connor' }),
    ];
    const made = leadsPdf(tricky);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('José Núñez'));
    for (const [code, what] of [['\u0093yes\u0094', 'curly quotes'], ['\u0097', 'the dash'], ['\u0080', 'the euro'], ['\u0085', 'the ellipsis']]) {
      assert.ok(flat(made.buffer).includes(code), `${what} keep their Windows-1252 code`);
    }
    assert.ok(text.includes(') Tj ET /Evil ('));
    assert.ok(text.includes('Zoë O\u0092Connor'));
    for (const page of readPdf(made.buffer)) assert.ok(!/\)\s*Tj/.test(page.ops) && !page.ops.includes('Evil'));
  });

  test('a long roster runs over several pages, repeating the table header, and never loses anyone', () => {
    const people = Array.from({ length: 150 }, (_, i) => lead({ name: `Buyer Number ${i}`, email: `buyer${i}@test.co`, phone: '(801) 555-0100', savedHomeIds: ['h1', 'h2'], notes: i % 3 === 0 ? 'A note that goes on a little.' : '' }));
    const made = leadsPdf(people);
    const pages = readPdf(made.buffer);
    assert.ok(pages.length >= 10, `${pages.length} pages`);
    assert.equal(made.pages, pages.length);
    const text = pages.flatMap((page) => page.lines).join('\n');
    for (let i = 0; i < 150; i += 1) assert.ok(text.includes(`Buyer Number ${i}`), `person ${i}`);
    for (const [i, page] of pages.slice(1).entries()) {
      assert.ok(page.lines.some((line) => line.includes('Leads report')), `page ${i + 2} has the running header`);
      assert.ok(page.lines.includes(`Page ${i + 2} of ${pages.length}`), `page ${i + 2} is numbered`);
    }
    assert.ok(pages[0].lines.includes(`Page 1 of ${pages.length}`));
  });

  test(`no more than ${MAX_PEOPLE} people are printed, and it says how many were left out`, () => {
    const people = Array.from({ length: MAX_PEOPLE + 5 }, (_, i) => lead({ name: `P${i}`, firstVisitAt: new Date(NOW.getTime() - (i + 1) * 60000).toISOString() }));
    const text = pdfText(leadsPdf(people).buffer);
    assert.ok(text.includes(`Showing the newest ${MAX_PEOPLE} of ${MAX_PEOPLE + 5} people.`));
    assert.ok(text.includes('P0') && !text.includes(`P${MAX_PEOPLE + 4}\n`), 'the newest are kept, the oldest dropped');
  });

  test('days are the builder’s, not the server’s: a late-evening sign-up is still that evening', () => {
    const late = lead({ name: 'Late Lou', firstVisitAt: '2026-10-17T03:30:00Z' }); // Oct 16, 9:30 PM in Denver
    assert.ok(pdfText(leadsPdf([late]).buffer).includes('Oct 16, 2026'));
    assert.ok(pdfText(leadsPdf([late], { timeZone: 'UTC' }).buffer).includes('Oct 17, 2026'));
  });

  test('the title band takes the community’s own colour and a community with no theme still builds', () => {
    const forest = readPdf(leadsPdf([lead()]).buffer)[0].ops;
    const plain = readPdf(buildLeadsPdf({ community: { id: 'x', name: 'No Theme' }, leads: [], homes: [], now: NOW, timeZone: ZONE }).buffer)[0].ops;
    assert.ok(forest.includes('0.12 0.3 0.23 rg'), 'the forest primary #1F4D3A');
    assert.ok(plain.includes('0.06 0.16 0.26 rg'), 'the default theme primary #102A43');
  });

  test('a PDF reader opens it, and its pages and text agree with ours', { skip: !poppler }, () => {
    const made = leadsPdf(Array.from({ length: 40 }, (_, i) => lead({ name: `José Núñez ${i}`, notes: '“Quoted” — €' })));
    const dir = mkdtempSync(join(tmpdir(), 'pdf-reports-'));
    try {
      const file = join(dir, 'leads.pdf');
      writeFileSync(file, made.buffer);
      const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
      assert.match(info, new RegExp(`Pages:\\s+${made.pages}\\b`));
      assert.match(info, /Title:\s+Willow Creek · Leads report/);
      const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
      assert.ok(text.includes('José Núñez 39'));
      assert.ok(text.includes('“Quoted” — €'));
      assert.ok(text.includes(`Page ${made.pages} of ${made.pages}`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the report PDF for one person', () => {
  const dana = () => lead({
    name: 'Dana Reyes', email: 'dana@test.co', phone: '(801) 555-0111', notes: 'Prefers texts after 5.', savedHomeIds: ['h1', 'gone'],
    plan: { afford: 'Up to $400,000', payment: '$2,400 a month' }, status: 'contacted', firstVisitAt: '2026-09-20T16:00:00Z',
    consent: { granted: true, at: '2026-09-20T16:00:00Z', text: 'I agree to receive calls and texts from Willow Creek.', version: 'v2' },
    tour: { date: '2026-10-20', time: '14:00', contact: 'phone', topic: 'lender', requestedAt: '2026-10-15T15:00:00Z' },
    activity: [
      { text: 'Asked to schedule a tour', createdAt: '2026-10-15T15:00:00Z' },
      { text: 'Saved The Aspen', createdAt: '2026-10-14T20:15:00Z' },
    ],
  });

  test('the file is named for the person and the day, and has the sections a builder reads', () => {
    const made = userPdf(dana());
    const text = pdfText(made.buffer);
    assert.equal(made.filename, 'dana-reyes-report-2026-10-16.pdf');
    for (const wanted of [
      'Willow Creek', 'User report: Dana Reyes', 'dana@test.co', '(801) 555-0111', 'Contact', 'Calls and texts', 'Scheduled call',
      'Homes saved (1)', 'What they worked out', 'Notes', 'Activity (2)', 'Prefers texts after 5.',
    ]) assert.ok(text.includes(wanted), wanted);
    assert.ok(text.includes('Sep 20, 2026'), 'signed up');
    assert.ok(text.includes('Oct 15, 2026'), 'last activity');
  });

  test('what they agreed to: the answer, when, the exact words shown and the version; and every answer on record', () => {
    const made = userPdf(dana(), { consents: [
      { granted: true, at: '2026-09-20T16:00:00Z' }, { granted: false, at: '2026-09-01T16:00:00Z' },
    ] });
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Agreed to calls and texts on Sun, Sep 20, 2026 at 10:00 AM.'));
    assert.ok(text.includes('Wording shown (version v2): I agree to receive calls and texts from Willow Creek.'));
    assert.ok(text.includes('2 answers on record: agreed Sep 20, 2026; declined Sep 1, 2026.'));
  });

  test('a person who declined, and one who was never asked, are told plainly not to be called', () => {
    const declined = flat(userPdf(lead({ phone: '(801) 555-0100', consent: { granted: false, at: '2026-09-20T16:00:00Z', text: 'x', version: 'v2' } })).buffer);
    assert.ok(declined.includes('Did not agree to calls and texts (answered Sun, Sep 20, 2026 at 10:00 AM). Do not call or text this number.'));
    const never = flat(userPdf(lead()).buffer);
    assert.ok(never.includes('Never asked.') && never.includes('Do not call or text without asking.'));
  });

  test('the scheduled call: what for, when, and whether it is still waiting, handled or closed', () => {
    const waiting = pdfText(userPdf(dana()).buffer);
    assert.ok(waiting.includes('Tue, Oct 20 at 2:00 PM · by phone · about financing (Summit Home Loans).'));
    assert.ok(waiting.includes('Waiting for a call.'));
    assert.ok(waiting.includes('Requested Thu, Oct 15, 2026 at 9:00 AM.'));
    const handled = pdfText(userPdf({ ...dana(), tour: { ...dana().tour, handledAt: '2026-10-16T15:00:00Z' } }).buffer);
    assert.ok(handled.includes('Handled Oct 16, 2026.') && !handled.includes('Waiting for a call.'));
    const none = pdfText(userPdf(lead({ phone: '1' })).buffer);
    assert.ok(!none.includes('Scheduled call'));
  });

  test('saved homes with price, beds, baths, size and lot; a home that no longer exists is skipped, and none says so', () => {
    const text = pdfText(userPdf(dana()).buffer);
    for (const wanted of ['The Aspen', '$425,000', '2.5', '2,100', '12']) assert.ok(text.includes(wanted), wanted);
    assert.ok(!text.includes('gone'));
    assert.ok(pdfText(userPdf(lead()).buffer).includes('No homes saved.'));
  });

  test('what they worked out lists every tool, with what was saved or that it was not started', () => {
    const text = pdfText(userPdf(dana()).buffer);
    assert.ok(text.includes('My Price Range') && text.includes('Up to $400,000'));
    assert.ok(text.includes('My Payment') && text.includes('$2,400 a month'));
    assert.ok(text.includes('My Loan Options'));
    assert.ok(text.includes('Not started'));
    assert.ok(!text.includes('Homes I Like'), 'saved homes have their own section');
  });

  test('the move-in plan: the sentence, the choices and every step, but only when they have a date of their own', () => {
    const withPlan = { ...dana(), moveIn: { homeId: 'h1', targetDate: '2027-03-01', drivers: ['lease'], leaseEnd: '2027-02-28', payMethod: 'loan' } };
    const text = pdfText(userPdf(withPlan).buffer);
    assert.ok(text.includes('Move-in plan'));
    assert.ok(/To have keys on Mar 1, 2027, your offer needs to be in by [A-Z][a-z]{2} \d+, 2027\./.test(text));
    assert.ok(text.includes('Closing day: you get your keys'));
    assert.ok(text.includes('LEASE ENDS') && text.includes('Feb 28, 2027'));
    assert.ok(!pdfText(userPdf(dana()).buffer).includes('Move-in plan'), 'no plan, no section');
    assert.ok(!pdfText(userPdf({ ...dana(), moveIn: { homeId: 'h1', targetDate: '' } }).buffer).includes('Move-in plan'), 'a plan with no date is a preview, not a plan');
  });

  test('the activity: newest first, in the builder’s day, and the notes only when there are some', () => {
    const text = pdfText(userPdf(dana()).buffer);
    assert.ok(text.indexOf('Thu, Oct 15, 2026 at 9:00 AM') < text.indexOf('Wed, Oct 14, 2026 at 2:15 PM'));
    assert.ok(text.includes('Asked to schedule a tour') && text.includes('Saved The Aspen'));
    const quiet = pdfText(userPdf(lead({ phone: '1', consent: { granted: true, at: daysAgo(1) } })).buffer);
    assert.ok(quiet.includes('No activity recorded.'));
    assert.ok(!quiet.includes('\nNotes\n'));
  });

  test('a hundred and fifty actions run over onto more pages with the table header on each', () => {
    const busy = { ...dana(), activity: Array.from({ length: 150 }, (_, i) => ({ text: `Viewed home number ${i}`, createdAt: daysAgo(i % 30) })) };
    const pages = readPdf(userPdf(busy).buffer);
    assert.ok(pages.length >= 3);
    const text = pages.flatMap((page) => page.lines).join('\n');
    for (let i = 0; i < 150; i += 1) assert.ok(text.includes(`Viewed home number ${i}`), `action ${i}`);
    assert.ok(text.includes('Activity (latest 200)') === false, 'under the cap, the real count is shown');
    assert.ok(text.includes('Activity (150)'));
    for (const page of pages.slice(1)) assert.ok(page.lines.includes('WHAT THEY DID') || !page.lines.some((l) => l.startsWith('Viewed')), 'the header is repeated above rows');
  });

  test('a name or note with a quote, accent, emoji or PDF syntax is shown as typed (an emoji as a question mark)', () => {
    const made = userPdf(lead({ name: 'Zoë “Z” O’Connor 😀', notes: ') Tj ET /Evil (\n\\ second line', phone: '1', consent: { granted: true, at: daysAgo(1) } }));
    const text = pdfText(made.buffer);
    assert.ok(text.includes('User report: Zoë \u0093Z\u0094 O\u0092Connor ?'));
    assert.ok(text.includes(') Tj ET /Evil (') && text.includes('\\ second line'));
    assert.match(made.filename, /^zoe-z-oconnor-report-2026-10-16\.pdf$/, 'the file name is plain ASCII');
    for (const page of readPdf(made.buffer)) assert.ok(!/\)\s*Tj/.test(page.ops) && !page.ops.includes('Evil'));
  });

  test('a PDF reader opens it', { skip: !poppler }, () => {
    const made = userPdf({ ...dana(), moveIn: { homeId: 'h1', targetDate: '2027-03-01', drivers: [], payMethod: 'loan' } });
    const dir = mkdtempSync(join(tmpdir(), 'pdf-user-'));
    try {
      const file = join(dir, 'user.pdf');
      writeFileSync(file, made.buffer);
      assert.match(execFileSync('pdfinfo', [file], { encoding: 'utf8' }), new RegExp(`Pages:\\s+${made.pages}\\b`));
      assert.ok(execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }).includes('Dana Reyes'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

for (const kind of backends()) {
  describe(`the PDF downloads over HTTP (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let counter2 = 0;

    before(async () => {
      app = await startBackend(kind, 'pdf_reports');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Pdf Test Estates', location: 'Lehi, Utah' } })).body.id;
    });
    after(async () => {
      delete process.env.RATE_LIMITS;
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const getPdf = async (path, opts = {}) => {
      const res = await api(path, { token, raw: true, ...opts });
      return { res, status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
    };
    const signUp = async (who) => {
      counter2 += 1;
      const res = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { phone: '', ...who } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    };

    test('both need an admin: no token, a buyer’s token and a made-up one are all refused', async () => {
      const buyer = await signUp({ name: 'Auth Check', email: 'auth@test.co' });
      for (const path of [`/api/admin/communities/${cid}/reports/leads.pdf`, `/api/admin/leads/${buyer.lead.id}/report.pdf`]) {
        assert.equal((await api(path)).status, 401, path);
        assert.equal((await api(path, { token: buyer.token })).status, 401, `${path} with a buyer's token`);
        assert.equal((await api(path, { token: 'nonsense' })).status, 401, `${path} with a bad token`);
      }
    });

    test('the leads report comes back as a private PDF download with the people in it', async () => {
      await signUp({ name: 'José Núñez', email: 'jose@test.co', phone: '(801) 555-0144', consent: true });
      await signUp({ name: 'Zoë O’Connor', email: 'zoe@test.co' });
      await signUp({ name: ') Tj ET /Evil (', email: 'evil@test.co' });
      const { res, status, buffer } = await getPdf(`/api/admin/communities/${cid}/reports/leads.pdf`);
      assert.equal(status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition'), /^attachment; filename="pdf-test-estates-leads-\d{4}-\d{2}-\d{2}\.pdf"$/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(Number(res.headers.get('content-length')), buffer.length);
      assert.ok(buffer.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'));
      assert.ok(buffer.toString('latin1').endsWith('%%EOF\n'));
      const text = pdfText(buffer);
      for (const wanted of ['Pdf Test Estates', 'Leads report', 'José Núñez', 'Zoë O\u0092Connor', ') Tj ET /Evil (', 'jose@test.co', '(801) 555-0144']) {
        assert.ok(text.includes(wanted), wanted);
      }
      assert.ok(text.includes('Agreed'), 'the consent answer is carried');
    });

    test('the period is checked, and a good one is accepted', async () => {
      for (const bad of ['0', '365', 'week', '7%20days', '__proto__', 'constructor', 'toString', '']) {
        const res = await admin(`/communities/${cid}/reports/leads.pdf?period=${bad}`);
        assert.equal(res.status, 400, `period=${bad}`);
        assert.match(res.body.error, /Choose a period/);
      }
      assert.equal((await admin(`/communities/${cid}/reports/leads.pdf?period[]=7`)).status, 400, 'an array is not a period');
      for (const good of ['all', '7', '30', '90']) {
        const { status, buffer } = await getPdf(`/api/admin/communities/${cid}/reports/leads.pdf?period=${good}`);
        assert.equal(status, 200, good);
        assert.ok(pdfText(buffer).includes(PERIODS[good].label) || good === 'all');
      }
    });

    test('a community that is not there is a 404, not a PDF', async () => {
      const res = await admin('/communities/nope-xxxx/reports/leads.pdf');
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Community not found');
    });

    test('one person’s report has their contact, what they agreed to, their plan, homes and activity', async () => {
      const home = (await admin(`/communities/${cid}/homes`, { method: 'POST', body: { name: 'The Aspen', price: 425000, beds: 4, baths: 2.5, sqft: 2100 } })).body;
      const buyer = await signUp({ name: 'Dana Reyes', email: 'dana.pdf@test.co', phone: '(801) 555-0111', consent: true });
      await api('/api/me/saves', { method: 'POST', token: buyer.token, body: { homeId: home.id } });
      const plan = await api('/api/me/plan/afford', { method: 'PUT', token: buyer.token, body: { summary: 'Up to $400,000' } });
      assert.equal(plan.status, 200, JSON.stringify(plan.body));
      await admin(`/leads/${buyer.lead.id}`, { method: 'PATCH', body: { notes: 'Prefers texts after 5.' } });

      const { res, status, buffer } = await getPdf(`/api/admin/leads/${buyer.lead.id}/report.pdf`);
      assert.equal(status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition'), /^attachment; filename="dana-reyes-report-\d{4}-\d{2}-\d{2}\.pdf"$/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      const text = pdfText(buffer);
      for (const wanted of [
        'User report: Dana Reyes', 'dana.pdf@test.co', '(801) 555-0111', 'Agreed to calls and texts on', 'Wording shown', 'The Aspen', '$425,000',
        'Up to $400,000', 'Prefers texts after 5.', 'Homes I Like'.length ? 'Activity (' : '',
      ]) assert.ok(text.includes(wanted), wanted);
      assert.match(text, /Saved|saved/, 'the activity the app recorded is listed');
    });

    test('a person who was never asked about calls says so', async () => {
      const buyer = await signUp({ name: 'No Phone', email: 'nophone@test.co' });
      const { status, buffer } = await getPdf(`/api/admin/leads/${buyer.lead.id}/report.pdf`);
      assert.equal(status, 200);
      assert.ok(pdfText(buffer).includes('Never asked.'));
    });

    test('a lead that is not there is a 404, and reading the report does not mark the lead as opened', async () => {
      assert.equal((await admin('/leads/l_nope/report.pdf')).status, 404);
      const buyer = await signUp({ name: 'Unread Una', email: 'unread@test.co' });
      assert.equal((await getPdf(`/api/admin/leads/${buyer.lead.id}/report.pdf`)).status, 200);
      const after = (await admin(`/communities/${cid}/leads`)).body.find((l) => l.id === buyer.lead.id);
      assert.equal(after.openedAt, null, 'a download is not the same as an admin reading the lead');
    });

    test('a lot of people make a long file, still a valid PDF, with everyone in it', async () => {
      const lots = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Big Estates' } });
      const big = lots.body.id;
      for (let i = 0; i < 45; i += 1) {
        const res = await api(`/api/c/${big}/leads`, { method: 'POST', body: { name: `Bulk Buyer ${i}`, email: `bulk${i}@test.co`, phone: '' } });
        assert.equal(res.status, 201, JSON.stringify(res.body));
      }
      const { status, buffer } = await getPdf(`/api/admin/communities/${big}/reports/leads.pdf`);
      assert.equal(status, 200);
      const pages = readPdf(buffer);
      assert.ok(pages.length >= 2, `${pages.length} pages`);
      const text = pages.flatMap((page) => page.lines).join('\n');
      for (let i = 0; i < 45; i += 1) assert.ok(text.includes(`Bulk Buyer ${i}`), `person ${i}`);
      assert.ok(text.includes('Everyone (45)'));
    });

    test('too many at once is held back with a wait time (the caps are on only when asked for)', async () => {
      process.env.RATE_LIMITS = 'on';
      try {
        const own = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Burst Estates' } })).body.id;
        const statuses = [];
        let wait = null;
        for (let i = 0; i < 6; i += 1) {
          const res = await api(`/api/admin/communities/${own}/reports/leads.pdf`, { token, raw: true });
          statuses.push(res.status);
          if (res.status === 429) wait = res.headers.get('retry-after');
          await res.arrayBuffer();
        }
        assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429]);
        assert.ok(Number(wait) >= 1, 'Retry-After says when to try again');
        const other = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Quiet Estates' } })).body.id;
        assert.equal((await api(`/api/admin/communities/${other}/reports/leads.pdf`, { token, raw: true })).status, 200, 'another community is unaffected');
      } finally {
        delete process.env.RATE_LIMITS;
      }
    });
  });
}
