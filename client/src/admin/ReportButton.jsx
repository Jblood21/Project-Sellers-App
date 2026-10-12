import { useState } from 'react';

import { adminApi } from '../lib/api.js';
import { useAdmin } from './AdminContext.jsx';
import { ErrorNote } from './ui.jsx';

const sentOn = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

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
  const { token } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const address = String(community.settings?.reportEmail ?? '').trim();
  const lastSent = sentOn(community.settings?.reportLastSentAt);
  const emailOff = community.emailStatus && !community.emailStatus.ready;

  const send = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await adminApi.sendReport(token, community.id));
      await reload?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!address) {
    // An address typed but not saved yet: say so, instead of asking for one that is already in the box.
    if (blocked) return <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{blocked}</p>;
    return (
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
        Add an address to send reports to{onOpenSetup ? (
          <>
            {' '}in{' '}
            <button type="button" onClick={onOpenSetup} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--color-accent-700)', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>
              Setup
            </button>
          </>
        ) : ' above'}, then press Email the report.
      </p>
    );
  }

  const why = blocked || (emailOff ? 'Email is not set up on this site yet (see Setup).' : '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || Boolean(why)}>
          {busy ? 'Sending…' : 'Email the report'}
        </button>
        <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
          to {address}{lastSent ? ` · last sent ${lastSent}` : ' · none sent yet'}
        </span>
      </div>
      {why ? <span className="text-muted" style={{ fontSize: 12.5 }}>{why}</span> : null}
      {result ? (
        <p role="status" style={{ margin: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
          Sent to {result.to}: {result.comingUp + result.overdue} scheduled call{result.comingUp + result.overdue === 1 ? '' : 's'},{' '}
          {result.newPeople} new {result.newPeople === 1 ? 'person' : 'people'}, and a spreadsheet of {result.everyone}.
        </p>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
