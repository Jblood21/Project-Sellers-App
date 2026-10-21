import { useId, useRef, useState } from 'react';

import { contrast, normalizeHex } from '@shared/customTheme.js';
import { THEMES } from '@shared/domain.js';
import {
  WHEEL_MIN_LIGHT, goesWellWith, hexToHsv, hsvToHex, hueStrengthToPoint, pointToHueStrength, stepWheel,
} from './colourWheel.js';
import { themeColours } from './themeTokens.js';

/** The three colours a builder picks, in the order the board numbers them. */
const SLOTS = [
  { key: 'brand', label: 'Brand colour', desc: 'The header, the footer and dark areas' },
  { key: 'button', label: 'Button colour', desc: 'Buttons, links and highlights' },
  { key: 'page', label: 'Page colour', desc: 'The background behind everything' },
];

/**
 * The left-hand side of the studio while "Your own colours" is tried on (board E): start from a theme,
 * pick which of the three colours to change, then change it on the wheel, with the slider, by its colour
 * code or from the swatches. Every one of those sets the same colour, so the wheel is never the only way.
 * The readability check (ReadabilityCheck, below) is drawn by the studio, which decides where it goes.
 *
 * Nothing here saves. The studio owns the colours (they repaint its preview) and the "Use these colours"
 * button; this only edits them. `titleRef` lets the studio move the keyboard focus to the heading when the
 * list makes way for these tools; `beside` is what a phone-width studio shows beside the wheel (the preview,
 * so a drag on the wheel shows on the buyer app without scrolling between the two).
 */
export default function OwnColours({ colours, setColours, onBack, titleRef, beside = null }) {
  const [active, setActive] = useState('brand');
  // What is typed in the colour-code field while it is not (yet) a colour code, and whether to say so.
  const [draft, setDraft] = useState(null);
  const [showError, setShowError] = useState(false);
  // The wheel's own reading of the colour. A grey or a black has no hue, so working the hue out again from
  // the code would snap the wheel back to red the moment the slider reached the bottom. Kept for as long
  // as the colour is still the one the wheel or the slider set.
  const [wheel, setWheel] = useState(null);
  const ids = useId();

  const slot = SLOTS.find((item) => item.key === active);
  const hex = colours[active];
  const hsv = wheel && wheel.slot === active && wheel.hex === hex ? wheel : hexToHsv(hex);

  const pickSlot = (key) => {
    setActive(key);
    setDraft(null);
    setShowError(false);
  };
  const setHex = (value) => {
    setColours((prev) => ({ ...prev, [active]: value }));
    setDraft(null);
    setShowError(false);
  };
  const setHsv = (next) => {
    const value = hsvToHex(next);
    setWheel({ slot: active, hex: value, h: next.h, s: next.s, v: next.v });
    setHex(value);
  };

  const typeCode = (event) => {
    const text = event.target.value;
    const code = normalizeHex(text);
    if (code) setHex(code);
    else {
      setDraft(text);
      // An error that appears while the code is still being typed only gets in the way; it waits for
      // the field to be left or Enter to be pressed. One that is showing goes as soon as the code is right.
      if (!text.trim()) setShowError(false);
    }
  };
  const codeError = draft !== null && showError
    ? `“${draft.trim()}” is not a colour code. Use # and six letters or numbers, like #5A1E33.`
    : '';

  const startFrom = (key) => {
    setColours({ ...themeColours(key), base: key });
    setDraft(null);
    setShowError(false);
  };

  const picker = <Wheel hsv={hsv} label={slot.label} hex={hex} onPick={setHsv} hintId={`${ids}-wheel-hint`} />;

  return (
    <div className="ax-own">
      <button type="button" className="btn btn-link ax-own__back" onClick={onBack}>
        <span aria-hidden="true">‹</span> All themes
      </button>
      <h3 className="ax-own__title" ref={titleRef} tabIndex={-1}>Make your own colours</h3>
      <p className="ax-own__lead">
        Pick three colours. We work out the rest (lighter tints, softer text, lines) and check that every word can be read.
      </p>

      <label className="ax-own__start">
        <span>Start from</span>
        <select className="input" value={colours.base} onChange={(event) => startFrom(event.target.value)}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <option key={key} value={key}>{theme.name}</option>
          ))}
        </select>
      </label>
      <p className="ax-own__small">Sets all three colours, and the type and shapes your colours are shown in.</p>

      <div role="group" aria-label="Which colour you are choosing" className="ax-own__slots">
        {SLOTS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className="ax-own__slot"
            aria-pressed={active === item.key}
            onClick={() => pickSlot(item.key)}
          >
            <span className="ax-own__slot-top">
              <span className="ax-own__chip" style={{ background: colours[item.key] }} aria-hidden="true" />
              <span className="ax-own__slot-name">{index + 1} · {item.label}</span>
            </span>
            <span className="ax-own__slot-desc">{item.desc}</span>
            <span className="ax-own__slot-hex">{colours[item.key]}</span>
          </button>
        ))}
      </div>

      <div className="ax-own__pick">
        {beside ? <div className="ax-own__wheelrow">{picker}{beside}</div> : picker}
        <div className="ax-own__controls">
          <div className="ax-own__field">
            <label htmlFor={`${ids}-code`}>Colour code</label>
            <input
              id={`${ids}-code`}
              className="input ax-own__code"
              type="text"
              value={draft ?? hex}
              onChange={typeCode}
              onBlur={() => draft !== null && setShowError(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && draft !== null) setShowError(true);
              }}
              spellCheck="false"
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={codeError ? 'true' : undefined}
              aria-describedby={`${ids}-code-note`}
            />
            <span id={`${ids}-code-note`} className={codeError ? 'ax-own__error' : 'ax-own__small'} aria-live="polite">
              {codeError || `For the ${slot.label.toLowerCase()}. #5A1E33 or 5A1E33 both work.`}
            </span>
          </div>

          <div className="ax-own__field">
            <label htmlFor={`${ids}-light`}>Lighter or darker</label>
            <span
              className="ax-own__ramp"
              aria-hidden="true"
              style={{ background: `linear-gradient(to right, #000000, ${hsvToHex({ h: hsv.h, s: hsv.s, v: 1 })})` }}
            />
            <input
              id={`${ids}-light`}
              className="ax-own__range"
              type="range"
              min="5"
              max="100"
              step="1"
              value={Math.max(5, Math.round(hsv.v * 100))}
              aria-valuetext={`${Math.round(hsv.v * 100)} percent light, ${hex}`}
              onChange={(event) => setHsv({ h: hsv.h, s: hsv.s, v: Number(event.target.value) / 100 })}
            />
          </div>

          <div className="ax-own__field">
            <span id={`${ids}-goes`} className="ax-own__label">Goes well with</span>
            <div className="ax-own__swatches" role="group" aria-labelledby={`${ids}-goes`}>
              {goesWellWith(hsv).map((swatch) => (
                <button
                  key={swatch.key}
                  type="button"
                  className="ax-own__swatch"
                  style={{ background: swatch.hex }}
                  title={`${swatch.label}, ${swatch.hex}`}
                  aria-label={`Use ${swatch.label.toLowerCase()}, ${swatch.hex}`}
                  onClick={() => setHex(swatch.hex)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The readability check under the colour tools, as board E lists it: each pair deriveTheme checks, with its
 * ratio, and under a pair a colour was moved for, the move in words. A move made for two pairs (the brand
 * colour darkened for the white words on it and for the words in it on the page) is explained under the first
 * and pointed to from the second, so nothing is said twice and no fix goes unexplained.
 *
 * While the three colours are still exactly the set theme they started from, they ARE that theme (the studio
 * previews and saves them as it), so the check says that instead of listing what deriving them afresh would do.
 * `asTheme` is then { name, lowest }.
 */
export function ReadabilityCheck({ derived, asTheme = null }) {
  if (asTheme) {
    return (
      <div className="ax-own ax-own__check">
        <h4 className="ax-own__h">Readability check</h4>
        <p className="ax-own__small">
          These are {asTheme.name}’s own colours, shown just as that theme draws them
          {asTheme.lowest ? `: every word is easy to read (lowest ${asTheme.lowest.toFixed(1)} to 1)` : ''}.
          Change any of the three and they become your own colours, checked here as you pick.
        </p>
      </div>
    );
  }
  const order = derived.checks.map((check) => check.key);
  const firstFor = (fix) => order.find((key) => fix.checks.includes(key));
  return (
    <div className="ax-own ax-own__check">
      <h4 className="ax-own__h">Readability check</h4>
      <p className="ax-own__small">Checked as you pick. Anything hard to read is fixed for you, and the fix shows here.</p>
      <ul className="ax-own__checks">
        {derived.checks.map((check) => {
          const fixes = derived.fixes.filter((fix) => fix.checks.includes(check.key));
          const words = fixes.map((fix) => (firstFor(fix) === check.key
            ? fix.detail
            : `The ${fix.title.toLowerCase()} change above fixes this too.`)).join(' ');
          return (
            <li key={check.key} className={fixes.length ? 'is-fixed' : ''}>
              <CheckIcon fixed={fixes.length > 0} />
              <span>
                <strong>{check.title}</strong>
                <span>{fixes.length ? `Fixed for you. ${words} Now ${check.text}.` : `Passes: ${check.text}.`}</span>
              </span>
            </li>
          );
        })}
        {derived.buttonNeedsEdge ? (
          <li className="is-fixed">
            <CheckIcon fixed />
            <span>
              <strong>Buttons stand out</strong>
              <span>
                Fixed for you. Your button colour is close to the page colour
                ({contrast(derived.vars['--t-acc'], derived.vars['--t-bg']).toFixed(1)} to 1), so buttons get a darker edge.
              </span>
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** A tick in a circle for a pass, an exclamation mark for a fix: the words beside it say which, too. */
export function CheckIcon({ fixed }) {
  return (
    <svg className="ax-own__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d={fixed ? 'M12 7.5v5.5M12 16.2v.3' : 'M8 12.5l2.6 2.6L16 9.5'} />
    </svg>
  );
}

/**
 * The wheel: hue round it, strength outward, under a black veil as dark as the colour is. Click or drag on
 * it (the pointer is captured, so a drag that leaves the wheel keeps steering it), or focus it and use the
 * arrow keys. A 2D picker has no ARIA role of its own; like most colour pickers it is a slider whose value
 * is spoken as words, and the colour code, the slider and the swatches beside it set the same colour.
 */
function Wheel({ hsv, label, hex, onPick, hintId }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const mark = hueStrengthToPoint(hsv.h, hsv.s);

  const pickAt = (event) => {
    const rect = ref.current.getBoundingClientRect();
    const radius = rect.width / 2;
    const { h, s } = pointToHueStrength(event.clientX - rect.left - radius, event.clientY - rect.top - radius, radius);
    onPick({ h, s, v: Math.max(WHEEL_MIN_LIGHT, hsv.v) });
  };

  return (
    <div className="ax-own__wheelbox">
      <div
        ref={ref}
        className="ax-own__wheel"
        role="slider"
        tabIndex={0}
        aria-label={`Colour wheel for the ${label.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h) % 360}
        aria-valuetext={`${hex}: ${Math.round(hsv.h) % 360} degrees round the wheel, ${Math.round(hsv.s * 100)} percent strong`}
        aria-describedby={hintId}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          ref.current.focus();
          ref.current.setPointerCapture(event.pointerId);
          dragging.current = true;
          pickAt(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) pickAt(event);
        }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onLostPointerCapture={() => { dragging.current = false; }}
        onKeyDown={(event) => {
          const next = stepWheel(hsv, event.key, event.shiftKey);
          if (!next) return;
          event.preventDefault();
          onPick(next);
        }}
      >
        <span className="ax-own__white" aria-hidden="true" />
        <span className="ax-own__veil" aria-hidden="true" style={{ opacity: (1 - hsv.v).toFixed(2) }} />
        <span
          className="ax-own__mark"
          aria-hidden="true"
          style={{ left: `${50 + mark.x * 50}%`, top: `${50 + mark.y * 50}%`, background: hex }}
        />
      </div>
      <span id={hintId} className="ax-own__small ax-own__hint">
        Click or drag on the wheel. Arrow keys work too: left and right go round it, up and down make the colour stronger or softer.
      </span>
    </div>
  );
}
