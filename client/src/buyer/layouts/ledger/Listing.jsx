import { useState } from 'react';

import Photo from '../../../components/Photo.jsx';
import { money } from '../../../lib/format.js';
import { useBuyer } from '../../BuyerContext.jsx';
import {
  dayLabel, directionsUrl, downloadIcs, isNowOpen, openHouseIcs, timeRange,
} from '../../openHouse.js';
import {
  AgentActions, AgentLines, Face, FloorPlans, Guides, useAgent, VideoButton,
} from '../../listing/parts.jsx';

/**
 * Ledger's listing page: the numbers dashboard. A grid of figure tiles first (price, monthly, down payment, beds
 * and baths and size, next open house, status), then one wide photo with a strip of thumbnails, then a facts table
 * and the description beside a narrow rail with the agent and the actions. Open houses are table rows.
 */

const DAY = 86400000;
const utc = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "Open now", "today", "tomorrow" or "in 3 days" for a session, by the viewer's own date. */
function countdown(session, today, time) {
  if (isNowOpen(session, today, time)) return 'Open now';
  const days = Math.round((utc(session.date) - utc(today)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function Tile({ label, className = '', children }) {
  return (
    <div className={`ls-ledger-tile ${className}`}>
      <p className="ls-ledger-tile__lbl">{label}</p>
      {children}
    </div>
  );
}

function OpenHouseRows({ model }) {
  const { community, communityId, track } = useBuyer();
  const { sessions, today, time } = model;
  if (!sessions.length) return null;
  const address = community?.name ?? '';
  const place = community?.location ?? '';
  return (
    <section className="ls-ledger-sec" aria-labelledby="ls-ledger-oh">
      <h2 id="ls-ledger-oh" className="ls-ledger-sec__h">{sessions.length > 1 ? 'Open houses' : 'Open house'}</h2>
      <div className="ls-ledger-scroll">
        <table className="ls-ledger-oh">
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Note</th><th scope="col"><span className="ls-ledger-vh">Actions</span></th></tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const now = isNowOpen(s, today, time);
              return (
                <tr key={`${s.date}-${s.start}`} data-now={now || undefined}>
                  <th scope="row" data-k="Date">
                    {s.date === today ? `Today, ${dayLabel(s.date)}` : dayLabel(s.date)}
                    {now ? <span className="ls-ledger-now">Open now</span> : null}
                  </th>
                  <td data-k="Time" className="ls-ledger-fig">{timeRange(s.start, s.end)}</td>
                  <td data-k="Note" className="ls-ledger-oh__note">{s.note || '—'}</td>
                  <td className="ls-ledger-oh__acts">
                    <button
                      type="button" className="ls-ledger-link"
                      aria-label={`Add to calendar: the ${dayLabel(s.date)} open house`}
                      onClick={() => {
                        track(`Added the ${dayLabel(s.date)} open house to their calendar`);
                        downloadIcs(openHouseIcs(s, { address, place, uid: communityId }), `open-house-${s.date}.ics`);
                      }}
                    >
                      Add to calendar
                    </button>
                    <a
                      className="ls-ledger-link" href={directionsUrl(address, place)} target="_blank" rel="noopener noreferrer"
                      aria-label={`Directions to ${address} (opens a map)`}
                      onClick={() => track('Opened directions to the home')}
                    >
                      Directions
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AgentCard({ model }) {
  const a = useAgent(model);
  if (!a) return null;
  return (
    <section className="ls-ledger-card" aria-labelledby="ls-ledger-agent">
      <h2 id="ls-ledger-agent" className="ls-ledger-tile__lbl">Your agent</h2>
      <div className="ls-ledger-agent">
        <Face agent={a.agent} size={56} />
        <div className="ls-ledger-agent__txt"><AgentLines model={model} nameTag="strong" /></div>
      </div>
      <div className="ls-ledger-agent__acts"><AgentActions model={model} className="ls-ledger-btn" emailToo /></div>
    </section>
  );
}

export default function Listing({ model }) {
  const [active, setActive] = useState(0);
  const { photos } = model;
  const shown = photos[Math.min(active, Math.max(photos.length - 1, 0))];
  const idx = Math.min(active, Math.max(photos.length - 1, 0));

  const est = model.estimate;
  const next = model.nextSession;
  const perSqft = model.price && model.sqft ? Math.round(model.price / Number(model.sqft)) : 0;
  const beds = model.beds ? String(model.beds) : '';
  const baths = model.baths ? String(model.baths) : '';
  const sqft = model.sqft ? Number(model.sqft).toLocaleString('en-US') : '';
  const stats = [
    beds ? { v: beds, l: Number(model.beds) === 1 ? 'Bed' : 'Beds' } : null,
    baths ? { v: baths, l: Number(model.baths) === 1 ? 'Bath' : 'Baths' } : null,
    sqft ? { v: sqft, l: 'Sq ft' } : null,
  ].filter(Boolean);

  const rows = [
    ['Status', model.status],
    model.mls ? ['MLS #', model.mls] : null,
    model.brokerage ? ['Brokerage', model.brokerage] : null,
    beds ? ['Beds', beds] : null,
    baths ? ['Baths', baths] : null,
    sqft ? ['Size', `${sqft} sq ft`] : null,
    perSqft ? ['Price per sq ft', money(perSqft)] : null,
  ].filter(Boolean);

  return (
    <div className="b-shell ls-ledger">
      <header className="ls-ledger-top">
        <h1 className="ls-ledger-h1">{model.name}</h1>
        {model.city ? <p className="ls-ledger-city">{model.city}</p> : null}
      </header>

      <section className="ls-ledger-grid" aria-label="Key figures">
        {model.price ? (
          <Tile label="Price" className="ls-ledger-tile--price">
            <p className="ls-ledger-big">{money(model.price)}</p>
            {perSqft ? <p className="ls-ledger-sub">{money(perSqft)} per sq ft</p> : null}
          </Tile>
        ) : null}
        {est ? (
          <Tile label="Est. monthly">
            <p className="ls-ledger-big">{money(est.monthly)}<span className="ls-ledger-unit">/mo</span></p>
            <p className="ls-ledger-sub">{est.downPct}% down, {Number(est.rate).toFixed(2)}% fixed</p>
          </Tile>
        ) : null}
        {est ? (
          <Tile label="Down needed">
            <p className="ls-ledger-big">{money(est.down)}</p>
            <p className="ls-ledger-sub">at {est.downPct}% down</p>
          </Tile>
        ) : null}
        {stats.length ? (
          <Tile label="Beds / baths / size" className="ls-ledger-tile--stats">
            <ul className="ls-ledger-stats">
              {stats.map((s) => (
                <li key={s.l}><span className="ls-ledger-num">{s.v}</span><span className="ls-ledger-stats__l">{s.l}</span></li>
              ))}
            </ul>
          </Tile>
        ) : null}
        {next ? (
          <Tile label="Next open house">
            <p className="ls-ledger-big ls-ledger-big--sm">{next.date === model.today ? 'Today' : dayLabel(next.date)}</p>
            <p className="ls-ledger-sub">{timeRange(next.start, next.end)}</p>
            <p className="ls-ledger-count">{countdown(next, model.today, model.time)}</p>
          </Tile>
        ) : null}
        <Tile label="Status">
          <p className="ls-ledger-big ls-ledger-big--sm">
            <span className="ls-ledger-dot" data-status={model.status} aria-hidden="true" />{model.status}
          </p>
          {model.sold ? <p className="ls-ledger-sub">No longer available</p> : null}
        </Tile>
      </section>

      {photos.length ? (
        <section className="ls-ledger-photos" aria-label="Photos">
          <button
            type="button" className="ls-ledger-photo" onClick={() => model.openPhoto(idx)}
            aria-label={`Open ${model.name} photo ${idx + 1} of ${photos.length}`}
          >
            <Photo eager photo={shown} alt={`${model.name} photo ${idx + 1} of ${photos.length}`} sizes="(min-width: 1024px) 900px, 100vw" />
          </button>
          {photos.length > 1 ? (
            <div className="ls-ledger-thumbs" role="group" aria-label="Choose a photo">
              {photos.map((p, i) => (
                <button
                  key={p.id ?? i} type="button" className="ls-ledger-thumb" aria-pressed={i === idx}
                  aria-label={`Show photo ${i + 1} of ${photos.length}`} onClick={() => setActive(i)}
                >
                  <Photo photo={p} alt="" sizes="120px" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="ls-ledger-cols">
        <div className="ls-ledger-main">
          <section className="ls-ledger-sec" aria-labelledby="ls-ledger-facts">
            <h2 id="ls-ledger-facts" className="ls-ledger-sec__h">Facts</h2>
            <table className="ls-ledger-facts">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}><th scope="row">{k}</th><td className="ls-ledger-fig">{v}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          {model.description ? (
            <section className="ls-ledger-sec" aria-labelledby="ls-ledger-desc">
              <h2 id="ls-ledger-desc" className="ls-ledger-sec__h">About this home</h2>
              <p className="ls-ledger-desc">{model.description}</p>
            </section>
          ) : null}

          <OpenHouseRows model={model} />

          {model.floorPlans.length ? (
            <section className="ls-ledger-sec" aria-labelledby="ls-ledger-plans">
              <h2 id="ls-ledger-plans" className="ls-ledger-sec__h">Floor plans</h2>
              <FloorPlans model={model} />
            </section>
          ) : null}
        </div>

        <aside className="ls-ledger-rail" aria-label="Agent and actions">
          <AgentCard model={model} />
          <div className="ls-ledger-card ls-ledger-actions">
            {model.sold ? <p className="ls-ledger-sold" role="status">Sold. This home is no longer available.</p> : null}
            {model.requestShowing ? <button type="button" className="ls-ledger-btn ls-ledger-btn--pri" onClick={model.requestShowing}>Request a showing</button> : null}
            {model.talkFinancing ? (
              <button type="button" className={`ls-ledger-btn${model.requestShowing ? '' : ' ls-ledger-btn--pri'}`} onClick={model.talkFinancing}>Talk about financing</button>
            ) : null}
            {model.openPayment ? <button type="button" className="ls-ledger-btn" onClick={model.openPayment}>See my payment for this home</button> : null}
            <VideoButton model={model} className="ls-ledger-btn" />
            <button type="button" className="ls-ledger-btn" aria-pressed={model.saved} onClick={model.toggleSave}>
              {model.saved ? '★ Saved' : '☆ Save this home'}
            </button>
          </div>
        </aside>
      </div>
      <div className="ls-ledger-more"><Guides /></div>
    </div>
  );
}
