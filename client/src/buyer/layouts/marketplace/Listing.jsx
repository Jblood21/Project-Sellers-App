import { useEffect, useRef, useState } from 'react';

import Photo from '../../../components/Photo.jsx';
import { money } from '../../../lib/format.js';
import {
  AgentActions, Face, FloorPlans, Guides, OpenHouses, StatusNote, statList, useAgent,
} from '../../listing/parts.jsx';
import { dayLabel, timeRange } from '../../openHouse.js';
import { Heart } from './icons.jsx';

/**
 * Marketplace's listing page: the detail page of a big home-search site.
 * A photo mosaic on top (a swipeable strip with a "1/6" badge on a phone), then a main column with the price,
 * address, a stat row, a sticky tab bar that scrolls to each section, and a contact card that sticks beside it
 * on a wide screen and becomes a bottom bar (price + Request a showing) on a phone.
 */
const MOBILE_READ_MORE = 360;

export default function Listing({ model }) {
  const agent = useAgent(model);
  const stats = statList(model);
  const {
    photos, sessions, estimate, sold,
  } = model;
  const hasPlans = model.floorPlans.length > 0;
  const hasPhotos = photos.length > 1 || hasPlans || model.hasVideo;
  const financing = Boolean(estimate || model.talkFinancing || model.openPayment);
  const facts = [
    { k: 'Status', v: model.status },
    model.mls ? { k: 'MLS #', v: model.mls } : null,
    model.brokerage ? { k: 'Brokerage', v: model.brokerage } : null,
    model.beds ? { k: 'Beds', v: String(model.beds) } : null,
    model.baths ? { k: 'Baths', v: String(model.baths) } : null,
    model.sqft ? { k: 'Size', v: `${Number(model.sqft).toLocaleString('en-US')} sq ft` } : null,
  ].filter(Boolean);

  const tabs = [
    { id: 'ls-marketplace-overview', label: 'Overview' },
    sessions.length ? { id: 'ls-marketplace-open', label: 'Open houses' } : null,
    hasPhotos ? { id: 'ls-marketplace-photos', label: 'Photos' } : null,
    financing ? { id: 'ls-marketplace-financing', label: 'Financing' } : null,
    { id: 'ls-marketplace-agent', label: 'Agent', mobileOnly: true },
  ].filter(Boolean);

  const [active, setActive] = useState(tabs[0].id);
  const tabKey = tabs.map((t) => t.id).join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const ids = tabKey.split('|');
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
      const first = ids.find((id) => seen.get(id));
      if (first) setActive(first);
    }, { rootMargin: '-120px 0px -55% 0px' });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [tabKey]);

  const goTo = (event, id) => {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <div className="ls-marketplace-page">
      <Mosaic model={model} />
      <div className="ls-marketplace-body">
        <div className="ls-marketplace-main">
          <header className="ls-marketplace-head">
            <StatusNote model={model} className="ls-marketplace-status" />
            {model.price || estimate ? (
              <div className="ls-marketplace-pricerow">
                {model.price ? <p className="ls-marketplace-price">{money(model.price)}</p> : null}
                {estimate ? <p className="ls-marketplace-est">est. <strong>{money(estimate.monthly)}/mo</strong></p> : null}
              </div>
            ) : null}
            <div className="ls-marketplace-addr">
              <h1 className="ls-marketplace-h1 b-head">{model.name}</h1>
              {model.city ? <p className="ls-marketplace-city">{model.city}</p> : null}
            </div>
            {stats.length ? (
              <dl className="ls-marketplace-stats">
                {stats.map((s) => (
                  <div key={s.key} className="ls-marketplace-stat">
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </header>

          <nav className="ls-marketplace-tabs" aria-label="On this page">
            <ul>
              {tabs.map((t) => (
                <li key={t.id} className={t.mobileOnly ? 'ls-marketplace-tab--mobile' : undefined}>
                  <a
                    href={`#${t.id}`} onClick={(e) => goTo(e, t.id)}
                    aria-current={active === t.id ? 'true' : undefined}
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section id="ls-marketplace-overview" className="ls-marketplace-sec" aria-labelledby="ls-marketplace-overview-h">
            <h2 id="ls-marketplace-overview-h" className="ls-marketplace-h2 b-head">Overview</h2>
            {model.description ? <Description text={model.description} /> : null}
            {facts.length ? (
              <>
                <h3 className="ls-marketplace-h3 b-head">Facts &amp; features</h3>
                <dl className="ls-marketplace-facts">
                  {facts.map((f) => (
                    <div key={f.k} className="ls-marketplace-fact">
                      <dt>{f.k}</dt>
                      <dd>{f.v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
          </section>

          {sessions.length ? (
            <section id="ls-marketplace-open" className="ls-marketplace-sec ls-marketplace-oh" aria-label="Open houses">
              <h2 className="ls-marketplace-h2 b-head" aria-hidden="true">{sessions.length > 1 ? 'Open houses' : 'Open house'}</h2>
              <OpenHouses model={model} />
            </section>
          ) : null}

          {hasPhotos ? (
            <section id="ls-marketplace-photos" className="ls-marketplace-sec" aria-labelledby="ls-marketplace-photos-h">
              <h2 id="ls-marketplace-photos-h" className="ls-marketplace-h2 b-head">Photos</h2>
              {photos.length > 1 ? (
                <ul className="ls-marketplace-thumbs">
                  {photos.map((p, i) => (
                    <li key={p.id ?? i}>
                      <button
                        type="button" className="ls-marketplace-thumb" onClick={() => model.openPhoto(i)}
                        aria-label={`Open ${model.name} photo ${i + 1} of ${photos.length}`}
                      >
                        <Photo photo={p} alt="" sizes="(min-width: 900px) 220px, 45vw" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {model.hasVideo ? (
                <button type="button" className="ls-marketplace-link" onClick={model.openVideo}>▶ Watch the video tour</button>
              ) : null}
              {hasPlans ? (
                <>
                  <h3 className="ls-marketplace-h3 b-head">Floor plans</h3>
                  <FloorPlans model={model} className="ls-marketplace-plans" />
                </>
              ) : null}
            </section>
          ) : null}

          {financing ? (
            <section id="ls-marketplace-financing" className="ls-marketplace-sec" aria-labelledby="ls-marketplace-fin-h">
              <h2 id="ls-marketplace-fin-h" className="ls-marketplace-h2 b-head">Financing</h2>
              <div className="ls-marketplace-fin">
                {estimate ? (
                  <div className="ls-marketplace-fin__fig">
                    <p className="ls-marketplace-fin__lbl">Estimated payment</p>
                    <p className="ls-marketplace-fin__num">{money(estimate.monthly)}<span>/mo</span></p>
                    <p className="ls-marketplace-fin__terms">
                      {estimate.downPct}% down ({money(estimate.down)}), {Number(estimate.rate).toFixed(2)}% fixed. An estimate, not an offer.
                    </p>
                  </div>
                ) : null}
                <div className="ls-marketplace-fin__act">
                  {model.talkFinancing ? <button type="button" className="b-btn" onClick={model.talkFinancing}>Talk about financing</button> : null}
                  {model.openPayment ? <button type="button" className="b-btn b-btn-outline" onClick={model.openPayment}>See my payment</button> : null}
                </div>
              </div>
            </section>
          ) : null}

          <Guides />
        </div>

        <aside id="ls-marketplace-agent" className="ls-marketplace-card" aria-label="Contact">
          {agent ? (
            <div className="ls-marketplace-card__who">
              <Face agent={agent.agent} size={56} />
              <div className="ls-marketplace-card__id">
                <strong className="ls-marketplace-card__name b-head">{agent.name}</strong>
                {agent.brokerage ? <span>{agent.brokerage}</span> : null}
                {agent.license ? <span className="ls-marketplace-card__lic">{agent.license}</span> : null}
              </div>
            </div>
          ) : (
            <p className="ls-marketplace-card__ttl b-head">{sold ? 'This home has sold' : 'Interested in this home?'}</p>
          )}
          {sold ? <p className="ls-marketplace-card__sold">Sold</p> : null}
          <div className="ls-marketplace-card__btns">
            {model.requestShowing ? <button type="button" className="b-btn" onClick={model.requestShowing}>Request a showing</button> : null}
            {model.talkFinancing ? (
              <button type="button" className={`b-btn${model.requestShowing ? ' b-btn-outline' : ''}`} onClick={model.talkFinancing}>Talk about financing</button>
            ) : null}
            {model.openPayment ? <button type="button" className="b-btn b-btn-outline" onClick={model.openPayment}>See my payment</button> : null}
            <button type="button" className="b-btn b-btn-outline ls-marketplace-save" aria-pressed={model.saved} onClick={model.toggleSave}>
              <Heart size={18} filled={model.saved} /> {model.saved ? 'Saved' : 'Save this home'}
            </button>
          </div>
          {agent && (agent.phoneHref || agent.email) ? (
            <div className="ls-marketplace-card__reach"><AgentActions model={model} className="ls-marketplace-reach" /></div>
          ) : null}
          {model.nextSession ? (
            <p className="ls-marketplace-card__oh">
              Open house <strong>{dayLabel(model.nextSession.date)}, {timeRange(model.nextSession.start, model.nextSession.end)}</strong>
            </p>
          ) : null}
        </aside>
      </div>

      <MobileBar model={model} />
    </div>
  );
}

function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > MOBILE_READ_MORE;
  return (
    <div className="ls-marketplace-desc">
      <p className={`ls-marketplace-desc__t${long && !open ? ' is-clamped' : ''}`} id="ls-marketplace-desc-t">{text}</p>
      {long ? (
        <button type="button" className="ls-marketplace-link" aria-expanded={open} aria-controls="ls-marketplace-desc-t" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  );
}

/** One big photo and four small ones; a snap-scrolling strip with a counter on a phone. */
function Mosaic({ model }) {
  const { photos } = model;
  const strip = useRef(null);
  const [at, setAt] = useState(1);
  if (!photos.length) return null;
  const shown = photos.slice(0, 5);
  const onScroll = () => {
    const el = strip.current;
    if (!el || !el.firstElementChild) return;
    const w = el.firstElementChild.getBoundingClientRect().width || 1;
    setAt(Math.min(shown.length, Math.round(el.scrollLeft / w) + 1));
  };
  return (
    <div className="ls-marketplace-mosaic" data-count={shown.length}>
      <div className="ls-marketplace-mosaic__grid" ref={strip} onScroll={onScroll} role="group" aria-label={`${model.name} photos`}>
        {shown.map((p, i) => (
          <button
            key={p.id ?? i} type="button" className="ls-marketplace-tile" onClick={() => model.openPhoto(i)}
            aria-label={`Open ${model.name} photo ${i + 1} of ${photos.length}`}
          >
            <Photo
              eager={i === 0} photo={p} alt=""
              sizes={i === 0 ? '(min-width: 900px) 600px, 100vw' : '(min-width: 900px) 300px, 100vw'}
            />
          </button>
        ))}
      </div>
      <span className="ls-marketplace-badge" aria-hidden="true">{at}/{photos.length}</span>
      {photos.length > 1 ? (
        <button type="button" className="ls-marketplace-all" onClick={() => model.openPhoto(0)}>
          See all {photos.length} photos
        </button>
      ) : null}
    </div>
  );
}

/** Phone only: the price and the main action stay at the bottom of the screen. */
function MobileBar({ model }) {
  const main = model.requestShowing
    ? { label: 'Request a showing', fn: model.requestShowing }
    : model.talkFinancing ? { label: 'Talk about financing', fn: model.talkFinancing } : null;
  if (!model.price && !main) return null;
  return (
    <div className="ls-marketplace-bar">
      <div className="ls-marketplace-bar__in">
        <div className="ls-marketplace-bar__p">
          {model.price ? <strong>{money(model.price)}</strong> : null}
          {model.sold ? <span>Sold</span> : model.estimate ? <span>est. {money(model.estimate.monthly)}/mo</span> : null}
        </div>
        {main ? <button type="button" className="b-btn" onClick={main.fn}>{main.label}</button> : null}
      </div>
    </div>
  );
}
