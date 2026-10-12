import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_LISTED, buildReport, csvCell, leadsCsv, reportText, toCsv,
} from '../lib/report.js';

const NOW = new Date(2026, 9, 12, 9, 0, 0); // Mon Oct 12 2026, local time
const community = { id: 'willow-creek-abcd', name: 'Willow Creek', settings: { lenderName: 'Summit Home Loans' } };
const homes = [{ id: 'h1', name: 'The Aspen' }, { id: 'h2', name: 'The Birch' }];

let counter = 0;
const lead = (extra = {}) => {
  counter += 1;
  return {
    id: `l${counter}`, communityId: community.id, name: `Person ${counter}`, email: `p${counter}@test.co`, phone: '',
    status: 'new', notes: '', tour: null, savedHomeIds: [], extraEmails: [], archivedAt: null, plan: {}, consent: null,
    firstVisitAt: new Date(Date.UTC(2026, 9, 1, 12, counter)).toISOString(), ...extra,
  };
};
const tour = (date, time = '10:00', extra = {}) => ({ slotId: 's', date, time, contact: 'phone', topic: 'community', ...extra });

test('csvCell quotes what needs it and turns anything a spreadsheet would run into plain text', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('Last, First'), '"Last, First"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  for (const risky of ['=SUM(A1)', '+1 801 555 0100', '-2+3', '@cmd', '\tx', '\rx']) {
    assert.ok(csvCell(risky).startsWith("'") || csvCell(risky).startsWith('"\''), `${JSON.stringify(risky)} -> ${csvCell(risky)}`);
  }
  assert.equal(csvCell('=HYPERLINK("http://evil.example","x")'), `"'=HYPERLINK(""http://evil.example"",""x"")"`);
  assert.equal(csvCell('a=b'), 'a=b', 'only a leading character counts');
});

test('toCsv: a byte-order mark for Excel, CRLF line ends, one row per line', () => {
  const text = toCsv([['a', 'b'], ['1', 'x,y']]);
  assert.equal(text, '﻿a,b\r\n1,"x,y"\r\n');
});

test('calls: waiting ones only, split into coming up and past their day, soonest first', () => {
  const soon = lead({ tour: tour('2026-10-13', '14:00') });
  const sooner = lead({ tour: tour('2026-10-12', '09:00') });
  const later = lead({ tour: tour('2026-11-02') });
  const noDate = lead({ tour: { time: 'Tuesday afternoon', contact: 'phone' } });
  const past = lead({ tour: tour('2026-10-09') });
  const handled = lead({ tour: tour('2026-10-14', '10:00', { handledAt: '2026-10-11T10:00:00Z' }) });
  const closed = lead({ tour: tour('2026-10-14'), archivedAt: '2026-10-10T10:00:00Z' });
  const nobody = lead();
  const report = buildReport({ community, homes, now: NOW, leads: [later, nobody, handled, soon, closed, past, noDate, sooner] });
  assert.deepEqual(report.comingUp.map((l) => l.id), [sooner.id, soon.id, later.id, noDate.id], 'soonest first; one with no date after the dated ones');
  assert.deepEqual(report.overdue.map((l) => l.id), [past.id]);
});

test('new people: everyone open the first time, then only those after the last report; closed ones are never listed', () => {
  const a = lead({ firstVisitAt: '2026-10-01T10:00:00Z' });
  const b = lead({ firstVisitAt: '2026-10-05T10:00:00Z' });
  const c = lead({ firstVisitAt: '2026-10-10T10:00:00Z' });
  const closed = lead({ firstVisitAt: '2026-10-11T10:00:00Z', archivedAt: '2026-10-11T12:00:00Z' });
  const first = buildReport({ community, homes, now: NOW, leads: [a, b, c, closed] });
  assert.deepEqual(first.fresh.map((l) => l.id), [c.id, b.id, a.id], 'newest first');
  const next = buildReport({ community, homes, now: NOW, leads: [a, b, c, closed], since: '2026-10-05T10:00:00Z' });
  assert.deepEqual(next.fresh.map((l) => l.id), [c.id], 'strictly after the last report');
  assert.equal(next.everyone, 4);
  assert.equal(next.closed, 1);
});

test('the email says what is waiting, who is new and where everyone is', () => {
  const pat = lead({
    name: 'Pat Vale', phone: '(801) 555-0101', email: 'pat@test.co', extraEmails: ['spouse@test.co'],
    savedHomeIds: ['h1', 'h2', 'gone'], plan: { afford: 'You can afford about $400,000.' }, consent: { granted: true },
    tour: tour('2026-10-13', '14:00', { topic: 'lender', contact: 'email' }),
  });
  const report = buildReport({ community, homes, now: NOW, leads: [pat], baseUrl: 'https://touradoor.example' });
  const text = reportText(report);
  assert.match(text, /^Willow Creek — leads report for Mon, Oct 12, 2026\nThis is the first report, so everyone is new\./);
  assert.match(text, /SCHEDULED CALLS WAITING \(1\)\n {2}Tue, Oct 13 at 2:00 PM · by email · about financing \(Summit Home Loans\) — Pat Vale\n {4}\(801\) 555-0101 · pat@test\.co · also spouse@test\.co\n {4}https:\/\/touradoor\.example\/admin\/communities\/willow-creek-abcd\/leads\/l/);
  assert.doesNotMatch(text, /PAST THEIR DAY/, 'that section appears only when there is something in it');
  assert.match(text, /NEW PEOPLE SINCE THE LAST REPORT \(1\)\n {2}Pat Vale — \(801\) 555-0101/);
  assert.match(text, /Saved: The Aspen, The Birch · Agreed to calls and texts/, 'a deleted home is skipped');
  assert.match(text, /Worked out: You can afford about \$400,000\./);
  assert.match(text, /Everyone \(1 person\) is in the attached spreadsheet, willow-creek-leads-2026-10-12\.csv\./);
  const empty = reportText(buildReport({ community, homes, now: NOW, leads: [], since: '2026-10-09T10:00:00Z' }));
  assert.match(empty, /The last report went out Fri, Oct 9, 2026\./);
  assert.match(empty, /SCHEDULED CALLS WAITING \(0\)\n {2}None right now\./);
  assert.match(empty, /NEW PEOPLE SINCE THE LAST REPORT \(0\)\n {2}No one new\./);
});

test('a long list is cut in the email and complete in the spreadsheet', () => {
  const many = Array.from({ length: MAX_LISTED + 7 }, () => lead());
  const report = buildReport({ community, homes, now: NOW, leads: many });
  const text = reportText(report);
  assert.equal((text.match(/^ {2}Person \d+ — no phone · p\d+@test\.co$/gm) ?? []).length, MAX_LISTED);
  assert.match(text, /…and 7 more, in the spreadsheet\./);
  assert.equal(leadsCsv(report).trim().split('\r\n').length, many.length + 1, 'the header and every person');
});

test('the spreadsheet: one row per person, closed ones marked, anything typed by a visitor made safe', () => {
  const pat = lead({
    name: '=HYPERLINK("http://evil.example","click")', email: 'pat@test.co', phone: '(801) 555-0101', notes: 'line one\nline two',
    savedHomeIds: ['h1'], plan: { afford: 'About $400k', dpa: 'May qualify' }, consent: { granted: true },
    tour: tour('2026-10-13', '14:00', { topic: 'lender', contact: 'email' }), status: 'contacted',
  });
  const quiet = lead({ name: 'Quinn, Q', archivedAt: '2026-10-10T10:00:00Z', tour: tour('2026-10-14', '09:30', { handledAt: '2026-10-11T00:00:00Z' }) });
  const csv = leadsCsv(buildReport({ community, homes, now: NOW, leads: [pat, quiet], baseUrl: 'https://t.example' }));
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.equal(lines[0], 'Name,Email,Second email,Phone,Agreed to calls and texts,Signed up,Call date,Call time,Call by,Call about,Call status,Homes saved,What they worked out,Status,Notes,Closed,Link');
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""http://evil.example"",""click"")",pat@test.co,,(801) 555-0101,Yes,2026-10-01,2026-10-13,2:00 PM,Email,Financing (Summit Home Loans),Waiting,The Aspen,About $400k | May qualify,contacted,line one line two,,https://t.example/admin/communities/willow-creek-abcd/leads/`), lines[1]);
  assert.ok(lines[2].startsWith('"Quinn, Q",'), lines[2]);
  assert.match(lines[2], /,Handled,/);
  assert.match(lines[2], /,Yes,https:\/\/t\.example\/.*$/, 'closed is marked');
});
