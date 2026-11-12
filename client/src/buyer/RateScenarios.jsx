import { percentLabel, scenariosOf } from '@shared/rateScenarios.js';
import { useBuyer } from './BuyerContext.jsx';

/** 'Oct 2, 2026' from a literal 'YYYY-MM-DD' (read as a calendar day, so no timezone can move it). */
function dayLabel(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The sample loan solutions the lender or agent chose to show: the rate in bold, the APR in italics, the date the
 * figures are effective, and the line saying whose situation they are based on. Draws nothing until at least one
 * solution has a rate. One component for every layout and for the Loans tool, so it is never worded two ways.
 */
export default function RateScenarios({ className = '', style }) {
  const { settings } = useBuyer();
  const { rows, effective, assumptions } = scenariosOf(settings ?? {});
  if (!rows.length) return null;
  const date = dayLabel(effective);
  return (
    <section className={`rs-card ${className}`.trim()} aria-label="Sample loan rates" style={{ margin: '0 0 16px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="b-lbl">Sample rates</span>
        {date ? <span style={{ fontSize: 12.5, color: 'var(--t-mut, #5b6675)' }}>Effective {date}</span> : null}
      </div>
      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map((row) => (
          <div
            key={row.k}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderTop: '1px solid var(--t-line, #e3e3e3)', flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 14.5, color: 'var(--t-ink, inherit)' }}>
              {row.label}
              {row.note ? <span style={{ color: 'var(--t-mut, #5b6675)' }}> ({row.note})</span> : null}
            </span>
            <span style={{ fontSize: 14.5, whiteSpace: 'nowrap' }}>
              <strong style={{ fontWeight: 800 }}>{percentLabel(row.rate)}</strong>
              {row.apr !== null ? <em style={{ marginLeft: 10, color: 'var(--t-mut, #5b6675)' }}>{percentLabel(row.apr)} APR</em> : null}
            </span>
          </div>
        ))}
      </div>
      {assumptions ? <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.45, color: 'var(--t-mut, #5b6675)' }}>{assumptions}</p> : null}
    </section>
  );
}
