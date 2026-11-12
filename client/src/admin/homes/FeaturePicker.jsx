import { useId, useState } from 'react';

import { FEATURE_GROUPS, MAX_FEATURES, featureLabel } from '@shared/homeFacts.js';

const chipStyle = (on) => ({
  minHeight: 38, padding: '4px 12px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
  border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
  background: on ? 'var(--color-accent)' : '#fff',
  color: on ? '#fff' : 'var(--color-accent-700)',
  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, lineHeight: 1.25,
});

/**
 * "What's special": the picks an agent makes for a home. The ones chosen sit on top as chips that come off with a
 * tap; the catalog is below in groups that stay shut until opened (or until a search is typed, which opens every
 * group that has a match). `value` is the list of keys in the order picked.
 */
export default function FeaturePicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState({});
  const baseId = useId();
  const picked = new Set(value);
  const full = value.length >= MAX_FEATURES;
  const needle = query.trim().toLowerCase();

  const toggle = (key) => {
    if (picked.has(key)) onChange(value.filter((k) => k !== key));
    else if (!full) onChange([...value, key]);
  };

  const groups = FEATURE_GROUPS
    .map((group) => ({
      ...group,
      shown: needle ? group.items.filter(([, label]) => label.toLowerCase().includes(needle)) : group.items,
    }))
    .filter((group) => group.shown.length > 0);

  return (
    <div className="field" role="group" aria-labelledby={`${baseId}-label`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span id={`${baseId}-label`} className="ax-plain" style={{ fontWeight: 700 }}>What&apos;s special</span>
        <span aria-live="polite" style={{ fontSize: 14, fontWeight: 600 }}>{value.length} of {MAX_FEATURES}</span>
      </div>

      {value.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="picked-features">
          {value.map((key) => (
            <button
              key={key} type="button" onClick={() => toggle(key)} aria-label={`Remove ${featureLabel(key)}`}
              style={chipStyle(true)}
            >
              {featureLabel(key)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      {full ? <span role="status" style={{ fontSize: 14, color: '#a8332b' }}>That is the most you can pick.</span> : null}

      <input
        className="input" type="search" value={query} placeholder="Search features" aria-label="Search features"
        onChange={(event) => setQuery(event.target.value)} autoComplete="off"
      />

      {groups.length === 0 ? <span className="text-muted" style={{ fontSize: 14 }}>No match.</span> : null}
      {groups.map((group) => {
        const isOpen = Boolean(needle) || Boolean(open[group.key]);
        const panelId = `${baseId}-${group.key}`;
        const count = group.items.filter(([k]) => picked.has(k)).length;
        return (
          <div key={group.key} style={{ border: '1px solid var(--color-divider)', borderRadius: 12, background: '#fff' }}>
            <button
              type="button" aria-expanded={isOpen} aria-controls={panelId}
              onClick={() => setOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                minHeight: 44, padding: '0 12px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 700, color: 'inherit', textAlign: 'left',
              }}
            >
              <span>{group.label}{count ? ` (${count})` : ''}</span>
              <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            <div id={panelId} hidden={!isOpen} style={{ display: isOpen ? 'flex' : 'none', flexWrap: 'wrap', gap: 6, padding: '0 10px 12px' }}>
              {group.shown.map(([key, label]) => {
                const on = picked.has(key);
                return (
                  <button
                    key={key} type="button" aria-pressed={on} onClick={() => toggle(key)}
                    aria-disabled={!on && full ? true : undefined}
                    style={{ ...chipStyle(on), opacity: !on && full ? 0.5 : 1 }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
