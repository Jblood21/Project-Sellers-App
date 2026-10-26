import { useEffect, useRef, useState } from 'react';

import { adminApi } from '../lib/api.js';
import { useAdmin } from './AdminContext.jsx';
import { ErrorNote } from './ui.jsx';

const sentOn = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const textStyle = { fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' };

/**
 * "Email the report": the scheduled calls waiting, the people who signed up since the last report, and a
 * spreadsheet of everyone, sent to the report address saved in Setup. Only when pressed. It says where it
 * will go, what the last one covered, and why it cannot be pressed (no saved address, a change not yet
 * saved, or email not set up on the site) instead of failing quietly.
 *
 * `blocked` lets a screen with unsaved edits hold the button; `onOpenSetup` gives the Leads tab a way to the
 * field.
 */
export default function ReportButton({ community, reload, blocked = '', onOpenSetup }) {
  const { token, isOwner } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const button = useRef(null);
  const note = useRef(null);
  const wasBusy = useRef(false);
  const address = String(community.settings?.reportEmail ?? '').trim();
  const lastSent = sentOn(community.settings?.reportLastSentAt);
  const emailOff = community.emailStatus && !community.emailStatus.ready;

  // Pressing the button disables it, which drops keyboard focus to the page. Put it back when the answer is in,
  // and bring the answer into view: on the Setup tab the sticky save bar would otherwise cover it.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    button.current?.focus({ preventScroll: true });
    note.current?.scrollIntoView?.({ block: 'nearest' });
  }, [busy]);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await adminApi.sendReport(token, community.id));
      await reload?.();
    } catch (err) {
      // A report that really went out stays on screen when the next press is only held back for a moment.
      if (err.status !== 429) setResult(null);
      // The server's 503 names the keys to add in Render, which is the account owner's to do and means nothing to
      // anyone else, so a member is told the fact and who can fix it.
      setError(err.status === 503 && !isOwner ? 'The report could not be sent. Email is not working right now. Tell the account owner.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!address) {
    // An address typed but not saved yet: say so, instead of asking for one that is already in the box.
    if (blocked) return <p className="text-muted" style={{ ...textStyle, margin: 0 }}>{blocked}</p>;
    return (
      <p className="text-muted" style={{ ...textStyle, margin: 0 }}>
        Add an address to send reports to{onOpenSetup ? (
          <>
            {' '}in{' '}
            <button
              type="button"
              onClick={onOpenSetup}
              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--color-accent-700)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              Setup
            </button>
          </>
        ) : ' above'}, then press Email the report.
      </p>
    );
  }

  // Same split as the email note on Setup: the keys and Render are the owner's, so everyone else gets a plain line.
  const emailWhy = isOwner
    ? 'Email is not set up on this site yet. The site owner adds RESEND_API_KEY and EMAIL_FROM in Render.'
    : 'Email is not working right now. Tell the account owner.';
  const why = blocked || (emailOff ? emailWhy : '');
  const calls = result ? result.comingUp + result.overdue : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button ref={button} type="button" className="btn btn-primary" onClick={send} disabled={busy || Boolean(why)}>
          {busy ? 'Sending…' : 'Email the report'}
        </button>
        <span className="text-muted" style={{ ...textStyle, minWidth: 0 }}>
          to {address}{lastSent ? ` · last sent ${lastSent}` : ' · none sent yet'}
        </span>
      </div>
      {why ? <span className="text-muted" style={textStyle}>{why}</span> : null}
      <div ref={note} className="ax-report-note" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {result ? (
          <p role="status" style={{ ...textStyle, margin: 0, fontWeight: 600 }}>
            Sent to {result.to}: {calls} scheduled call{calls === 1 ? '' : 's'},{' '}
            {result.newPeople} new {result.newPeople === 1 ? 'person' : 'people'}, and a spreadsheet of{' '}
            {result.everyone} {result.everyone === 1 ? 'person' : 'people'}.
            {result.notRecorded ? ' The time could not be saved, so the next report may list the same people again.' : ''}
          </p>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  );
}
