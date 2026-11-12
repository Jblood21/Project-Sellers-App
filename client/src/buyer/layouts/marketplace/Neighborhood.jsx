import { useMemo, useState } from 'react';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { directionsUrl, placeColor, pointOf } from '@shared/neighborhood.js';
import { Pin } from '../../../components/Icons.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import NeighborhoodMap from '../../NeighborhoodMap.jsx';
import { onApple } from '../../screens/Area.jsx';

/**
 * Marketplace's Neighborhood tab, under the photos and floor plans: a map with numbered dots beside a numbered list of
 * the places, nearest first. Tap a row and the map jumps to that place. On a phone the map comes first.
 * The first few places are shown; the rest open with one button.
 */
const FIRST = 8;

const kindLabel = (key) => HIGHLIGHT_CATEGORIES.find((c) => c.k === key)?.label ?? 'Other';

/** "0.6 mi · 3 min", from whichever of the two is known. */
function away(place) {
  const parts = [];
  if (place.miles !== null && place.miles !== undefined) parts.push(`${Number(place.miles).toFixed(1).replace(/\.0$/, '')} mi`);
  if (place.minutes) parts.push(`${Math.round(Number(place.minutes))} min`);
  return parts.join(' · ') || place.detail || '';
}

export default function Neighborhood() {
  const { community, isListing } = useBuyer();
  const apple = onApple();
  const [all, setAll] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const highlights = community?.highlights ?? [];
  const home = pointOf({ lat: community?.settings?.mapLat, lng: community?.settings?.mapLng });

  // Nearest first (a place with no distance goes last); each place's number is its place in this order.
  const places = useMemo(() => [...highlights]
    .sort((a, b) => (a.miles ?? 1e9) - (b.miles ?? 1e9) || String(a.name).localeCompare(String(b.name)))
    .map((h, i) => ({ ...h, n: i + 1 })), [highlights]);
  if (!home && !places.length) return null;

  const shown = all ? places : places.slice(0, FIRST);
  const homeDirections = directionsUrl({ ...(home ?? {}), address: [community?.name, community?.location].filter(Boolean).join(', '), apple });
  const pins = places.filter((p) => pointOf(p));

  return (
    <section id="ls-marketplace-neighborhood" className="ls-marketplace-sec ls-mk-nh" aria-labelledby="ls-marketplace-nh-h">
      <h2 id="ls-marketplace-nh-h" className="ls-marketplace-h2 b-head">Neighborhood</h2>
      <div className="ls-mk-nh__cols">
        <div className="ls-mk-nh__sticky">
          <div className="ls-mk-nh__map">
            <NeighborhoodMap home={home} homeLabel={community?.name} places={pins} height={420} numbered labels={false} showKey={false} focusId={focusId} />
            {homeDirections ? (
              <a className="ls-mk-nh__go b-btn b-btn-outline" href={homeDirections} target="_blank" rel="noreferrer noopener">
                <Pin size={16} /> Get directions to {isListing ? 'the home' : community?.name}
              </a>
            ) : null}
          </div>
        </div>
        {places.length ? (
          <div className="ls-mk-nh__list">
            <ol className="ls-mk-nh__nums">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`ls-mk-nh__num${focusId === p.id ? ' is-on' : ''}`} onClick={() => setFocusId(p.id)}>
                    <span className="ls-mk-nh__badge" style={{ background: placeColor(p.category) }}>{p.n}</span>
                    <span className="ls-mk-nh__name"><strong>{p.name}</strong><small>{kindLabel(p.category)}</small></span>
                    <span className="ls-mk-nh__drive">{away(p)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {places.length > FIRST ? (
              <button type="button" className="ls-marketplace-link" onClick={() => setAll((v) => !v)}>
                {all ? 'Show fewer' : `Show all ${places.length} places`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
