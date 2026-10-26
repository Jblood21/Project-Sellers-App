import { useId } from 'react';

/** The red the admin uses for a refusal, the same as ErrorNote's, so a message here reads like every other one. */
export const PROBLEM_RED = '#a8332b';

/**
 * A text box that says what is wrong under itself, in words, the moment it is known.
 *
 * `error` is the plain sentence ("Type the price, like 475000 or 475k."); `preview` is a quiet line that says how
 * what was typed will be read ("$475,000"), shown only while there is nothing wrong. Both sit directly under the
 * box, before the longer `hint`, and the box is tied to them for a screen reader (aria-invalid, aria-describedby)
 * rather than the sentence being folded into the label's name the way TextField's hint is.
 *
 * `invalid` draws the red box without a sentence of its own, for a row of boxes that share one message.
 *
 * The label looks like TextField's. It is a separate component because TextField puts everything inside its
 * <label>, which is the wrong place for an error that comes and goes.
 */
export default function CheckedField({
  label, hint, error, invalid = false, preview, value, onChange, onBlur, id: givenId, style, ...rest
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const describedBy = [error ? `${id}-error` : preview ? `${id}-preview` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label className="ax-plain" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={describedBy || undefined}
        style={error || invalid ? { ...style, borderColor: PROBLEM_RED } : style}
        {...rest}
      />
      {error ? (
        <span id={`${id}-error`} role="alert" style={{ color: PROBLEM_RED, fontSize: 14, lineHeight: 1.4 }}>{error}</span>
      ) : preview ? (
        <span id={`${id}-preview`} style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{preview}</span>
      ) : null}
      {hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}
    </div>
  );
}
