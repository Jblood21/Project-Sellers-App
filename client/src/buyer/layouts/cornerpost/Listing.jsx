import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Actions, AgentActions, AgentLines, Estimate, Face, FloorPlans, Guides, OpenHouses, PhotoButton, Price, StatusNote,
  VideoButton, factLines, statList, useAgent,
} from '../../listing/parts.jsx';

/** A small chevron for the carousel arrows. */
function Chev({ dir }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
    </svg>
  );
}

/** The photos as a horizontal swipe strip (CSS scroll-snap) with a "2 / 6" pill. Tapping a photo opens the viewer. */
function Carousel({ model }) {
  const { photos } = model;
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    setAt(Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  }, [photos.length]);
  useEffect(() => { setAt(0); }, [photos.length]);
  const go = (delta) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: Math.max(0, Math.min(photos.length - 1, at + delta)) * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };
  if (!photos.length) return <div className="ls-cornerpost-hero ls-cornerpost-hero--none" aria-hidden="true" />;
  return (
    <div className="ls-cornerpost-hero">
      <div
        className="ls-cornerpost-strip" ref={track} onScroll={onScroll}
        role="group" aria-roledescription="carousel" aria-label={`${model.name} photos`} tabIndex={-1}
      >
        {photos.map((photo, index) => (
          <div className="ls-cornerpost-slide" key={photo.id ?? index}>
            <PhotoButton
              model={model} photo={photo} index={index} className="ls-photo ls-cornerpost-photo"
              sizes="(min-width: 1100px) 560px, 100vw" eager={index === 0}
            />
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <span className="ls-cornerpost-count" aria-live="polite">{at + 1} / {photos.length}</span>
          <button type="button" className="ls-cornerpost-arrow ls-cornerpost-arrow--prev" onClick={() => go(-1)} disabled={at === 0} aria-label="Previous photo"><Chev dir="prev" /></button>
          <button type="button" className="ls-cornerpost-arrow ls-cornerpost-arrow--next" onClick={() => go(1)} disabled={at === photos.length - 1} aria-label="Next photo"><Chev dir="next" /></button>
        </>
      ) : null}
    </div>
  );
}

/** The description, clamped to a few lines with a Read more toggle when it is long. */
function About({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split('\n').length > 4;
  return (
    <section className="ls-cornerpost-tile" aria-labelledby="ls-cornerpost-about">
      <h2 id="ls-cornerpost-about" className="ls-cornerpost-h2">About this home</h2>
      <p className={`ls-cornerpost-about${long && !open ? ' is-clamped' : ''}`} id="ls-cornerpost-about-text">{text}</p>
      {long ? (
        <button type="button" className="ls-cornerpost-more" aria-expanded={open} aria-controls="ls-cornerpost-about-text" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </section>
  );
}

function AgentTile({ model }) {
  const a = useAgent(model);
  if (!a) return null;
  return (
    <section className="ls-cornerpost-tile ls-cornerpost-agent" aria-labelledby="ls-cornerpost-agent-h">
      <h2 id="ls-cornerpost-agent-h" className="ls-cornerpost-eyebrow">Your agent</h2>
      <div className="ls-cornerpost-agent__who">
        <Face agent={a.agent} size={64} />
        <div className="ls-cornerpost-agent__lines"><AgentLines model={model} nameTag="strong" /></div>
      </div>
      <div className="ls-cornerpost-agent__acts"><AgentActions model={model} className="ls-cornerpost-act" /></div>
    </section>
  );
}

export default function Listing({ model }) {
  const stats = statList(model);
  const facts = factLines(model);
  const description = String(model.description ?? '').trim();
  const hasMedia = model.floorPlans.length > 0 || model.hasVideo;
  const next = model.nextSession;
  void next;
  return (
    <div className="b-shell ls-cornerpost-page">
      <div className="ls-cornerpost-top">
        <Carousel model={model} />
        <div className="ls-cornerpost-summary">
          <section className="ls-cornerpost-price" aria-labelledby="ls-cornerpost-title">
            <div className="ls-cornerpost-price__row">
              {model.status ? <span className="b-ls-chip ls-cornerpost-chip" data-status={model.status}>{model.status}</span> : null}
              <button
                type="button" className="ls-cornerpost-save" onClick={model.toggleSave} aria-pressed={model.saved}
                aria-label={model.saved ? 'Saved. Remove from saved homes' : 'Save this home'}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill={model.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                </svg>
              </button>
            </div>
            <h1 id="ls-cornerpost-title" className="b-head ls-cornerpost-title">{model.name}</h1>
            {model.city ? <p className="ls-cornerpost-city">{model.city}</p> : null}
            {model.price || model.estimate ? (
              <div className="ls-cornerpost-money">
                <Price model={model} className="ls-cornerpost-amount" />
                <Estimate model={model} className="ls-cornerpost-est" />
              </div>
            ) : null}
            <StatusNote model={model} className="ls-cornerpost-note" />
            <Actions model={model} className="ls-cornerpost-actions" only={['showing', 'finance', 'payment']} />
          </section>

          {stats.length ? (
            <ul className="ls-cornerpost-stats" aria-label="Home facts">
              {stats.map((s) => (
                <li key={s.key} className="ls-cornerpost-stat"><strong>{s.value}</strong><span>{s.label}</span></li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="ls-cornerpost-body">
        <div className="ls-cornerpost-col">
          <OpenHouses model={model} />
          {description ? <About text={description} /> : null}
          {facts.length ? (
            <ul className="ls-cornerpost-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          ) : null}
        </div>
        <div className="ls-cornerpost-col">
          <AgentTile model={model} />
          {hasMedia ? (
            <section className="ls-cornerpost-tile" aria-labelledby="ls-cornerpost-media-h">
              <h2 id="ls-cornerpost-media-h" className="ls-cornerpost-h2">{model.floorPlans.length ? 'Floor plans and tour' : 'Video tour'}</h2>
              <FloorPlans model={model} className="ls-cornerpost-plans" />
              <VideoButton model={model} className="ls-cornerpost-video" />
            </section>
          ) : null}
          <Guides headingLevel={2} />
        </div>
      </div>
    </div>
  );
}
