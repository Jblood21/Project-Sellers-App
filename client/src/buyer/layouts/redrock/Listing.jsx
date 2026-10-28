import { useState } from 'react';

import Photo from '../../../components/Photo.jsx';
import { money } from '../../../lib/format.js';
import { useBuyer } from '../../BuyerContext.jsx';
import {
  dayLabel, directionsUrl, downloadIcs, isNowOpen, openHouseIcs, timeRange,
} from '../../openHouse.js';
import {
  AgentActions, AgentLines, Face, FloorPlans, Guides, StatusNote, factLines, statList, useAgent,
} from '../../listing/parts.jsx';

/**
 * Red Rock's listing page: a warm brochure. From 900px the screen is split: the photo panel on the left stays
 * put (the main photo and a rail of thumbnails) while the right half scrolls a solid price band, the address, three
 * big numbers and the numbered sections (The home, Come see it, Make it yours, Your agent), each under a thick rule.
 * On a phone the photo comes first, edge to edge, the price band overlaps its foot, and the same sections stack.
 * Open houses are solid colour blocks with an oversized day; the agent signs off at the end.
 */

/** "2026-11-14" as { weekday: 'Sat', day: '14', month: 'Nov' }, read as a literal date. */
function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts) => at.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  return { weekday: fmt({ weekday: 'short' }), day: String(d), month: fmt({ month: 'short' }) };
}

function PhotoPanel({ model }) {
  const [current, setCurrent] = useState(0);
  const { photos } = model;
  const at = Math.min(current, Math.max(photos.length - 1, 0));
  const photo = photos[at];
  return (
    <div className="ls-redrock-media">
      <div className="ls-redrock-main">
        {photo ? (
          <button
            type="button" className="ls-redrock-main__btn" onClick={() => model.openPhoto(at)}
            aria-label={`Open ${model.name} photo ${at + 1} of ${photos.length}`}
          >
            <Photo
              key={photo.id ?? at} eager={at === 0} photo={photo} alt={`${model.name} photo ${at + 1} of ${photos.length}`}
              sizes="(min-width: 900px) 50vw, 100vw"
            />
            <span className="ls-redrock-main__count" aria-hidden="true">
              {photos.length > 1 ? `${at + 1} of ${photos.length} · ` : ''}View larger
            </span>
          </button>
        ) : <div className="ls-redrock-main__none" aria-hidden="true" />}
      </div>
      {photos.length > 1 ? (
        <ul className="ls-redrock-rail" aria-label="More photos">
          {photos.map((p, index) => (
            <li key={p.id ?? index}>
              <button
                type="button" className="ls-redrock-thumb" aria-pressed={index === at}
                aria-label={`Show photo ${index + 1} of ${photos.length}`} onClick={() => setCurrent(index)}
              >
                <Photo photo={p} alt="" sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OpenHouseBlocks({ model }) {
  const { community, communityId, track } = useBuyer();
  if (!model.sessions.length) return null;
  const address = community?.name ?? '';
  const place = community?.location ?? '';
  return (
    <ul className="ls-redrock-oh">
      {model.sessions.map((session, i) => {
        const { weekday, day, month } = dateParts(session.date);
        const now = isNowOpen(session, model.today, model.time);
        const isToday = session.date === model.today;
        return (
          <li key={`${session.date}-${session.start}`} className={`ls-redrock-ohb ls-redrock-ohb--${i % 2 ? 'b' : 'a'}`}>
            <div className="ls-redrock-ohb__when">
              <span className="ls-redrock-ohb__day" aria-hidden="true">{day}</span>
              <span className="ls-redrock-ohb__mon" aria-hidden="true">{month}</span>
              <span className="ls-redrock-ohb__sr">{isToday ? `Today, ${dayLabel(session.date)}` : dayLabel(session.date)}</span>
            </div>
            <div className="ls-redrock-ohb__what">
              <p className="ls-redrock-ohb__wk">{isToday ? `Today · ${weekday}` : weekday}</p>
              <p className="ls-redrock-ohb__time">{timeRange(session.start, session.end)}</p>
              {now ? <p className="ls-redrock-ohb__now">Now open</p> : null}
              {session.note ? <p className="ls-redrock-ohb__note">{session.note}</p> : null}
            </div>
            <div className="ls-redrock-ohb__acts">
              <button
                type="button" className="ls-redrock-ohb__act"
                aria-label={`Add to calendar: the ${dayLabel(session.date)} open house`}
                onClick={() => {
                  track(`Added the ${dayLabel(session.date)} open house to their calendar`);
                  downloadIcs(openHouseIcs(session, { address, place, uid: communityId }), `open-house-${session.date}.ics`);
                }}
              >
                Add to calendar
              </button>
              <a
                className="ls-redrock-ohb__act" href={directionsUrl(address, place)} target="_blank" rel="noopener noreferrer"
                aria-label={`Directions to ${address} (opens a map)`} onClick={() => track('Opened directions to the home')}
              >
                Directions
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ n, id, title, children }) {
  return (
    <section className="ls-redrock-sec" aria-labelledby={id}>
      <span className="ls-redrock-sec__n" aria-hidden="true">{String(n).padStart(2, '0')}</span>
      <div className="ls-redrock-sec__body">
        <h2 id={id} className="b-head ls-redrock-sec__h">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function Listing({ model }) {
  const agent = useAgent(model);
  const stats = statList(model);
  const facts = factLines(model);
  const paragraphs = String(model.description ?? '').split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
  const ribbon = model.status === 'Active' ? 'For sale' : model.status;

  const hasHome = paragraphs.length || facts.length || model.floorPlans.length || model.hasVideo;
  const hasSee = model.sessions.length > 0 || Boolean(model.requestShowing);
  const hasYours = Boolean(model.openPayment || model.talkFinancing || model.toggleSave);
  const hasAgent = Boolean(agent);
  let n = 0;

  return (
    <div className="ls-redrock">
      <PhotoPanel model={model} />

      <div className="ls-redrock-body">
        <div className="ls-redrock-band" data-status={model.status}>
          <span className="ls-redrock-ribbon">{ribbon}</span>
          {model.price ? <p className="ls-redrock-price" aria-label={`Price ${money(model.price)}`}>{money(model.price)}</p> : null}
          {model.estimate ? (
            <p className="ls-redrock-monthly">
              <span className="ls-redrock-monthly__k">Monthly</span>
              <span className="ls-redrock-monthly__v">About {money(model.estimate.monthly)}/mo</span>
              <span className="ls-redrock-monthly__t">{model.estimate.downPct}% down, {Number(model.estimate.rate).toFixed(2)}% fixed</span>
            </p>
          ) : null}
        </div>

        <div className="ls-redrock-title">
          <h1 className="b-head ls-redrock-h1">{model.name}</h1>
          {model.city ? <p className="ls-redrock-city">{model.city}</p> : null}
          <StatusNote model={model} className="ls-redrock-note" />
        </div>

        {stats.length ? (
          <ul className="ls-redrock-stats">
            {stats.map((s) => (
              <li key={s.key}>
                <span className="ls-redrock-stats__v">{s.value}</span>
                <span className="ls-redrock-stats__l">{s.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="ls-redrock-secs">
          {hasHome ? (
            <Section n={++n} id="rr-ls-home" title="The home">
              {paragraphs.map((text, i) => <p key={i} className={i === 0 ? 'ls-redrock-lead' : 'ls-redrock-p'}>{text}</p>)}
              {model.hasVideo ? (
                <button type="button" className="ls-redrock-btn ls-redrock-btn--line" onClick={model.openVideo}>▶ Watch the video tour</button>
              ) : null}
              {model.floorPlans.length ? (
                <div className="ls-redrock-plans">
                  <p className="ls-redrock-minor">Floor plans</p>
                  <FloorPlans model={model} className="ls-plans" />
                </div>
              ) : null}
              {facts.length ? (
                <ul className="ls-redrock-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
              ) : null}
            </Section>
          ) : null}

          {hasSee ? (
            <Section n={++n} id="rr-ls-see" title={model.sessions.length > 1 ? 'Come see it: open houses' : model.sessions.length ? 'Come see it: open house' : 'Come see it'}>
              <OpenHouseBlocks model={model} />
              {model.requestShowing ? (
                <div className="ls-redrock-cta">
                  <button type="button" className="ls-redrock-btn ls-redrock-btn--solid" onClick={model.requestShowing}>Request a showing</button>
                </div>
              ) : null}
            </Section>
          ) : null}

          {hasYours ? (
            <Section n={++n} id="rr-ls-yours" title="Make it yours">
              <div className="ls-redrock-cta">
                {model.openPayment ? (
                  <button type="button" className="ls-redrock-btn ls-redrock-btn--solid" onClick={model.openPayment}>See My Payment for This Home</button>
                ) : null}
                {model.talkFinancing ? (
                  <button
                    type="button" className={`ls-redrock-btn ${model.openPayment ? 'ls-redrock-btn--line' : 'ls-redrock-btn--solid'}`}
                    onClick={model.talkFinancing}
                  >
                    Talk about financing
                  </button>
                ) : null}
                <button
                  type="button" className="ls-redrock-btn ls-redrock-btn--line" aria-pressed={model.saved}
                  data-saved={model.saved || undefined} onClick={model.toggleSave}
                >
                  {model.saved ? '★ Saved' : '☆ Save this home'}
                </button>
              </div>
              <Guides count={4} headingLevel={3} />
            </Section>
          ) : null}

          {hasAgent ? (
            <Section n={++n} id="rr-ls-agent" title="Your agent">
              <div className="ls-redrock-sign">
                <Face agent={agent.agent} size={112} className="ls-redrock-face" />
                <div className="ls-redrock-sign__t">
                  <AgentLines model={model} nameTag="p" />
                  <div className="ls-redrock-sign__acts">
                    <AgentActions model={model} className="ls-redrock-btn ls-redrock-btn--solid" />
                  </div>
                </div>
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
