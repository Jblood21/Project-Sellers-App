import { useEffect, useId, useRef, useState } from 'react';

import Photo from '../../../components/Photo.jsx';
import { money } from '../../../lib/format.js';
import {
  Actions, AgentActions, AgentLines, Estimate, Face, FloorPlans, OpenHouses, StatusNote, VideoButton,
  factLines, statList, useAgent,
} from '../../listing/parts.jsx';

const Chevron = ({ up }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </svg>
);
const Arrow = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={dir === 'prev' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </svg>
);

/** The floating agent chip: face, first name and one way to reach them. */
function AgentChip({ model }) {
  const a = useAgent(model);
  if (!a) return null;
  const href = a.phoneHref || (a.email ? `mailto:${a.email}` : '');
  return (
    <div className="ls-showcase-chip">
      <Face agent={a.agent} size={32} />
      <span className="ls-showcase-chip__name">{a.first || a.name}</span>
      {href ? (
        <a className="ls-showcase-chip__act" href={href} onClick={() => a.reached(a.phoneHref ? 'call' : 'email')}>
          {a.phoneHref ? 'Call' : 'Email'}<span className="ls-showcase-sr"> {a.name}</span>
        </a>
      ) : null}
    </div>
  );
}

/**
 * Showcase's listing page: photo stories. A full-screen photo with the price and address on a scrim and the
 * details in a sheet over its foot (a disclosure on a phone, a floating glass panel on a wide screen); the
 * rest of the photos follow as full-screen pages on a phone.
 */
export default function Listing({ model }) {
  const { photos, name, city, price, status, sold } = model;
  const count = photos.length;
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const bodyId = useId();
  const stats = statList(model);
  const facts = factLines(model);
  const agent = useAgent(model);

  const go = (d) => setIdx((i) => (i + d + count) % count);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = photos[idx] ?? null;

  return (
    <div className="ls-showcase-page">
      <section className="ls-showcase-hero" aria-label={`${name} photos and details`}>
        <div className="ls-showcase-stage">
          {current ? (
            <button
              type="button" className="ls-showcase-stage__hit" onClick={() => model.openPhoto(idx)}
              aria-label={`Open ${name} photo ${idx + 1} of ${count}`}
            >
              <span key={idx} className="ls-showcase-stage__img">
                <Photo eager photo={current} alt="" sizes="(min-width: 900px) 70vw, 100vw" />
              </span>
            </button>
          ) : <div className="ls-showcase-stage__none" aria-hidden="true" />}
          <div className="ls-showcase-scrim" aria-hidden="true" />

          <div className="ls-showcase-top">
            <AgentChip model={model} />
            {count ? <span className="ls-showcase-count" aria-live="polite">{idx + 1} / {count}</span> : null}
          </div>

          <div className="ls-showcase-title">
            {status && status !== 'Active' ? <span className="ls-showcase-status" data-status={status}>{status}</span> : null}
            {price ? <p className="ls-showcase-price">{money(price)}</p> : null}
            <h1 className="ls-showcase-h1 b-head">{name}</h1>
            {city ? <p className="ls-showcase-city">{city}</p> : null}
            {count > 1 ? <p className="ls-showcase-cue" aria-hidden="true">Swipe up for more photos</p> : null}
          </div>

          {count > 1 ? (
            <>
              <button type="button" className="ls-showcase-arrow ls-showcase-arrow--prev" onClick={() => go(-1)} aria-label="Previous photo"><Arrow dir="prev" /></button>
              <button type="button" className="ls-showcase-arrow ls-showcase-arrow--next" onClick={() => go(1)} aria-label="Next photo"><Arrow dir="next" /></button>
              <ul className="ls-showcase-strip" aria-label="Photos">
                {photos.map((p, i) => (
                  <li key={p.id ?? i}>
                    <button
                      type="button" className="ls-showcase-thumb" aria-label={`Show photo ${i + 1} of ${count}`}
                      aria-current={i === idx ? 'true' : undefined} onClick={() => setIdx(i)}
                    >
                      <Photo eager photo={p} alt="" sizes="96px" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="ls-showcase-sheet" data-open={open || undefined}>
          <button
            ref={toggleRef} type="button" className="ls-showcase-handle" aria-expanded={open} aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="ls-showcase-handle__bar" aria-hidden="true" />
            <span className="ls-showcase-handle__row">
              <span>{open ? 'Hide details' : 'Home details'}</span>
              <Chevron up={!open} />
            </span>
          </button>
          <div className="ls-showcase-sheet__wrap">
            <div id={bodyId} className="ls-showcase-sheet__body">
              <StatusNote model={model} className="ls-showcase-note" />
              {stats.length ? (
                <ul className="ls-showcase-stats">
                  {stats.map((s) => <li key={s.key}><strong className="b-head">{s.value}</strong><span>{s.label}</span></li>)}
                </ul>
              ) : null}
              {facts.length ? <p className="ls-showcase-facts">{facts.join(' · ')}</p> : null}

              {model.estimate ? <Estimate model={model} className="ls-showcase-est" /> : null}
              <Actions model={model} className="ls-showcase-actions" only={sold ? ['save'] : undefined} />
              {model.hasVideo ? <VideoButton model={model} className="b-btn b-btn-outline ls-showcase-video" /> : null}

              {model.description ? (
                <section className="ls-showcase-sec">
                  <h2 className="ls-showcase-h2 b-head">About this home</h2>
                  <p className="ls-showcase-desc">{model.description}</p>
                </section>
              ) : null}

              {model.sessions.length ? <div className="ls-showcase-sec"><OpenHouses model={model} /></div> : null}

              {model.floorPlans.length ? (
                <section className="ls-showcase-sec">
                  <h2 className="ls-showcase-h2 b-head">Floor plans</h2>
                  <FloorPlans model={model} className="ls-showcase-plans" />
                </section>
              ) : null}

              {agent ? (
                <section className="ls-showcase-sec ls-showcase-agent" aria-label="Your agent">
                  <Face agent={agent.agent} size={56} />
                  <div className="ls-showcase-agent__who"><AgentLines model={model} nameTag="h2" /></div>
                  <div className="ls-showcase-agent__acts"><AgentActions model={model} className="b-btn b-btn-outline" /></div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {count > 1 ? (
        <ol className="ls-showcase-pages" aria-label="More photos">
          {photos.slice(1).map((p, i) => {
            const n = i + 2;
            return (
              <li key={p.id ?? n} className="ls-showcase-pg">
                <button type="button" className="ls-showcase-pg__hit" onClick={() => model.openPhoto(n - 1)} aria-label={`Open ${name} photo ${n} of ${count}`}>
                  <Photo photo={p} alt="" sizes="100vw" />
                </button>
                <span className="ls-showcase-cap">Photo {n} of {count}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
