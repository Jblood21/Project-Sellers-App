import { Link, useNavigate, useParams } from 'react-router-dom';

import { LENDER, LENDER_LOGO, lenderReady, TOOLS, videoEmbed } from '@shared/domain.js';
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
export default function AllTools({ onOpenLender }) {
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
        <section style={{ marginTop: 22, marginBottom: 14 }}>
          {/* The rule is what tells a buyer the tools have ended and something
              else has begun — the grid above it otherwise runs straight into
              this list. aria-hidden because the heading already says so. */}
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <span
            className="b-lbl"
            style={{ display: 'block', marginBottom: 12, color: 'var(--t-accT)' }}
          >
            Worth knowing
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {resources.map((item) => {
              // An uploaded file plays in the page; a link plays in its frame.
              // A video row with neither is a builder's half-finished edit, and
              // an empty black box is worse than nothing.
              const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
              if (item.kind === 'video' && !embed && !item.videoUrl) return null;
              const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
              // A title the builder never wrote a body under: the bubble would
              // be an empty box, so the title stands on its own instead.
              const boxed = Boolean(item.videoUrl || embed || body);
              return (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Outside the bubble and in the accent: the title is what a
                      buyer scans the section by, and a heading sitting on the
                      page reads faster than one boxed in with its own text. */}
                  <h3
                    className="b-head"
                    style={{ fontSize: 16.5, lineHeight: 1.25, color: 'var(--t-accT)' }}
                  >
                    {item.title}
                  </h3>
                  {boxed ? (
                    <article
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
                      {body ? (
                        <p
                          style={{
                            margin: 0, padding: 14, fontSize: 13.5, lineHeight: 1.6,
                            color: 'var(--t-mut)', whiteSpace: 'pre-wrap',
                          }}
                        >
                          {body}
                        </p>
                      ) : null}
                    </article>
                  ) : null}
                </div>
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

      <LenderCard
        onOpen={() => {
          track(`Tapped ${LENDER.name}`);
          onOpenLender?.();
        }}
      />
    </div>
  );
}

/** The Equal Housing Opportunity mark: a house with an equals sign in it. */
function EqualHousing({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3 2.5 10.2h2.2V20h14.6v-9.8h2.2L12 3Zm0 2.6 6.1 4.6V18H5.9v-7.8L12 5.6Z"
        fill="currentColor"
      />
      <path d="M8.2 11.4h7.6v1.7H8.2zM8.2 14.6h7.6v1.7H8.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * The lender at the foot of the screen.
 *
 * Last on the page, below the buyer's own plan and saved homes, because it is
 * an advertisement and they came here for the calculators. Tapping it opens the
 * same appointment sheet everything else uses -- one place to book, and the
 * request arrives tagged so whoever reads it knows to bring a loan officer.
 *
 * Renders nothing at all until LENDER carries a real NMLS ID. A half-filled
 * block is a non-compliant mortgage ad, and showing nothing is the safe way for
 * this to fail.
 */
function LenderCard({ onOpen }) {
  if (!lenderReady()) return null;

  return (
    <section style={{ marginTop: 26 }}>
      <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
      <span className="b-lbl" style={{ display: 'block', marginBottom: 10, color: 'var(--t-accT)' }}>
        Financing
      </span>

      <div
        style={{
          background: 'var(--t-tint)', border: '1px solid var(--t-line)',
          borderRadius: 'var(--t-radlg)', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {LENDER_LOGO ? (
          <img
            src={LENDER_LOGO}
            alt={LENDER.name}
            style={{ height: 34, alignSelf: 'flex-start', objectFit: 'contain' }}
          />
        ) : (
          <span className="b-head" style={{ fontSize: 18, lineHeight: 1.2 }}>{LENDER.name}</span>
        )}

        {LENDER.tagline ? (
          <span style={{ fontSize: 13, color: 'var(--t-mut)', lineHeight: 1.5 }}>{LENDER.tagline}</span>
        ) : null}

        <button type="button" className="b-btn" onClick={onOpen} style={{ minHeight: 46 }}>
          Set up a time to talk
        </button>

        {/*
          The licence number and the Equal Housing mark are part of the
          advertisement, not decoration under it -- which is why they sit inside
          the card rather than in a footer somebody might drop later.
        */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2,
            color: 'var(--t-mut)', fontSize: 10.5, lineHeight: 1.45,
          }}
        >
          <span style={{ flex: 'none', color: 'var(--t-mut)' }}><EqualHousing /></span>
          <span>
            {LENDER.name} · NMLS #{LENDER.nmls}
            {LENDER.loName && LENDER.loNmls ? ` · ${LENDER.loName}, NMLS #${LENDER.loNmls}` : ''}
            {LENDER.phone ? ` · ${LENDER.phone}` : ''}
            <br />
            Equal Housing Lender. Not a commitment to lend. You are free to choose any lender.
          </span>
        </div>
      </div>
    </section>
  );
}
