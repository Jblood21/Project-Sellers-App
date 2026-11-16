import { useEffect, useRef, useState } from 'react';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { placeColor, pointOf } from '@shared/neighborhood.js';

const MILES_FAR = 12;
const miles = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

/**
 * A map of the home and the places around it, from OpenStreetMap (free, no key, with its credit shown).
 * Leaflet and its tiles load only when this is drawn, so a visitor who never opens the Neighborhood screen
 * never downloads them. Names are agent-typed text, so they go into the popups as text, never as markup.
 */
export default function NeighborhoodMap({ home, homeLabel, places = [], height = 280, numbered = false, labels = true, focusId = null, showKey = true }) {
  const box = useRef(null);
  const markers = useRef(new Map());
  const mapRef = useRef(null);
  const homeMarker = useRef(null);
  const [failed, setFailed] = useState(false);
  const homeKey = home ? `${home.lat},${home.lng}` : '';
  const placesKey = places.map((p) => `${p.id}:${p.lat},${p.lng}:${p.n ?? ''}`).join('|') + (numbered ? '#' : '') + (labels ? 'L' : '');

  useEffect(() => {
    let map = null;
    let gone = false;
    (async () => {
      try {
        const [leaflet] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        const L = leaflet.default ?? leaflet;
        if (gone || !box.current) return;
        map = L.map(box.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
        mapRef.current = map;
        markers.current = new Map();
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);
        const bounds = [];
        const near = []; // what the map is fitted to: places far from the home (a ski resort) stay on the map but off the first view
        // A coloured dot for each place with its name over it. The colour is the kind of place (see the key under the map).
        const homePoint = home;
        const pin = (point, label, { className = '', size, color, home = false, n = null, id = null }) => {
          const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({
              className: 'nm-icon',
              html: `<span class="nm-dot ${className}${n ? ' nm-dot--num' : ''}" style="background:${color}">${n ? Number(n) : ''}</span>`,
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
          if (labels) marker.bindTooltip(tag, { permanent: true, direction: 'top', offset: [0, -size / 2 - 2], className: `nm-label${home ? ' nm-label--home' : ''}`, opacity: 1 });
          if (id) markers.current.set(id, marker);
          if (home) homeMarker.current = marker;
          const text = document.createElement('div');
          text.style.fontWeight = '600';
          text.textContent = label;
          marker.bindPopup(text);
          bounds.push([point.lat, point.lng]);
          if (home || !homePoint || miles(homePoint, point) <= MILES_FAR) near.push([point.lat, point.lng]);
        };
        if (home) pin(home, homeLabel || 'The home', { className: 'nm-dot--home', size: 24, color: 'var(--t-accT, #1b6b5a)', home: true });
        for (const place of places) {
          const point = pointOf(place);
          if (point) pin(point, place.name, { size: numbered ? 24 : 18, color: placeColor(place.category), n: numbered ? place.n : null, id: place.id });
        }
        const fit = near.length ? near : bounds;
        if (fit.length === 1) map.setView(fit[0], 14);
        else map.fitBounds(fit, { paddingTopLeft: [76, 56], paddingBottomRight: [64, 34], maxZoom: 15 });

        // Names that would sit on top of each other are not all drawn: the home first, then the others in turn. The rest
        // show when the map is zoomed in or the dot is tapped.
        const tidy = () => {
          if (gone) return;
          const taken = [];
          const order = [...markers.current.values()];
          if (homeMarker.current) order.unshift(homeMarker.current);
          for (const marker of order) {
            const el = marker.getTooltip()?.getElement();
            if (!el) continue;
            el.classList.remove('nm-label--off');
            const r = el.getBoundingClientRect();
            const clash = taken.some((t) => r.left < t.right + 3 && r.right > t.left - 3 && r.top < t.bottom + 2 && r.bottom > t.top - 2);
            if (clash) el.classList.add('nm-label--off');
            else taken.push(r);
          }
        };
        map.on('zoomend moveend', tidy);
        setTimeout(tidy, 60);
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => { gone = true; mapRef.current = null; if (map) map.remove(); };
    // The map is rebuilt when the pins change, not on every render.
  }, [homeKey, placesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A place picked in the list: the map moves to it and opens its name.
  useEffect(() => {
    const marker = focusId ? markers.current.get(focusId) : null;
    if (!marker || !mapRef.current) return;
    mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 15), { animate: true });
    marker.openPopup();
  }, [focusId]);

  if (failed) return null;
  // The key: only the kinds of place that are on this map.
  const kinds = HIGHLIGHT_CATEGORIES.filter((c) => places.some((p) => p.category === c.k && pointOf(p)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        ref={box} role="region" aria-label="Map of the home and nearby places"
        style={{ height, borderRadius: 'var(--t-radlg, 14px)', overflow: 'hidden', border: '1px solid var(--t-line, #ddd)', background: 'var(--t-tint, #eef1f4)' }}
      />
      {showKey && kinds.length ? (
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
