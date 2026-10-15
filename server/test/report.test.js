import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TIME_ZONE, MAX_LISTED, buildReport as build, csvCell, leadsCsv, reportTimeZone, reportText, toCsv,
} from '../lib/report.js';

const NOW = new Date('2026-10-12T15:00:00Z'); // Mon Oct 12 2026, 9:00 AM in Denver
const ZONE = 'America/Denver';
/** The same day wherever the tests run: the zone is always named. */
const buildReport = (options) => build({ timeZone: ZONE, ...options });
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

test('days are the builder\'s, not the server\'s: an evening call is still today, and a sign-up keeps its local date', () => {
  // 9:30 PM in Denver on Oct 12 is already Oct 13 in UTC.
  const evening = new Date('2026-10-13T03:30:00Z');
  const tonight = lead({ tour: tour('2026-10-12', '20:00'), firstVisitAt: '2026-10-13T03:10:00Z' });
  const utc = build({ community, homes, now: evening, timeZone: 'UTC', leads: [tonight] });
  assert.deepEqual(utc.overdue.map((l) => l.id), [tonight.id], 'counted in UTC the call would look a day late');
  const denver = build({ community, homes, now: evening, timeZone: ZONE, leads: [tonight] });
  assert.equal(denver.today, '2026-10-12');
  assert.deepEqual(denver.comingUp.map((l) => l.id), [tonight.id]);
  assert.equal(denver.overdue.length, 0);
  assert.match(reportText(denver), /leads report for Mon, Oct 12, 2026/);
  assert.match(reportText(denver), /Signed up 2026-10-12/);
  assert.match(leadsCsv(denver).split('\r\n')[1], /,2026-10-12,2026-10-12,8:00 PM,/, 'signed-up date and call date in the same day');
  assert.equal(denver.filename, 'willow-creek-leads-2026-10-12.csv');
});

test('the zone comes from REPORT_TIME_ZONE, and a name that is not a zone falls back to Mountain Time', () => {
  const saved = process.env.REPORT_TIME_ZONE;
  try {
    delete process.env.REPORT_TIME_ZONE;
    assert.equal(reportTimeZone(), DEFAULT_TIME_ZONE);
    process.env.REPORT_TIME_ZONE = 'Pacific/Auckland';
    assert.equal(reportTimeZone(), 'Pacific/Auckland');
    assert.equal(build({ community, now: NOW, leads: [] }).today, '2026-10-13', 'it is already tomorrow there');
    process.env.REPORT_TIME_ZONE = 'Not/AZone';
    assert.equal(reportTimeZone(), DEFAULT_TIME_ZONE);
    assert.equal(build({ community, now: NOW, leads: [] }).today, '2026-10-12');
  } finally {
    if (saved === undefined) delete process.env.REPORT_TIME_ZONE;
    else process.env.REPORT_TIME_ZONE = saved;
  }
});

test('new people are those after the last report and by the time this one was started', () => {
  const before = lead({ firstVisitAt: '2026-10-10T10:00:00.000Z' });
  const inside = lead({ firstVisitAt: '2026-10-12T14:59:59.000Z' });
  const exactly = lead({ firstVisitAt: '2026-10-12T15:00:00.000Z' });
  const after = lead({ firstVisitAt: '2026-10-12T15:00:00.001Z' });
  const report = buildReport({
    community, homes, now: NOW, leads: [before, inside, exactly, after],
    since: '2026-10-10T10:00:00.000Z', until: '2026-10-12T15:00:00.000Z',
  });
  assert.deepEqual(report.fresh.map((l) => l.id), [exactly.id, inside.id], 'not the one who signed up after it started: that is the next report\'s');
  assert.equal(report.everyone, 4, 'but the spreadsheet is still everyone');
});

test('a long list of calls is cut too, each section on its own', () => {
  const waiting = Array.from({ length: MAX_LISTED + 3 }, (_, i) => lead({ name: `Caller ${i}`, tour: tour('2026-10-20', `${String(8 + (i % 10)).padStart(2, '0')}:00`) }));
  const late = Array.from({ length: MAX_LISTED + 2 }, (_, i) => lead({ name: `Late ${i}`, tour: tour('2026-10-01') }));
  const text = reportText(buildReport({ community, homes, now: NOW, leads: [...waiting, ...late] }));
  const calls = text.split('PAST THEIR DAY')[0];
  const past = text.split('PAST THEIR DAY')[1].split('NEW PEOPLE')[0];
  assert.equal((calls.match(/— Caller \d+/g) ?? []).length, MAX_LISTED);
  assert.match(calls, /SCHEDULED CALLS WAITING \(53\)/, 'the heading still counts them all');
  assert.match(calls, /…and 3 more, in the spreadsheet\./);
  assert.equal((past.match(/— Late \d+/g) ?? []).length, MAX_LISTED);
  assert.match(past, /…and 2 more, in the spreadsheet\./);
});

test('a person who cannot be called says so beside their number, as in the Leads tab', () => {
  const yes = lead({ name: 'Yes Yolanda', phone: '(801) 555-0101', consent: { granted: true }, tour: tour('2026-10-13') });
  const no = lead({ name: 'No Nina', phone: '(801) 555-0102', consent: { granted: false }, tour: tour('2026-10-13') });
  const unasked = lead({ name: 'Unasked Uma', phone: '(801) 555-0103', consent: null, tour: tour('2026-10-13') });
  const report = buildReport({ community, homes, now: NOW, leads: [yes, no, unasked] });
  const text = reportText(report);
  const block = (who) => text.split('SCHEDULED CALLS WAITING')[1].split('\n').filter((l, i, all) => all[i - 1]?.includes(who) || l.includes(who)).join('\n');
  assert.doesNotMatch(block('Yes Yolanda'), /Do not call/);
  assert.match(block('No Nina'), /\(801\) 555-0102 · .* · Do not call · declined/);
  assert.match(block('Unasked Uma'), /Do not call · never asked/);
  assert.match(text.split('NEW PEOPLE')[1], /Signed up 2026-10-01 · Agreed to calls and texts/);
  assert.match(text.split('NEW PEOPLE')[1], /Signed up 2026-10-01 · Do not call · declined/);
  assert.match(text.split('NEW PEOPLE')[1], /Signed up 2026-10-01 · Do not call · never asked/);
  const rows = leadsCsv(report).split('\r\n');
  assert.match(rows[1], /,\(801\) 555-0101,Yes,/);
  assert.match(rows[2], /,\(801\) 555-0102,Declined,/);
  assert.match(rows[3], /,\(801\) 555-0103,Never asked,/);
});

test('a call with no time given leaves the time blank, and a name with a line break stays on one line', () => {
  const vague = lead({ name: 'Vera\nVague', tour: { time: '', contact: 'phone' } });
  const csv = leadsCsv(buildReport({ community, homes, now: NOW, leads: [vague] }));
  const row = csv.split('\r\n')[1];
  assert.ok(row.startsWith('Vera Vague,'), row);
  assert.match(row, /,,,Phone,/, 'no date and no time');
  const text = reportText(buildReport({ community: { ...community, name: 'Willow\nCreek' }, homes, now: NOW, leads: [vague] }));
  assert.match(text, /^Willow Creek — leads report/);
  assert.match(text, /— Vera Vague\n/);
});
