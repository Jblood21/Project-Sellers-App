import { useState } from 'react';

import Photo from '../../components/Photo.jsx';
import { money } from '@shared/domain.js';
import { useBuyer } from '../BuyerContext.jsx';
import ImageViewer from '../ImageViewer.jsx';

/**
 * The plat drawing, plus the lots that have a home on them. Buyers standing at a
 * sign ask "which one is that?" before they ask anything about financing.
 */
export default function SiteMap() {
  const { community, homes } = useBuyer();
  // Same viewer the floor plans use. Growing the map in place topped out at
  // whatever fits the page, which is not enough to read a plat on a phone.
  const [open, setOpen] = useState(false);
  const lots = homes.filter((home) => home.lotNumber);
  const map = community?.siteMap ? [{ id: 'map', url: community.siteMap }] : [];

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h2 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>Site Map</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        Where the homes sit in {community?.name}.{map.length ? ' Tap it to open it full screen.' : ''}
      </p>

      <button
        type="button"
        onClick={() => map.length && setOpen(true)}
        disabled={!map.length}
        aria-label="Open the site map full screen"
        style={{
          width: '100%', padding: 0, border: '1px solid var(--t-line)',
          cursor: map.length ? 'zoom-in' : 'default',
          borderRadius: 'var(--t-radlg)', overflow: 'hidden', background: 'var(--t-sur)',
          marginBottom: 18,
        }}
      >
        <div style={{ height: 240 }}>
          <Photo
            photo={map[0] ?? null}
            label="Site map coming soon"
            alt={`${community?.name} site map`}
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
                  <strong style={{ color: 'var(--t-accT)' }}>{home.lotNumber}</strong>
                  <span style={{ color: 'var(--t-mut)' }}> · {home.name}</span>
                </span>
                <span style={{ flex: 'none', fontWeight: 700 }}>{money(home.price)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    <ImageViewer
        images={map}
        index={open ? 0 : null}
        onClose={() => setOpen(false)}
        label={`${community?.name} site map`}
      />
    </div>
  );
}
