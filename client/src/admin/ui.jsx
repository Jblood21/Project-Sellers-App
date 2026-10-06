import { useEffect, useId, useRef, useState } from 'react';

import '../styles/admin-extras.css';

// What Tab can land on. Hidden controls (the file inputs behind the upload
// buttons) are filtered out by their layout, since `disabled` alone would miss them.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const tabStops = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

export function Dialog({ title, children, actions, onClose, wide = false }) {
  const ref = useRef(null);
  // Callers pass an inline arrow for onClose, so its identity changes on every
  // render. Reading it through a ref keeps the effects below from re-running
  // each time — which is what used to move focus mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus the first control once, when the dialog opens. This must NOT depend on
  // anything that changes while the dialog is open: re-running it on every render
  // yanked the caret out of whatever was being typed and back to the first field,
  // so only one character per field ever landed.
  useEffect(() => {
    // Remember what had focus so closing the dialog puts the keyboard back where
    // it was, instead of dropping it at the top of the page.
    const opener = document.activeElement;
    ref.current?.querySelector('input, textarea, select, button')?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // aria-modal tells a screen reader the page behind is inert, so the keyboard
  // has to agree: Tab and Shift+Tab wrap inside the dialog rather than walking
  // out into controls the backdrop is hiding.
  const trapTab = (event) => {
    if (event.key !== 'Tab' || !ref.current) return;
    const stops = tabStops(ref.current);
    if (!stops.length) {
      event.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    const inside = ref.current.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className={wide ? 'dialog dialog-wide' : 'dialog'}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div className="dialog-title">{title}</div>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextField({ label, hint, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} {...rest} />
    </Field>
  );
}

/**
 * A multi-line field whose label sits OUTSIDE the helper line. Field wraps
 * everything in one <label>, which is right for a short input but wrong here:
 * a live character counter inside the label would be re-read as part of the
 * field's name on every keystroke. `counter` is the helper line, tied to the
 * textarea with aria-describedby instead.
 */
export function TextAreaField({ label, hint, counter, value, onChange, rows = 4, id: givenId, ...rest }) {
  // A caller may need a known id (the checklist jumps to a field by it). The label
  // and the description must follow whichever id is in use, or the field loses its name.
  const generated = useId();
  const id = givenId ?? generated;
  const noteId = `${id}-note`;
  return (
    <div className="field">
      <label className="ax-plain" htmlFor={id}>{label}</label>
      <textarea
        className="input"
        rows={rows}
        value={value}
        aria-describedby={hint || counter ? noteId : undefined}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
        id={id}
      />
      {hint || counter ? (
        <span id={noteId} className="field-hint ax-note">
          {hint ? <span>{hint}</span> : null}
          {counter ? <span className="ax-counter">{counter}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A section that stays folded until the person wants to edit it, so a long page of
 * settings reads as a short list. The title, a one-line `summary` of what is in
 * there now, an unsaved `tag` and any `actions` stay in view; the fields open
 * underneath.
 *
 * The body stays mounted while folded (just hidden), so nothing typed is lost by
 * folding and a caller can open it and then move focus to a field inside. Pass
 * `open` and `onOpenChange` to control it from outside (the "needs your
 * attention" list does), or leave them out and it keeps its own state, folded.
 * `heading` wraps the toggle in that heading element (for a section that was one).
 */
export function Disclosure({
  title, summary, tag, actions, children, open, onOpenChange, heading: Heading, className = 'card elev-sm',
  titleClass = 'card-kicker',
}) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const bodyId = `${useId()}-body`;
  const toggle = () => {
    if (open === undefined) setOwn(!isOpen);
    onOpenChange?.(!isOpen);
  };
  const button = (
    <button type="button" className="ax-fold__toggle" aria-expanded={isOpen} aria-controls={bodyId} onClick={toggle}>
      <span className="ax-fold__chev" aria-hidden="true" />
      <span className="ax-fold__text">
        <span className={titleClass}>{title}</span>
        {summary ? <span className="ax-fold__summary">{summary}</span> : null}
      </span>
    </button>
  );
  return (
    <div className={`${className} ax-fold`}>
      <div className="ax-fold__head">
        {Heading ? <Heading className="ax-fold__h">{button}</Heading> : button}
        {tag}
        {actions}
      </div>
      <div id={bodyId} className="ax-fold__body" hidden={!isOpen}>{children}</div>
    </div>
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
      className="ax-toggle"
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
