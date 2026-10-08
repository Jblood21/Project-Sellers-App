import { Link, useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';
import CommunityMark from '../CommunityMark.jsx';
import { layoutTraits } from '../layouts/index.js';

/** What a buyer sees straight off the QR code on the development sign. */
export default function Landing() {
  const { community, lead, features, guides, layout } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  const enterApp = () => navigate(lead ? `/c/${communityId}/tools` : `/c/${communityId}/start`);

  return (
    <div className="b-shell b-stack b-landing" style={{ minHeight: '100vh', paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
      {/* Only when a logo was uploaded: with none, the name below is the mark. */}
      {community?.logo || community?.logoLight ? (
        <div style={{ marginBottom: 14 }}>
          {/* The ground is the layout's: Salt Grass's landing is dark, so it takes the logo made for dark grounds. */}
          <CommunityMark tone={layoutTraits(layout).headerTone} height={44} fallback="none" />
        </div>
      ) : null}
      <div style={{ height: 190, borderRadius: 'var(--t-radlg)', overflow: 'hidden', marginBottom: 20 }}>
        <Photo
          photo={community?.heroPhoto ? { url: community.heroPhoto } : null}
          label={`${community?.name} community photo`}
          alt={`${community?.name} community photo`}
        />
      </div>
      <span className="b-lbl" style={{ color: 'var(--t-accT)' }}>You scanned the sign at</span>
      <h1
        className="b-head"
        style={{ margin: '4px 0 2px', fontSize: 34 }}
        data-punct={/[.?!]$/.test(community?.name ?? '') || undefined}
      >
        {community?.name}
      </h1>
      <p style={{ margin: '0 0 22px', color: 'var(--t-mut)', fontSize: 14 }}>
        {community?.location}
        {community?.builder ? ` · by ${community.builder}` : ''}
      </p>
      <div className="b-stack" style={{ gap: 10 }}>
        <button type="button" className="b-btn" onClick={enterApp} style={{ minHeight: 52, fontSize: 16 }}>
          Open the Homebuyer App
        </button>
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
        The app helps you explore homes, see what one would cost you, find financing that fits and build your own
        move-in plan — free, no sign-in.
      </p>
      {/* The guides need no sign-in, so the front door is where they are offered. */}
      {features.guides && guides.length ? (
        <Link
          to={`/c/${communityId}/guides`}
          style={{
            display: 'flex', alignItems: 'center', minHeight: 44, marginTop: 4,
            color: 'var(--t-accT)', fontSize: 14, fontWeight: 600,
          }}
        >
          Read the buyer guides
        </Link>
      ) : null}
    </div>
  );
}
