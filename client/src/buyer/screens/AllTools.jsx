import { Link, useNavigate, useParams } from 'react-router-dom';

import { TOOLS, videoEmbed } from '@shared/domain.js';
import Photo from '../../components/Photo.jsx';
import { firstName } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';

/**
 * The two questions a buyer asks before any other, so they lead rather than
 * sitting in a grid of seven: what can I afford, and can I get help with the
 * down payment. Everything else is a follow-up to one of these.
 */
const LEAD_TOOLS = ['afford', 'dpa'];

/** The buyer's home screen: the two lead questions, the homes banner, the tools. */
export default function AllTools() {
  const { community, homes, lead, track } = useBuyer();
  const { communityId } = useParams();
  const navigate = useNavigate();
  const here = { from: `/c/${communityId}/tools` };
  const openTool = (tool) => {
    track(`Opened ${tool.name}`);
    navigate(`/c/${communityId}/tool/${tool.k}`, { state: here });
  };
  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);
  // The server sends an empty list when the builder has this switched off, so
  // its length is the only condition worth checking.
  const resources = community?.resources ?? [];
  const lead2 = enabled.filter((tool) => LEAD_TOOLS.includes(tool.k));
  const rest = enabled.filter((tool) => !LEAD_TOOLS.includes(tool.k));

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h2 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>
        Hi {firstName(lead?.name)} — can you buy one of these?
      </h2>
      <p style={{ margin: '0 0 16px', color: 'var(--t-mut)', fontSize: 13 }}>
        Answer a few natural questions and find out. Everything you do saves to your home plan.
      </p>

      {lead2.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: lead2.length > 1 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18 }}>
          {lead2.map((tool) => (
            <button
              key={tool.k}
              type="button"
              onClick={() => openTool(tool)}
              style={{
                cursor: 'pointer', background: 'var(--t-tint)', border: '1px solid var(--t-line)',
                borderRadius: 'var(--t-radlg)', padding: 16, display: 'flex', flexDirection: 'column',
                gap: 6, minHeight: 104, textAlign: 'left', color: 'var(--t-ink)',
                fontFamily: 'var(--t-font)',
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
              <span className="b-head" style={{ fontSize: 16, lineHeight: 1.2 }}>{tool.name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--t-mut)', lineHeight: 1.4 }}>{tool.q}</span>
            </button>
          ))}
        </div>
      ) : null}

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
            track('Browsed Local Spots');
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
            <span className="b-head" style={{ fontSize: 16 }}>Local Spots</span>
            <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
              Schools, parks and everyday places nearby
            </span>
          </span>
          <span style={{ flex: 'none', color: 'var(--t-accT)', fontSize: 18 }}>›</span>
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
          <span style={{ flex: 'none', color: 'var(--t-accT)', fontSize: 18 }}>›</span>
        </button>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {rest.map((tool) => (
          <button
            key={tool.k}
            type="button"
            onClick={() => openTool(tool)}
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

      {/*
        Below the tools on purpose. A buyer came here to find out what they can
        afford; this answers what comes after that, so it sits after it. Videos
        are lazy so a section nobody scrolls to costs nobody anything.
      */}
      {resources.length ? (
        <section style={{ marginTop: 20, marginBottom: 14 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 10 }}>Worth knowing</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resources.map((item) => {
              // An uploaded file plays in the page; a link plays in its frame.
              // A video row with neither is a builder's half-finished edit, and
              // an empty black box is worse than nothing.
              const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
              if (item.kind === 'video' && !embed && !item.videoUrl) return null;
              return (
                <article
                  key={item.id}
                  style={{
                    background: 'var(--t-sur)', border: '1px solid var(--t-line)',
                    borderRadius: 'var(--t-radlg)', overflow: 'hidden',
                  }}
                >
                  {item.videoUrl ? (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      src={item.videoUrl}
                      controls
                      playsInline
                      // metadata, not auto: the poster frame and the duration
                      // are enough to decide to watch, and a buyer on mobile
                      // data should not pay for a clip they scroll past.
                      preload="metadata"
                      style={{ width: '100%', display: 'block', background: '#000' }}
                    />
                  ) : embed ? (
                    <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                      <iframe
                        src={embed}
                        title={item.title}
                        loading="lazy"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  ) : null}
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="b-head" style={{ fontSize: 16, lineHeight: 1.25 }}>{item.title}</span>
                    {item.kind === 'article' && item.body ? (
                      <p
                        style={{
                          margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--t-mut)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {item.body}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

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
