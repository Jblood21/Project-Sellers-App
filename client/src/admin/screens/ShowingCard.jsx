import { useState } from 'react';

import { describeShowing, formatSlotDate, formatSlotTime } from '@shared/domain.js';
import { shortDate } from '../../lib/format.js';
import { SaveNote, useSaving } from '../ui.jsx';

const ANSWERS = [
  { key: 'confirmed', label: 'Confirm a time' },
  { key: 'suggested', label: 'Suggest another time' },
  { key: 'declined', label: 'Decline' },
];

const SAID = {
  confirmed: (r) => `Confirmed for ${formatSlotDate(r.date)} at ${formatSlotTime(r.time)}`,
  suggested: (r) => `Suggested ${formatSlotDate(r.date)} at ${formatSlotTime(r.time)}`,
  declined: () => 'Declined',
};

/**
 * A showing a person asked for on a listing: the day and part of it they chose and what they wrote, then the agent's
 * answer. Confirming, suggesting another time or declining emails them (a confirmed time comes with a calendar invite)
 * and marks them contacted. `onAnswer` saves it, resolving when the server has.
 */
export default function ShowingCard({ lead, onAnswer }) {
  const showing = lead.showing;
  const response = showing.response;
  const [mode, setMode] = useState(null);
  const [date, setDate] = useState(response?.date || showing.date || '');
  const [time, setTime] = useState(response?.time || '10:00');
  const [message, setMessage] = useState('');
  const saver = useSaving();
  const open = !response || mode;

  const send = async () => {
    const saved = await saver.run(() => onAnswer({ status: mode, date, time, message }));
    if (saved) {
      setMode(null);
      setMessage('');
    }
  };

  return (
    <div className="card" style={{ gap: 8, marginBottom: 12 }}>
      <span className="card-kicker">Showing request{response ? '' : ' · waiting for you'}</span>
      <div style={{ fontWeight: 600 }}>{describeShowing(showing)}</div>
      {showing.message ? <div style={{ fontSize: 14 }}>&ldquo;{showing.message}&rdquo;</div> : null}
      <span className="text-muted" style={{ fontSize: 14 }}>Asked {shortDate(showing.requestedAt)}</span>

      {response ? (
        <div style={{ fontSize: 14 }}>
          <strong>{SAID[response.status](response)}</strong>
          {response.message ? ` · ${response.message}` : ''}
          <span className="text-muted"> · {shortDate(response.at)}, emailed to them</span>
        </div>
      ) : null}

      <div role="group" aria-label="Answer the request" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ANSWERS.map((answer) => (
          <button
            key={answer.key} type="button" aria-pressed={mode === answer.key}
            className={mode === answer.key ? 'btn btn-primary' : response ? 'btn btn-ghost' : 'btn btn-secondary'}
            onClick={() => setMode(mode === answer.key ? null : answer.key)}
          >
            {response && !mode ? `Change: ${answer.label.toLowerCase()}` : answer.label}
          </button>
        ))}
      </div>

      {open && mode ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {mode !== 'declined' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Day
                <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Time
                <input className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
            </div>
          ) : null}
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            A note to them (optional)
            <textarea className="input" rows={2} maxLength={600} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button
            type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
            onClick={send} aria-disabled={saver.saving || undefined}
          >
            {saver.saving ? 'Sending…' : mode === 'confirmed' ? 'Confirm and email them' : mode === 'suggested' ? 'Suggest and email them' : 'Decline and email them'}
          </button>
        </div>
      ) : null}
      <SaveNote saver={saver} />
    </div>
  );
}
