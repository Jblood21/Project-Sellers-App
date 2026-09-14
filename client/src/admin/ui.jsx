import { useEffect, useRef } from 'react';

export function Dialog({ title, children, actions, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, textarea, select, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div className="dialog" ref={ref} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextField({ label, value, onChange, ...rest }) {
  return (
    <Field label={label}>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} {...rest} />
    </Field>
  );
}

export function PillRow({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              flex: '1 1 auto', minHeight: 38, whiteSpace: 'nowrap', borderRadius: 999,
              border: '1px solid var(--color-divider)', cursor: 'pointer', padding: '0 12px',
              background: active ? 'var(--color-accent)' : 'transparent',
              color: active ? '#fff' : 'var(--color-text)',
              fontFamily: 'var(--font-heading)', fontSize: 12.5, fontWeight: 600,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 46, height: 27, flex: 'none', borderRadius: 999, border: 'none', cursor: 'pointer',
        position: 'relative', padding: 0,
        background: on ? 'var(--color-accent-2-500)' : 'var(--color-neutral-300)',
        transition: 'background .18s',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 3.5, left: on ? 22 : 3.5, width: 20, height: 20,
          borderRadius: '50%', background: '#fff', transition: 'left .18s',
          boxShadow: '0 1px 3px rgba(0,0,0,.25)',
        }}
      />
    </button>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p style={{ color: '#a8332b', fontSize: 12.5, margin: '4px 0 0' }} role="alert">
      {children}
    </p>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <p className="text-muted" style={{ fontSize: 13, padding: '24px 0' }}>
      {label}
    </p>
  );
}
