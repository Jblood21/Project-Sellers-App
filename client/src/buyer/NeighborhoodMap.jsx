import { useEffect, useRef, useState } from 'react';

import { pointOf } from '@shared/neighborhood.js';

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
        const pin = (point, label, className, size) => {
          const marker = L.marker([point.lat, point.lng], {
            icon: L.divIcon({ className: `nm-pin ${className}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
            title: label,
            keyboard: true,
          }).addTo(map);
          const text = document.createElement('div');
          text.style.fontWeight = '600';
          text.textContent = label;
          marker.bindPopup(text);
          bounds.push([point.lat, point.lng]);
        };
        if (home) pin(home, homeLabel || 'The home', 'nm-pin--home', 22);
        for (const place of places) {
          const point = pointOf(place);
          if (point) pin(point, place.name, 'nm-pin--place', 16);
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
  return (
    <div
      ref={box} role="region" aria-label="Map of the home and nearby places"
      style={{ height, borderRadius: 'var(--t-radlg, 14px)', overflow: 'hidden', border: '1px solid var(--t-line, #ddd)', background: 'var(--t-tint, #eef1f4)' }}
    />
  );
}
