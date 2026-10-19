import { useEffect, useId, useRef, useState } from 'react';

import { DEFAULT_LEAD_SORT, LEAD_SORTS } from '@shared/domain.js';
import { adminApi } from '../lib/api.js';
import { useAdmin } from './AdminContext.jsx';
import { ErrorNote } from './ui.jsx';

/** The periods the leads report can cover; the keys are the ones the server accepts. */
const PERIODS = [
  { k: 'all', label: 'Everyone' },
  { k: '7', label: 'Signed up in the last 7 days' },
  { k: '30', label: 'Signed up in the last 30 days' },
  { k: '90', label: 'Signed up in the last 90 days' },
];

const textStyle = { fontSize: 12.5, lineHeight: 1.45, overflowWrap: 'anywhere' };
const hidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

/**
 * "Download PDF": the leads report for this development as a file to keep or print. It goes to this device only
 * (nothing is emailed), and covers everyone or only those who signed up in the last 7, 30 or 90 days. The report
 * is built when the button is pressed, from what is in the app at that moment.
 *
 * `sort` is the order chosen on the Leads tab (its Recent / Most ★ pills); the people in the PDF are listed in that
 * order. A screen with no such choice (Stats) gets the newest first. `title` and `note` let a screen say what it is for.
 */
export default function PdfReportButton({ community, title = '', note = '', sort = DEFAULT_LEAD_SORT }) {
  const { token } = useAdmin();
  const id = useId();
  const [period, setPeriod] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const button = useRef(null);
  const wasBusy = useRef(false);

  // Pressing the button disables it, which drops keyboard focus to the page. Put it back when the file is saved,
  // unless the person has already moved on to something else while it was building.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    const focused = document.activeElement;
    if (!focused || focused === document.body) button.current?.focus({ preventScroll: true });
  }, [busy]);

  const download = async () => {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      setSaved(await adminApi.downloadLeadsPdf(token, community.id, period, sort));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-busy={busy}>
      {title ? <span className="card-kicker">{title}</span> : null}
      {note ? <p className="text-muted" style={{ ...textStyle, margin: 0 }}>{note}</p> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label htmlFor={id} style={hidden}>
          Who the PDF report covers
        </label>
        <select
          id={id} className="input" value={period} disabled={busy}
          onChange={(event) => { setPeriod(event.target.value); setSaved(''); setError(''); }}
          style={{ width: 'auto', maxWidth: '100%', flex: '0 1 auto' }}
        >
          {PERIODS.map((option) => <option key={option.k} value={option.k}>{option.label}</option>)}
        </select>
        <button ref={button} type="button" className="btn btn-secondary" onClick={download} disabled={busy}>
          {busy ? 'Building…' : 'Download PDF'}
        </button>
      </div>
      {/* Always on the page, so a screen reader announces the text when it arrives (a region added with its text is often missed). */}
      <span role="status" style={hidden}>{saved ? `Download started: ${saved}` : ''}</span>
      <span className="text-muted" style={textStyle}>Listed {(LEAD_SORTS[sort] ?? LEAD_SORTS[DEFAULT_LEAD_SORT]).report.toLowerCase()}.</span>
      {saved ? <p style={{ ...textStyle, margin: 0, fontWeight: 600 }}>Download started: {saved}</p> : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
