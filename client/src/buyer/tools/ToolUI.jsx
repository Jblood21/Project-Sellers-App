import { useLocation } from 'react-router-dom';

/** Shared bits every buyer tool screen uses, so the seven tools stay consistent. */

/**
 * The tool's title. On its own screen it is the page's one h1; opened in a sheet
 * over another screen (the payment sheet on a home) that screen already has the
 * h1, so this steps down to h2 rather than giving the page two. The look is the
 * same either way.
 */
export function ToolHeader({ title, subtitle }) {
  const { pathname } = useLocation();
  const Heading = pathname.includes('/tool/') ? 'h1' : 'h2';
  return (
    <>
      <Heading className="b-head" style={{ margin: '0 0 2px', fontSize: 22 }}>{title}</Heading>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 12.5 }}>{subtitle}</p>
    </>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="b-field">
      <span className="b-lbl">{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: 'var(--t-mut)' }}>{hint}</span> : null}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder }) {
  return (
    <input
      className="b-in"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="numeric"
      placeholder={placeholder}
    />
  );
}

/**
 * A browser may break a line after an en dash, which would split "700–739" into
 * "700–" and "739" on a narrow chip. Number ranges are kept whole instead; the
 * chip then wraps at the space before the range, which reads correctly.
 */
function keepRangesWhole(label) {
  if (typeof label !== 'string') return label;
  return label.split(/(\d+–\d+%?)/).map((part, i) =>
    i % 2 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{part}</span> : part,
  );
}

/** Single-select pill group — selected reads accent background, on-accent text. */
export function PillGroup({ options, value, onChange, label, stack = false }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={stack ? { display: 'flex', flexDirection: 'column', gap: 6 } : { display: 'flex', gap: 6 }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="b-pill"
          data-on={option.value === value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          style={stack ? { flex: 'none', display: 'flex', justifyContent: 'space-between', padding: '0 16px', fontSize: 13.5 } : undefined}
        >
          <span>{keepRangesWhole(option.label)}</span>
          {option.trailing ? <span style={{ opacity: 0.75 }}>{option.trailing}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ResultCard({ children, style }) {
  return (
    <div
      className="b-card b-result"
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, ...style }}
    >
      {children}
    </div>
  );
}

export function ResultRow({ label, value, bold = false }) {
  return (
    <div
      className="b-resultrow"
      style={{
        display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13,
        borderTop: '1px solid var(--t-line)', paddingTop: 7,
      }}
    >
      <span style={{ color: 'var(--t-mut)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  );
}

export function BigNumber({ value, suffix }) {
  return (
    <span className="b-head b-bignum" style={{ fontSize: 34 }}>
      {value}
      {suffix ? <span style={{ fontSize: 15, color: 'var(--t-mut)' }}>{suffix}</span> : null}
    </span>
  );
}

export function SaveToPlan({ onSave, disabled, note }) {
  return (
    <>
      <button type="button" className="b-btn" onClick={onSave} disabled={disabled}>
        Add to My Home Plan
      </button>
      {note ? (
        <p style={{ fontSize: 10.5, color: 'var(--t-mut)', textAlign: 'center', margin: '10px 0 0' }}>{note}</p>
      ) : null}
    </>
  );
}

export function EmptyPrompt({ children }) {
  return (
    <div
      className="b-card"
      style={{ padding: 18, marginBottom: 14, fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}
    >
      {children}
    </div>
  );
}
