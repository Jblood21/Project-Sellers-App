import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ArrowRight, Chat, Check, Key } from './icons.jsx';
import HomeRow from './Overlook.jsx';
import { OVERLOOK, placeStops, stateWords, stopLink, trailLine } from './trail.js';

/**
 * A stop's round marker: a tick once it is done, its number until then, and the current stop's larger and
 * filled. The number and the tick are drawn, not read: the link around the marker says "Stop 3:" in words.
 * The trail's line is measured through the centre of every element marked data-th-mark, in order.
 */
function Marker({ stop, current, size = '' }) {
  const kind = stop.done ? 'done' : current ? 'here' : 'later';
  return (
    <span
      className={`th-mark th-mark--${kind}${size ? ` th-mark--${size}` : ''}`}
      data-th-mark={current ? 'current' : 'stop'}
      aria-hidden="true"
    >
      {stop.done ? <Check size={size === 'sm' ? 12 : 17} /> : stop.n}
    </span>
  );
}

/**
 * A stop as a link, the marker and the name, and its state in words: "In your plan", "1 saved", or for the
 * current one "You are here". Its name is said in one piece to a screen reader, "Stop 3: Find My Loan Options,
 * you are here", and the current stop is the trail's current step.
 */
function StopLink({ stop, trail, model, compact = false }) {
  const current = trail.current?.key === stop.key;
  const words = stateWords(stop, trail, { savedCount: model.savedCount });
  const { to, state, onClick } = stopLink(stop, model);
  return (
    <Link
      to={to}
      state={state}
      onClick={onClick}
      className={`th-stop${stop.done ? ' th-stop--done' : current ? ' th-stop--here' : ' th-stop--later'}`}
      aria-current={current ? 'step' : undefined}
      // Said in one piece: the parts are laid out as separate boxes, which a screen reader would read with
      // stray pauses between ("Afford , In your plan"). Every visible word is in it.
      aria-label={`Stop ${stop.n}: ${stop.name}${words ? `, ${words.toLowerCase()}` : ''}`}
    >
      <Marker stop={stop} current={current} size={compact ? 'sm' : ''} />
      <span className="th-stop__text">
        <span className="th-stop__name">{stop.name}</span>
        {stop.done ? (
          <span className="th-stop__state">{words}</span>
        ) : current ? (
          <span className="th-stop__state th-stop__state--here">{words}</span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The current stop opened into a card on a phone, as the board draws it: where it sits on the trail, its
 * name and the question it answers, and a big Start. The overlook brings its row of homes with it, and the
 * stops about money offer the lender too, when there is one to talk to.
 */
export function HereCard({ stop, trail, model, onFinance, headingLevel = 3, wide = false }) {
  const { to, state, onClick } = stopLink(stop, model);
  const Heading = `h${headingLevel}`;
  const money = onFinance && (stop.key === 'loans' || stop.key === 'compare' || stop.key === 'afford');
  return (
    <div className={`th-here${wide ? ' th-here--wide' : ''}`}>
      <p className="th-kicker">
        Stop {stop.n}
        {wide ? ` of ${trail.total}` : ''} · You are here
      </p>
      <Heading className="th-here__name" id={wide ? 'home-here' : undefined}>{stop.name}</Heading>
      <p className="th-here__q">{stop.q}</p>
      {stop.key === OVERLOOK && !wide ? <HomeRow model={model} more={false} /> : null}
      <div className="th-here__acts">
        <Link
          to={to}
          state={state}
          onClick={onClick}
          className="th-btn th-btn--go th-here__start"
          // "Start" alone says nothing out of context, so the name says what is started.
          aria-label={`${stop.key === OVERLOOK ? 'See all the homes' : 'Start'}: stop ${stop.n}, ${stop.name}`}
        >
          {stop.key === OVERLOOK ? 'See all the homes' : 'Start'}
          <ArrowRight />
        </Link>
        {money ? (
          <button type="button" className="th-link th-here__talk" onClick={onFinance}>
            <Chat />
            Talk about financing
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The trail drawn: one winding line down the screen, with the numbered stops on it as a real ordered list
 * and the end of the trail ("Keys in hand") after it, which is not a stop. The line is decoration and is
 * measured from where the stops landed, so it follows them at any width and with any number of stops.
 *
 * On a phone the stops go two to a row and the rows snake back and forth (placeStops), the current stop
 * opened into a card on the trail. On a wide screen it is one narrow column, the current stop a highlighted
 * row, and the opened card sits in the page beside it instead.
 */
export default function TrailMap({ model, trail, wide, onFinance, endCard = null }) {
  const boxRef = useRef(null);
  const [line, setLine] = useState(null);
  const { places, endSide } = placeStops(trail.stops, trail.current?.key);
  const allDone = !trail.current;

  // What the line depends on besides the box's size: which stops there are, which are done, which is current.
  const shape = `${wide}|${trail.stops.map((stop) => `${stop.key}${stop.done ? '+' : ''}`).join(',')}|${trail.current?.key}`;

  // Measured when the trail changes, and again whenever its box changes size (a rotated phone, the fonts
  // arriving, a name wrapping onto a second line). Not after every render: the line is drawn in a layer of
  // its own that never moves the stops, but measuring only on a real change means even a moment without the
  // stylesheet (the line laid out in the page) cannot start a loop. The state is only set when the line has
  // moved, so this never renders twice for nothing.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const frame = box.getBoundingClientRect();
      const marks = [...box.querySelectorAll('[data-th-mark]')].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - frame.left,
          y: rect.top + rect.height / 2 - frame.top,
          current: el.dataset.thMark === 'current',
        };
      });
      const next = trailLine(marks, frame.width, wide);
      const key = next ? `${next.bed}|${next.done}|${frame.width}x${frame.height}` : '';
      setLine((prev) => (prev?.key === key ? prev : next ? { ...next, key, w: frame.width, h: frame.height } : null));
    };
    measure();
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    watch?.observe(box);
    let live = true;
    document.fonts?.ready?.then(() => live && measure());
    return () => {
      live = false;
      watch?.disconnect();
    };
  }, [shape, wide]);

  return (
    <div className={`th-trailbox${wide ? ' th-trailbox--wide' : ''}`} ref={boxRef}>
      {line ? (
        <svg
          className="th-path"
          width={line.w}
          height={line.h}
          viewBox={`0 0 ${line.w} ${line.h}`}
          // Out of the page's flow whatever the stylesheet says, so the line can never move what it is measured from.
          style={{ position: 'absolute', top: 0, left: 0 }}
          aria-hidden="true"
          focusable="false"
        >
          <path className="th-path__bed" d={line.bed} />
          {line.done ? <path className="th-path__done" d={line.done} /> : null}
          {line.todo ? <path className="th-path__todo" d={line.todo} /> : null}
          {/* The trailhead: a flag on a short pole where the line begins. */}
          <path className="th-path__pole" d={`M${line.start.x} ${line.start.y + 2}V${line.start.y - 22}`} />
          <path className="th-path__flag" d={`M${line.start.x + 1} ${line.start.y - 22}l13 4.5-13 4.5z`} />
          <circle className="th-path__foot" cx={line.start.x} cy={line.start.y} r="4" />
        </svg>
      ) : null}

      <ol className="th-trail" aria-label={`Your trail: ${trail.total} ${trail.total === 1 ? 'stop' : 'stops'}`}>
        {trail.stops.map((stop) => {
          const place = places[stop.key];
          const current = trail.current?.key === stop.key;
          const style = wide ? undefined : { '--th-row': place.row, '--th-side': place.side };
          const side = place.side ? 'right' : 'left';

          if (current && !wide) {
            return (
              <li key={stop.key} className={`th-li th-li--full th-li--card th-li--${side}`} style={style}>
                <Marker stop={stop} current size="lg" />
                <HereCard stop={stop} trail={trail} model={model} onFinance={onFinance} />
              </li>
            );
          }
          if (stop.key === OVERLOOK) {
            return (
              <li key={stop.key} className={`th-li th-li--overlook th-li--${side}${wide ? '' : ' th-li--full'}`} style={style}>
                <div className="th-li__stop">
                  <StopLink stop={stop} trail={trail} model={model} compact={wide} />
                </div>
                {/* On a wide screen the opened card is beside the trail and says "See all the homes"; the
                    row stays here, on the trail, where the overlook is. */}
                <HomeRow model={model} />
              </li>
            );
          }
          return (
            <li key={stop.key} className={`th-li th-li--${side}${current ? ' th-li--here' : ''}`} style={style}>
              <StopLink stop={stop} trail={trail} model={model} compact={wide} />
            </li>
          );
        })}
      </ol>

      {allDone && endCard ? <div className="th-endcard">{endCard}</div> : null}

      <p className={`th-end th-end--${endSide ? 'right' : 'left'}${allDone ? ' th-end--reached' : ''}`}>
        <span className="th-end__mark" data-th-mark="end" aria-hidden="true">
          <Key size={wide ? 14 : 20} />
        </span>
        <span className="th-end__words">Keys in hand</span>
      </p>
    </div>
  );
}
