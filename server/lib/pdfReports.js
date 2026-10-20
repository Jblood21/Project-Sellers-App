import {
  DEFAULT_LEAD_SORT, LEAD_SORTS, PLAN_LABELS, THEMES, TOOL_ORDER, describeTour, formatSlotDate, formatSlotTime, isArchived, isTourPending,
  lenderNameOf, money, slugify, sortLeads, toolAnswerOf, toolsOfferedBy, toolsUsedOf,
} from '../../shared/domain.js';
import { printableMoveIn } from '../../shared/moveInPrint.js';
import { lenderBrandOf, lenderContact, lenderTitle } from './lenderBrand.js';
import { COLORS, PdfDocument, fitLine, hexToRgb, textWidth, toWinAnsi, wrapText } from './pdf.js';
import { buildReport, reportTimeZone } from './report.js';

/** The tools by short names, for the places a full list has to fit a narrow column. */
const TOOL_SHORT = {
  afford: 'Price range', payment: 'Payment', loans: 'Loans', compare: 'Compare', dpa: 'Down payment help', savings: 'Savings', movein: 'Move-in',
};

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
 *
 * Both are prepared by the lender set in Setup (see lenderBrand.js): their logo, name, NMLS ID and how to reach them
 * sit under the title band, and their name runs along the top and bottom of every page.
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
/** What the lead's page says under "Do not call or text". */
const REPLY_NOTE = 'Replying to something they asked for is fine; marketing calls and texts are not.';
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** One line of at most `max` characters, so a pasted wall of text cannot swamp a table cell. */
const clip = (value, max) => {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
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

/** A calendar day ('2026-10-12') some days earlier or later, by the calendar and not by 24-hour steps (which a clock change breaks). */
const addDays = (day, n) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
/** 'Oct 12, 2026' from a calendar day. */
const dayName = (day) => formatter('UTC', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
/** The Monday of the week a calendar day is in. */
const mondayOf = (day) => {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
};

const themeOf = (community) => THEMES[community?.theme] ?? THEMES.navy;
const consentWords = (lead) => (lead.consent?.granted ? 'Agreed' : lead.consent ? 'Declined' : 'Never asked');
const callAbout = (lead, lender) => (lead.tour.topic === 'lender' ? `Financing (${lender})` : 'Tour (booked earlier)');
const callWhen = (tour) => {
  if (tour.date) return [`${formatSlotDate(tour.date)}, ${tour.date.slice(0, 4)}`, tour.time ? formatSlotTime(tour.time) : ''];
  return [clip(tour.time, 200) || 'No time given'];
};
const reachWith = (lead) => [lead.phone || 'No phone', lead.email, ...(lead.extraEmails ?? []).map((email) => `also ${email}`)];

/** "Prepared by" and the lender, for the running header: '' when Setup has no lender. */
const preparedBy = (brand) => (brand?.name ? `Prepared by ${oneLine(brand.name)}` : '');

/**
 * "Summit Home Loans · NMLS #1790749" fitted to a width by shortening the name only, so the NMLS ID is printed whole
 * or, when even it will not fit, the line is cut as any other. '' when there is no lender.
 */
function fitLenderTitle(brand, { font = 'regular', size, width }) {
  const name = oneLine(brand?.name);
  if (!name) return '';
  const id = oneLine(brand.nmls) ? ` · NMLS #${oneLine(brand.nmls)}` : '';
  const idWidth = textWidth(toWinAnsi(id), font, size);
  if (!id || idWidth > width / 2) return fitLine(name + id, { font, size, width });
  return fitLine(name, { font, size, width: width - idWidth }) + toWinAnsi(id);
}

/**
 * The lender's row under the title band: their logo (or, without one, nothing), then "Prepared by" with their name and
 * NMLS ID, and how to reach them. Draws nothing when Setup has no lender; returns the y below what it drew.
 */
function lenderStrip(doc, brand, { y, logoHeight = 22, maxLogoWidth = 150 }) {
  if (!brand?.name) return y;
  const height = Math.max(logoHeight, 22) + 12;
  let x = doc.left;
  if (brand.logo) {
    let h = logoHeight;
    let w = (h * brand.logo.width) / brand.logo.height;
    // A wide logo is held to its width rather than run into the words beside it.
    if (w > maxLogoWidth) {
      w = maxLogoWidth;
      h = (w * brand.logo.height) / brand.logo.width;
    }
    doc.image(brand.logo, { x, y: y + (height - h) / 2, w, h });
    x += w + 12;
    doc.vrule({ x, y1: y + 7, y2: y + height - 7, color: COLORS.rule, weight: 0.7 });
    x += 12;
  }
  const width = doc.right - x;
  const contact = oneLine(lenderContact(brand));
  // A named loan officer is printed whole, NMLS ID and all, or not at all (complianceOf names one only with their
  // ID): it is the lender's contact line that is cut to make room for them.
  const lo = brand.lo ? toWinAnsi(oneLine(`Loan officer: ${brand.lo.name} · NMLS #${brand.lo.nmls}`)) : '';
  const showLo = Boolean(lo) && textWidth(lo, 'regular', 7.8) <= width;
  const room = width - (showLo ? textWidth(`${lo} · `, 'regular', 7.8) : 0);
  const second = [contact && room >= 40 ? fitLine(contact, { size: 7.8, width: room }) : '', showLo ? lo : ''].filter(Boolean).join(' · ');
  const top = second ? y + height / 2 - 2 : y + height / 2 + 3;
  const lead = 'Prepared by ';
  const leadWidth = textWidth(lead, 'regular', 8.5);
  doc.text(lead, { x, y: top, size: 8.5, color: COLORS.muted });
  doc.text(fitLenderTitle(brand, { font: 'bold', size: 9.5, width: width - leadWidth }), { x: x + leadWidth, y: top, size: 9.5, font: 'bold' });
  if (second) doc.text(second, { x, y: top + 11, size: 7.8, color: COLORS.muted });
  doc.rule({ y: y + height, color: COLORS.rule, weight: 0.6 });
  return y + height;
}

/** The footer both reports end each page with: privacy on the left, the lender and the page number on the right. */
function footerOf(brand, { size = 7.5, gap = 22, privacy }) {
  const lender = oneLine(lenderTitle(brand));
  return (d, page, count) => {
    const y = d.height - gap;
    const number = `Page ${page} of ${count}`;
    let used = d.text(number, { y, size, color: COLORS.muted, align: 'right', x: d.left, width: d.contentWidth });
    if (lender) {
      // Half the row at least, or whatever the privacy line leaves when that is more (the 30 is the two gaps).
      const privacyWidth = textWidth(fitLine(privacy, { size: size - 0.5, width: d.contentWidth }), 'regular', size - 0.5);
      const room = Math.max(d.contentWidth / 2, d.contentWidth - privacyWidth - 30) - used;
      const name = fitLenderTitle(brand, { size, width: room });
      used += d.text(name, { y, size, color: COLORS.muted, align: 'right', x: d.left, width: d.contentWidth - used - 14 }) + 14;
    }
    d.text(fitLine(privacy, { size: size - 0.5, width: d.contentWidth - used - 16 }), { y, size: size - 0.5, color: COLORS.muted });
  };
}

/** The page furniture both reports share: a title band, a running header and a footer with page numbers. */
function startDocument({ community, title, subtitle, generated, theme, brand }) {
  const doc = new PdfDocument({ title: `${oneLine(community.name)} · ${title}`, subject: subtitle, author: oneLine(brand?.name) || 'Touradoor' });
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
  doc.y = brand?.name ? lenderStrip(doc, brand, { y: 103, logoHeight: 34 }) + 14 : 112;

  doc.onNewPage((d) => {
    const by = preparedBy(brand);
    const byWidth = by ? textWidth(fitLine(by, { size: 8.5, width: d.contentWidth / 2 }), 'regular', 8.5) : 0;
    d.text(fitLine(`${oneLine(community.name)} · ${title}`, { size: 8.5, width: d.contentWidth - byWidth - 16 }), { y: d.margin - 12, size: 8.5, color: COLORS.muted });
    if (by) d.text(fitLine(by, { size: 8.5, width: d.contentWidth / 2 }), { y: d.margin - 12, size: 8.5, color: COLORS.muted, align: 'right', x: d.left, width: d.contentWidth });
    d.rule({ y: d.margin - 5 });
    d.y = d.margin + 10;
  });
  const footer = footerOf(brand, { size: 8, gap: 38, privacy: 'Confidential. Personal information about app users; keep it private.' });
  doc.setFooter((d, page, count) => {
    d.rule({ y: d.height - 48 });
    footer(d, page, count);
  });
  return { doc, primary, accent };
}

/** The page furniture of the leads report: a running header, the title band and a footer, on narrow margins. */
function startLeadsDocument({ community, subtitle, generated, theme, brand }) {
  const name = oneLine(community.name);
  const doc = new PdfDocument({ title: `${name} · Leads report`, subject: subtitle, margin: 36, author: oneLine(brand?.name) || 'Touradoor' });
  const primary = hexToRgb(theme.primary);
  const accent = hexToRgb(theme.accent);
  const by = preparedBy(brand);
  const running = (d) => {
    const byWidth = by ? textWidth(fitLine(by, { size: 7.5, width: d.contentWidth / 2 }), 'regular', 7.5) : 0;
    d.text(fitLine(`${name} · Leads report`, { size: 7.5, width: d.contentWidth - byWidth - 16 }), { y: 24, size: 7.5, color: COLORS.muted });
    if (by) d.text(fitLine(by, { size: 7.5, width: d.contentWidth / 2 }), { y: 24, size: 7.5, color: COLORS.muted, align: 'right', x: d.left, width: d.contentWidth });
  };
  running(doc);
  doc.onNewPage(running);

  // Title band: the name and what the report covers on the left, when it was made on the right.
  const top = doc.margin;
  const bandHeight = 48;
  doc.rect({ x: doc.left, y: top, w: doc.contentWidth, h: bandHeight, fill: primary });
  doc.rect({ x: doc.left, y: top + bandHeight, w: doc.contentWidth, h: 3, fill: accent });
  const stampLines = [`Generated ${generated.day}`, generated.clock];
  const stampWidth = Math.max(...stampLines.map((line) => textWidth(line, 'regular', 8)));
  doc.text(fitLine(name, { font: 'bold', size: 17, width: doc.contentWidth - stampWidth - 40 }), { x: doc.left + 14, y: top + 22, size: 17, font: 'bold', color: COLORS.white });
  doc.text(fitLine(subtitle, { size: 8.5, width: doc.contentWidth - stampWidth - 40 }), { x: doc.left + 14, y: top + 37, size: 8.5, color: [0.88, 0.9, 0.93] });
  stampLines.forEach((line, i) => doc.text(line, { x: doc.left, y: top + 21 + i * 11, size: 8, color: [0.88, 0.9, 0.93], align: 'right', width: doc.contentWidth - 14 }));
  doc.y = top + bandHeight + 3;
  if (brand?.name) doc.y = lenderStrip(doc, brand, { y: doc.y + 4, logoHeight: 30 }) + 8;

  doc.setFooter(footerOf(brand, { privacy: 'Confidential. Personal information about app users; keep it private.' }));
  return { doc, primary, accent };
}

/**
 * The leads report for a development, as a PDF: a title band, a strip of six figures, three small panels (the homes
 * people saved, the tools they used, sign-ups by week) and then everyone, in the order `sort` names (the Leads tab's own
 * Recent / Most ★ choice). People the team has closed are never in it (see buildReport).
 */
export function buildLeadsPdf({
  community, leads = [], homes = [], now = new Date(), period = 'all', sort = DEFAULT_LEAD_SORT, timeZone = reportTimeZone(), brand = lenderBrandOf(community),
}) {
  const range = Object.hasOwn(PERIODS, period) ? PERIODS[period] : PERIODS.all;
  const order = Object.hasOwn(LEAD_SORTS, sort) ? sort : DEFAULT_LEAD_SORT;
  const lender = clip(lenderNameOf(community), 80);
  const homeName = new Map(homes.map((home) => [home.id, clip(home.name, 80)]));
  // The same homes a person's saved list means: one that was deleted since is no longer counted or named.
  const savedOf = (lead) => (lead.savedHomeIds ?? []).filter((id) => homeName.has(id));
  const today = calendarDay(now, timeZone);
  // "The last 7 days" is today and the six days before it, by the builder's calendar, so the cut is a midnight.
  const firstDay = range.days ? addDays(today, 1 - range.days) : null;
  const signedUp = (lead) => (Number.isNaN(when(lead.firstVisitAt)) ? '' : calendarDay(when(lead.firstVisitAt), timeZone));
  // Closed people are never in a report: buildReport has already left them out, so everything below is about `people`.
  const calls = buildReport({ community, leads, homes, now, timeZone });
  const people = calls.leads;
  const roster = sortLeads(people.filter((lead) => !firstDay || (signedUp(lead) && signedUp(lead) >= firstDay)), order);
  const since = Boolean(firstDay);
  const shown = roster.slice(0, MAX_PEOPLE);
  const waiting = calls.waiting;

  const theme = themeOf(community);
  const generated = { day: stamp(now, timeZone).split(' at ')[0], clock: `${stamp(now, timeZone).split(' at ')[1]} ${zoneName(timeZone, now)}` };
  const { doc, primary, accent } = startLeadsDocument({
    community, generated, theme, brand,
    subtitle: ['Leads report', since ? `${range.label} (since ${dayName(firstDay)})` : range.label,
      community.location && community.location !== 'Location TBD' ? clip(community.location, 80) : '', LEAD_SORTS[order].report].filter(Boolean).join(' · '),
  });
  const wash = [0.93, 0.94, 0.945];

  // ── the strip of figures ──
  const withPhone = roster.filter((lead) => lead.phone).length;
  const agreed = roster.filter((lead) => lead.consent?.granted).length;
  const declined = roster.filter((lead) => lead.consent && !lead.consent.granted).length;
  const neverAsked = roster.length - agreed - declined;
  const savedAny = roster.filter((lead) => savedOf(lead).length > 0).length;
  const contacted = roster.filter((lead) => lead.status === 'contacted').length;
  const pct = (n) => (roster.length ? `${Math.round((n / roster.length) * 100)}%` : '');
  const noCall = declined + neverAsked;
  doc.statStrip([
    { value: String(roster.length), label: 'People', sub: since ? `of ${people.length} in all` : `${contacted} contacted` },
    { value: String(waiting.length), label: 'Calls waiting' },
    { value: String(withPhone), label: 'Gave phone', sub: pct(withPhone) },
    { value: String(agreed), label: 'Agreed to calls', sub: pct(agreed) },
    { value: String(savedAny), label: 'Saved a home', sub: pct(savedAny) },
    {
      value: String(noCall), label: 'Do not call',
      sub: !noCall ? 'no one' : declined && neverAsked ? `${declined} declined · ${neverAsked} never asked` : declined ? 'declined' : 'never asked',
    },
  ], { border: [0.8, 0.82, 0.84] });
  if (since) doc.paragraph('Calls waiting counts everyone, not only the people in this period.', { size: 7.5, color: COLORS.muted, gap: 0 });

  // A section heading in the community's colour, with a rule under it.
  const heading = (text, { x = doc.left, y, width = doc.contentWidth }) => {
    doc.text(fitLine(text.toUpperCase(), { font: 'bold', size: 6.8, width }), { x, y: y + 7, size: 6.8, font: 'bold', color: primary, spacing: 0.5 });
    doc.rule({ x1: x, x2: x + width, y: y + 11, color: primary, weight: 0.9 });
    return y + 19;
  };
  /** A bar on a light track, `fraction` of the way across. */
  const bar = ({ x, y, w, h = 5, fraction, color }) => {
    doc.rect({ x, y, w, h, fill: wash });
    if (fraction > 0) doc.rect({ x, y, w: Math.max(1.5, w * Math.min(1, fraction)), h, fill: color });
  };

  // ── the three panels ──
  if (people.length) {
    const gap = 10.5;
    const inner = doc.contentWidth - gap * 2;
    const widths = [inner * 0.242, inner * 0.394, inner * 0.364];
    const xs = [doc.left, doc.left + widths[0] + gap, doc.left + widths[0] + widths[1] + gap * 2];

    const saves = new Map();
    for (const lead of roster) for (const id of savedOf(lead)) saves.set(id, (saves.get(id) ?? 0) + 1);
    const topHomes = [...saves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    // A tool counts for a person once they used it (opened it or worked in it), whether or not they kept its answer.
    // The tools this community offers, and any it has since switched off that somebody here used before it did.
    const offered = toolsOfferedBy(community);
    const tools = TOOL_ORDER
      .map((key, index) => ({ key, index, label: PLAN_LABELS[key], value: roster.filter((lead) => toolsUsedOf(lead).includes(key)).length }))
      .filter((tool) => offered.includes(tool.key) || tool.value > 0)
      .sort((a, b) => b.value - a.value || a.index - b.index);
    // Sign-ups by week over the last eight weeks, from all open people so the trend does not depend on the period chosen.
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), -7 * (7 - i)));
    const counts = new Map(weeks.map((start) => [start, 0]));
    for (const lead of people) {
      const day = signedUp(lead);
      if (day && counts.has(mondayOf(day))) counts.set(mondayOf(day), counts.get(mondayOf(day)) + 1);
    }
    const shownCalls = waiting.slice(0, 5);

    const row = 13;
    const leftHeight = 19 + Math.max(1, topHomes.length) * row + 12 + 19 + (waiting.length ? shownCalls.length * 21 + (waiting.length > 5 ? 11 : 0) : 12);
    const height = Math.max(leftHeight, 19 + tools.length * row, 19 + weeks.length * row) + 8;
    doc.ensure(height);
    const top = doc.y + 6;

    // left: the homes people saved most, then the calls waiting
    let y = heading('Most saved homes', { x: xs[0], y: top, width: widths[0] });
    if (topHomes.length) {
      for (const [id, n] of topHomes) {
        const count = plural(n, 'save');
        doc.text(fitLine(homeName.get(id), { size: 8, width: widths[0] - textWidth(count, 'bold', 8) - 8 }), { x: xs[0], y: y + 8, size: 8 });
        doc.text(count, { x: xs[0], y: y + 8, size: 8, font: 'bold', align: 'right', width: widths[0] });
        y += row;
      }
    } else {
      doc.text(roster.length ? 'No one has saved a home yet.' : 'No one in this period.', { x: xs[0], y: y + 8, size: 8, color: COLORS.muted });
      y += row;
    }
    y = heading(`Scheduled calls waiting (${waiting.length})`, { x: xs[0], y: y + 12, width: widths[0] });
    if (waiting.length) {
      for (const lead of shownCalls) {
        const [day, time] = callWhen(lead.tour);
        doc.text(fitLine([day.replace(/, \d{4}$/, ''), time].filter(Boolean).join(' · '), { font: 'bold', size: 7.8, width: widths[0] }), { x: xs[0], y: y + 8, size: 7.8, font: 'bold' });
        doc.text(fitLine(`${clip(lead.name, 60)} · ${lead.tour.topic === 'lender' ? 'Financing' : 'Tour'}`, { size: 7.2, width: widths[0] }), { x: xs[0], y: y + 17.5, size: 7.2, color: COLORS.muted });
        y += 21;
      }
      if (waiting.length > shownCalls.length) {
        doc.text(`+${waiting.length - shownCalls.length} more: see Status in the list`, { x: xs[0], y: y + 7, size: 7, color: COLORS.muted });
      }
    } else {
      doc.text('No scheduled calls are waiting.', { x: xs[0], y: y + 8, size: 8, color: COLORS.muted });
    }

    // middle: which tools people used
    y = heading('Tools used · people who used each', { x: xs[1], y: top, width: widths[1] });
    const labelW = 80;
    const countW = 34;
    if (!roster.length || !tools.length) {
      doc.text(roster.length ? 'No tools are switched on.' : 'No one in this period.', { x: xs[1], y: y + 8, size: 8, color: COLORS.muted });
    }
    for (const tool of roster.length ? tools : []) {
      doc.text(fitLine(tool.label, { size: 7.8, width: labelW - 4 }), { x: xs[1], y: y + 8, size: 7.8 });
      bar({ x: xs[1] + labelW, y: y + 3, w: widths[1] - labelW - countW - 6, fraction: roster.length ? tool.value / roster.length : 0, color: primary });
      doc.text(`${tool.value} of ${roster.length}`, { x: xs[1], y: y + 8, size: 7.2, color: COLORS.muted, align: 'right', width: widths[1] });
      y += row;
    }

    // right: sign-ups for each of the last eight weeks
    y = heading('Sign-ups per week · last 8 weeks', { x: xs[2], y: top, width: widths[2] });
    const most = Math.max(1, ...counts.values());
    weeks.forEach((start, i) => {
      const label = formatter('UTC', { month: 'short', day: 'numeric' }).format(new Date(`${start}T00:00:00Z`));
      doc.text(`${label}${i === weeks.length - 1 ? ' (this wk)' : ''}`, { x: xs[2], y: y + 8, size: 7.8 });
      bar({ x: xs[2] + 64, y: y + 3, w: widths[2] - 64 - 18, fraction: counts.get(start) / most, color: accent });
      doc.text(String(counts.get(start)), { x: xs[2], y: y + 8, size: 7.8, font: 'bold', align: 'right', width: widths[2] });
      y += row;
    });
    doc.y = top + height - 6;
  }

  // ── everyone ──
  doc.ensure(60);
  {
    const y = doc.y + 4;
    heading(`${since ? range.label : 'Everyone'} (${roster.length})`, { y });
    doc.y = y + 19;
  }
  if (roster.length > shown.length) {
    doc.paragraph(`Showing the first ${shown.length} of ${roster.length} people. The spreadsheet in the emailed report has everyone.`, { size: 7.5, color: COLORS.muted, gap: 4 });
  }
  const small = 7;
  /** How many tools this person used, and which, by short names. */
  const toolsCell = (lead) => {
    const used = toolsUsedOf(lead);
    if (!used.length) return [{ text: 'None', color: COLORS.muted }];
    return [{ text: used.length === 1 ? '1 tool' : `${used.length} tools`, font: 'bold' }, { text: used.map((key) => TOOL_SHORT[key]).join(', '), size: 6.6, color: COLORS.muted }];
  };
  doc.table({
    columns: [
      { label: 'NAME', width: 2.1 }, { label: 'PHONE · CONSENT', width: 2.25 }, { label: 'SIGNED UP', width: 1.1 },
      { label: 'TOOLS USED', width: 1.4 }, { label: 'SAVED HOMES', width: 1.3 }, { label: 'STATUS', width: 1.35 },
    ],
    size: 8, padX: 6, padY: 4.5, header: primary, rules: false,
    rows: shown.map((lead) => {
      const names = savedOf(lead).map((id) => homeName.get(id));
      const consent = lead.consent;
      const reach = lead.phone || 'No phone';
      return [
        [
          { text: clip(lead.name, 120) },
          { text: lead.email, color: COLORS.muted, size: small },
          ...(lead.extraEmails ?? []).map((email) => ({ text: `also ${email}`, color: COLORS.muted, size: small })),
        ],
        consent?.granted
          ? [{ parts: [{ text: `${reach} · ` }, { text: 'Agreed', font: 'bold' }] }]
          : [{ text: reach }, { tag: true, text: `DO NOT CALL · ${consent ? 'DECLINED' : 'NEVER ASKED'}`, size: 6.2 }],
        dayText(lead.firstVisitAt, timeZone),
        toolsCell(lead),
        names.length ? `${names.length} saved: ${names.slice(0, 3).join(', ')}${names.length > 3 ? `, +${names.length - 3} more` : ''}` : { text: 'None', color: COLORS.muted },
        { font: 'bold', text: `${lead.status === 'contacted' ? 'Contacted' : 'New'}${lead.tour ? ` · call ${isTourPending(lead) ? 'waiting' : lead.tour.handledAt ? 'handled' : 'booked'}` : ''}` },
      ].map((cell) => (typeof cell === 'object' && !Array.isArray(cell) && (cell.text !== undefined || cell.parts) ? [cell] : cell));
    }),
    empty: since ? 'No one signed up in this period.' : 'No one has signed up yet.',
  });

  const filename = `${slugify(community.name) || 'community'}-leads-${today}.pdf`;
  return {
    buffer: doc.finish(), filename, people: roster.length, pages: doc.pages.length,
    // The numbers in the strip at the top, for whoever needs them without reading the file.
    figures: {
      people: roster.length, everyone: people.length, contacted, waiting: waiting.length, gavePhone: withPhone,
      agreed, declined, neverAsked, doNotCall: noCall, savedHome: savedAny,
      // How many of these people used each tool, by tool key.
      toolUsers: Object.fromEntries(TOOL_ORDER.map((key) => [key, roster.filter((lead) => toolsUsedOf(lead).includes(key)).length])),
    },
  };
}

/** One person's report, as a PDF. */
export function buildUserPdf({ community, lead, homes = [], consents = [], now = new Date(), timeZone = reportTimeZone(), brand = lenderBrandOf(community) }) {
  const lender = clip(lenderNameOf(community), 80);
  const theme = themeOf(community);
  const generated = `${stamp(now, timeZone)} ${zoneName(timeZone, now)}`;
  const { doc, accent } = startDocument({
    community, title: `User report: ${clip(lead.name, 120)}`, subtitle: oneLine(lead.email), generated, theme, brand,
  });
  const homeById = new Map(homes.map((home) => [home.id, home]));
  const activity = lead.activity ?? [];
  // A saved home that has since been deleted is neither counted nor listed.
  const saved = (lead.savedHomeIds ?? []).map((id) => homeById.get(id)).filter(Boolean);
  /**
   * Pairs of [label, value, span] in columns, the value in bold under its small label. A value is wrapped, never cut
   * short (an address or phone number must be readable in full), and a row is as tall as its tallest value.
   */
  const facts = (pairs, perRow = 3) => {
    const colWidth = doc.contentWidth / perRow;
    const rows = [];
    let row = [];
    let used = 0;
    for (const [key, value, span = 1] of pairs) {
      if (used + span > perRow) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push({ key, span, x: used, lines: wrapText(String(value || '—'), { font: 'bold', size: 10, width: colWidth * span - 10 }).slice(0, 6) });
      used += span;
    }
    if (row.length) rows.push(row);
    for (const cells of rows) {
      const height = 21 + Math.max(...cells.map((cell) => cell.lines.length)) * 12.5 + 8;
      doc.ensure(height);
      for (const cell of cells) {
        const x = doc.left + cell.x * colWidth;
        doc.text(String(cell.key).toUpperCase(), { x, y: doc.y + 8, size: 7, color: COLORS.muted });
        cell.lines.forEach((line, i) => doc.text(line, { x, y: doc.y + 21 + i * 12.5, size: 10, font: 'bold' }));
      }
      doc.moveDown(height);
    }
  };

  // ── who ──
  const lastActive = activity.find((item) => item.createdAt)?.createdAt;
  doc.statRow([
    { label: 'Tools used', value: String(toolsUsedOf(lead).length) },
    { label: 'Homes saved', value: String(saved.length) },
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
        : `Do not call or text. They were asked on ${stamp(lead.consent.at, timeZone)} and did not agree.`,
      { font: 'bold', color: lead.consent.granted ? COLORS.ink : RED, gap: 3 },
    );
    if (!lead.consent.granted) doc.paragraph(REPLY_NOTE, { size: 8.5, color: COLORS.muted, gap: 3 });
    if (lead.consent.text) doc.paragraph(`Wording shown${lead.consent.version ? ` (version ${lead.consent.version})` : ''}: ${lead.consent.text}`, { size: 8, color: COLORS.muted, gap: 3 });
    if (consents.length > 1) {
      doc.paragraph(`${plural(consents.length, 'answer')} on record: ${consents.map((c) => `${c.granted ? 'agreed' : 'declined'} ${dayText(c.at, timeZone)}`).join('; ')}.`, { size: 8, color: COLORS.muted });
    }
  } else if (!lead.phone) {
    doc.paragraph('Nobody has asked about calls and texts yet, because there is no number. They are asked when they give one to book a time.', { color: COLORS.muted });
  } else {
    doc.paragraph('Do not call or text. Never asked: no consent is on file, because this person signed up before the question was added.', { font: 'bold', color: RED, gap: 3 });
    doc.paragraph(REPLY_NOTE, { size: 8.5, color: COLORS.muted });
  }

  // ── the call they asked for ──
  if (lead.tour) {
    doc.heading('Scheduled call');
    const pending = isTourPending(lead);
    doc.paragraph(`${describeTour({ ...lead.tour, time: lead.tour.date ? lead.tour.time : clip(lead.tour.time, 200) }, lender)}.`, { font: 'bold', gap: 2 });
    doc.paragraph(
      `${pending ? 'Waiting for a call.' : lead.tour.handledAt ? `Handled ${dayText(lead.tour.handledAt, timeZone)}.` : 'Closed with the person.'}`
      + `${lead.tour.requestedAt ? ` Requested ${stamp(lead.tour.requestedAt, timeZone)}.` : ''}`,
      { color: pending ? RED : COLORS.muted },
    );
  }

  // ── homes ──
  doc.heading(`Homes saved (${saved.length})`);
  doc.table({
    columns: [
      { label: 'HOME', width: 2.4 }, { label: 'PRICE', width: 1.2, align: 'right' }, { label: 'BEDS', width: 0.7, align: 'right' },
      { label: 'BATHS', width: 0.7, align: 'right' }, { label: 'SQ FT', width: 0.9, align: 'right' }, { label: 'LOT', width: 0.8 },
    ],
    rows: saved.map((home) => [
      { text: clip(home.name, 80), font: 'bold' }, home.price ? money(home.price) : '', home.beds ? String(home.beds) : '', home.baths ? String(home.baths) : '',
      home.sqft ? home.sqft.toLocaleString('en-US') : '', home.lotNumber ? String(home.lotNumber) : '',
    ].map((cell) => (typeof cell === 'object' ? [cell] : cell))),
    empty: 'No homes saved.',
  });

  // ── the tools they used, and what each worked out when they kept it ──
  doc.heading('Tools they used');
  const used = new Set(toolsUsedOf(lead));
  const offered = toolsOfferedBy(community);
  doc.table({
    columns: [{ label: 'TOOL', width: 1.5 }, { label: 'RESULT', width: 4.2 }],
    // The tools the community offers, and any it has since switched off that this person used before it did.
    rows: TOOL_ORDER.filter((key) => offered.includes(key) || used.has(key)).map((key) => [
      { text: PLAN_LABELS[key], font: 'bold' },
      toolAnswerOf(lead, key)
        ? clip(toolAnswerOf(lead, key), 400)
        : used.has(key) ? { text: 'Used. Nothing saved.' } : { text: 'Not used', color: COLORS.muted },
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
    rows: activity.map((item) => [stamp(item.createdAt, timeZone), clip(item.text, 400)]),
    empty: 'No activity recorded.',
    size: 8,
  });

  const filename = `${slugify(lead.name) || 'person'}-report-${calendarDay(now, timeZone)}.pdf`;
  return { buffer: doc.finish(), filename, pages: doc.pages.length };
}
