import { Navigate, useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';

export default function HomeDetail({ onOpenTour }) {
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
      <span style={{ fontSize: 13, color: 'var(--t-mut)' }}>{homeMeta(home)} · {home.availability}</span>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '12px 0 16px' }}>{home.description}</p>

      <div className="b-stack" style={{ gap: 10 }}>
        <button
          type="button"
          className="b-btn"
          style={{ minHeight: 50 }}
          onClick={() => {
            setTool('pay', { homeId: home.id });
            track(`Opened payment for ${home.name}`);
            navigate(`/c/${communityId}/tool/payment`);
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
    </div>
  );
}
