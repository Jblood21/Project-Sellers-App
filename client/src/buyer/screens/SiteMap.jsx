import { useState } from 'react';

import Photo from '../../components/Photo.jsx';
import { money } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';

/**
 * The plat drawing, plus the lots that have a home on them. Buyers standing at a
 * sign ask "which one is that?" before they ask anything about financing.
 */
export default function SiteMap() {
  const { community, homes } = useBuyer();
  const [zoomed, setZoomed] = useState(false);
  const lots = homes.filter((home) => home.lotNumber);

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h2 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>Site Map</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        Where the homes sit in {community?.name}. Tap the map to open it larger.
      </p>

      <button
        type="button"
        onClick={() => setZoomed((z) => !z)}
        aria-label={zoomed ? 'Shrink the site map' : 'Enlarge the site map'}
        style={{
          width: '100%', padding: 0, border: '1px solid var(--t-line)', cursor: 'zoom-in',
          borderRadius: 'var(--t-radlg)', overflow: 'hidden', background: 'var(--t-sur)',
          marginBottom: 18,
        }}
      >
        <div style={{ height: zoomed ? 520 : 240 }}>
          <Photo
            photo={community?.siteMap ? { url: community.siteMap } : null}
            label="Site map coming soon"
            alt={`${community?.name} site map`}
            fit={zoomed ? 'contain' : 'cover'}
          />
        </div>
      </button>

      {lots.length ? (
        <>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 10 }}>Lots with a home on them</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lots.map((home) => (
              <div
                key={home.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                  background: 'var(--t-sur)', border: '1px solid var(--t-line)',
                  borderRadius: 'var(--t-rad)', padding: '10px 14px', fontSize: 13.5,
                }}
              >
                <span>
                  <strong style={{ color: 'var(--t-acc)' }}>{home.lotNumber}</strong>
                  <span style={{ color: 'var(--t-mut)' }}> · {home.name}</span>
                </span>
                <span style={{ flex: 'none', fontWeight: 700 }}>{money(home.price)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
