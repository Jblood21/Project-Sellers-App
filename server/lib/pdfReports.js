import {
  PLAN_KEYS, PLAN_LABELS, THEMES, describeTour, formatSlotDate, formatSlotTime, isArchived, isTourPending, lenderNameOf, money,
  planProgress, slugify,
} from '../../shared/domain.js';
import { printableMoveIn } from '../../shared/moveInPrint.js';
import { COLORS, PdfDocument, fitLine, hexToRgb, textWidth } from './pdf.js';
import { buildReport, reportTimeZone } from './report.js';

/**
 * The reports a builder can download as a PDF: the leads report for a development, and the report for one person.
 * They are made from the same data as the screens and the emailed report, and only when asked for.
 *
 * The leads report: a summary, what people did (the homes they saved, the tools they used, sign-ups by week), the
 * scheduled calls still waiting and then everyone. The person's report: who they are, what they agreed to, the call
 * they asked for, the homes they saved, what the tools worked out, their move-in plan, the builder's notes and
 * everything they did in the app.
 *
 * Dates are the builder's day (REPORT_TIME_ZONE), not the server's, as in the emailed report. Everything a visitor
 * typed is text in the file and never PDF syntax (see pdf.js).
 */

/** Longest roster printed in the leads report; the emailed report's spreadsheet has everyone. */
export const MAX_PEOPLE = 2000;

/** The periods the leads report can cover, by the key the request names. */
export const PERIODS = {
  all: { label: 'Everyone', days: null },
  7: { label: 'Signed up in the last 7 days', days: 7 },
  30: { label: 'Signed up in the last 30 days', days: 30 },
  90: { label: 'Signed up in the last 90 days', days: 90 },
};

const RED = [0.66, 0.12, 0.1];
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const when = (value) => (value ? new Date(value).getTime() : Number.NaN);

const formatters = new Map();
const formatter = (timeZone, options) => {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-US', { timeZone, ...options }));
  return formatters.get(key);
};
/** 'Oct 12, 2026', or '' for a missing or unreadable value. */
const dayText = (value, timeZone) => {
  const time = when(value);
  return Number.isNaN(time) ? '' : formatter(timeZone, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
};
/** 'Mon, Oct 12, 2026 at 9:05 AM'. */
const stamp = (value, timeZone) => {
  const time = when(value);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  const day = formatter(timeZone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  const clock = formatter(timeZone, { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${day} at ${clock}`;
};
const zoneName = (timeZone, date) => formatter(timeZone, { timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
/** The calendar day ('2026-10-12') of a moment, in the builder's zone. */
const calendarDay = (value, timeZone) => {
  const parts = Object.fromEntries(formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** A small caps label above a list, kept with the first row under it. */
function subhead(doc, text) {
  doc.ensure(44);
  doc.text(text.toUpperCase(), { y: doc.y + 8, size: 7.5, font: 'bold', color: COLORS.muted });
  doc.moveDown(14);
}

const themeOf = (community) => THEMES[community?.theme] ?? THEMES.navy;
const consentWords = (lead) => (lead.consent?.granted ? 'Agreed' : lead.consent ? 'Declined' : 'Never asked');
const callAbout = (lead, lender) => (lead.tour.topic === 'lender' ? `Financing (${lender})` : 'Tour (booked earlier)');
const callWhen = (tour) => {
  if (tour.date) return [`${formatSlotDate(tour.date)}, ${tour.date.slice(0, 4)}`, tour.time ? formatSlotTime(tour.time) : ''];
  return [oneLine(tour.time) || 'No time given'];
};
const reachWith = (lead) => [lead.phone || 'No phone', lead.email, ...(lead.extraEmails ?? []).map((email) => `also ${email}`)];

/** The page furniture both reports share: a title band, a running header and a footer with page numbers. */
function startDocument({ community, title, subtitle, generated, theme }) {
  const doc = new PdfDocument({ title: `${oneLine(community.name)} · ${title}`, subject: subtitle });
  const primary = hexToRgb(theme.primary);
  const accent = hexToRgb(theme.accent);
  // Full-width band across the top of the first page, then the cursor goes below it.
  doc.rect({ x: 0, y: 0, w: doc.width, h: 92, fill: primary });
  doc.rect({ x: 0, y: 92, w: doc.width, h: 3, fill: accent });
  doc.text(fitLine(oneLine(community.name), { font: 'bold', size: 21, width: doc.contentWidth }), { y: 40, size: 21, font: 'bold', color: COLORS.white });
  doc.text(fitLine(title, { size: 12, width: doc.contentWidth }), { y: 59, size: 12, color: COLORS.white });
  const stampText = `Generated ${generated}`;
  const stampWidth = textWidth(stampText, 'regular', 9);
  doc.text(fitLine(subtitle, { size: 9, width: doc.contentWidth - stampWidth - 16 }), { y: 76, size: 9, color: [0.86, 0.88, 0.92] });
  doc.text(stampText, { y: 76, size: 9, color: [0.86, 0.88, 0.92], align: 'right', x: doc.left, width: doc.contentWidth });
  doc.y = 112;

  doc.onNewPage((d) => {
    d.text(fitLine(`${oneLine(community.name)} · ${title}`, { size: 8.5, width: d.contentWidth }), { y: d.margin - 12, size: 8.5, color: COLORS.muted });
    d.rule({ y: d.margin - 5 });
    d.y = d.margin + 10;
  });
  doc.setFooter((d, page, count) => {
    const y = d.height - 38;
    d.rule({ y: y - 10 });
    d.text('Confidential. This report contains personal information about people who used the app; keep it private.', { y, size: 7.5, color: COLORS.muted });
    d.text(`Page ${page} of ${count}`, { y, size: 8, color: COLORS.muted, align: 'right', x: d.left, width: d.contentWidth });
  });
  return { doc, primary, accent };
}

/** The leads report for a development, as a PDF. */
export function buildLeadsPdf({ community, leads = [], homes = [], now = new Date(), period = 'all', timeZone = reportTimeZone() }) {
  const range = PERIODS[period] ?? PERIODS.all;
  const lender = lenderNameOf(community);
  const homeName = new Map(homes.map((home) => [home.id, home.name]));
  const since = range.days ? new Date(now.getTime() - range.days * 86400000) : null;
  const roster = leads
    .filter((lead) => !since || when(lead.firstVisitAt) >= since.getTime())
    .sort((a, b) => when(b.firstVisitAt) - when(a.firstVisitAt));
  const shown = roster.slice(0, MAX_PEOPLE);
  const calls = buildReport({ community, leads, homes, now, timeZone });
  const waiting = [...calls.comingUp, ...calls.overdue];

  const theme = themeOf(community);
  const generated = `${stamp(now, timeZone)} ${zoneName(timeZone, now)}`;
  const { doc, accent } = startDocument({
    community, title: 'Leads report', subtitle: `${range.label}${community.location ? ` · ${oneLine(community.location)}` : ''}`, generated, theme,
  });

  // ── the summary ──
  const withPhone = roster.filter((lead) => lead.phone).length;
  const agreed = roster.filter((lead) => lead.consent?.granted).length;
  const savedAny = roster.filter((lead) => (lead.savedHomeIds ?? []).length > 0).length;
  const average = roster.length ? Math.round(roster.reduce((sum, lead) => sum + planProgress(lead), 0) / roster.length) : 0;
  const closed = roster.filter(isArchived).length;
  const pct = (n) => (roster.length ? ` · ${Math.round((n / roster.length) * 100)}%` : '');
  doc.statRow([
    { label: since ? `People (of ${leads.length} in all)` : 'People', value: String(roster.length) },
    { label: 'Open · closed', value: `${roster.length - closed} · ${closed}` },
    { label: 'Calls waiting', value: String(waiting.length) },
    { label: 'Past their day', value: String(calls.overdue.length) },
    { label: `Gave a phone${pct(withPhone)}`, value: String(withPhone) },
    { label: `Agreed to calls${pct(agreed)}`, value: String(agreed) },
    { label: `Saved a home${pct(savedAny)}`, value: String(savedAny) },
    { label: 'Average plan progress', value: `${average}%` },
  ], { accent });

  // ── what people did ──
  if (roster.length) {
    doc.heading('What people did');
    const saves = new Map();
    for (const lead of roster) for (const id of lead.savedHomeIds ?? []) if (homeName.has(id)) saves.set(id, (saves.get(id) ?? 0) + 1);
    const topHomes = [...saves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ label: homeName.get(id), value: n, note: plural(n, 'save') }));
    const toolUse = PLAN_KEYS.filter((key) => key !== 'homes')
      .map((key) => ({ label: PLAN_LABELS[key], value: roster.filter((lead) => lead.plan?.[key]).length }))
      .filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

    subhead(doc, 'Most saved homes');
    if (topHomes.length) doc.barList(topHomes, { color: accent });
    else doc.paragraph('No one has saved a home yet.', { color: COLORS.muted, gap: 4 });

    doc.moveDown(8);
    subhead(doc, 'Tools used (people who saved a result)');
    if (toolUse.length) doc.barList(toolUse.map((item) => ({ ...item, note: `${item.value} of ${roster.length}` })), { color: accent });
    else doc.paragraph('No one has saved a tool result yet.', { color: COLORS.muted, gap: 4 });

    // Sign-ups by week over the last eight weeks, from all leads so the trend does not depend on the period chosen.
    const today = calendarDay(now, timeZone);
    const weekStart = (day) => {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      return date;
    };
    const thisWeek = weekStart(today);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(thisWeek);
      start.setUTCDate(start.getUTCDate() - 7 * (7 - i));
      return start;
    });
    const counts = weeks.map((start) => leads.filter((lead) => {
      const t = when(lead.firstVisitAt);
      if (Number.isNaN(t)) return false;
      const day = new Date(`${calendarDay(t, timeZone)}T00:00:00Z`);
      return day >= start && day < new Date(start.getTime() + 7 * 86400000);
    }).length);
    doc.moveDown(8);
    subhead(doc, 'Sign-ups per week (last 8 weeks, all people)');
    doc.barList(weeks.map((start, i) => ({
      label: `Week of ${formatter('UTC', { month: 'short', day: 'numeric' }).format(start)}${i === 7 ? ' (this week)' : ''}`, value: counts[i], note: String(counts[i]),
    })), { color: accent });
  }

  // ── scheduled calls ──
  doc.heading(`Scheduled calls waiting (${waiting.length})`);
  doc.table({
    columns: [
      { label: 'WHEN', width: 1.6 }, { label: 'PERSON', width: 1.7 }, { label: 'ABOUT', width: 1.5 }, { label: 'HOW TO REACH THEM', width: 2.6 },
    ],
    rows: waiting.map((lead) => {
      const overdue = calls.overdue.includes(lead);
      const [day, time] = callWhen(lead.tour);
      return [
        [{ text: day, font: 'bold', color: overdue ? RED : COLORS.ink }, ...(time ? [time] : []), ...(overdue ? [{ text: 'Past their day', color: RED }] : [])],
        [{ text: oneLine(lead.name), font: 'bold' }, { text: `by ${lead.tour.contact === 'email' ? 'email' : 'phone'}`, color: COLORS.muted }],
        callAbout(lead, lender),
        [...reachWith(lead), ...(lead.consent?.granted ? [] : [{ text: `Do not call · ${lead.consent ? 'declined' : 'never asked'}`, color: RED }])],
      ];
    }),
    empty: 'No scheduled calls are waiting.',
  });

  // ── everyone ──
  doc.heading(`${since ? range.label : 'Everyone'} (${roster.length})`);
  if (roster.length > shown.length) {
    doc.paragraph(`Showing the newest ${shown.length} of ${roster.length} people. The spreadsheet in the emailed report has everyone.`, { color: COLORS.muted, gap: 4 });
  }
  doc.table({
    columns: [
      { label: 'NAME AND CONTACT', width: 3.3 }, { label: 'SIGNED UP', width: 1.15 }, { label: 'PLAN', width: 0.7, align: 'right' },
      { label: 'SAVED HOMES', width: 1.7 }, { label: 'STATUS', width: 1.2 }, { label: 'CONSENT', width: 1.1 },
    ],
    rows: shown.map((lead) => {
      const names = (lead.savedHomeIds ?? []).map((id) => homeName.get(id)).filter(Boolean);
      const note = oneLine(lead.notes);
      return [
        [
          { text: oneLine(lead.name), font: 'bold' },
          { text: lead.email, color: COLORS.muted },
          ...(lead.extraEmails ?? []).map((email) => ({ text: `also ${email}`, color: COLORS.muted })),
          { text: lead.phone || 'No phone', color: COLORS.muted },
          ...(note ? [{ text: `Note: ${note.length > 140 ? `${note.slice(0, 139)}...` : note}`, font: 'italic', color: COLORS.muted, size: 7.5 }] : []),
        ],
        dayText(lead.firstVisitAt, timeZone),
        `${planProgress(lead)}%`,
        names.length ? [`${names.length} saved`, { text: names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : ''), color: COLORS.muted, size: 7.5 }] : [{ text: 'None', color: COLORS.muted }],
        [
          isArchived(lead) ? { text: 'Closed', font: 'bold' } : lead.status === 'contacted' ? 'Contacted' : 'New',
          ...(lead.tour ? [{ text: isTourPending(lead) ? 'Call waiting' : lead.tour.handledAt ? 'Call handled' : 'Call booked', color: isTourPending(lead) ? RED : COLORS.muted }] : []),
        ],
        { text: consentWords(lead), color: lead.consent && !lead.consent.granted ? RED : lead.consent ? COLORS.ink : COLORS.muted },
      ].map((cell) => (typeof cell === 'object' && !Array.isArray(cell) && cell.text !== undefined ? [cell] : cell));
    }),
    empty: since ? 'No one signed up in this period.' : 'No one has signed up yet.',
  });

  const filename = `${slugify(community.name) || 'community'}-leads-${calendarDay(now, timeZone)}.pdf`;
  return { buffer: doc.finish(), filename, people: roster.length, pages: doc.pages.length };
}

/** One person's report, as a PDF. */
export function buildUserPdf({ community, lead, homes = [], consents = [], now = new Date(), timeZone = reportTimeZone() }) {
  const lender = lenderNameOf(community);
  const theme = themeOf(community);
  const generated = `${stamp(now, timeZone)} ${zoneName(timeZone, now)}`;
  const { doc, accent } = startDocument({
    community, title: `User report: ${oneLine(lead.name)}`, subtitle: oneLine(lead.email), generated, theme,
  });
  const homeById = new Map(homes.map((home) => [home.id, home]));
  const activity = lead.activity ?? [];
  /** Pairs of (label, value) in columns, value in bold under its small label. */
  const facts = (pairs, perRow = 3) => {
    const colWidth = doc.contentWidth / perRow;
    let used = perRow;
    let started = false;
    pairs.forEach(([key, value, span = 1]) => {
      if (used + span > perRow) {
        if (started) doc.moveDown(32);
        doc.ensure(34);
        used = 0;
        started = true;
      }
      const x = doc.left + used * colWidth;
      doc.text(String(key).toUpperCase(), { x, y: doc.y + 8, size: 7, color: COLORS.muted });
      doc.text(fitLine(String(value || '—'), { font: 'bold', size: 10, width: colWidth * span - 10 }), { x, y: doc.y + 21, size: 10, font: 'bold' });
      used += span;
    });
    if (started) doc.moveDown(32);
  };

  // ── who ──
  const lastActive = activity.find((item) => item.createdAt)?.createdAt;
  doc.statRow([
    { label: 'Plan progress', value: `${planProgress(lead)}%` },
    { label: 'Homes saved', value: String((lead.savedHomeIds ?? []).length) },
    { label: 'Actions in the app', value: String(activity.length >= 200 ? '200+' : activity.length) },
    { label: 'Status', value: isArchived(lead) ? 'Closed' : lead.status === 'contacted' ? 'Contacted' : 'New' },
  ], { accent });
  doc.heading('Contact');
  facts([
    ['Email', lead.email, 2], ['Phone', lead.phone || 'None given'],
    ...((lead.extraEmails ?? []).length ? [['Other email', lead.extraEmails.join(', '), 3]] : []),
    ['Signed up', dayText(lead.firstVisitAt, timeZone)], ['Last activity', lastActive ? dayText(lastActive, timeZone) : 'None'],
    ['Closed', isArchived(lead) ? dayText(lead.archivedAt, timeZone) : 'No'],
  ]);

  // ── what they agreed to ──
  doc.heading('Calls and texts');
  if (lead.consent) {
    doc.paragraph(
      lead.consent.granted
        ? `Agreed to calls and texts on ${stamp(lead.consent.at, timeZone)}.`
        : `Did not agree to calls and texts (answered ${stamp(lead.consent.at, timeZone)}). Do not call or text this number.`,
      { font: 'bold', color: lead.consent.granted ? COLORS.ink : RED, gap: 3 },
    );
    if (lead.consent.text) doc.paragraph(`Wording shown${lead.consent.version ? ` (version ${lead.consent.version})` : ''}: ${lead.consent.text}`, { size: 8, color: COLORS.muted, gap: 3 });
    if (consents.length > 1) {
      doc.paragraph(`${plural(consents.length, 'answer')} on record: ${consents.map((c) => `${c.granted ? 'agreed' : 'declined'} ${dayText(c.at, timeZone)}`).join('; ')}.`, { size: 8, color: COLORS.muted });
    }
  } else {
    doc.paragraph('Never asked. They gave no phone number, or signed up before the question was added. Do not call or text without asking.', { font: 'bold', color: RED });
  }

  // ── the call they asked for ──
  if (lead.tour) {
    doc.heading('Scheduled call');
    const pending = isTourPending(lead);
    doc.paragraph(`${describeTour(lead.tour, lender)}.`, { font: 'bold', gap: 2 });
    doc.paragraph(
      `${pending ? 'Waiting for a call.' : lead.tour.handledAt ? `Handled ${dayText(lead.tour.handledAt, timeZone)}.` : 'Closed with the person.'}`
      + `${lead.tour.requestedAt ? ` Requested ${stamp(lead.tour.requestedAt, timeZone)}.` : ''}`,
      { color: pending ? RED : COLORS.muted },
    );
  }

  // ── homes ──
  const saved = (lead.savedHomeIds ?? []).map((id) => homeById.get(id)).filter(Boolean);
  doc.heading(`Homes saved (${saved.length})`);
  doc.table({
    columns: [
      { label: 'HOME', width: 2.4 }, { label: 'PRICE', width: 1.2, align: 'right' }, { label: 'BEDS', width: 0.7, align: 'right' },
      { label: 'BATHS', width: 0.7, align: 'right' }, { label: 'SQ FT', width: 0.9, align: 'right' }, { label: 'LOT', width: 0.8 },
    ],
    rows: saved.map((home) => [
      { text: oneLine(home.name), font: 'bold' }, home.price ? money(home.price) : '', home.beds ? String(home.beds) : '', home.baths ? String(home.baths) : '',
      home.sqft ? home.sqft.toLocaleString('en-US') : '', home.lotNumber ? String(home.lotNumber) : '',
    ].map((cell) => (typeof cell === 'object' ? [cell] : cell))),
    empty: 'No homes saved.',
  });

  // ── what the tools worked out ──
  doc.heading('What they worked out');
  doc.table({
    columns: [{ label: 'TOOL', width: 1.5 }, { label: 'RESULT', width: 4.2 }],
    rows: PLAN_KEYS.filter((key) => key !== 'homes').map((key) => [
      { text: PLAN_LABELS[key], font: 'bold' },
      lead.plan?.[key] ? oneLine(lead.plan[key]) : { text: 'Not started', color: COLORS.muted },
    ].map((cell) => (typeof cell === 'object' ? [cell] : cell))),
  });

  // ── move-in plan ──
  const home = homeById.get(lead.moveIn?.homeId) ?? null;
  const moveIn = lead.moveIn ? printableMoveIn(lead.moveIn, { home, today: calendarDay(now, timeZone) }) : null;
  if (moveIn) {
    doc.ensure(150);
    doc.heading('Move-in plan');
    doc.paragraph(moveIn.headline, { font: 'bold', gap: 4 });
    facts(moveIn.details.map(([key, value]) => [key, value, String(value).length > 24 ? 3 : 1]), 3);
    for (const note of moveIn.notes ?? []) doc.paragraph(note, { size: 8.5, color: COLORS.muted, gap: 3 });
    if (moveIn.steps?.length) {
      doc.table({
        columns: [{ label: 'DATE', width: 1 }, { label: 'STEP', width: 3.6 }, { label: 'WHOSE JOB', width: 1.1 }, { label: 'DONE', width: 0.7 }],
        rows: moveIn.steps.map((step) => [step.date, step.label, step.who, step.done ? 'Yes' : 'No']),
      });
    }
  }

  // ── the builder's notes ──
  if (oneLine(lead.notes)) {
    doc.heading('Notes');
    doc.paragraph(lead.notes, { gap: 2 });
  }

  // ── everything they did ──
  doc.heading(`Activity (${activity.length >= 200 ? 'latest 200' : activity.length})`);
  doc.table({
    columns: [{ label: 'WHEN', width: 1.6 }, { label: 'WHAT THEY DID', width: 4.4 }],
    rows: activity.map((item) => [stamp(item.createdAt, timeZone), oneLine(item.text)]),
    empty: 'No activity recorded.',
    size: 8,
  });

  const filename = `${slugify(lead.name) || 'person'}-report-${calendarDay(now, timeZone)}.pdf`;
  return { buffer: doc.finish(), filename, pages: doc.pages.length };
}
