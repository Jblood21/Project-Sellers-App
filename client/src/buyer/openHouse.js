import { useEffect, useState } from 'react';

import { readOpenHouses, upcomingOpenHouses } from '@shared/listing.js';

/**
 * Open houses are literal local dates and times ('2026-11-14', '13:00'): 1 pm means 1 pm at the home, whoever
 * reads it, so nothing here converts a time zone. "Today" and "now" are the viewer's own clock, which is the
 * clock of someone standing at the door.
 */

/** Without an end time a session is taken to last this long, for "Now open" and the calendar event. */
const DEFAULT_MINUTES = 120;

const pad = (n) => String(n).padStart(2, '0');

/** The viewer's own 'YYYY-MM-DD' and 'HH:MM'. */
export function localNow(now = new Date()) {
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMinutes = (total) => `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;

/** '13:05' -> '1:05 PM'. */
export function clock12(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** '13:00', '15:00' -> '1:00–3:00 PM' (the meridiem is said once when both ends share it); no end -> '1:00 PM'. */
export function timeRange(start, end) {
  if (!end) return clock12(start);
  const a = clock12(start);
  const b = clock12(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** The end of a session as 'HH:MM': its own, or the default length after its start (never past midnight). */
function endOf(session) {
  return session.end || fromMinutes(Math.min(minutes(session.start) + DEFAULT_MINUTES, 23 * 60 + 59));
}

/** 'Sat, Nov 14' for a literal date. UTC is used only to read the date back out unchanged. */
export function dayLabel(date, withWeekday = true) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withWeekday ? { weekday: 'short' } : null),
  });
}

/** True when the session is on right now by the viewer's clock. */
export function isNowOpen(session, today, time) {
  return session.date === today && time >= session.start && time < endOf(session);
}

/**
 * The sessions still to come: today's that have not finished, and later ones. (upcomingOpenHouses keeps the
 * whole of today; a session that ended at noon should not be offered at 3 pm.)
 */
export function comingOpenHouses(list, today, time) {
  return upcomingOpenHouses(list, today).filter((s) => s.date > today || time < endOf(s));
}

/** The community's open houses, still to come, by the viewer's clock. Refreshes each minute so "Now open" turns on and off. */
export function useOpenHouses(settings) {
  const raw = settings?.openHousesJson;
  const [now, setNow] = useState(() => localNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(localNow()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const all = readOpenHouses(raw);
  return { ...now, sessions: comingOpenHouses(all, now.today, now.time) };
}

/** "Open house today 1:00–3:00 PM" / "Open house Sat, Nov 14 · 1:00–3:00 PM". */
export function nextOpenHouseLine(session, today) {
  if (!session) return '';
  const range = timeRange(session.start, session.end);
  return session.date === today ? `Open house today ${range}` : `Open house ${dayLabel(session.date)} · ${range}`;
}

const icsText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsStamp = (date, hhmm) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;

/** An .ics calendar file for one session. Floating local times (no zone), the way the session is stored. */
export function openHouseIcs(session, { address, place, uid }) {
  const where = [address, place].filter(Boolean).join(', ');
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Touradoor//Open house//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${session.date}-${session.start.replace(':', '')}-${uid}@touradoor`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsStamp(session.date, session.start)}`,
    `DTEND:${icsStamp(session.date, endOf(session))}`,
    `SUMMARY:${icsText(`Open house: ${address}`)}`,
    `LOCATION:${icsText(where)}`,
    ...(session.note ? [`DESCRIPTION:${icsText(session.note)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Hands the browser the file to save. */
export function downloadIcs(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A Google Maps search for the home. */
export function directionsUrl(address, place) {
  const query = [address, place].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
