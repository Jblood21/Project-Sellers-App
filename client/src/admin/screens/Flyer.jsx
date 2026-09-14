import { useNavigate, useParams } from 'react-router-dom';

import { ChevronLeft } from '../../components/Icons.jsx';
import { buyerUrl, useQrDataUrl } from './QrDialog.jsx';

/** A print-ready sign for the development entrance or sales trailer. */
export default function Flyer({ community }) {
  const navigate = useNavigate();
  const { communityId } = useParams();
  const dataUrl = useQrDataUrl(communityId, 8);

  return (
    <div className="a-shell">
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button
          type="button" className="btn btn-secondary btn-icon" aria-label="Back"
          onClick={() => navigate(`/admin/communities/${communityId}`)}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 style={{ margin: 0, fontSize: 20, flex: 1 }}>QR sign</h3>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>

      <div
        id="plan-doc"
        style={{
          background: '#fff', borderRadius: 14, padding: '40px 32px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          boxShadow: '0 2px 14px rgba(0,0,0,.08)',
        }}
      >
        {community.builder ? <span className="card-kicker">{community.builder}</span> : null}
        <h3 style={{ margin: '4px 0 0', fontSize: 30 }}>{community.name}</h3>
        <span className="text-muted" style={{ fontSize: 14 }}>{community.location}</span>
        <div style={{ padding: '18px 0' }}>
          {dataUrl ? (
            <img
              src={dataUrl} alt={`QR code for ${community.name}`} width={220} height={220}
              style={{ display: 'block', imageRendering: 'pixelated', borderRadius: 10 }}
            />
          ) : null}
        </div>
        <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{buyerUrl(community.id)}</span>
        <p className="text-muted" style={{ fontSize: 14, maxWidth: 420, lineHeight: 1.6, margin: '8px 0 0' }}>
          Scan to explore every home, see what it would cost you and build your own home plan.
        </p>
      </div>
      <p className="text-muted no-print" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 14 }}>
        Print-ready — post it on the development sign or sales trailer.
      </p>
    </div>
  );
}
