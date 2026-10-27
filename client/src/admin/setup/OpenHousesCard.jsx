import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { OPEN_HOUSE_MAX, OPEN_HOUSE_NOTE_MAX, normalizeOpenHouses, readOpenHouses } from '@shared/listing.js';
import { Trash } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { localToday, sessionDate, sessionLabel, sessionTimes } from '../listing.js';
import { SaveNote, TextField, useSaving } from '../ui.jsx';

const BLANK = { date: '', start: '', end: '', note: '' };
const keyOf = (session) => `${session.date} ${session.start}`;

/**
 * When people can come to see the home. A list of days with a start and an end time and a note ("Meet the seller"),
 * kept in the listing's settings as `openHousesJson`. Each add or remove is saved on its own, the moment it is made
 * (not with Save settings), and says so if it did not go, with Retry on a bad signal and the server's own sentence
 * when it refused. Sessions that have passed stay on the list, muted, until they are removed (they count toward the
 * limit), and "Remove past ones" clears them in one go.
 */
export default function OpenHousesCard({ community, reload, onDirty }) {
  const { token } = useAdmin();
  const { hash } = useLocation();
  const saver = useSaving();
  const card = useRef(null);
  const [form, setForm] = useState(BLANK);
  const today = localToday();

  const sessions = readOpenHouses(community.settings?.openHousesJson);
  const upcoming = sessions.filter((session) => session.date >= today);
  const past = sessions.filter((session) => session.date < today);
  const full = sessions.length >= OPEN_HOUSE_MAX;
  const typed = Boolean(form.date || form.start || form.end || form.note.trim());

  // The nudges on Today and on The home link here (#open-houses): bring the card into view and start on its first box.
  useEffect(() => {
    if (hash !== '#open-houses') return;
    card.current?.scrollIntoView({ block: 'start' });
    document.getElementById('open-house-date')?.focus({ preventScroll: true });
  }, [hash]);

  // Something typed into the add form and not added yet is an unsaved change: Setup asks before it is thrown away.
  useEffect(() => {
    onDirty?.(typed);
    return () => onDirty?.(false);
  }, [typed, onDirty]);

  const save = (list) => saver.run(async () => {
    // The same check the server makes, so the sentence is the same and a bad list never leaves this page.
    const checked = normalizeOpenHouses(JSON.stringify(list));
    if (checked.error) throw new Error(checked.error);
    await adminApi.updateCommunity(token, community.id, { settings: { openHousesJson: checked.value } });
    // The people are not touched by an open house, so the community alone is read again.
    await reload({ leads: false });
  });

  const add = async (event) => {
    event.preventDefault();
    const ok = await save([
      ...sessions,
      { date: form.date, start: form.start, ...(form.end ? { end: form.end } : {}), note: form.note.trim() },
    ]);
    if (ok) setForm(BLANK);
  };

  const row = (session, isPast) => (
    <li key={keyOf(session)} className={`ax-oh__row${isPast ? ' is-past' : ''}`}>
      <span className="ax-oh__when">
        <strong>{sessionDate(session.date)}</strong>
        <span>{sessionTimes(session)}</span>
      </span>
      {session.note ? <span className="ax-oh__note">{session.note}</span> : null}
      {isPast ? <span className="tag tag-neutral">Past</span> : null}
      <button
        type="button" className="btn btn-ghost ax-oh__remove" onClick={() => save(sessions.filter((item) => keyOf(item) !== keyOf(session)))}
        aria-disabled={saver.saving || undefined} aria-label={`Remove open house ${sessionLabel(session)}`}
      >
        <Trash size={18} /> <span>Remove</span>
      </button>
    </li>
  );

  return (
    <div className="card elev-sm ax-oh" id="open-houses" ref={card} style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="card-kicker">Open houses</span>
        <span className="tag tag-neutral" aria-live="polite">{sessions.length} of {OPEN_HOUSE_MAX}</span>
      </div>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        The days and times visitors can come and see the home. They are shown on the home&apos;s page. Each change
        saves on its own, not with the Save settings button.
      </p>

      {sessions.length === 0 ? (
        <p className="ax-oh__none">No open houses yet. Add the first one below.</p>
      ) : (
        <>
          {upcoming.length ? <ul className="ax-oh__list" aria-label="Open houses to come">{upcoming.map((session) => row(session, false))}</ul> : (
            <p className="ax-oh__none">No open house is coming up. Add one below.</p>
          )}
          {past.length ? (
            <>
              <div className="ax-oh__pasthead">
                <span className="text-muted" style={{ fontSize: 14 }}>Past ({past.length})</span>
                <button
                  type="button" className="btn btn-ghost" onClick={() => save(upcoming)}
                  aria-disabled={saver.saving || undefined} style={{ minHeight: 44, fontSize: 14 }}
                >
                  Remove past ones
                </button>
              </div>
              <ul className="ax-oh__list" aria-label="Open houses that have passed">{past.map((session) => row(session, true))}</ul>
            </>
          ) : null}
        </>
      )}

      <form className="ax-oh__form" onSubmit={add} noValidate>
        <span className="ax-oh__formtitle">Add an open house</span>
        <div className="ax-oh__boxes">
          <TextField
            id="open-house-date" label="Date" type="date" value={form.date} min={today}
            onChange={(date) => setForm((f) => ({ ...f, date }))} disabled={full}
          />
          <TextField
            id="open-house-start" label="Starts" type="time" value={form.start}
            onChange={(start) => setForm((f) => ({ ...f, start }))} disabled={full}
          />
          <TextField
            id="open-house-end" label="Ends (optional)" type="time" value={form.end}
            onChange={(end) => setForm((f) => ({ ...f, end }))} disabled={full}
          />
        </div>
        <TextField
          label="Note (optional)" value={form.note} maxLength={OPEN_HOUSE_NOTE_MAX} disabled={full}
          onChange={(note) => setForm((f) => ({ ...f, note }))} placeholder="e.g. Meet the seller, or Park on the street"
          hint={`Up to ${OPEN_HOUSE_NOTE_MAX} characters.`}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={full} aria-disabled={saver.saving || undefined} style={{ minHeight: 46 }}>
            {saver.saving ? 'Saving…' : '＋ Add open house'}
          </button>
          {typed ? (
            <button type="button" className="btn btn-ghost" onClick={() => setForm(BLANK)} style={{ minHeight: 44 }}>Clear</button>
          ) : null}
        </div>
        {full ? (
          <span className="text-muted" style={{ fontSize: 14 }}>
            A listing can show up to {OPEN_HOUSE_MAX} open houses at a time. Remove one that has passed to add another.
          </span>
        ) : null}
        <SaveNote saver={saver} />
      </form>
    </div>
  );
}
