import { useNavigate, useParams } from 'react-router-dom';

import { Star } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';

export default function Explore() {
  const { homes, lead, toggleSave, track } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h3 className="b-head" style={{ margin: '0 0 12px', fontSize: 22 }}>Explore Homes</h3>
      {homes.length === 0 ? (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>
          Homes for this community are being added — check back soon.
        </p>
      ) : null}
      <div className="b-stack" style={{ gap: 14 }}>
        {homes.map((home) => {
          const saved = lead?.savedHomeIds?.includes(home.id);
          return (
            <div
              key={home.id}
              onClick={() => {
                track(`Viewed ${home.name} (${home.photos.length} photos)`);
                navigate(`/c/${communityId}/homes/${home.id}`);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate(`/c/${communityId}/homes/${home.id}`);
              }}
              className="b-card"
              style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
            >
              <button
                type="button"
                aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
                aria-pressed={saved}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSave(home);
                }}
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 2, width: 44, height: 44,
                  borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: saved ? 'var(--t-acc)' : 'var(--t-bg)',
                  color: saved ? 'var(--t-onacc)' : 'var(--t-acc)',
                  boxShadow: '0 2px 8px rgba(0,0,0,.18)',
                }}
              >
                <Star filled={saved} />
              </button>
              <div style={{ height: 130, margin: -1, marginBottom: 0 }}>
                <Photo photo={home.photos[0]} label={`${home.name} photo`} alt={home.name} />
              </div>
              <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="b-head" style={{ fontSize: 18 }}>{home.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{money(home.price)}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
                  {homeMeta(home)} · {home.availability}
                </span>
                {home.photos.length > 1 ? (
                  <span style={{ fontSize: 11, color: 'var(--t-mut)' }}>{home.photos.length} photos</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
