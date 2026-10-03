import { Link } from 'react-router-dom';

import { videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import { GuideCard } from '../../screens/Guides.jsx';

/** The small "done" flag a tool card carries once its answer is in the plan. */
function InPlan() {
  return <span className="sg-tag">✓ In your plan</span>;
}

/**
 * One tool as a tappable card. Lead tools are the large ones on the dark band;
 * the rest sit in the grid below. The handler is the model's, so a tap does what
 * it does in every layout.
 */
function ToolCard({ tool, done, onOpen, lead }) {
  return (
    <button type="button" className={`sg-tool${lead ? ' sg-tool--lead' : ''}`} onClick={() => onOpen(tool)}>
      {done ? <InPlan /> : null}
      <span className="sg-tool__name">{tool.name}</span>
      <span className="sg-tool__q">{tool.q}</span>
    </button>
  );
}

/** A full-width row that leads somewhere: Local Spots, Site Map. */
function Row({ title, sub, onOpen }) {
  return (
    <button type="button" className="sg-row" onClick={onOpen}>
      <span className="sg-row__text">
        <span className="sg-row__title">{title}</span>
        <span className="sg-row__sub">{sub}</span>
      </span>
      <span className="sg-row__go" aria-hidden="true">›</span>
    </button>
  );
}

/**
 * The lender at the foot of the home screen, as a dark panel.
 *
 * Built from the community's own compliance settings so Setup is the one
 * source: it renders nothing until the lender has a name and an NMLS ID, the
 * same rule as the default card, because a half-filled lender block is a
 * non-compliant mortgage ad. The licence number and the Equal Housing mark stay
 * inside the panel, part of the advertisement and not decoration under it.
 */
function LenderPanel({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section className="sg-band" aria-labelledby="home-financing">
      <div className="sg-wrap">
        <h2 id="home-financing" className="sg-h2">Financing</h2>
        <div className="sg-lender">
          <div className="sg-lender__logo">
            <LenderLogo tone="dark" height={64} />
          </div>
          {lender.tagline ? <p className="sg-lender__tag">{lender.tagline}</p> : null}
          <button type="button" className="sg-btn-white" onClick={onOpen}>
            Set up a time to talk
          </button>
          <div className="sg-lender__id">
            <span className="sg-lender__ehl"><EhlMark tone="dark" height={44} /></span>
            <span className="sg-lender__text b-lender-card__text">
              <span>
                {lender.name} · NMLS #{lender.nmls}
                {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
              </span>
              {lender.phone ? (
                phoneHref ? (
                  <a href={phoneHref} className="sg-lender__tel">{lender.phone}</a>
                ) : (
                  <span>{lender.phone}</span>
                )
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The "Worth knowing" list: videos and short articles the builder added. */
function Resources({ resources }) {
  return (
    <section className="sg-band" aria-labelledby="home-worth-knowing">
      <div className="sg-wrap">
        <h2 id="home-worth-knowing" className="sg-h2">Worth knowing</h2>
        <div className="sg-res">
          {resources.map((item) => {
            // An uploaded file plays in the page; a link plays in its frame. A
            // video row with neither is a half-finished edit, and an empty
            // black box is worse than nothing.
            const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
            if (item.kind === 'video' && !embed && !item.videoUrl) return null;
            const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
            const boxed = Boolean(item.videoUrl || embed || body);
            return (
              <div key={item.id} className="sg-res__item">
                <h3 className="sg-h3">{item.title}</h3>
                {boxed ? (
                  <article className="sg-res__box">
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
                        className="sg-res__video"
                      />
                    ) : embed ? (
                      <div className="sg-res__frame">
                        <iframe
                          src={embed}
                          title={item.title}
                          loading="lazy"
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : null}
                    {body ? <p className="sg-res__body">{body}</p> : null}
                  </article>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * The Salt Grass home: a dark hero with the two questions a buyer asks first, a
 * band of three figures, then everything the default home has, in the same
 * order of importance but laid out as alternating grounds.
 *
 * Every datum and handler comes from the model (see useHomeModel), so nothing
 * here decides what a tap does.
 */
export default function Home({ model }) {
  const {
    community, paths, leadTools, otherTools, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;
  const allTools = [...leadTools, ...otherTools];
  const inPlanCount = allTools.filter((tool) => inPlan(tool.k)).length;

  return (
    <div className="sg-home">
      <section className="sg-hero">
        <div className="sg-wrap">
          <h1 className="sg-hero__h1">Hi {model.firstName} — can you buy one of these?</h1>
          <p className="sg-lead">
            Answer a few natural questions and find out. Everything you do saves to your home plan.
          </p>
          {leadTools.length ? (
            <div className={`sg-lead-tools${leadTools.length > 1 ? ' sg-lead-tools--two' : ''}`}>
              {leadTools.map((tool) => (
                <ToolCard key={tool.k} tool={tool} done={inPlan(tool.k)} onOpen={openTool} lead />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="sg-strip" aria-label="Where you are">
        <div className="sg-wrap sg-strip__grid">
          <div>
            <b className="num">{model.homesCount}</b>
            <span>{model.homesCount === 1 ? 'Home available' : 'Homes available'}</span>
          </div>
          <div>
            <b className="num">{savedCount}</b>
            <span>Homes I like</span>
          </div>
          <div>
            <b className="num">{inPlanCount}</b>
            <span>In your plan</span>
          </div>
        </div>
      </section>

      <section className="sg-band">
        <div className="sg-wrap">
          <div
            role="button"
            tabIndex={0}
            aria-label="Explore homes"
            className="sg-explore"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openExplore();
              }
            }}
            onClick={openExplore}
          >
            <div className="sg-explore__photo">
              <Photo
                photo={community?.heroPhoto ? { url: community.heroPhoto } : null}
                label=""
                alt={`${community?.name} community photo`}
              />
            </div>
            <div className="sg-explore__scrim">
              <span className="sg-explore__title">Explore Homes</span>
              <span className="sg-explore__sub">
                {model.homesCount} homes available · save the ones you like
              </span>
            </div>
          </div>

          {model.hasSpots || model.hasMap ? (
            <div className="sg-rows">
              {model.hasSpots ? (
                <Row title="Local Spots" sub="Schools, parks and everyday places nearby" onOpen={openArea} />
              ) : null}
              {model.hasMap ? <Row title="Site Map" sub="See where each home sits" onOpen={openMap} /> : null}
            </div>
          ) : null}

          {otherTools.length ? (
            <div className="sg-tools">
              {otherTools.map((tool) => (
                <ToolCard key={tool.k} tool={tool} done={inPlan(tool.k)} onOpen={openTool} />
              ))}
            </div>
          ) : null}

          <div className="sg-actions">
            <Link to={paths.saved} className="sg-btn-line">
              ★ Homes I Like · {savedCount}
            </Link>
            <Link to={paths.plan} className="sg-btn-deep">
              My Home Plan
            </Link>
          </div>
        </div>
      </section>

      {model.showGuides ? (
        <section className="sg-band sg-band--sur sg-guides" aria-labelledby="home-guides">
          <div className="sg-wrap">
            <h2 id="home-guides" className="sg-h2">Buyer guides</h2>
            <div className="b-glist">
              {model.featuredGuides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
            {model.guides.length > model.featuredGuides.length ? (
              <Link to={paths.guides} className="sg-btn-line sg-more">
                All {model.guides.length} buyer guides
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {resources.length ? <Resources resources={resources} /> : null}

      {/* One row, not four cards: the full cards are a tap away, and a home
          screen that listed every agent would push the tools out of sight. */}
      {model.showAgents ? (
        <section className="sg-band sg-band--sur" aria-labelledby="home-realtors">
          <div className="sg-wrap">
            <h2 id="home-realtors" className="sg-h2">Realtors</h2>
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
                <span className="sg-h3">Meet the realtors</span>
                <span className="sg-row__sub">
                  {model.agents.length} {model.agents.length === 1 ? 'agent' : 'agents'} working with buyers here
                </span>
              </span>
              <span className="sg-row__go" aria-hidden="true">›</span>
            </Link>
          </div>
        </section>
      ) : null}

      <LenderPanel onOpen={openLender} />
    </div>
  );
}
