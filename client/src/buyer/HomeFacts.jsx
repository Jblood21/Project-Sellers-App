import { useState } from 'react';

import { money } from '../lib/format.js';
import { featureLabels, hoaLabel, homeTaxAnnual, lotLabel, pricePerSqft } from '@shared/homeFacts.js';

/**
 * The facts an agent adds to a home (year built, lot size, price per square foot, HOA, property tax) and the
 * highlights they picked ("What's special"). One component for every layout and for a community's home page, so a
 * fact is never worded two ways. Each shows only when the agent gave it; with none, nothing is drawn.
 *
 * Colours come from the buyer app's own variables, so it takes on whichever theme and layout it is placed in.
 */

/** The rows of facts, as [label, value]. Exported so a layout that wants its own markup can use the same words. */
export function factRows(home) {
  if (!home) return [];
  const rows = [];
  if (Number(home.yearBuilt) > 0) rows.push(['Year built', String(home.yearBuilt)]);
  const lot = lotLabel(home.lotAcres);
  if (lot) rows.push(['Lot size', lot]);
  const perSqft = pricePerSqft(home);
  if (perSqft) rows.push(['Price per sq ft', `$${perSqft.toLocaleString('en-US')}`]);
  const hoa = hoaLabel(home.hoaMonthly);
  if (hoa) rows.push(['HOA', hoa]);
  const tax = homeTaxAnnual(home);
  if (tax) {
    const pct = Number(home.taxPct) > 0 ? ` (${Math.round(Number(home.taxPct) * 1000) / 1000}%)` : '';
    rows.push(['Property tax (estimate)', `${money(tax)} / year${pct}`]);
  }
  return rows;
}

export function HomeFacts({ home, className = '', style }) {
  const rows = factRows(home);
  if (!rows.length) return null;
  return (
    <dl
      className={`hf-facts ${className}`.trim()}
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 18px', margin: '0 0 16px',
        ...style,
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gap: 2 }}>
          <dt style={{ fontSize: 12.5, color: 'var(--t-mut, #5b6675)' }}>{label}</dt>
          <dd style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--t-ink, inherit)' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const FIRST = 12;

export function WhatsSpecial({ home, className = '', style }) {
  const labels = featureLabels(home?.features);
  const [all, setAll] = useState(false);
  if (!labels.length) return null;
  const shown = all ? labels : labels.slice(0, FIRST);
  return (
    <section className={`hf-special ${className}`.trim()} aria-label="What's special" style={{ margin: '0 0 16px', ...style }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>What&rsquo;s special</h3>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map((label) => (
          <li
            key={label}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 13.5, lineHeight: 1.2,
              border: '1px solid var(--t-line, rgba(0,0,0,.18))', color: 'var(--t-ink, inherit)',
            }}
          >
            {label}
          </li>
        ))}
      </ul>
      {labels.length > FIRST ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          style={{ marginTop: 8, background: 'none', border: 0, padding: '6px 0', font: 'inherit', fontWeight: 600, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
        >
          {all ? 'Show fewer' : `Show all ${labels.length}`}
        </button>
      ) : null}
    </section>
  );
}
