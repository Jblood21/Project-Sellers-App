import { useNavigate, useParams } from 'react-router-dom';

import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';

export default function Saved() {
  const { homes, lead } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  const saved = (lead?.savedHomeIds ?? []).map((id) => homes.find((h) => h.id === id)).filter(Boolean);

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h3 className="b-head" style={{ margin: '0 0 12px', fontSize: 22 }}>Homes I Like</h3>
      {saved.length === 0 ? (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>
          Nothing saved yet — tap the star on any home you like.
        </p>
      ) : null}
      <div className="b-stack" style={{ gap: 10 }}>
        {saved.map((home) => (
          <button
            key={home.id}
            type="button"
            onClick={() => navigate(`/c/${communityId}/homes/${home.id}`)}
            className="b-card"
            style={{
              cursor: 'pointer', padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: 10, textAlign: 'left', color: 'var(--t-ink)',
            }}
          >
            <span className="b-stack">
              <span className="b-head" style={{ fontSize: 16 }}>★ {home.name}</span>
              <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>{homeMeta(home)}</span>
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{money(home.price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
