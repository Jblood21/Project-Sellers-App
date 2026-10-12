import {
  describeTour, formatSlotDate, formatSlotTime, isArchived, isoDate, isTourPending, lenderNameOf, slugify,
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
 */

/** Longest list written out in the email itself; the rest are in the spreadsheet. */
export const MAX_LISTED = 50;

const when = (value) => (value ? new Date(value).getTime() : Number.NaN);
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateOnly = (value) => {
  const time = when(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10);
};

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

/** The lists the report is made of. */
export function buildReport({ community, leads = [], homes = [], now = new Date(), since = '', baseUrl = '' }) {
  const today = isoDate(now);
  const homeName = new Map(homes.map((home) => [home.id, home.name]));
  const link = (lead) => (baseUrl ? `${baseUrl}/admin/communities/${community.id}/leads/${lead.id}` : '');
  const savedNames = (lead) => (lead.savedHomeIds ?? []).map((id) => homeName.get(id)).filter(Boolean);
  const byCall = (a, b) => `${a.tour.date || '9999-12-31'} ${a.tour.time || ''}`.localeCompare(`${b.tour.date || '9999-12-31'} ${b.tour.time || ''}`);

  const waiting = leads.filter(isTourPending);
  const comingUp = waiting.filter((lead) => !lead.tour.date || lead.tour.date >= today).sort(byCall);
  const overdue = waiting.filter((lead) => lead.tour.date && lead.tour.date < today).sort(byCall);
  const sinceTime = when(since);
  const fresh = leads
    .filter((lead) => !isArchived(lead) && (Number.isNaN(sinceTime) || when(lead.firstVisitAt) > sinceTime))
    .sort((a, b) => when(b.firstVisitAt) - when(a.firstVisitAt));

  return {
    community, today, since, link, savedNames, comingUp, overdue, fresh,
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
      lead.name,
      lead.email,
      (lead.extraEmails ?? []).join(' '),
      lead.phone,
      lead.consent?.granted ? 'Yes' : 'No',
      dateOnly(lead.firstVisitAt),
      tour?.date ?? '',
      tour ? (tour.date ? formatSlotTime(tour.time) : oneLine(tour.time)) : '',
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
    `  ${describeTour(lead.tour, lender)} — ${lead.name}`,
    `    ${reach(lead)}`,
    ...(report.link(lead) ? [`    ${report.link(lead)}`] : []),
  ];
  const listed = fresh.slice(0, MAX_LISTED);

  const lines = [
    `${community.name} — leads report for ${day(report.today)}`,
    report.since ? `The last report went out ${day(dateOnly(report.since))}.` : 'This is the first report, so everyone is new.',
    '',
    `SCHEDULED CALLS WAITING (${comingUp.length})`,
    ...(comingUp.length ? comingUp.flatMap(callLines) : ['  None right now.']),
    '',
  ];
  if (overdue.length) {
    lines.push(
      `PAST THEIR DAY AND NOT MARKED HANDLED (${overdue.length})`,
      ...overdue.flatMap(callLines),
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
          `  ${lead.name} — ${reach(lead)}`,
          `    Signed up ${dateOnly(lead.firstVisitAt)}${saved.length ? ` · Saved: ${saved.join(', ')}` : ''}${lead.consent?.granted ? ' · Agreed to calls and texts' : ''}`,
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

/** Builds the report and mails it, with the spreadsheet attached. */
export async function emailReport({ community, leads, homes, to, baseUrl, now = new Date(), since = '' }) {
  const report = buildReport({ community, leads, homes, now, since, baseUrl });
  const calls = report.comingUp.length + report.overdue.length;
  const result = await sendEmail({
    to,
    subject: `${community.name}: ${plural(calls, 'scheduled call')} waiting, ${plural(report.fresh.length, 'new person', 'new people')}`,
    text: reportText(report),
    attachments: [{ filename: report.filename, content: Buffer.from(leadsCsv(report), 'utf8').toString('base64') }],
  });
  return { result, report };
}
