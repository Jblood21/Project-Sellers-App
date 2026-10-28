import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Photo from '../../../components/Photo.jsx';
import { money } from '../../../lib/format.js';
import {
  AgentActions, AgentLines, Face, FloorPlans, OpenHouses, StatusNote, VideoButton,
  factLines, statList, useAgent,
} from '../../listing/parts.jsx';
import { ArrowRight, Check, ChevronLeft, ChevronRight } from './icons.jsx';

/**
 * Trailhead's listing page: "A guided walk". The home is a trail of numbered stops (See it, Know it, Tour it,
 * Finance it, Meet your guide), each a card on one dotted line with a round node. A slim progress rail pinned
 * under the header says which step the buyer is on and fills as they scroll; stops already passed get a tick.
 * Every stop but the last ends with a big button to the next. A stop with nothing to show is left out and the
 * rest renumber, so the trail never has an empty card on it.
 */

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useActiveStop(ids) {
  const [active, setActive] = useState(0);
  const key = ids.join('|');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const i = ids.indexOf(e.target.id);
        if (e.isIntersecting) seen.add(i); else seen.delete(i);
      });
      if (seen.size) setActive(Math.min(...seen));
    }, { rootMargin: '-30% 0px -55% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd) setActive(ids.length - 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [active, setActive];
}

/** The photo carousel: swipe (scroll-snap), arrows, and a strip of thumbnails. A photo opens in the viewer. */
function Carousel({ model }) {
  const { photos, name } = model;
  const track = useRef(null);
  const [idx, setIdx] = useState(0);
  const go = useCallback((i) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setIdx(n);
  }, [photos.length]);
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  if (!photos.length) return null;
  return (
    <div className="ls-trailhead-gallery">
      <div className="ls-trailhead-carousel">
        <div className="ls-trailhead-slides" ref={track} onScroll={onScroll} role="group" aria-roledescription="carousel" aria-label={`${name} photos`}>
          {photos.map((photo, i) => (
            <div className="ls-trailhead-slide" key={photo.id ?? i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`}>
              <button
                type="button" className="ls-trailhead-slide__btn" onClick={() => model.openPhoto(i)}
                aria-label={`Open ${name} photo ${i + 1} of ${photos.length}`}
              >
                <Photo eager={i === 0} photo={photo} alt="" sizes="(min-width: 900px) 640px, 100vw" />
              </button>
            </div>
          ))}
        </div>
        {photos.length > 1 ? (
          <>
            <button type="button" className="ls-trailhead-arrow ls-trailhead-arrow--prev" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous photo"><ChevronLeft size={22} /></button>
            <button type="button" className="ls-trailhead-arrow ls-trailhead-arrow--next" onClick={() => go(idx + 1)} disabled={idx === photos.length - 1} aria-label="Next photo"><ChevronRight size={22} /></button>
          </>
        ) : null}
        <span className="ls-trailhead-count" aria-live="polite">{idx + 1} / {photos.length}</span>
      </div>
      {photos.length > 1 ? (
        <ul className="ls-trailhead-thumbs" aria-label="Photo thumbnails">
          {photos.map((photo, i) => (
            <li key={photo.id ?? i}>
              <button
                type="button" className="ls-trailhead-thumb" data-on={i === idx || undefined}
                onClick={() => go(i)} aria-label={`Show photo ${i + 1} of ${photos.length}`} aria-current={i === idx ? 'true' : undefined}
              >
                <Photo photo={photo} alt="" sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function Listing({ model }) {
  const agent = useAgent(model);
  const stats = statList(model);
  const facts = factLines(model);
  const desc = String(model.description ?? '').trim();
  const est = model.estimate;
  const hasTour = model.sessions.length > 0 || Boolean(model.requestShowing);
  const hasMoney = Boolean(est || model.openPayment || model.talkFinancing);

  const stops = useMemo(() => {
    const list = [{ key: 'see', short: 'See it', title: 'See it', hint: 'Take a look around' }];
    list.push({ key: 'know', short: 'Know it', title: 'Know it', hint: 'The lay of the land' });
    if (hasTour) list.push({ key: 'tour', short: 'Tour it', title: 'Tour it', hint: 'Walk it in person' });
    if (hasMoney && !model.sold) list.push({ key: 'finance', short: 'Finance it', title: 'Finance it', hint: 'What it takes to get there' });
    if (agent) list.push({ key: 'guide', short: 'Your guide', title: 'Meet your guide', hint: 'Someone who knows the way' });
    return list;
  }, [hasTour, hasMoney, model.sold, agent]);

  const ids = stops.map((s) => `th-ls-${s.key}`);
  const [active, setActive] = useActiveStop(ids);

  const next = (i) => {
    const el = document.getElementById(ids[i + 1]);
    if (!el) return;
    setActive(i + 1);
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.querySelector('h2')?.focus({ preventScroll: true });
  };

  const nextBtn = (i) => (i < stops.length - 1 ? (
    <button type="button" className="ls-trailhead-next" onClick={() => next(i)}>
      <span>Next: {stops[i + 1].short}</span><ArrowRight />
    </button>
  ) : null);

  const pct = stops.length > 1 ? Math.round(((active + 1) / stops.length) * 100) : 100;

  return (
    <div className="b-shell ls-trailhead-page">
      <header className="ls-trailhead-intro">
        <p className="ls-trailhead-kicker">Your trail to this home</p>
        <h1 className="ls-trailhead-title">{model.name}</h1>
        {model.city ? <p className="ls-trailhead-city">{model.city}</p> : null}
        <StatusNote model={model} className="ls-trailhead-status" />
      </header>

      <nav className="ls-trailhead-rail" aria-label="Trail progress">
        <div className="ls-trailhead-rail__row">
          <span className="ls-trailhead-rail__step">Step {active + 1} of {stops.length}</span>
          <span className="ls-trailhead-rail__name">{stops[active]?.title}</span>
        </div>
        <div className="ls-trailhead-rail__bar" role="progressbar" aria-valuemin={1} aria-valuemax={stops.length} aria-valuenow={active + 1} aria-label="Step">
          <span style={{ width: `${pct}%` }} />
        </div>
      </nav>

      <ol className="ls-trailhead-trail">
        {stops.map((stop, i) => {
          const state = i < active ? 'done' : i === active ? 'here' : 'later';
          return (
            <li key={stop.key} className="ls-trailhead-stop" data-state={state}>
              <span className="ls-trailhead-node" aria-hidden="true">{state === 'done' ? <Check size={16} /> : i + 1}</span>
              <section id={ids[i]} className="ls-trailhead-card" aria-labelledby={`${ids[i]}-h`}>
                <p className="ls-trailhead-stoplbl">Stop {i + 1} of {stops.length} <span>{stop.hint}</span></p>
                <h2 id={`${ids[i]}-h`} className="ls-trailhead-h2" tabIndex={-1}>{stop.title}</h2>

                {stop.key === 'see' ? (
                  <>
                    <Carousel model={model} />
                    {model.hasVideo || model.floorPlans.length ? (
                      <div className="ls-trailhead-extras">
                        <VideoButton model={model} className="ls-trailhead-btn ls-trailhead-btn--line" />
                        {model.floorPlans.length ? <p className="ls-trailhead-sub">Floor plans</p> : null}
                        <FloorPlans model={model} className="ls-plans ls-trailhead-plans" />
                      </div>
                    ) : null}
                  </>
                ) : null}

                {stop.key === 'know' ? (
                  <>
                    {model.price ? <p className="ls-trailhead-price">{money(model.price)}</p> : null}
                    {est ? (
                      <p className="ls-trailhead-est"><strong>About {money(est.monthly)}/mo</strong> <span>with {est.downPct}% down at {Number(est.rate).toFixed(2)}% fixed</span></p>
                    ) : null}
                    {stats.length ? (
                      <ul className="ls-trailhead-chips">
                        {stats.map((s) => <li key={s.key}><strong>{s.value}</strong> {s.label}</li>)}
                      </ul>
                    ) : null}
                    {facts.length ? <p className="ls-trailhead-facts">{facts.join(' · ')}</p> : null}
                    {desc ? <p className="ls-trailhead-desc">{desc}</p> : null}
                    <button type="button" className="ls-trailhead-btn ls-trailhead-btn--line" onClick={model.toggleSave} aria-pressed={model.saved}>
                      {model.saved ? '★ Saved to your pack' : '☆ Save this home'}
                    </button>
                  </>
                ) : null}

                {stop.key === 'tour' ? (
                  <>
                    <OpenHouses model={model} />
                    {!model.sessions.length ? <p className="ls-trailhead-note">No open houses are on the calendar right now. A private showing can be arranged.</p> : null}
                    {model.sold ? <p className="ls-trailhead-note">Sold.</p> : null}
                    {model.requestShowing ? (
                      <button type="button" className="ls-trailhead-btn ls-trailhead-btn--go" onClick={model.requestShowing}>Request a showing</button>
                    ) : null}
                  </>
                ) : null}

                {stop.key === 'finance' ? (
                  <>
                    {est ? (
                      <div className="ls-trailhead-fin">
                        <p className="ls-trailhead-fin__big">{money(est.monthly)}<small>/mo est.</small></p>
                        <dl className="ls-trailhead-fin__list">
                          <div><dt>Down payment ({est.downPct}%)</dt><dd>{money(est.down)}</dd></div>
                          <div><dt>Rate</dt><dd>{Number(est.rate).toFixed(2)}% fixed</dd></div>
                          {model.price ? <div><dt>Price</dt><dd>{money(model.price)}</dd></div> : null}
                        </dl>
                        <p className="ls-trailhead-fine">An estimate for a conventional loan, not an offer of credit.</p>
                      </div>
                    ) : null}
                    <div className="ls-trailhead-acts">
                      {model.openPayment ? <button type="button" className="ls-trailhead-btn ls-trailhead-btn--go" onClick={model.openPayment}>See my payment</button> : null}
                      {model.talkFinancing ? (
                        <button type="button" className={`ls-trailhead-btn ${model.openPayment ? 'ls-trailhead-btn--line' : 'ls-trailhead-btn--go'}`} onClick={model.talkFinancing}>Talk about financing</button>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {stop.key === 'guide' && agent ? (
                  <div className="ls-trailhead-guide">
                    <Face agent={agent.agent} size={72} className="ls-trailhead-face" />
                    <div className="ls-trailhead-guide__who">
                      <AgentLines model={model} nameTag="h3" />
                    </div>
                    <div className="ls-trailhead-guide__acts">
                      <AgentActions model={model} className="ls-trailhead-btn ls-trailhead-btn--line" />
                    </div>
                  </div>
                ) : null}

                {nextBtn(i)}
              </section>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
