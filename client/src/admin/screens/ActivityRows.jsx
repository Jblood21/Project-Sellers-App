import { Link } from 'react-router-dom';

import { ACTIONS } from '@shared/adminActivity.js';

/** The time of day of an entry, the way a phone shows it: 3:42 PM. */
const timeOf = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** One value per calendar day, in the reader's own time zone, so entries from one day group together. */
const dayKey = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** The heading over a day's entries: Today, Yesterday, or the day itself (with its year once it is not this one). */
export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Some time';
  const key = dayKey(iso);
  if (key === dayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Entries, already newest first, split where the day changes. */
export function groupByDay(entries) {
  const groups = [];
  for (const entry of entries) {
    const key = dayKey(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.at), entries: [entry] });
  }
  return groups;
}

/**
 * The words of an entry in three parts, so the subject can be set in bold: "Added home " + "Lot 12" + "". The
 * labels are the shared list the server writes its keys from; a key this build does not know (a newer server)
 * is still read, as its own words with the subject after it, so a row never shows a bare key or nothing at all.
 */
export function describeActivity(entry) {
  const template = ACTIONS[entry.action];
  if (!template) {
    const words = String(entry.action ?? '').replace(/[._-]+/g, ' ').trim();
    return { before: words ? `${words[0].toUpperCase()}${words.slice(1)} ` : 'Changed ', subject: entry.subject || '', after: '' };
  }
  const at = template.indexOf('{subject}');
  if (at < 0) return { before: template, subject: '', after: '' };
  return { before: template.slice(0, at), subject: entry.subject || '', after: template.slice(at + '{subject}'.length) };
}

/**
 * One line per entry: who, what (the subject in bold), where and when, with the detail under it when there is one.
 * The community's name opens it; an entry whose community is gone (deleted since) has none, and the name it kept
 * is in its words instead. When the subject is the community itself ("Changed setup for Willow Creek") the name
 * is written once, as the link, rather than again beside the line. `compact` is Today's card: no detail line.
 * The dots between the parts are drawn, not read, and a phone stacks the parts instead.
 */
export default function ActivityRows({ entries, compact = false }) {
  const dot = <span className="as-act__dot" aria-hidden="true">·</span>;
  return (
    <ul className="as-acts">
      {entries.map((entry) => {
        const { before, subject, after } = describeActivity(entry);
        const where = entry.community
          ? <Link className="as-act__where" to={`/admin/communities/${entry.community.id}/leads`}>{entry.community.name}</Link>
          : null;
        const subjectIsWhere = Boolean(where) && subject === entry.community.name;
        return (
          <li key={entry.id} className="as-act">
            <span className="as-act__who">{entry.admin?.email || 'Someone'}</span>
            {dot}
            <span className="as-act__what">
              {before}
              {subjectIsWhere ? <strong>{where}</strong> : null}
              {subject && !subjectIsWhere ? <strong>{subject}</strong> : null}
              {after}
            </span>
            {where && !subjectIsWhere ? (
              <>
                {dot}
                {where}
              </>
            ) : null}
            {dot}
            <time className="as-act__when" dateTime={entry.at}>{timeOf(entry.at)}</time>
            {!compact && entry.detail ? <span className="as-act__detail">{entry.detail}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
