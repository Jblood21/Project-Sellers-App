import { useMemo, useState } from 'react';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { UTAH_SCHOOL_REPORT_URL, directionsUrl, driveLabel, pointOf } from '@shared/neighborhood.js';
import { Pin } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';
import NeighborhoodMap from '../NeighborhoodMap.jsx';

// A simple picture for a place with no photo of its own.
const ICONS = {
  schools: '🏫', employment: '💼', shopping: '🛍️', grocery: '🛒', parks: '🌳', gym: '🏋️',
  parkride: '🚌', golf: '⛳', ski: '⛷️', health: '🏥', commute: '🚗', other: '📍',
};

const onApple = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/i.test(`${navigator.userAgent} ${navigator.platform ?? ''}`);

/**
 * "What's around here": the schools, jobs, shops and everyday places near the home, on a map and in a tab for each
 * kind. Each place shows how far it is, a link for more (schools default to the Utah school report card), and
 * directions that open in the phone's own maps app, starting from where the person is.
 */
export default function Area() {
  const { community, isListing } = useBuyer();
  const highlights = community?.highlights ?? [];
  const [tab, setTab] = useState('all');
  const apple = onApple();

  const categories = HIGHLIGHT_CATEGORIES.filter((c) => highlights.some((h) => h.category === c.k));
  const active = categories.some((c) => c.k === tab) ? tab : 'all';
  const shown = active === 'all' ? highlights : highlights.filter((h) => h.category === active);
  const grouped = HIGHLIGHT_CATEGORIES
    .map((category) => [category, shown.filter((h) => h.category === category.k)])
    .filter(([, items]) => items.length);

  const home = pointOf({ lat: community?.settings?.mapLat, lng: community?.settings?.mapLng });
  const homeName = community?.name;
  const homeDirections = directionsUrl({ ...(home ?? {}), address: [community?.name, community?.location].filter(Boolean).join(', '), apple });
  const pins = useMemo(() => shown.filter((h) => pointOf(h)), [shown]);
  const showMap = Boolean(home) || pins.length > 0;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>{isListing ? 'Neighborhood' : 'Local Spots'}</h1>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        {highlights.length
          ? `The schools, jobs, shops and everyday places near ${isListing ? 'the home' : community?.name}.`
          : isListing ? 'Nothing has been added yet — ask your agent what’s nearby.' : 'Nothing has been added yet — ask the team what’s nearby.'}
      </p>

      {showMap ? (
        <div style={{ marginBottom: 12 }}>
          <NeighborhoodMap home={home} homeLabel={homeName} places={pins} />
        </div>
      ) : null}

      {homeDirections ? (
        <a
          href={homeDirections} target="_blank" rel="noreferrer noopener" className="b-btn"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, textDecoration: 'none' }}
        >
          <Pin size={16} />
          <span>Get directions to {isListing ? 'the home' : community?.name}</span>
        </a>
      ) : null}

      {categories.length > 1 ? (
        <div role="tablist" aria-label="Kinds of places" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 12px', marginBottom: 4 }}>
          {[{ k: 'all', label: 'All' }, ...categories].map((category) => (
            <button
              key={category.k} type="button" role="tab" aria-selected={active === category.k} onClick={() => setTab(category.k)}
              style={{
                flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${active === category.k ? 'var(--t-accT)' : 'var(--t-line)'}`,
                background: active === category.k ? 'var(--t-tint)' : 'var(--t-sur)',
                color: active === category.k ? 'var(--t-accT)' : 'var(--t-ink)',
              }}
            >
              {category.k === 'all' ? 'All' : `${ICONS[category.k] ?? ''} ${category.label}`.trim()}
            </button>
          ))}
        </div>
      ) : null}

      {grouped.map(([category, items]) => (
        <section key={category.k} style={{ marginBottom: 22 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 10, color: 'var(--t-accT)' }}>
            {category.label}{category.hint ? ` · ${category.hint}` : ''}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((highlight) => {
              const directions = directionsUrl({ ...(pointOf(highlight) ?? {}), address: highlight.address, apple });
              const drive = driveLabel(highlight.miles, highlight.minutes);
              const more = highlight.link || (highlight.category === 'schools' ? UTAH_SCHOOL_REPORT_URL : '');
              return (
                <article key={highlight.id} className="b-card" style={{ overflow: 'hidden' }}>
                  {highlight.photo ? (
                    <div style={{ height: 150 }}>
                      <Photo photo={highlight.photo} label="" alt={highlight.name} sizes="(min-width: 600px) 700px, 105vw" />
                    </div>
                  ) : null}
                  <div style={{ padding: 14, display: 'flex', gap: 12 }}>
                    {highlight.photo ? null : (
                      <span
                        aria-hidden="true"
                        style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, background: 'var(--t-tint)', display: 'grid', placeItems: 'center', fontSize: 22 }}
                      >
                        {ICONS[highlight.category] ?? ICONS.other}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span className="b-head" style={{ fontSize: 16, lineHeight: 1.25 }}>{highlight.name}</span>
                        {drive || highlight.detail ? (
                          <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--t-tint)', color: 'var(--t-accT)' }}>
                            {drive || highlight.detail}
                          </span>
                        ) : null}
                      </div>
                      {drive && highlight.detail ? <span style={{ fontSize: 12.5, color: 'var(--t-mut)' }}>{highlight.detail}</span> : null}
                      {highlight.description ? (
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--t-mut)' }}>{highlight.description}</p>
                      ) : null}
                      {directions && highlight.address ? (
                        <a
                          href={directions} target="_blank" rel="noreferrer noopener" aria-label={`Get directions to ${highlight.name}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minHeight: 40, fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: 'var(--t-accT)', textDecoration: 'none' }}
                        >
                          <Pin size={15} />
                          <span>{highlight.address}</span>
                        </a>
                      ) : directions ? (
                        <a
                          href={directions} target="_blank" rel="noreferrer noopener"
                          style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 40, fontSize: 13, fontWeight: 700, color: 'var(--t-accT)', textDecoration: 'none' }}
                        >
                          <Pin size={15} /><span>Get directions</span>
                        </a>
                      ) : null}
                      {more ? (
                        <a
                          href={more} target="_blank" rel="noreferrer noopener"
                          style={{ display: 'flex', alignItems: 'center', minHeight: 40, fontSize: 13, fontWeight: 700, color: 'var(--t-accT)', textDecoration: 'none' }}
                        >
                          {highlight.category === 'schools' && !highlight.link ? 'Utah school ratings ↗' : 'More information ↗'}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
