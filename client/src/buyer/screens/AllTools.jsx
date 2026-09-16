import { Link, useNavigate, useParams } from 'react-router-dom';

import { TOOLS } from '@shared/domain.js';
import Photo from '../../components/Photo.jsx';
import { firstName } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { planProgress } from '../progress.js';

/** The buyer's home screen: progress, the homes banner, and the enabled tools. */
export default function AllTools() {
  const { community, homes, lead, track } = useBuyer();
  const { communityId } = useParams();
  const navigate = useNavigate();
  const progress = planProgress(lead, communityId);
  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h2 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>
        Hi {firstName(lead?.name)} — can you buy one of these?
      </h2>
      <p style={{ margin: '0 0 16px', color: 'var(--t-mut)', fontSize: 13 }}>
        Answer a few natural questions and find out. Everything you do saves to your home plan.
      </p>

      <div
        style={{
          background: 'var(--t-tint)', borderRadius: 'var(--t-radlg)', padding: 16,
          marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="b-head" style={{ fontSize: 15 }}>Your home plan</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-acc)' }}>{progress.percent}% complete</span>
        </div>
        <div className="b-bar"><span style={{ width: `${progress.percent}%` }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--t-mut)' }}>Next: {progress.nextLabel}</span>
          <button
            type="button"
            onClick={() => navigate(progress.nextTo)}
            style={{
              flex: 'none', minHeight: 36, padding: '0 16px', borderRadius: 'var(--t-radbtn)',
              border: 'none', background: 'var(--t-acc)', color: 'var(--t-onacc)',
              fontFamily: 'var(--t-font)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Go
          </button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Explore homes"
        onKeyDown={(event) => event.key === 'Enter' && navigate(`/c/${communityId}/explore`)}
        onClick={() => {
          track('Browsed Explore Homes');
          navigate(`/c/${communityId}/explore`);
        }}
        style={{
          width: '100%', cursor: 'pointer', borderRadius: 'var(--t-radlg)',
          overflow: 'hidden', position: 'relative', marginBottom: 12, border: '1px solid var(--t-line)',
        }}
      >
        <div style={{ height: 120 }}>
          <Photo photo={community?.heroPhoto ? { url: community.heroPhoto } : null} label="" />
        </div>
        <div
          style={{
            position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 30%,rgba(10,14,10,.72))',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start',
            padding: '14px 16px',
          }}
        >
          <span className="b-head" style={{ color: '#fff', fontSize: 19 }}>Explore Homes</span>
          <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 12 }}>
            {homes.length} homes available · save the ones you like
          </span>
        </div>
      </div>

      {community?.highlights?.length ? (
        <button
          type="button"
          onClick={() => {
            track('Browsed Around Here');
            navigate(`/c/${communityId}/area`);
          }}
          style={{
            width: '100%', cursor: 'pointer', marginBottom: 12, textAlign: 'left',
            background: 'var(--t-tint)', border: '1px solid var(--t-line)',
            borderRadius: 'var(--t-radlg)', padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            color: 'var(--t-ink)', fontFamily: 'var(--t-font)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="b-head" style={{ fontSize: 16 }}>Around Here</span>
            <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
              Schools, parks and everyday places nearby
            </span>
          </span>
          <span style={{ flex: 'none', color: 'var(--t-acc)', fontSize: 18 }}>›</span>
        </button>
      ) : null}

      {community?.features?.siteMap && community?.siteMap ? (
        <button
          type="button"
          onClick={() => {
            track('Opened the site map');
            navigate(`/c/${communityId}/map`);
          }}
          style={{
            width: '100%', cursor: 'pointer', marginBottom: 12, textAlign: 'left',
            background: 'var(--t-tint)', border: '1px solid var(--t-line)',
            borderRadius: 'var(--t-radlg)', padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            color: 'var(--t-ink)', fontFamily: 'var(--t-font)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="b-head" style={{ fontSize: 16 }}>Site Map</span>
            <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
              See where each home sits
            </span>
          </span>
          <span style={{ flex: 'none', color: 'var(--t-acc)', fontSize: 18 }}>›</span>
        </button>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {enabled.map((tool) => (
          <button
            key={tool.k}
            type="button"
            onClick={() => {
              track(`Opened ${tool.name}`);
              navigate(`/c/${communityId}/tool/${tool.k}`);
            }}
            style={{
              cursor: 'pointer', background: 'var(--t-sur)', border: '1px solid var(--t-line)',
              borderRadius: 'var(--t-radlg)', padding: 14, display: 'flex', flexDirection: 'column',
              gap: 6, minHeight: 96, textAlign: 'left', color: 'var(--t-ink)',
            }}
          >
            {lead?.plan?.[tool.k] ? (
              <span
                style={{
                  alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
                  color: 'var(--t-acc2)', textTransform: 'uppercase',
                }}
              >
                ✓ In your plan
              </span>
            ) : null}
            <span className="b-head" style={{ fontSize: 15, lineHeight: 1.2 }}>{tool.name}</span>
            <span style={{ fontSize: 11, color: 'var(--t-mut)', lineHeight: 1.4 }}>{tool.q}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Link
          to={`/c/${communityId}/saved`}
          className="b-btn b-btn-outline"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', minHeight: 46 }}
        >
          ★ Homes I Like · {lead?.savedHomeIds?.length ?? 0}
        </Link>
        <Link
          to={`/c/${communityId}/plan`}
          className="b-btn"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', minHeight: 46 }}
        >
          My Home Plan
        </Link>
      </div>
    </div>
  );
}
