import { Link, useNavigate, useParams } from 'react-router-dom';

import { HOME_GUIDES, TOOLS, videoEmbed } from '@shared/domain.js';
import { complianceOf } from '@shared/compliance.js';
import Photo from '../../components/Photo.jsx';
import { firstName } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { telHref } from '@shared/compliance.js';
import LenderLogo, { EhlMark } from '../LenderLogo.jsx';
import { layoutFor } from '../layouts/index.js';
import { GuideCard } from './Guides.jsx';

/**
 * The two questions a buyer asks before any other, so they lead rather than
 * sitting in a grid of seven: what can I afford, and can I get down payment
 * help. Everything else is a follow-up to one of these.
 */
const LEAD_TOOLS = ['afford', 'dpa'];

/**
 * Everything the tools home needs: the data, and what each tap does.
 *
 * A layout may replace the home screen's markup entirely, and the one thing it
 * must not change is what a tap does. So the data and the handlers live here,
 * once, and a layout's Home receives them as `model` and decides only where to
 * put them and how they look.
 */
export function useHomeModel({ onOpenLender } = {}) {
  const { community, homes, lead, track, features, guides, agents } = useBuyer();
  const { communityId } = useParams();
  const navigate = useNavigate();
  const base = `/c/${communityId}`;
  const here = { from: `${base}/tools` };

  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);

  return {
    community,
    communityId,
    homesCount: homes.length,
    firstName: firstName(lead?.name),
    savedCount: lead?.savedHomeIds?.length ?? 0,
    inPlan: (toolKey) => Boolean(lead?.plan?.[toolKey]),
    leadTools: enabled.filter((tool) => LEAD_TOOLS.includes(tool.k)),
    otherTools: enabled.filter((tool) => !LEAD_TOOLS.includes(tool.k)),
    hasSpots: Boolean(community?.highlights?.length),
    hasMap: Boolean(community?.features?.siteMap && community?.siteMap),
    // The server sends an empty list when the builder has this switched off, so
    // its length is the only condition worth checking.
    resources: community?.resources ?? [],
    showGuides: Boolean(features.guides && guides.length),
    guides,
    featuredGuides: guides.slice(0, HOME_GUIDES),
    showAgents: Boolean(features.agents && agents.length),
    agents,
    paths: {
      tools: `${base}/tools`,
      explore: `${base}/explore`,
      area: `${base}/area`,
      map: `${base}/map`,
      saved: `${base}/saved`,
      plan: `${base}/plan`,
      guides: `${base}/guides`,
      realtors: `${base}/realtors`,
    },
    openTool: (tool) => {
      track(`Opened ${tool.name}`);
      navigate(`${base}/tool/${tool.k}`, { state: here });
    },
    openExplore: () => {
      track('Browsed Explore Homes');
      navigate(`${base}/explore`);
    },
    openArea: () => {
      track('Browsed Local Spots');
      navigate(`${base}/area`);
    },
    openMap: () => {
      track('Opened the site map');
      navigate(`${base}/map`);
    },
    openLender: () => {
      const { lender } = complianceOf(community?.settings, { community });
      track(`Tapped ${lender.name || 'the lender'}`);
      onOpenLender?.();
    },
  };
}

/** The route: the layout's own home screen when it has one, otherwise today's. */
export default function AllTools({ onOpenLender }) {
  const { layout } = useBuyer();
  const model = useHomeModel({ onOpenLender });
  const Home = layoutFor(layout).Home ?? HomeScreen;
  return <Home model={model} />;
}

/** The buyer's home screen: the two lead questions, the homes banner, the tools. */
export function HomeScreen({ model }) {
  const {
    community, paths, leadTools: lead2, otherTools: rest, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>
        Hi {model.firstName} — can you buy one of these?
      </h1>
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
              {inPlan(tool.k) ? (
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
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openExplore();
          }
        }}
        onClick={openExplore}
        style={{
          width: '100%', cursor: 'pointer', borderRadius: 'var(--t-radlg)',
          overflow: 'hidden', position: 'relative', marginBottom: 12, border: '1px solid var(--t-line)',
        }}
      >
        <div style={{ height: 120 }}>
          <Photo
            className="b-photo--scrimmed"
            photo={community?.heroPhoto ? { url: community.heroPhoto } : null}
            label=""
            alt={`${community?.name} community photo`}
          />
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
            {model.homesCount} homes available · save the ones you like
          </span>
        </div>
      </div>

      {model.hasSpots ? (
        <button
          type="button"
          onClick={openArea}
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
          <span style={{ flex: 'none', color: 'var(--t-accT)', fontSize: 18 }} aria-hidden="true">›</span>
        </button>
      ) : null}

      {model.hasMap ? (
        <button
          type="button"
          onClick={openMap}
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
          <span style={{ flex: 'none', color: 'var(--t-accT)', fontSize: 18 }} aria-hidden="true">›</span>
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
            {inPlan(tool.k) ? (
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
        The guides come right after the tools: a buyer who has just seen what
        the tools ask for is the buyer who wants the plain-English version of
        why. Three, with the way to the rest, so the screen stays a home screen
        and not a reading list.
      */}
      {model.showGuides ? (
        <section style={{ marginTop: 22, marginBottom: 14 }} aria-labelledby="home-guides">
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <h2 id="home-guides" className="b-lbl" style={{ margin: '0 0 12px', color: 'var(--t-accT)' }}>
            Buyer guides
          </h2>
          <div className="b-glist">
            {model.featuredGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
          {model.guides.length > model.featuredGuides.length ? (
            <Link to={paths.guides} className="b-btn b-btn-outline b-more" style={moreLink}>
              All {model.guides.length} buyer guides
            </Link>
          ) : null}
        </section>
      ) : null}

      {/*
        Below the tools on purpose. A buyer came here to find out what they can
        afford; this answers what comes after that, so it sits after it. Videos
        are lazy so a section nobody scrolls to costs nobody anything.
      */}
      {resources.length ? (
        <section style={{ marginTop: 22, marginBottom: 14 }} aria-labelledby="home-worth-knowing">
          {/* The rule is what tells a buyer the tools have ended and something
              else has begun — the grid above it otherwise runs straight into
              this list. aria-hidden because the heading already says so. */}
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <h2
            id="home-worth-knowing"
            className="b-lbl"
            style={{ display: 'block', margin: '0 0 12px', color: 'var(--t-accT)' }}
          >
            Worth knowing
          </h2>
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

      {/* One row, not four cards: the full cards are a tap away, and a home
          screen that listed every agent would push the tools out of sight. */}
      {model.showAgents ? (
        <section style={{ marginTop: 22, marginBottom: 14 }} aria-labelledby="home-realtors">
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <h2 id="home-realtors" className="b-lbl" style={{ margin: '0 0 12px', color: 'var(--t-accT)' }}>
            Realtors
          </h2>
          <Link to={paths.realtors} className="b-agents-row">
            <span className="b-agents-row__faces" aria-hidden="true">
              {model.agents.map((agent) =>
                agent.photo ? (
                  <img key={agent.id} src={agent.photo} alt="" />
                ) : (
                  <span key={agent.id} className="b-agents-row__initial">{agent.name?.trim()?.[0]}</span>
                ),
              )}
            </span>
            <span className="b-agents-row__text">
              <span className="b-head" style={{ fontSize: 16 }}>Meet the realtors</span>
              <span style={{ fontSize: 12, color: 'var(--t-ink)' }}>
                {model.agents.length} {model.agents.length === 1 ? 'agent' : 'agents'} working with buyers here
              </span>
            </span>
            <span style={{ flex: 'none', color: 'var(--t-accT)', fontSize: 18 }} aria-hidden="true">›</span>
          </Link>
        </section>
      ) : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <Link
          to={paths.saved}
          className="b-btn b-btn-outline"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', minHeight: 46 }}
        >
          ★ Homes I Like · {savedCount}
        </Link>
        <Link
          to={paths.plan}
          className="b-btn"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', minHeight: 46 }}
        >
          My Home Plan
        </Link>
      </div>

      <LenderCard onOpen={openLender} />
    </div>
  );
}

const moreLink = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
  minHeight: 46, marginTop: 12,
};

/**
 * The lender at the foot of the screen.
 *
 * Last on the page, below the buyer's own plan and saved homes, because it is
 * an advertisement and they came here for the calculators. Tapping it opens the
 * same appointment sheet everything else uses -- one place to book, and the
 * request arrives tagged so whoever reads it knows to bring a loan officer.
 *
 * Built from the community's own compliance settings, so what Setup says is
 * what the card says. Renders nothing at all until the lender has a name and an
 * NMLS ID: a half-filled block is a non-compliant mortgage ad, and showing
 * nothing is the safe way for this to fail.
 */
function LenderCard({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section style={{ marginTop: 26 }} aria-labelledby="home-financing">
      <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
      <h2 id="home-financing" className="b-lbl" style={{ margin: '0 0 10px', color: 'var(--t-accT)' }}>
        Financing
      </h2>

      <div
        style={{
          background: 'var(--t-tint)', border: '1px solid var(--t-line)',
          borderRadius: 'var(--t-radlg)', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <LenderLogo tone="light" height={52} className="b-lender-card__logo" />

        {lender.tagline ? (
          <span style={{ fontSize: 13, color: 'var(--t-ink)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{lender.tagline}</span>
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
            display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2,
            color: 'var(--t-ink)', fontSize: 11, lineHeight: 1.5,
          }}
        >
          <span style={{ flex: 'none', display: 'flex' }}><EhlMark tone="light" height={40} /></span>
          <span className="b-lender-card__text" style={{ display: 'flex', flexDirection: 'column' }}>
            <span>
              {lender.name} · NMLS #{lender.nmls}
              {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
            </span>
            {lender.phone ? (
              phoneHref ? (
                <a
                  href={phoneHref}
                  style={{ display: 'flex', alignItems: 'center', minHeight: 44, color: 'var(--t-accT)', fontWeight: 600 }}
                >
                  {lender.phone}
                </a>
              ) : (
                <span>{lender.phone}</span>
              )
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}
