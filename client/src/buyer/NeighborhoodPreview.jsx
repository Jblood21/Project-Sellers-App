import { Link, useParams } from 'react-router-dom';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { directionsUrl, driveLabel, pointOf } from '@shared/neighborhood.js';
import { Pin } from '../components/Icons.jsx';
import { useBuyer } from './BuyerContext.jsx';
import NeighborhoodMap from './NeighborhoodMap.jsx';
import { ICONS, onApple } from './screens/Area.jsx';

/**
 * The Neighborhood on a listing's front page, so a buyer sees it without opening the menu: the map with the home
 * and nearby places, Get directions, a short list of the nearest of each kind (name and how far), and a link to the
 * whole screen. Draws nothing when the home has neither a map point nor places. `Heading` lets a layout use its own
 * heading style and `className` its own section class.
 */
export default function NeighborhoodPreview({ className = '', headingClassName = '', title = 'Neighborhood', limit = 6 }) {
  const { community, isListing } = useBuyer();
  const { communityId } = useParams();
  const highlights = community?.highlights ?? [];
  const home = pointOf({ lat: community?.settings?.mapLat, lng: community?.settings?.mapLng });
  const pins = highlights.filter((h) => pointOf(h));
  if (!home && !highlights.length) return null;

  // One place for each kind first (schools, grocery, park, ...), in the order buyers ask about them, then the rest.
  const order = HIGHLIGHT_CATEGORIES.map((c) => c.k);
  const sorted = [...highlights].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const firsts = [];
  const seen = new Set();
  for (const h of sorted) if (!seen.has(h.category)) { seen.add(h.category); firsts.push(h); }
  const shown = [...firsts, ...sorted.filter((h) => !firsts.includes(h))].slice(0, limit);
  const directions = directionsUrl({ ...(home ?? {}), address: [community?.name, community?.location].filter(Boolean).join(', '), apple: onApple() });
  const labelOf = (key) => HIGHLIGHT_CATEGORIES.find((c) => c.k === key)?.label ?? 'Other';

  return (
    <section className={`nh-preview ${className}`.trim()} aria-label={title} style={{ margin: '28px 0', display: 'grid', gap: 12 }}>
      <h2 className={headingClassName}>{title}</h2>
      {home || pins.length ? <NeighborhoodMap home={home} homeLabel={community?.name} places={pins} height={260} /> : null}
      {directions ? (
        <a
          href={directions} target="_blank" rel="noreferrer noopener"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontWeight: 700, color: 'inherit' }}
        >
          <Pin size={16} />
          <span>Get directions to {isListing ? 'the home' : community?.name}</span>
        </a>
      ) : null}
      {shown.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
          {shown.map((h) => {
            const drive = driveLabel(h.miles, h.minutes) || h.detail;
            return (
              <li
                key={h.id}
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderTop: '1px solid color-mix(in srgb, currentColor 16%, transparent)', flexWrap: 'wrap' }}
              >
                <span aria-hidden="true" style={{ flex: 'none' }}>{ICONS[h.category] ?? ICONS.other}</span>
                <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <strong>{h.name}</strong>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.75 }}>{labelOf(h.category)}</span>
                </span>
                {drive ? <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{drive}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link to={`/c/${communityId}/area`} style={{ fontWeight: 700, color: 'inherit', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        See the whole neighborhood →
      </Link>
    </section>
  );
}
