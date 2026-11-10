import { useState } from 'react';

import { SHOWING_PARTS, describeShowing, formatSlotDate, formatSlotTime } from '@shared/domain.js';
import { useBuyer } from './BuyerContext.jsx';

const pad = (n) => String(n).padStart(2, '0');
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** What the agent said, in the buyer's words. */
function answerLine(response) {
  if (response.status === 'confirmed') return `Confirmed for ${formatSlotDate(response.date)} at ${formatSlotTime(response.time)}.`;
  if (response.status === 'suggested') return `The agent suggests ${formatSlotDate(response.date)} at ${formatSlotTime(response.time)} instead.`;
  return 'The agent is not able to show it then.';
}

/**
 * Ask to see a listing: a day, a part of it and a word to the agent, sent to them (they are told on their phone and by
 * email) and answered from their page. Shows the request and the agent's answer once there is one. A buyer who
 * signed in without a number is asked for one, because the agent has to be able to reach them.
 */
export default function ShowingRequest() {
  const { lead, requestShowing } = useBuyer();
  const sent = lead?.showing;
  const [editing, setEditing] = useState(!sent);
  const [date, setDate] = useState(localDay(1));
  const [part, setPart] = useState('Any time');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const needsPhone = Boolean(lead) && !lead.phone;
  const phoneOk = !needsPhone || (phone.match(/\d/g) || []).length >= 7;
  if (!lead) return null;

  const send = async () => {
    setBusy(true);
    const done = await requestShowing({ date, part, message: message.trim(), ...(needsPhone ? { phone: phone.trim() } : {}) });
    setBusy(false);
    if (done) setEditing(false);
  };

  if (sent && !editing) {
    return (
      <div style={{ display: 'grid', gap: 6, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--t-line, #0002)' }}>
        <span className="b-lbl">Your showing request</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{describeShowing(sent)}</span>
        <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
          {sent.response
            ? `${answerLine(sent.response)}${sent.response.message ? ` “${sent.response.message}”` : ''}`
            : 'Sent. The agent will confirm a time.'}
        </span>
        <button type="button" className="b-btn b-btn-outline" onClick={() => setEditing(true)}>Ask for a different day</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--t-line, #0002)' }}>
      <span className="b-lbl">Ask for a showing</span>
      <label className="b-field">
        <span className="b-lbl">Day</span>
        <input className="b-in" type="date" value={date} min={localDay(0)} onChange={(event) => setDate(event.target.value)} />
      </label>
      <div role="group" aria-label="Time of day" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SHOWING_PARTS.map((option) => (
          <button
            key={option} type="button" className="b-pill" data-on={part === option} aria-pressed={part === option}
            onClick={() => setPart(option)} style={{ flex: 'none', padding: '0 14px' }}
          >
            {option}
          </button>
        ))}
      </div>
      {needsPhone ? (
        <label className="b-field">
          <span className="b-lbl">Your number</span>
          <input className="b-in" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(801) 555-0100" autoComplete="tel" inputMode="tel" />
        </label>
      ) : null}
      <label className="b-field">
        <span className="b-lbl">Anything the agent should know? (optional)</span>
        <textarea className="b-in" rows={2} maxLength={600} value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button type="button" className="b-btn" onClick={send} disabled={busy || !date || !phoneOk} aria-disabled={busy || !date || !phoneOk}>
        {busy ? 'Sending…' : 'Send request'}
      </button>
      {sent ? <button type="button" className="b-btn b-btn-outline" onClick={() => setEditing(false)}>Cancel</button> : null}
    </div>
  );
}
