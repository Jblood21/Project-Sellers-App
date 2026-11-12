import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import {
  UTAH_SCHOOL_REPORT_URL, directionsUrl, driveLabel, placeColor, pointOf,
} from '@shared/neighborhood.js';
import { Pin } from '../../../components/Icons.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import NeighborhoodMap from '../../NeighborhoodMap.jsx';
import { ICONS, onApple } from '../../screens/Area.jsx';

/**
 * Marketplace's Neighborhood tab, under the photos and floor plans: the places around the home beside a map of them.
 * Four layouts of the same thing are drawn for the agent to choose between (?nh=1 to ?nh=4 on the page's address):
 *   1  Side map: the list grouped by kind, the map beside it
 *   2  Chips: kinds as filter chips; the list and the map follow the chip
 *   3  Cards: a card for each place, the map beside them
 *   4  Numbered: a big map with numbered dots and the same numbers on the list; tap a row to find it on the map
 * With a phone's narrow screen the map goes above the list.
 */

const kindOf = (key) => HIGHLIGHT_CATEGORIES.find((c) => c.k === key);

function Dot({ category, size = 12 }) {
  return <span aria-hidden="true" className="ls-mk-nh__dot" style={{ background: placeColor(category), width: size, height: size }} />;
}

function Directions({ place, apple, children }) {
  const href = directionsUrl({ ...(pointOf(place) ?? {}), address: place.address, apple });
  if (!href) return null;
  return <a className="ls-mk-nh__link" href={href} target="_blank" rel="noreferrer noopener" aria-label={`Get directions to ${place.name}`}>{children ?? 'Directions'}</a>;
}

export default function Neighborhood({ variant = 1 }) {
  const { community, isListing } = useBuyer();
  const { communityId } = useParams();
  const apple = onApple();
  const highlights = community?.highlights ?? [];
  const home = pointOf({ lat: community?.settings?.mapLat, lng: community?.settings?.mapLng });
  const [chip, setChip] = useState('all');
  const [focusId, setFocusId] = useState(null);

  // The places in the order buyers ask about them, each given its number.
  const places = useMemo(() => {
    const order = HIGHLIGHT_CATEGORIES.map((c) => c.k);
    return [...highlights]
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || String(a.name).localeCompare(String(b.name)))
      .map((h, i) => ({ ...h, n: i + 1 }));
  }, [highlights]);
  if (!home && !places.length) return null;

  const kinds = HIGHLIGHT_CATEGORIES.filter((c) => places.some((p) => p.category === c.k));
  const active = kinds.some((k) => k.k === chip) ? chip : 'all';
  const shown = variant === 2 && active !== 'all' ? places.filter((p) => p.category === active) : places;
  const pins = shown.filter((p) => pointOf(p));
  const homeDirections = directionsUrl({ ...(home ?? {}), address: [community?.name, community?.location].filter(Boolean).join(', '), apple });
  const homeLabel = community?.name;

  const map = (props = {}) => (
    <NeighborhoodMap home={home} homeLabel={homeLabel} places={pins} height={props.height ?? 360} {...props} />
  );
  const mapColumn = (props) => (
    <div className="ls-mk-nh__map">
      {map(props)}
      {homeDirections ? (
        <a className="ls-mk-nh__go b-btn b-btn-outline" href={homeDirections} target="_blank" rel="noreferrer noopener">
          <Pin size={16} /> Get directions to {isListing ? 'the home' : community?.name}
        </a>
      ) : null}
      <Link className="ls-mk-nh__all" to={`/c/${communityId}/area`}>Open the full neighborhood page →</Link>
    </div>
  );

  let body;
  if (variant === 2) {
    body = (
      <>
        <div className="ls-mk-nh__chips" role="tablist" aria-label="Kinds of places">
          {[{ k: 'all', label: 'All' }, ...kinds].map((c) => (
            <button
              key={c.k} type="button" role="tab" aria-selected={active === c.k} onClick={() => setChip(c.k)}
              className={`ls-mk-nh__chip${active === c.k ? ' is-on' : ''}`}
            >
              {c.k === 'all' ? null : <Dot category={c.k} size={10} />}{c.label}
            </button>
          ))}
        </div>
        <div className="ls-mk-nh__cols">
          <ul className="ls-mk-nh__rows">
            {shown.map((p) => (
              <li key={p.id} className="ls-mk-nh__row">
                <Dot category={p.category} />
                <span className="ls-mk-nh__name"><strong>{p.name}</strong><small>{kindOf(p.category)?.label}</small></span>
                <span className="ls-mk-nh__drive">{driveLabel(p.miles, p.minutes) || p.detail}</span>
              </li>
            ))}
          </ul>
          {mapColumn({ height: 340 })}
        </div>
      </>
    );
  } else if (variant === 3) {
    body = (
      <div className="ls-mk-nh__cols">
        <div className="ls-mk-nh__cards">
          {places.map((p) => {
            const drive = driveLabel(p.miles, p.minutes) || p.detail;
            const more = p.link || (p.category === 'schools' ? UTAH_SCHOOL_REPORT_URL : '');
            return (
              <article key={p.id} className="ls-mk-nh__card">
                <span className="ls-mk-nh__icon" aria-hidden="true" style={{ background: `color-mix(in srgb, ${placeColor(p.category)} 18%, transparent)`, borderColor: placeColor(p.category) }}>{ICONS[p.category] ?? ICONS.other}</span>
                <div className="ls-mk-nh__cardbody">
                  <div className="ls-mk-nh__cardtop">
                    <strong>{p.name}</strong>
                    {drive ? <span className="ls-mk-nh__pill">{drive}</span> : null}
                  </div>
                  <small>{kindOf(p.category)?.label}</small>
                  {p.description ? <p>{p.description}</p> : null}
                  <div className="ls-mk-nh__cardlinks">
                    <Directions place={p} apple={apple} />
                    {more ? <a className="ls-mk-nh__link" href={more} target="_blank" rel="noreferrer noopener">{p.category === 'schools' && !p.link ? 'Utah school ratings ↗' : 'More info ↗'}</a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="ls-mk-nh__sticky">{mapColumn({ height: 460 })}</div>
      </div>
    );
  } else if (variant === 4) {
    body = (
      <div className="ls-mk-nh__cols ls-mk-nh__cols--wide">
        <div className="ls-mk-nh__sticky">{mapColumn({ height: 460, numbered: true, labels: false, focusId })}</div>
        <ol className="ls-mk-nh__nums">
          {places.map((p) => (
            <li key={p.id}>
              <button type="button" className={`ls-mk-nh__num${focusId === p.id ? ' is-on' : ''}`} onClick={() => setFocusId(p.id)}>
                <span className="ls-mk-nh__badge" style={{ background: placeColor(p.category) }}>{p.n}</span>
                <span className="ls-mk-nh__name"><strong>{p.name}</strong><small>{kindOf(p.category)?.label}{driveLabel(p.miles, p.minutes) ? ` · ${driveLabel(p.miles, p.minutes)}` : ''}</small></span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  } else {
    // 1: the list grouped by kind, the map beside it.
    body = (
      <div className="ls-mk-nh__cols">
        <div className="ls-mk-nh__groups">
          {kinds.map((k) => (
            <div key={k.k} className="ls-mk-nh__group">
              <h3 className="ls-mk-nh__kind"><Dot category={k.k} size={11} />{k.label}{k.hint ? <small> · {k.hint}</small> : null}</h3>
              <ul className="ls-mk-nh__rows">
                {places.filter((p) => p.category === k.k).map((p) => (
                  <li key={p.id} className="ls-mk-nh__row ls-mk-nh__row--plain">
                    <span className="ls-mk-nh__name"><strong>{p.name}</strong></span>
                    <span className="ls-mk-nh__drive">{driveLabel(p.miles, p.minutes) || p.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="ls-mk-nh__sticky">{mapColumn({ height: 420 })}</div>
      </div>
    );
  }

  return (
    <section id="ls-marketplace-neighborhood" className="ls-marketplace-sec ls-mk-nh" aria-labelledby="ls-marketplace-nh-h">
      <h2 id="ls-marketplace-nh-h" className="ls-marketplace-h2 b-head">Neighborhood</h2>
      {body}
    </section>
  );
}
