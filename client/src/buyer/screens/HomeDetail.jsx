import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { ToolSheet } from '../tools/index.jsx';
import ImageViewer from '../ImageViewer.jsx';

export default function HomeDetail({ onOpenTour }) {
  // Which plan the viewer is showing; null means closed.
  const [planIndex, setPlanIndex] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { homes, lead, toggleSave, track, setTool } = useBuyer();
  const { communityId, homeId } = useParams();
  const navigate = useNavigate();

  const home = homes.find((h) => h.id === homeId);
  if (!home) return <Navigate to={`/c/${communityId}/explore`} replace />;

  const saved = lead?.savedHomeIds?.includes(home.id);
  const photos = home.photos.length ? home.photos : [null];

  return (
    <div className="b-shell" style={{ paddingTop: 16 }}>
      <div
        className="scroll-x"
        style={{
          display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory',
          margin: '0 -20px 6px', padding: '0 20px',
        }}
      >
        {photos.map((photo, index) => (
          <div
            key={photo?.id ?? index}
            style={{
              width: 'min(318px, 80vw)', height: 200, flex: 'none',
              borderRadius: 'var(--t-radlg)', overflow: 'hidden', scrollSnapAlign: 'center',
            }}
          >
            <Photo photo={photo} label={`${home.name} — photo ${index + 1}`} alt={`${home.name} photo ${index + 1}`} />
          </div>
        ))}
      </div>
      {home.photos.length > 1 ? (
        <p style={{ fontSize: 11, color: 'var(--t-mut)', margin: '0 0 12px' }}>
          {home.photos.length} photos · swipe to browse
        </p>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <h3 className="b-head" style={{ fontSize: 24 }}>{home.name}</h3>
        <span style={{ fontWeight: 700, fontSize: 19 }}>{money(home.price)}</span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--t-mut)' }}>
        {homeMeta(home)} · {home.availability}
        {home.lotNumber ? ` · ${home.lotNumber}` : ''}
      </span>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '12px 0 16px' }}>{home.description}</p>

      {/*
        Under the description rather than in the photo strip: a buyer swiping
        photos is scanning, and a video is a decision to stop and watch. It sits
        where they have already decided this home is worth reading about.
      */}
      {home.videoUrl ? (
        <div style={{ marginBottom: 16 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 8, color: 'var(--t-accT)' }}>
            Walk through this home
          </span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={home.videoUrl}
            controls
            playsInline
            // metadata, not auto: the first frame and the length are enough to
            // decide to watch, and a buyer on mobile data should not pay for a
            // clip they scrolled past.
            preload="metadata"
            style={{
              width: '100%', display: 'block', background: '#000',
              borderRadius: 'var(--t-radlg)',
            }}
          />
        </div>
      ) : null}

      {home.floorPlans?.length ? (
        <div style={{ marginBottom: 16 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 8 }}>Floor plans</span>
          <div className="scroll-x" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {home.floorPlans.map((plan, index) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanIndex(index)}
                aria-label={`Open ${home.name} floor plan ${index + 1}`}
                style={{
                  flex: 'none', width: 150, height: 150, borderRadius: 'var(--t-rad)',
                  overflow: 'hidden', border: '1px solid var(--t-line)', background: '#fff',
                  display: 'block', padding: 0, cursor: 'pointer',
                }}
              >
                <Photo photo={plan} alt={`${home.name} floor plan ${index + 1}`} fit="contain" />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--t-mut)' }}>Tap a plan to see it full size.</span>
        </div>
      ) : null}

      <div className="b-stack" style={{ gap: 10 }}>
        <button
          type="button"
          className="b-btn"
          style={{ minHeight: 50 }}
          onClick={() => {
            setTool('pay', { homeId: home.id });
            track(`Opened payment for ${home.name}`);
            setPaymentOpen(true);
          }}
        >
          See My Payment for This Home
        </button>
        <button
          type="button"
          className="b-btn b-btn-outline"
          onClick={() => toggleSave(home)}
          style={saved ? { background: 'var(--t-acc)', color: 'var(--t-onacc)' } : undefined}
        >
          {saved ? '★ Saved to Homes I Like' : '☆ Save to Homes I Like'}
        </button>
        <button type="button" className="b-btn b-btn-outline" onClick={onOpenTour} style={{ minHeight: 44 }}>
          Talk to the team · tour or call
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--t-mut)', textAlign: 'center', margin: '10px 0 0' }}>
        Saving a home adds it to Homes I Like and tells the team you&apos;re interested.
      </p>
    <ToolSheet
      open={paymentOpen}
      toolKey="payment"
      label="See My Payment"
      onClose={() => setPaymentOpen(false)}
    />
    <ImageViewer
        images={home.floorPlans ?? []}
        index={planIndex}
        onIndex={setPlanIndex}
        onClose={() => setPlanIndex(null)}
        label={`${home.name} floor plan`}
      />
    </div>
  );
}
