import { Fragment } from 'react';

import { money } from '../../../lib/format.js';
import { useBuyer } from '../../BuyerContext.jsx';
import {
  clock12, dayLabel, directionsUrl, downloadIcs, isNowOpen, openHouseIcs,
} from '../../openHouse.js';
import {
  Actions, AgentActions, Face, FloorPlans, Guides, PhotoButton, StatusNote, VideoButton, factLines, statList, useAgent,
} from '../../listing/parts.jsx';

/**
 * Salt Grass listing page: "Billboard".
 *
 * A dark band opens the page with the address set huge and the price on an accent plate, the hero photo runs under
 * it as a cinematic banner with an angled foot, a stat bar of big numerals follows, open houses are tickets in a
 * row, the agent is a dark strip, further photos are a tight mosaic. Everything reads theme tokens in the sheet.
 */

const flagFor = (status) => (status === 'Active' || !status ? 'For sale' : status);

/** 'Nov', '14', 'Sat' for a literal date (read back in UTC so it never shifts). */
function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const fmt = (o) => at.toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  return { month: fmt({ month: 'short' }), day: String(d), weekday: fmt({ weekday: 'long' }) };
}

function Stats({ model }) {
  const cells = statList(model).map((s) => ({ ...s, big: s.value }));
  if (model.estimate) cells.push({ key: 'est', big: money(model.estimate.monthly), label: '/mo est.', note: `${model.estimate.downPct}% down` });
  if (!cells.length) return null;
  return (
    <ul className="ls-saltgrass-stats" style={{ '--n': cells.length }} aria-label="Home facts">
      {cells.map((c) => (
        <li key={c.key} className="ls-saltgrass-stat" data-k={c.key}>
          <span className="ls-saltgrass-stat__n">{c.big}</span>
          <span className="ls-saltgrass-stat__l">{c.label}</span>
          {c.note ? <span className="ls-saltgrass-stat__note">{c.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Tickets({ model }) {
  const { community, communityId, track } = useBuyer();
  if (!model.sessions.length) return null;
  const address = community?.name ?? '';
  const place = community?.location ?? '';
  return (
    <section className="ls-saltgrass-oh" aria-labelledby="ls-saltgrass-oh-h">
      <div className="ls-saltgrass-wrap">
        <h2 id="ls-saltgrass-oh-h" className="ls-saltgrass-h2 b-head">{model.sessions.length > 1 ? 'Open houses' : 'Open house'}</h2>
      </div>
      <ul className="ls-saltgrass-tickets" tabIndex={0} aria-label="Open house dates">
        {model.sessions.map((s) => {
          const p = dateParts(s.date);
          const now = isNowOpen(s, model.today, model.time);
          const isToday = s.date === model.today;
          return (
            <li key={`${s.date}-${s.start}`} className="ls-saltgrass-ticket" data-now={now || undefined}>
              <div className="ls-saltgrass-ticket__date">
                <span className="ls-saltgrass-ticket__mo">{p.month}</span>
                <span className="ls-saltgrass-ticket__day">{p.day}</span>
              </div>
              <div className="ls-saltgrass-ticket__body">
                <p className="ls-saltgrass-ticket__wk">{isToday ? `Today · ${p.weekday}` : p.weekday}</p>
                <p className="ls-saltgrass-ticket__time">
                  {clock12(s.start)}{s.end ? <> <span aria-hidden="true">to</span><span className="ls-saltgrass-sr"> to </span> {clock12(s.end)}</> : null}
                </p>
                {now ? <p className="ls-saltgrass-ticket__now">Now open</p> : null}
                {s.note ? <p className="ls-saltgrass-ticket__note">{s.note}</p> : null}
                <div className="ls-saltgrass-ticket__acts">
                  <button
                    type="button" className="ls-saltgrass-ticket__act"
                    aria-label={`Add to calendar: the ${dayLabel(s.date)} open house`}
                    onClick={() => {
                      track(`Added the ${dayLabel(s.date)} open house to their calendar`);
                      downloadIcs(openHouseIcs(s, { address, place, uid: communityId }), `open-house-${s.date}.ics`);
                    }}
                  >
                    Add to calendar
                  </button>
                  <a
                    className="ls-saltgrass-ticket__act" href={directionsUrl(address, place)} target="_blank" rel="noopener noreferrer"
                    aria-label={`Directions to ${address} (opens a map)`} onClick={() => track('Opened directions to the home')}
                  >
                    Directions
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AgentStrip({ model }) {
  const a = useAgent(model);
  if (!a) return null;
  return (
    <section className="ls-saltgrass-agent" aria-labelledby="ls-saltgrass-agent-h">
      <div className="ls-saltgrass-wrap ls-saltgrass-agent__in">
        <Face agent={a.agent} size={96} className="ls-saltgrass-face" />
        <div className="ls-saltgrass-agent__who">
          <h2 id="ls-saltgrass-agent-h" className="ls-saltgrass-agent__lbl">Your listing agent</h2>
          <p className="ls-saltgrass-agent__name b-head">{a.name}</p>
          {a.brokerage ? <p className="ls-saltgrass-agent__line">{a.brokerage}</p> : null}
          {a.license ? <p className="ls-saltgrass-agent__line ls-saltgrass-agent__lic">{a.license}</p> : null}
        </div>
        <div className="ls-saltgrass-agent__acts"><AgentActions model={model} className="ls-saltgrass-act" /></div>
      </div>
    </section>
  );
}

export default function Listing({ model }) {
  const { name, city, status, price, hero, more } = model;
  const facts = factLines(model);
  return (
    <div className="ls-saltgrass">
      <div className="ls-saltgrass-bill">
        <div className="ls-saltgrass-wrap ls-saltgrass-bill__head">
          <p className="ls-saltgrass-flag" data-status={status}>{flagFor(status)}</p>
          <h1 className="ls-saltgrass-h1 b-head" data-punct>{name}</h1>
          {city ? <p className="ls-saltgrass-city">{city}</p> : null}
          {price ? (
            <p className="ls-saltgrass-price"><span className="ls-saltgrass-sr">Price </span>{money(price)}</p>
          ) : null}
        </div>
        {hero ? (
          <div className="ls-saltgrass-banner">
            <PhotoButton model={model} photo={hero} index={0} eager sizes="(min-width: 1200px) 1200px, 100vw" className="ls-saltgrass-banner__btn" />
            {model.photos.length > 1 ? <span className="ls-saltgrass-count" aria-hidden="true">{model.photos.length} photos</span> : null}
          </div>
        ) : null}
      </div>

      <div className="ls-saltgrass-main">
        <div className="ls-saltgrass-wrap">
          <StatusNote model={model} className="ls-saltgrass-note" />
          <Stats model={model} />
          {(
            <div className="ls-saltgrass-cta">
              <Actions model={model} className="ls-saltgrass-actions" btn="b-btn ls-saltgrass-btn" outline="b-btn b-btn-outline ls-saltgrass-btn" only={['showing', 'finance', 'payment', 'save']} />
              <VideoButton model={model} className="b-btn b-btn-outline ls-saltgrass-btn" />
            </div>
          )}
        </div>

        <Tickets model={model} />

        {model.description ? (
          <section className="ls-saltgrass-story" aria-labelledby="ls-saltgrass-story-h">
            <div className="ls-saltgrass-wrap">
              <h2 id="ls-saltgrass-story-h" className="ls-saltgrass-lbl">About this home</h2>
              <p className="ls-saltgrass-desc">{model.description}</p>
            </div>
          </section>
        ) : null}

        {more.length ? (
          <section className="ls-saltgrass-wrap ls-saltgrass-gallery" aria-labelledby="ls-saltgrass-gal-h">
            <h2 id="ls-saltgrass-gal-h" className="ls-saltgrass-h2 b-head">Photos</h2>
            <div className="ls-saltgrass-mosaic">
              {more.map((photo, i) => (
                <PhotoButton
                  key={photo.id ?? i} model={model} photo={photo} index={i + 1}
                  sizes={i === 0 ? '(min-width: 900px) 740px, 66vw' : '(min-width: 900px) 370px, 34vw'}
                  className={`ls-saltgrass-tile${i === 0 ? ' ls-saltgrass-tile--big' : ''}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {model.floorPlans.length ? (
          <section className="ls-saltgrass-wrap ls-saltgrass-plans" aria-labelledby="ls-saltgrass-plans-h">
            <h2 id="ls-saltgrass-plans-h" className="ls-saltgrass-h2 b-head">Floor plans</h2>
            <FloorPlans model={model} className="ls-saltgrass-planrow" />
          </section>
        ) : null}

        <AgentStrip model={model} />

        <div className="ls-saltgrass-wrap ls-saltgrass-guides"><Guides /></div>

        {facts.length ? (
          <div className="ls-saltgrass-wrap">
            <ul className="ls-saltgrass-facts">
              {facts.map((f, i) => <Fragment key={f}><li>{f}</li>{i < facts.length - 1 ? <li aria-hidden="true" className="ls-saltgrass-facts__dot" /> : null}</Fragment>)}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
