import { useEffect, useRef, useState } from 'react';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { placeColor, pointOf } from '@shared/neighborhood.js';

/**
 * A map of the home and the places around it, from OpenStreetMap (free, no key, with its credit shown).
 * Leaflet and its tiles load only when this is drawn, so a visitor who never opens the Neighborhood screen
 * never downloads them. Names are agent-typed text, so they go into the popups as text, never as markup.
 */
export default function NeighborhoodMap({ home, homeLabel, places = [], height = 280 }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);
  const homeKey = home ? `${home.lat},${home.lng}` : '';
  const placesKey = places.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    let map = null;
    let gone = false;
    (async () => {
      try {
        const [leaflet] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        const L = leaflet.default ?? leaflet;
        if (gone || !box.current) return;
        map = L.map(box.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);
        const bounds = [];
        // A coloured dot for each place with its name over it. The colour is the kind of place (see the key under the map).
        const pin = (point, label, { className = '', size, color, home = false }) => {
          const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({
              className: 'nm-icon',
              html: `<span class="nm-dot ${className}" style="background:${color}"></span>`,
              iconSize: [size, size], iconAnchor: [size / 2, size / 2],
            }),
            title: label,
            keyboard: true,
            zIndexOffset: home ? 1000 : 0,
          }).addTo(map);
          const tag = document.createElement('span');
          tag.className = 'nm-tag';
          tag.style.borderLeftColor = color;
          tag.textContent = label;
          marker.bindTooltip(tag, { permanent: true, direction: 'top', offset: [0, -size / 2 - 2], className: `nm-label${home ? ' nm-label--home' : ''}`, opacity: 1 });
          const text = document.createElement('div');
          text.style.fontWeight = '600';
          text.textContent = label;
          marker.bindPopup(text);
          bounds.push([point.lat, point.lng]);
        };
        if (home) pin(home, homeLabel || 'The home', { className: 'nm-dot--home', size: 24, color: 'var(--t-accT, #1b6b5a)', home: true });
        for (const place of places) {
          const point = pointOf(place);
          if (point) pin(point, place.name, { size: 18, color: placeColor(place.category) });
        }
        if (bounds.length === 1) map.setView(bounds[0], 14);
        else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => { gone = true; if (map) map.remove(); };
    // The map is rebuilt when the pins change, not on every render.
  }, [homeKey, placesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  // The key: only the kinds of place that are on this map.
  const kinds = HIGHLIGHT_CATEGORIES.filter((c) => places.some((p) => p.category === c.k && pointOf(p)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        ref={box} role="region" aria-label="Map of the home and nearby places"
        style={{ height, borderRadius: 'var(--t-radlg, 14px)', overflow: 'hidden', border: '1px solid var(--t-line, #ddd)', background: 'var(--t-tint, #eef1f4)' }}
      />
      {kinds.length ? (
        <ul className="nm-key" aria-label="Map key" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5 }}>
          {home ? <li style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="nm-dot nm-dot--key nm-dot--home" style={{ background: 'var(--t-accT, #1b6b5a)' }} />The home</li> : null}
          {kinds.map((c) => (
            <li key={c.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="nm-dot nm-dot--key" style={{ background: placeColor(c.k) }} />{c.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
