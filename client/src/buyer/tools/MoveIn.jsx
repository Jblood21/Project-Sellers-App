import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  isoDate, leaseOverlap, MOVE_IN_DRIVERS, moveInTimeline, PAY_METHODS, WHO_LABELS,
} from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import { Field, PillGroup, SaveToPlan, ToolHeader } from './ToolUI.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY_PLAN = {
  homeId: '', targetDate: '', leaseEnd: '', payMethod: 'loan', drivers: [], done: [], ownSteps: [],
};

/** 'Sep 20', or 'Sep 20, 2027' once the year stops being obvious. */
function dayLabel(value, thisYear) {
  const [y, m, d] = String(value ?? '').split('-').map(Number);
  if (!y || !m || !d) return '—';
  return y === thisYear ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * The buyer's own move-in plan. It asks when they want to be *living* there —
 * the question they have a real answer to — and works backwards to the date
 * they would have to start, rather than asking for an offer date they have not
 * thought about.
 */
export default function MoveIn() {
  const { homes, lead, savePlan, saveMoveIn, track } = useBuyer();
  const [plan, setPlan] = useState(EMPTY_PLAN);
  const [draft, setDraft] = useState({ label: '', date: '' });

  const today = isoDate(new Date());
  const thisYear = new Date().getFullYear();

  // Seed from the lead once. Re-seeding on every lead change would let the
  // response to our own save land on top of edits made while it was in flight.
  const seededFor = useRef(null);
  useEffect(() => {
    if (!lead || seededFor.current === lead.id) return;
    seededFor.current = lead.id;
    if (lead.moveIn) setPlan({ ...EMPTY_PLAN, ...lead.moveIn, homeId: lead.moveIn.homeId || '' });
  }, [lead]);

  // Saving is debounced — this fires on every keystroke and every tick — but the
  // last edit is flushed on the way out, so tapping Back never loses it.
  const saveTimer = useRef(null);
  const pending = useRef(null);
  const queueSave = useCallback(
    (next) => {
      pending.current = next;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const plan = pending.current;
        pending.current = null;
        if (plan) saveMoveIn(plan);
      }, 700);
    },
    [saveMoveIn],
  );
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      if (pending.current) saveMoveIn(pending.current);
    },
    [saveMoveIn],
  );

  const update = useCallback(
    (patch) => {
      setPlan((prev) => {
        const next = { ...prev, ...patch };
        queueSave(next);
        return next;
      });
    },
    [queueSave],
  );

  const home = homes.find((h) => h.id === plan.homeId) || null;
  const timeline = useMemo(
    () => moveInTimeline(plan, { home, today }),
    [home, plan, today],
  );
  const overlap = plan.leaseEnd ? leaseOverlap(plan.leaseEnd, timeline.keys) : null;

  const toggleDriver = (key) => {
    const on = plan.drivers.includes(key);
    update({
      drivers: on ? plan.drivers.filter((d) => d !== key) : [...plan.drivers, key],
      // Dropping "my lease is ending" should drop the date it asked for, rather
      // than keeping a lease date nothing on screen explains any more.
      ...(on && key === 'lease' ? { leaseEnd: '' } : {}),
    });
    if (!on) track(`Move-in driver: ${MOVE_IN_DRIVERS.find((d) => d.k === key)?.label ?? key}`);
  };

  const toggleDone = (key) => {
    update({
      done: plan.done.includes(key) ? plan.done.filter((k) => k !== key) : [...plan.done, key],
    });
  };

  const addOwnStep = () => {
    const label = draft.label.trim();
    if (!label) return;
    update({ ownSteps: [...plan.ownSteps, { id: newId(), label, date: draft.date }] });
    setDraft({ label: '', date: '' });
    track(`Added their own move-in step: ${label}`);
  };

  const removeOwnStep = (id) => {
    update({
      ownSteps: plan.ownSteps.filter((s) => s.id !== id),
      done: plan.done.filter((k) => k !== `own:${id}`),
    });
  };

  const doneCount = timeline.items.filter((i) => i.done).length;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <ToolHeader
        title="My Move-In Plan"
        subtitle="Tell us when you want to be in. We will work backwards from there."
      />

      <div style={{ marginBottom: 14 }}>
        <Field label="When do you want to be living there?">
          <input
            className="b-in"
            type="date"
            value={plan.targetDate}
            min={today}
            onChange={(event) => update({ targetDate: event.target.value })}
          />
        </Field>
      </div>

      {homes.length ? (
        <div style={{ marginBottom: 14 }}>
          <Field label="Which home?" hint="Leave it open if you have not decided.">
            <select
              className="b-in"
              value={plan.homeId}
              onChange={(event) => update({ homeId: event.target.value })}
            >
              <option value="">Not sure yet</option>
              {homes.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      <div style={{ marginBottom: 14 }}>
        <Field label="How are you paying?" hint="Cash skips the appraisal and underwriting — weeks shorter.">
          <PillGroup
            label="How you are paying"
            value={plan.payMethod}
            onChange={(payMethod) => {
              update({ payMethod });
              track(`Move-in paying: ${payMethod === 'cash' ? 'cash' : 'with a loan'}`);
            }}
            options={PAY_METHODS.map((m) => ({ value: m.k, label: m.label }))}
          />
        </Field>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="b-lbl">What is driving that date?</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {MOVE_IN_DRIVERS.map((driver) => (
            <button
              key={driver.k}
              type="button"
              className="b-pill"
              data-on={plan.drivers.includes(driver.k)}
              aria-pressed={plan.drivers.includes(driver.k)}
              onClick={() => toggleDriver(driver.k)}
              style={{ flex: 'none', padding: '0 14px' }}
            >
              {driver.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--t-mut)', margin: '6px 0 0' }}>
          Optional — each one adds the steps it needs.
        </p>
      </div>

      {plan.drivers.includes('lease') ? (
        <div style={{ marginBottom: 14 }}>
          <Field label="When does your lease end?">
            <input
              className="b-in"
              type="date"
              value={plan.leaseEnd}
              onChange={(event) => update({ leaseEnd: event.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <Notices timeline={timeline} home={home} thisYear={thisYear} onUseEarliest={(d) => update({ targetDate: d })} />

      {overlap ? <Overlap overlap={overlap} /> : null}

      {timeline.keys ? (
        <div
          className="b-card"
          style={{ padding: '14px 16px', marginBottom: 14, fontSize: 13.5, lineHeight: 1.5 }}
        >
          {plan.targetDate ? (
            <>
              To have keys on <strong>{dayLabel(timeline.keys, thisYear)}</strong>, your offer needs
              to be in by <strong>{dayLabel(timeline.offerBy, thisYear)}</strong>.
            </>
          ) : (
            // Without a date of their own this is a preview, not their plan --
            // saying "to have keys on" would assert a date they never picked.
            <>
              Pick a date above to build your own plan. Starting today, the soonest you could have
              keys is <strong>{dayLabel(timeline.keys, thisYear)}</strong>.
            </>
          )}
        </div>
      ) : null}

      <div className="b-card" style={{ padding: '4px 16px', marginBottom: 14 }}>
        {timeline.items.map((item, index) => (
          <StepRow
            key={item.key}
            item={item}
            first={index === 0}
            today={today}
            thisYear={thisYear}
            onToggle={() => toggleDone(item.key)}
            onRemove={item.own ? () => removeOwnStep(item.key.slice(4)) : null}
          />
        ))}
        {!timeline.items.length ? (
          <p style={{ fontSize: 13, color: 'var(--t-mut)', padding: '14px 0', margin: 0 }}>
            Pick a date above and your steps will appear here.
          </p>
        ) : null}
      </div>

      <div className="b-card" style={{ padding: 14, marginBottom: 14 }}>
        <span className="b-lbl">Add your own step</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            className="b-in"
            value={draft.label}
            placeholder="Transfer utilities"
            maxLength={80}
            onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addOwnStep();
              }
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            className="b-in"
            type="date"
            value={draft.date}
            aria-label="Date for your own step"
            onChange={(event) => setDraft((d) => ({ ...d, date: event.target.value }))}
          />
          <button
            type="button"
            className="b-btn b-btn-outline"
            style={{ width: 96, minHeight: 46 }}
            onClick={addOwnStep}
            disabled={!draft.label.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <SaveToPlan
        onSave={() =>
          savePlan(
            'movein',
            timeline.keys
              ? `In by ${dayLabel(timeline.keys, thisYear)} — offer by ${dayLabel(timeline.offerBy, thisYear)}`
              : 'Working out a move-in date',
          )
        }
        note={
          timeline.items.length
            ? `${doneCount} of ${timeline.items.length} done — your plan saves as you go.`
            : undefined
        }
      />
    </div>
  );
}

/** One step: tick it off, see whose job it is, and when. */
function StepRow({ item, first, today, thisYear, onToggle, onRemove }) {
  const overdue = Boolean(item.date) && item.date <= today && !item.done;
  return (
    <div
      style={{
        display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0',
        borderTop: first ? 'none' : '1px solid var(--t-line)',
      }}
    >
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        aria-label={item.label}
        style={{ flex: 'none', width: 20, height: 20, accentColor: 'var(--t-acc)' }}
      />
      <span
        style={{
          flex: 'none', width: 58, fontSize: 12, fontWeight: 700,
          color: overdue ? 'var(--t-acc)' : 'var(--t-mut)',
        }}
      >
        {overdue ? 'Now' : dayLabel(item.date, thisYear)}
      </span>
      <span
        style={{
          flex: 1, fontSize: 13.5, lineHeight: 1.35,
          textDecoration: item.done ? 'line-through' : 'none',
          opacity: item.done ? 0.55 : 1,
        }}
      >
        {item.label}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--t-mut)' }}>
          {WHO_LABELS[item.who] ?? 'You'}
        </span>
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.label}`}
          style={{
            flex: 'none', border: 'none', background: 'none', color: 'var(--t-mut)',
            fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4,
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/** What the dates cannot deliver, said plainly rather than quietly ignored. */
function Notices({ timeline, home, thisYear, onUseEarliest }) {
  const box = {
    background: 'var(--t-tint)', borderRadius: 'var(--t-rad)', padding: '12px 14px',
    marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
  };

  if (timeline.unknownReady) {
    return (
      <div style={box}>
        {home?.name ?? 'This home'} is still being built and the team has not set a completion date
        yet. These dates cover the paperwork only — ask them when the home will be finished before
        you plan around it.
      </div>
    );
  }
  if (timeline.keys && !timeline.feasible) {
    return (
      <div style={box}>
        The earliest {home?.name ?? 'a home'} could hand over keys is{' '}
        <strong>{dayLabel(timeline.earliest, thisYear)}</strong>
        {home && home.availability !== 'Move-in ready' ? ' — it is still being built.' : '.'}{' '}
        <button
          type="button"
          onClick={() => onUseEarliest(timeline.earliest)}
          style={{
            border: 'none', background: 'none', padding: 0, color: 'var(--t-accT)',
            font: 'inherit', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Use that date
        </button>
      </div>
    );
  }
  return null;
}

/** The bit renters actually lose sleep over. */
function Overlap({ overlap }) {
  const box = {
    background: 'var(--t-tint)', borderRadius: 'var(--t-rad)', padding: '12px 14px',
    marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
  };
  const days = Math.abs(overlap.days);
  if (overlap.kind === 'same') {
    return <div style={box}>Your lease ends the same day you get keys. Tight, but nothing doubled up.</div>;
  }
  if (overlap.kind === 'overlap') {
    return (
      <div style={box}>
        Your lease runs <strong>{days} days</strong> past your keys — that is about{' '}
        {days >= 28 ? `${Math.round(days / 30)} month${days >= 45 ? 's' : ''}` : `${days} days`} of paying
        for both places. Moving your date earlier, or asking the landlord about a shorter final term,
        closes the gap.
      </div>
    );
  }
  return (
    <div style={box}>
      Your lease ends <strong>{days} days</strong> before your keys — you would need somewhere to stay
      in between. Ask the landlord about going month-to-month, or aim for an earlier date.
    </div>
  );
}
