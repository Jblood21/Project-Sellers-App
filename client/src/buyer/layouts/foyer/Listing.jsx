import { money } from '../../../lib/format.js';
import { useBuyer } from '../../BuyerContext.jsx';
import {
  AgentActions, Face, FloorPlans, Guides, PhotoButton, StatusNote, statList, useAgent,
} from '../../listing/parts.jsx';
import { dayLabel, directionsUrl, downloadIcs, isNowOpen, openHouseIcs, timeRange } from '../../openHouse.js';

/** "Sat, Nov 14" into its three parts: the weekday, the big day number and the month. */
function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const part = (opts) => at.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  return { weekday: part({ weekday: 'short' }), day: String(d), month: part({ month: 'short' }) };
}

/** The open houses as a typeset calendar: a large numeral, the time beside it, hairlines between. */
function Calendar({ model }) {
  const { community, communityId, track } = useBuyer();
  const { sessions, today, time } = model;
  if (!sessions.length) return null;
  const address = community?.name ?? '';
  const place = community?.location ?? '';
  return (
    <section className="ls-foyer-cal" aria-labelledby="ls-foyer-cal-h">
      <h2 id="ls-foyer-cal-h" className="ls-foyer-kicker">{sessions.length > 1 ? 'Open houses' : 'Open house'}</h2>
      <ul className="ls-foyer-cal__list">
        {sessions.map((session) => {
          const parts = dateParts(session.date);
          const now = isNowOpen(session, today, time);
          const label = dayLabel(session.date);
          return (
            <li key={`${session.date}-${session.start}`} className="ls-foyer-cal__item" data-now={now || undefined}>
              <div className="ls-foyer-cal__date" aria-hidden="true">
                <span className="ls-foyer-cal__num">{parts.day}</span>
                <span className="ls-foyer-cal__mon">{parts.month}</span>
              </div>
              <div className="ls-foyer-cal__body">
                <p className="ls-foyer-cal__when">
                  <span className="ls-foyer-cal__wd">{session.date === today ? `Today, ${label}` : label}</span>
                  <span className="ls-foyer-cal__time">{timeRange(session.start, session.end)}</span>
                </p>
                {now ? <p className="ls-foyer-cal__now">Now open</p> : null}
                {session.note ? <p className="ls-foyer-cal__note">{session.note}</p> : null}
                <p className="ls-foyer-cal__acts">
                  <button
                    type="button" className="ls-foyer-link"
                    aria-label={`Add to calendar: the ${label} open house`}
                    onClick={() => {
                      track(`Added the ${label} open house to their calendar`);
                      downloadIcs(openHouseIcs(session, { address, place, uid: communityId }), `open-house-${session.date}.ics`);
                    }}
                  >
                    Add to calendar
                  </button>
                  <a
                    className="ls-foyer-link" href={directionsUrl(address, place)} target="_blank" rel="noopener noreferrer"
                    aria-label={`Directions to ${address} (opens a map)`} onClick={() => track('Opened directions to the home')}
                  >
                    Directions
                  </a>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The agent as a tall portrait with an arched top, the name in italic, and Call / Text as underlined links. */
function Portrait({ model }) {
  const a = useAgent(model);
  if (!a) return null;
  return (
    <section className="ls-foyer-agent" aria-labelledby="ls-foyer-agent-h">
      <div className="ls-foyer-agent__arch"><Face agent={a.agent} size={320} /></div>
      <p className="ls-foyer-kicker" id="ls-foyer-agent-h">Your agent</p>
      <p className="ls-foyer-agent__name">{a.name}</p>
      {a.brokerage ? <p className="ls-foyer-agent__line">{a.brokerage}</p> : null}
      {a.license ? <p className="ls-foyer-agent__line">{a.license}</p> : null}
      <p className="ls-foyer-agent__acts"><AgentActions model={model} className="ls-foyer-link" emailToo /></p>
    </section>
  );
}

/** Rows of the At a glance box. Anything not given is left out. */
function glanceRows(model) {
  const names = { beds: 'Bedrooms', baths: 'Bathrooms', sqft: 'Interior' };
  const rows = statList(model).map((s) => ({ key: s.key, label: names[s.key], value: s.key === 'sqft' ? `${s.value} sq ft` : s.value }));
  if (model.price) rows.unshift({ key: 'price', label: 'Asking', value: money(model.price) });
  if (model.estimate) rows.push({ key: 'est', label: 'Estimated payment', value: `${money(model.estimate.monthly)}/mo`, note: `${model.estimate.downPct}% down, ${Number(model.estimate.rate).toFixed(2)}% fixed` });
  if (model.mls) rows.push({ key: 'mls', label: 'MLS', value: `#${model.mls}` });
  if (model.brokerage) rows.push({ key: 'brk', label: 'Listed with', value: model.brokerage });
  return rows;
}

export default function Listing({ model }) {
  const { name, city, hero, more, photos, description, sold } = model;
  const rows = glanceRows(model);
  const paragraphs = String(description ?? '').split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const hasAgent = Boolean(model.agent);
  const showAside = hasAgent || model.sessions.length > 0;
  const caption = [name, city].filter(Boolean).join(', ');

  return (
    <div className="ls-foyer">
      <header className="ls-foyer-mast">
        {city ? <p className="ls-foyer-city">{city}</p> : null}
        <h1 className="ls-foyer-title">{name}</h1>
        {model.price ? (
          <p className="ls-foyer-quote">
            <span className="ls-foyer-quote__price">{money(model.price)}</span>
            {model.estimate ? <span className="ls-foyer-quote__est"> or about {money(model.estimate.monthly)} a month</span> : null}
          </p>
        ) : null}
        <StatusNote model={model} className="ls-foyer-status" />
        <div className="ls-foyer-cta">
          {model.requestShowing ? <button type="button" className="b-btn" onClick={model.requestShowing}>Request a showing</button> : null}
          {model.talkFinancing ? <button type="button" className={`b-btn${model.requestShowing ? ' b-btn-outline' : ''}`} onClick={model.talkFinancing}>Talk about financing</button> : null}
          {model.openPayment ? <button type="button" className="b-btn b-btn-outline" onClick={model.openPayment}>See My Payment for This Home</button> : null}
        </div>
      </header>

      {hero ? (
        <figure className="ls-foyer-hero">
          <PhotoButton model={model} photo={hero} index={0} eager className="ls-foyer-hero__btn" sizes="(min-width: 1100px) 1040px, 100vw" />
          <figcaption className="ls-foyer-cap">
            {caption}<span aria-hidden="true"> — </span><span className="ls-foyer-cap__n">Photograph 1 of {photos.length}</span>
          </figcaption>
        </figure>
      ) : null}

      <div className={`ls-foyer-spread${showAside ? '' : ' ls-foyer-spread--solo'}`}>
        <div className="ls-foyer-main">
          {paragraphs.length ? (
            <section className="ls-foyer-story" aria-labelledby="ls-foyer-story-h">
              <h2 id="ls-foyer-story-h" className="ls-foyer-kicker">The story</h2>
              {paragraphs.map((p, i) => <p key={i} className={i === 0 ? 'ls-foyer-story__lead' : undefined}>{p}</p>)}
            </section>
          ) : null}

          {rows.length ? (
            <section className="ls-foyer-glance" aria-labelledby="ls-foyer-glance-h">
              <h2 id="ls-foyer-glance-h" className="ls-foyer-glance__h">At a glance</h2>
              <dl className="ls-foyer-glance__list">
                {rows.map((r) => (
                  <div key={r.key} className="ls-foyer-glance__row">
                    <dt>{r.label}</dt>
                    <dd>{r.value}{r.note ? <small>{r.note}</small> : null}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {model.hasVideo || model.floorPlans.length ? (
            <section className="ls-foyer-extras" aria-labelledby="ls-foyer-extras-h">
              <h2 id="ls-foyer-extras-h" className="ls-foyer-kicker">Tour the home</h2>
              {model.hasVideo ? <p><button type="button" className="ls-foyer-link" onClick={model.openVideo}>Watch the video tour</button></p> : null}
              <FloorPlans model={model} className="ls-foyer-plans" />
            </section>
          ) : null}

          <p className="ls-foyer-save">
            <button type="button" className="ls-foyer-link" onClick={model.toggleSave} aria-pressed={model.saved}>
              {model.saved ? 'Saved to your list' : 'Save this home'}
            </button>
          </p>
        </div>

        {showAside ? (
          <aside className="ls-foyer-side" aria-label="Your agent and open houses">
            <Portrait model={model} />
            {!sold ? <Calendar model={model} /> : null}
          </aside>
        ) : null}
      </div>

      {more.length ? (
        <section className="ls-foyer-gallery" aria-labelledby="ls-foyer-gallery-h">
          <h2 id="ls-foyer-gallery-h" className="ls-foyer-kicker ls-foyer-kicker--rule">The photographs</h2>
          <ol className="ls-foyer-plates">
            {more.map((photo, i) => (
              <li key={photo.id ?? i} className="ls-foyer-plate">
                <PhotoButton model={model} photo={photo} index={i + 1} className="ls-foyer-plate__btn" sizes="(min-width: 900px) 640px, 100vw" />
                <span className="ls-foyer-plate__cap"><span className="ls-foyer-plate__n">No. {i + 2}</span> {name}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="ls-foyer-guides"><Guides /></div>
    </div>
  );
}

