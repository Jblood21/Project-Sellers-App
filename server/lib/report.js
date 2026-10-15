import {
  describeTour, formatSlotDate, formatSlotTime, isArchived, isTourPending, lenderNameOf, slugify,
} from '../../shared/domain.js';
import { sendEmail } from './email.js';

/**
 * The lead report: what a builder's team needs on one page to follow up. Built when somebody presses
 * "Email the report", never on a schedule.
 *
 *  - The scheduled calls still waiting (a call someone asked for, or a time they booked, that nobody has marked
 *    handled), the ones whose day has passed listed apart so they are not missed.
 *  - The people who signed up since the last report (everyone, the first time).
 *  - A spreadsheet of everyone, so nothing is only in the email.
 *
 * Pure apart from `emailReport`: the lists, the text and the spreadsheet are built from the leads handed in,
 * and `now` is a parameter so a test does not depend on the day it runs.
 *
 * Days ("today", the day somebody signed up) are the builder's, not the server's: the server runs on UTC, where
 * an evening call would already be tomorrow's. REPORT_TIME_ZONE says whose day it is (Mountain Time by default).
 */

/** Longest list written out in the email itself; the rest are in the spreadsheet. */
export const MAX_LISTED = 50;

/** Mountain Time, where the first builders are. */
export const DEFAULT_TIME_ZONE = 'America/Denver';

/** The zone days are counted in: REPORT_TIME_ZONE when it names a real one, otherwise Mountain Time. */
export function reportTimeZone() {
  const wanted = process.env.REPORT_TIME_ZONE;
  if (!wanted) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: wanted });
    return wanted;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const when = (value) => (value ? new Date(value).getTime() : Number.NaN);
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A function from any date or timestamp to its calendar day ('2026-10-12') in `timeZone`; '' for a bad value. */
function dayCounter(timeZone) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (value) => {
    const time = value instanceof Date ? value.getTime() : when(value);
    if (Number.isNaN(time)) return '';
    const parts = Object.fromEntries(format.formatToParts(new Date(time)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

/** What a lead agreed to, in the words the Leads tab uses beside a phone number. */
const consentLabel = (lead) => (lead.consent?.granted
  ? 'Agreed to calls and texts'
  : `Do not call · ${lead.consent ? 'declined' : 'never asked'}`);

/**
 * One spreadsheet cell. Quoted when it holds a comma, a quote or a line break. A cell that starts with = + - @
 * (or a tab or return) is made plain text with a leading apostrophe: names and emails are typed by anyone with the
 * community's link, and a spreadsheet would run such a cell as a formula.
 */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text: CRLF line ends, and a byte-order mark so Excel reads accented names as UTF-8. */
export const toCsv = (rows) => `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

const COLUMNS = [
  'Name', 'Email', 'Second email', 'Phone', 'Agreed to calls and texts', 'Signed up', 'Call date', 'Call time',
  'Call by', 'Call about', 'Call status', 'Homes saved', 'What they worked out', 'Status', 'Notes', 'Closed', 'Link',
];

/**
 * The lists the report is made of. `since` is when the last report was started and `until` when this one was:
 * a person counts as new when they signed up after the first and by the second, so somebody who signs up while
 * the mail is going out belongs to the next report, never to neither.
 */
export function buildReport({
  community, leads = [], homes = [], now = new Date(), since = '', until = '', baseUrl = '', timeZone = reportTimeZone(),
}) {
  const dayOf = dayCounter(timeZone);
  const today = dayOf(now);
  const homeName = new Map(homes.map((home) => [home.id, home.name]));
  const link = (lead) => (baseUrl ? `${baseUrl}/admin/communities/${community.id}/leads/${lead.id}` : '');
  const savedNames = (lead) => (lead.savedHomeIds ?? []).map((id) => homeName.get(id)).filter(Boolean);
  const byCall = (a, b) => `${a.tour.date || '9999-12-31'} ${a.tour.time || ''}`.localeCompare(`${b.tour.date || '9999-12-31'} ${b.tour.time || ''}`);

  const waiting = leads.filter(isTourPending);
  const comingUp = waiting.filter((lead) => !lead.tour.date || lead.tour.date >= today).sort(byCall);
  const overdue = waiting.filter((lead) => lead.tour.date && lead.tour.date < today).sort(byCall);
  const sinceTime = when(since);
  const untilTime = when(until);
  const fresh = leads
    .filter((lead) => !isArchived(lead)
      && (Number.isNaN(sinceTime) || when(lead.firstVisitAt) > sinceTime)
      && (Number.isNaN(untilTime) || when(lead.firstVisitAt) <= untilTime))
    .sort((a, b) => when(b.firstVisitAt) - when(a.firstVisitAt));

  return {
    community, today, since, dayOf, link, savedNames, comingUp, overdue, fresh,
    everyone: leads.length,
    closed: leads.filter(isArchived).length,
    leads,
    filename: `${slugify(community.name) || 'community'}-leads-${today}.csv`,
  };
}

/** The spreadsheet: one row per person, oldest first, closed ones included and marked. */
export function leadsCsv(report) {
  const lender = lenderNameOf(report.community);
  const rows = [COLUMNS];
  for (const lead of report.leads) {
    const tour = lead.tour;
    rows.push([
      oneLine(lead.name),
      lead.email,
      (lead.extraEmails ?? []).join(' '),
      lead.phone,
      lead.consent?.granted ? 'Yes' : lead.consent ? 'Declined' : 'Never asked',
      report.dayOf(lead.firstVisitAt),
      tour?.date ?? '',
      tour?.time ? (tour.date ? formatSlotTime(tour.time) : oneLine(tour.time)) : '',
      tour ? (tour.contact === 'email' ? 'Email' : 'Phone') : '',
      tour ? (tour.topic === 'lender' ? `Financing (${lender})` : 'Tour of the community') : '',
      tour ? (tour.handledAt ? 'Handled' : isArchived(lead) ? 'Closed' : 'Waiting') : '',
      report.savedNames(lead).join('; '),
      Object.values(lead.plan ?? {}).map(oneLine).filter(Boolean).join(' | '),
      lead.status ?? '',
      oneLine(lead.notes),
      isArchived(lead) ? 'Yes' : '',
      report.link(lead),
    ]);
  }
  return toCsv(rows);
}

/** The email, as plain text. */
export function reportText(report) {
  const { community, comingUp, overdue, fresh } = report;
  const lender = lenderNameOf(community);
  const day = (iso) => `${formatSlotDate(iso)}, ${iso.slice(0, 4)}`;
  const reach = (lead) => [lead.phone || 'no phone', lead.email, ...(lead.extraEmails ?? []).map((e) => `also ${e}`)].join(' · ');
  const callLines = (lead) => [
    `  ${describeTour(lead.tour, lender)} — ${oneLine(lead.name)}`,
    `    ${reach(lead)}${lead.consent?.granted ? '' : ` · ${consentLabel(lead)}`}`,
    ...(report.link(lead) ? [`    ${report.link(lead)}`] : []),
  ];
  // A long list is cut here and complete in the spreadsheet, so one busy weekend cannot make an unreadable email.
  const cut = (list, flatten) => [
    ...list.slice(0, MAX_LISTED).flatMap(flatten),
    ...(list.length > MAX_LISTED ? [`  …and ${list.length - MAX_LISTED} more, in the spreadsheet.`] : []),
  ];
  const listed = fresh.slice(0, MAX_LISTED);
  const name = oneLine(community.name);

  const lines = [
    `${name} — leads report for ${day(report.today)}`,
    report.dayOf(report.since) ? `The last report went out ${day(report.dayOf(report.since))}.` : 'This is the first report, so everyone is new.',
    '',
    `SCHEDULED CALLS WAITING (${comingUp.length})`,
    ...(comingUp.length ? cut(comingUp, callLines) : ['  None right now.']),
    '',
  ];
  if (overdue.length) {
    lines.push(
      `PAST THEIR DAY AND NOT MARKED HANDLED (${overdue.length})`,
      ...cut(overdue, callLines),
      '',
    );
  }
  lines.push(
    `NEW PEOPLE SINCE THE LAST REPORT (${fresh.length})`,
    ...(listed.length
      ? listed.flatMap((lead) => {
        const saved = report.savedNames(lead);
        const worked = Object.values(lead.plan ?? {}).map(oneLine).filter(Boolean).join('; ').slice(0, 200);
        return [
          `  ${oneLine(lead.name)} — ${reach(lead)}`,
          `    Signed up ${report.dayOf(lead.firstVisitAt)}${saved.length ? ` · Saved: ${saved.join(', ')}` : ''} · ${consentLabel(lead)}`,
          ...(worked ? [`    Worked out: ${worked}`] : []),
          ...(report.link(lead) ? [`    ${report.link(lead)}`] : []),
        ];
      })
      : ['  No one new.']),
    ...(fresh.length > listed.length ? [`  …and ${fresh.length - listed.length} more, in the spreadsheet.`] : []),
    '',
    `Everyone (${plural(report.everyone, 'person', 'people')}${report.closed ? `, ${report.closed} closed` : ''}) is in the attached spreadsheet, ${report.filename}.`,
    '',
    'Mark a call handled in the dashboard once you have been in touch, so it leaves the list.',
  );
  return lines.join('\n');
}

/** Longer than the five seconds an alert gets: the spreadsheet goes along with this one. */
export const REPORT_SEND_TIMEOUT_MS = 20000;

/** Builds the report and mails it, with the spreadsheet attached. */
export async function emailReport({ community, leads, homes, to, baseUrl, now = new Date(), since = '', until = '' }) {
  const report = buildReport({ community, leads, homes, now, since, until, baseUrl });
  const calls = report.comingUp.length + report.overdue.length;
  const result = await sendEmail({
    to,
    subject: `${oneLine(community.name)}: ${plural(calls, 'scheduled call')} waiting, ${plural(report.fresh.length, 'new person', 'new people')}`,
    text: reportText(report),
    attachments: [{ filename: report.filename, content: Buffer.from(leadsCsv(report), 'utf8').toString('base64') }],
    // The spreadsheet makes this a larger request than an alert, and it is sent from a button somebody waits on.
    timeoutMs: REPORT_SEND_TIMEOUT_MS,
  });
  return { result, report };
}
