import { formatSlotDate, formatSlotTime } from '../../shared/domain.js';

/**
 * What the buyer is emailed when the agent answers a showing request, and the calendar file that goes with a
 * confirmed time. Plain text only: it is a short note from a person, and the buyer replies to the agent.
 */
const pad = (n) => String(n).padStart(2, '0');

/** A calendar invite (RFC 5545) for a time the agent confirmed, as floating local time at the listing. */
export function showingInvite({ uid, date, time, address, agentName, minutes = 30 }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const stamp = (t) => `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
  const esc = (v) => String(v ?? '').replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Touradoor//Showing//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${esc(uid)}@touradoor`,
    `DTSTAMP:${stamp(now)}Z`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Showing: ${address}`)}`,
    `LOCATION:${esc(address)}`,
    agentName ? `DESCRIPTION:${esc(`Showing with ${agentName}`)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

/** The subject and body of the answer. `response` is { status, date, time, message }. */
export function showingAnswerEmail({ lead, community, agentName, agentPhone, response }) {
  const place = community?.name || 'the home';
  const who = agentName || 'Your agent';
  const when = response.date
    ? `${formatSlotDate(response.date)}${response.time ? ` at ${formatSlotTime(response.time)}` : ''}`
    : '';
  const note = response.message ? `\n\n${who} says: ${response.message}` : '';
  const reach = agentPhone ? `\n\nTo talk it over, call or text ${agentPhone}.` : '\n\nReply to this email to talk it over.';
  if (response.status === 'confirmed') {
    return {
      subject: `Your showing at ${place} is confirmed`,
      text: `Hi ${lead.name},\n\nYour showing at ${place} is confirmed for ${when}.${note}${reach}\n\nA calendar invite is attached.`,
    };
  }
  if (response.status === 'suggested') {
    return {
      subject: `Another time for your showing at ${place}`,
      text: `Hi ${lead.name},\n\nThat time does not work for the showing at ${place}. ${who} suggests ${when || 'another time'}.${note}${reach}\n\nOpen the app and ask again if that suits you, or call to confirm.`,
    };
  }
  return {
    subject: `About your showing request at ${place}`,
    text: `Hi ${lead.name},\n\nThanks for asking about ${place}. ${who} is not able to show it at the time you asked.${note}${reach}`,
  };
}
