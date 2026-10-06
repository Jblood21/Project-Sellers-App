import {
  MOVE_IN_DRIVERS, PAY_METHODS, WHO_LABELS, isoDate, leaseOverlap, moveInTimeline,
} from './domain.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Sep 20', or 'Sep 20, 2027' once the year stops being obvious; '—' for a blank or unreadable date. */
export function dayLabel(value, thisYear) {
  const [y, m, d] = String(value ?? '').split('-').map(Number);
  if (!y || !m || !d) return '—';
  return y === thisYear ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Said under the steps on the printed plan and in the plan email, so both carry the same warning. */
export const MOVE_IN_ESTIMATE_NOTE = 'The dates are estimates worked back from the day you want keys.';

/**
 * The buyer's whole move-in plan as something a printed page can show: the
 * sentence that matters, the choices behind it, anything the dates cannot
 * deliver, and every step in date order with whose job it is and whether it is
 * done. The saved summary line ("In by Sep 20 — offer by Jul 26") is all the plan
 * list keeps; a buyer who takes the page away needs the steps themselves.
 *
 * Null when there is no date of their own: without one the tool only shows a
 * preview ("the soonest you could have keys"), which is not a plan to print.
 *
 * Pure: `today` comes in rather than being read, so the result depends only on
 * its inputs.
 */
export function printableMoveIn(plan, { home = null, today = isoDate(new Date()) } = {}) {
  if (!plan?.targetDate) return null;
  const timeline = moveInTimeline(plan, { home, today });
  if (!timeline.keys) return null;
  const year = Number(String(today).slice(0, 4));
  const day = (value) => dayLabel(value, year);

  const drivers = MOVE_IN_DRIVERS.filter((driver) => (plan.drivers ?? []).includes(driver.k));
  const homeName = home?.name ?? '';
  const details = [
    ['Keys', day(timeline.keys)],
    ['Offer in by', day(timeline.offerBy)],
    ['Home', homeName || 'Not decided yet'],
    ['Paying', PAY_METHODS.find((method) => method.k === timeline.payMethod)?.label ?? 'With a loan'],
  ];
  if (drivers.length) details.push(['What is driving the date', drivers.map((driver) => driver.label).join(', ')]);
  const hasLease = drivers.some((driver) => driver.k === 'lease') && plan.leaseEnd;
  if (hasLease) details.push(['Lease ends', day(plan.leaseEnd)]);

  // What the dates cannot deliver, said plainly, as the tool says it on screen.
  const notes = [];
  if (timeline.unknownReady) {
    notes.push(`${homeName || 'This home'} is still being built and the team has not set a completion date yet. These dates cover the paperwork only; ask them when the home will be finished before you plan around it.`);
  } else if (!timeline.feasible) {
    notes.push(`The earliest ${homeName || 'a home'} could hand over keys is ${day(timeline.earliest)}${home && home.availability !== 'Move-in ready' ? ', because it is still being built' : ''}.`);
  }
  const overlap = hasLease ? leaseOverlap(plan.leaseEnd, timeline.keys) : null;
  if (overlap) {
    const days = Math.abs(overlap.days);
    if (overlap.kind === 'same') {
      notes.push('Your lease ends the same day you get keys. Tight, but nothing doubled up.');
    } else if (overlap.kind === 'overlap') {
      const paying = days >= 28
        ? `which is about ${Math.round(days / 30)} month${days >= 45 ? 's' : ''} of paying for both places`
        : 'so you would pay for both places for that long';
      notes.push(`Your lease runs ${days} days past your keys, ${paying}. Moving your date earlier, or asking the landlord about a shorter final term, closes the gap.`);
    } else {
      notes.push(`Your lease ends ${days} days before your keys, so you would need somewhere to stay in between. Ask the landlord about going month-to-month, or aim for an earlier date.`);
    }
  }

  const steps = timeline.items.map((item) => ({
    date: item.date ? day(item.date) : '',
    label: item.label,
    who: WHO_LABELS[item.who] ?? 'You',
    done: Boolean(item.done),
    own: Boolean(item.own),
  }));

  return {
    headline: `To have keys on ${day(timeline.keys)}, the offer needs to be in by ${day(timeline.offerBy)}.`,
    details,
    notes,
    steps,
    done: steps.filter((step) => step.done).length,
    total: steps.length,
  };
}

/**
 * The same plan as plain text lines, for the plan email: the sentence, the
 * choices, any note, then every step with [x]/[ ] in place of a tick box. Columns
 * are padded with spaces so it lines up in a mail client's fixed-width view and
 * still reads in a proportional one.
 */
export function moveInPlanLines(doc) {
  if (!doc) return [];
  const labelWidth = Math.max(0, ...doc.details.map(([label]) => label.length + 1));
  const dateWidth = Math.max(0, ...doc.steps.map((step) => (step.date || '—').length));
  return [
    doc.headline,
    '',
    ...doc.details.map(([label, value]) => `${`${label}:`.padEnd(labelWidth)}  ${value}`),
    '',
    ...doc.notes.flatMap((note) => [note, '']),
    'Every step, in date order:',
    ...doc.steps.map((step) => `${step.done ? '[x]' : '[ ]'} ${(step.date || '—').padEnd(dateWidth)}  ${step.label} (${step.who})`),
    '',
    `${doc.done} of ${doc.total} steps done. ${MOVE_IN_ESTIMATE_NOTE}`,
  ];
}
