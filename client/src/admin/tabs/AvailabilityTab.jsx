import { useEffect, useMemo, useState } from 'react';

import { formatSlotDate, formatSlotTime, isoDate, SLOT_TIMES } from '@shared/domain.js';
import { Trash } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote } from '../ui.jsx';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The days of a month laid out in weeks, padded so the 1st lands under its weekday. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * When the team is available. The builder taps the days they are around and
 * ticks the times they can do, and every combination is published at once —
 * "Tuesday, Wednesday and Thursday at 10, 2 and 4" is six taps, not nine forms.
 */
export default function AvailabilityTab({ community }) {
  const { token } = useAdmin();
  const [slots, setSlots] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setSlots(await adminApi.slots(token, community.id));
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, [community.id]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const slot of slots ?? []) {
      if (!map.has(slot.date)) map.set(slot.date, []);
      map.get(slot.date).push(slot);
    }
    return [...map.entries()];
  }, [slots]);

  const today = isoDate(new Date());
  const upcoming = byDate.filter(([date]) => date >= today);
  const past = byDate.filter(([date]) => date < today);

  const remove = async (slot) => {
    if (slot.leadId && !window.confirm('Someone has booked this time. Remove it anyway?')) return;
    await adminApi.deleteSlot(token, slot.id);
    await load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}>
        Times you publish here are the only times buyers can choose. Nothing else is offered,
        so an empty list means no one can book.
      </p>

      {slots && !upcoming.length ? (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Nothing published yet.
        </p>
      ) : null}

      {upcoming.map(([date, daySlots]) => (
        <div key={date} className="card elev-sm" style={{ gap: 8 }}>
          <span className="card-title" style={{ fontSize: 15 }}>{formatSlotDate(date)}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {daySlots.map((slot) => (
              <span
                key={slot.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                  padding: '5px 8px 5px 12px', borderRadius: 999,
                  border: '1px solid var(--color-divider)',
                  background: slot.leadId ? 'var(--color-accent)' : 'transparent',
                  color: slot.leadId ? '#fff' : 'var(--color-text)',
                }}
              >
                {formatSlotTime(slot.time)}
                {slot.leadId ? <span style={{ fontSize: 10, opacity: 0.85 }}>booked</span> : null}
                <button
                  type="button"
                  aria-label={`Remove ${formatSlotDate(date)} at ${formatSlotTime(slot.time)}`}
                  onClick={() => remove(slot)}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
                    color: slot.leadId ? '#fff' : 'var(--color-neutral-700)', display: 'flex',
                  }}
                >
                  <Trash size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {past.length ? (
        <p className="text-muted" style={{ fontSize: 12 }}>
          {past.reduce((n, [, d]) => n + d.length, 0)} past time
          {past.reduce((n, [, d]) => n + d.length, 0) === 1 ? '' : 's'} hidden — buyers are never shown these.
        </p>
      ) : null}

      <button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(true)} style={{ minHeight: 46 }}>
        ＋ Add available times
      </button>
      <ErrorNote>{error}</ErrorNote>

      {open ? (
        <AddSlots
          community={community}
          onClose={() => setOpen(false)}
          onSaved={async () => { setOpen(false); await load(); }}
        />
      ) : null}
    </div>
  );
}

function AddSlots({ community, onClose, onSaved }) {
  const { token } = useAdmin();
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [dates, setDates] = useState([]);
  const [times, setTimes] = useState(['10:00', '14:00']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const today = isoDate(new Date());
  const cells = monthGrid(view.year, view.month);
  const toggle = (list, value, set) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const shift = (by) => {
    const d = new Date(view.year, view.month + by, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.createSlots(token, community.id, { dates, times });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const total = dates.length * times.length;

  return (
    <Dialog
      title="Add available times"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !total}>
            {busy ? 'Adding…' : total ? `Add ${total} time${total === 1 ? '' : 's'}` : 'Add'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>
          {MONTH_NAMES[view.month]} {view.year}
        </span>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Next month" onClick={() => shift(1)}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 8 }}>
        {DAY_LABELS.map((label, i) => (
          <span key={i} className="text-muted" style={{ textAlign: 'center', fontSize: 11, padding: '4px 0' }}>
            {label}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} />;
          const iso = isoDate(date);
          const on = dates.includes(iso);
          const isPast = iso < today;
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast}
              aria-pressed={on}
              aria-label={formatSlotDate(iso)}
              onClick={() => toggle(dates, iso, setDates)}
              style={{
                aspectRatio: '1', borderRadius: 8, cursor: isPast ? 'default' : 'pointer',
                border: `1px solid ${on ? 'transparent' : 'var(--color-divider)'}`,
                background: on ? 'var(--color-accent)' : 'transparent',
                color: isPast ? 'var(--color-neutral-400)' : on ? '#fff' : 'var(--color-text)',
                fontSize: 13, fontWeight: on ? 700 : 500, padding: 0,
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <span className="text-muted" style={{ fontSize: 12, display: 'block', margin: '12px 0 6px' }}>
        Times on each of those days
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {SLOT_TIMES.map((time) => {
          const on = times.includes(time);
          return (
            <button
              key={time}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(times, time, setTimes)}
              style={{
                padding: '6px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                border: `1px solid ${on ? 'transparent' : 'var(--color-divider)'}`,
                background: on ? 'var(--color-accent)' : 'transparent',
                color: on ? '#fff' : 'var(--color-text)',
                fontWeight: on ? 700 : 500,
              }}
            >
              {formatSlotTime(time)}
            </button>
          );
        })}
      </div>

      <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.45 }}>
        {total
          ? `${dates.length} day${dates.length === 1 ? '' : 's'} × ${times.length} time${times.length === 1 ? '' : 's'} = ${total} slots. Times you already published are left alone.`
          : 'Pick at least one day and one time.'}
      </p>
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}
