import { Link, useParams } from 'react-router-dom';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { directionsUrl, driveLabel, hasNeighborhood, pointOf } from '@shared/neighborhood.js';
import { Pin } from '../components/Icons.jsx';
import { useBuyer } from './BuyerContext.jsx';
import NeighborhoodMap from './NeighborhoodMap.jsx';
import { ICONS, onApple } from './screens/Area.jsx';

/**
 * The Neighborhood on a listing's page, so a buyer sees it without opening the menu: the map with the home and nearby
 * places, Get directions, a short list of the nearest of each kind (name and how far), and a link to the whole screen.
 * Draws nothing when the home has neither a map point nor places.
 *
 * It is one piece with the same parts in every layout, and each layout dresses it in its own CSS (`.nh-preview` in
 * base.css has the plain version; a layout's own file changes the frame, the heading, the rows). `variant` names the
 * layout (`data-nh`), `className` and `headingClassName` let it borrow the layout's section and heading styles,
 * `showTitle={false}` leaves the heading to a layout that already has one around it, `mapHeight` is a number or any CSS
 * length, and `dirClassName` / `allClassName` let the Get directions and See-the-whole links wear the layout's own button.
 */
export default function NeighborhoodPreview({
  variant = '', className = '', headingClassName = '', headingId, headingLevel = 2, title = 'Neighborhood', showTitle = true,
  limit = 6, mapHeight = 260, dirClassName = '', allClassName = '',
}) {
  const { community, isListing } = useBuyer();
  const { communityId } = useParams();
  const highlights = community?.highlights ?? [];
  const home = pointOf({ lat: community?.settings?.mapLat, lng: community?.settings?.mapLng });
  const pins = highlights.filter((h) => pointOf(h));
  if (!hasNeighborhood(community)) return null;

  // One place for each kind first (schools, grocery, park, ...), in the order buyers ask about them, then the rest.
  const order = HIGHLIGHT_CATEGORIES.map((c) => c.k);
  const sorted = [...highlights].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const firsts = [];
  const seen = new Set();
  for (const h of sorted) if (!seen.has(h.category)) { seen.add(h.category); firsts.push(h); }
  const shown = [...firsts, ...sorted.filter((h) => !firsts.includes(h))].slice(0, limit);
  const directions = directionsUrl({ ...(home ?? {}), address: [community?.name, community?.location].filter(Boolean).join(', '), apple: onApple() });
  const labelOf = (key) => HIGHLIGHT_CATEGORIES.find((c) => c.k === key)?.label ?? 'Other';
  const Heading = `h${headingLevel}`;

  return (
    <section className={`nh-preview ${className}`.trim()} data-nh={variant || undefined} aria-label={showTitle ? undefined : title} aria-labelledby={showTitle ? headingId : undefined}>
      {showTitle ? <Heading id={headingId} className={`nh-preview__title ${headingClassName}`.trim()}>{title}</Heading> : null}
      {home || pins.length ? (
        <div className="nh-preview__map">
          <NeighborhoodMap home={home} homeLabel={community?.name} places={pins} height={mapHeight} />
        </div>
      ) : null}
      {directions ? (
        <a className={`nh-preview__dir ${dirClassName}`.trim()} href={directions} target="_blank" rel="noreferrer noopener">
          <Pin size={16} />
          <span>Get directions to {isListing ? 'the home' : community?.name}</span>
        </a>
      ) : null}
      {shown.length ? (
        <ul className="nh-preview__list">
          {shown.map((h) => {
            const drive = driveLabel(h.miles, h.minutes) || h.detail;
            return (
              <li key={h.id} className="nh-preview__row">
                <span className="nh-preview__ico" aria-hidden="true">{ICONS[h.category] ?? ICONS.other}</span>
                <span className="nh-preview__what">
                  <strong className="nh-preview__name">{h.name}</strong>
                  <span className="nh-preview__kind">{labelOf(h.category)}</span>
                </span>
                {drive ? <span className="nh-preview__drive">{drive}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link className={`nh-preview__all ${allClassName}`.trim()} to={`/c/${communityId}/area`}>See the whole neighborhood →</Link>
    </section>
  );
}
