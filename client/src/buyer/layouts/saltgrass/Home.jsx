import { Link } from 'react-router-dom';

import { videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
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
          <LoanProcessLink className="sg-btn-apply" />
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
 * band of three figures under a "My Home Plan" heading, then everything the
 * default home has, laid out as alternating grounds: the tools, the agent to
 * tour with, the guides, the financing, the FAQ, and last the builder's own
 * videos and articles. A builder incentive, when there is one, sits above the
 * homes picture.
 *
 * Every datum and handler comes from the model (see useHomeModel), so nothing
 * here decides what a tap does.
 */
export default function Home({ model }) {
  const {
    community, paths, leadTools, otherTools, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;
  const faq = useFaq();
  const allTools = [...leadTools, ...otherTools];
  const inPlanCount = allTools.filter((tool) => inPlan(tool.k)).length;
  const floorplans = model.homesCount === 1 ? 'available floorplan' : 'available floorplans';

  return (
    <div className="sg-home">
      <section className="sg-hero">
        <div className="sg-wrap">
          <h1 className="sg-hero__h1">Hi {model.firstName} — can you buy one of these?</h1>
          <p className="sg-lead">
            Take a few minutes to find out what works for you and build your own home plan.
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

      <section className="sg-strip" aria-labelledby="home-my-plan">
        <div className="sg-wrap">
          <h2 id="home-my-plan" className="sg-strip__title">My Home Plan</h2>
          <div className="sg-strip__grid">
            <div>
              <b className="num">{model.homesCount}</b>
              <span>{model.homesCount === 1 ? 'Available floorplan' : 'Available floorplans'}</span>
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
        </div>
      </section>

      <section className="sg-band">
        <div className="sg-wrap">
          <IncentiveCard className="sg-incentive" />

          {/* The picture is shown as it is: no fade, no tint. The words sit on a
              solid caption beneath it, where they read on any photograph. */}
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
                {model.homesCount} {floorplans} · save the ones you like
              </span>
            </div>
          </div>

          {model.hasSpots || model.hasMap ? (
            <div className="sg-rows">
              {model.hasSpots ? (
                <Row title="Local Spots" sub="Schools, parks and everyday places nearby" onOpen={openArea} />
              ) : null}
              {model.hasMap ? <Row title="Site Map" sub="View the community layout" onOpen={openMap} /> : null}
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

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who
          is ready to see a home should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section className="sg-band sg-band--sur" aria-labelledby="home-agents">
          <div className="sg-wrap">
            <h2 id="home-agents" className="sg-h2">Schedule your tour</h2>
            <AgentsBlock />
          </div>
        </section>
      ) : null}

      {model.showGuides ? (
        <section className="sg-band sg-guides" aria-labelledby="home-guides">
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

      <LenderPanel onOpen={openLender} />

      {faq.length ? (
        <section className="sg-band sg-band--sur" aria-labelledby="home-faq">
          <div className="sg-wrap">
            <h2 id="home-faq" className="sg-h2">FAQ</h2>
            <FaqList items={faq} />
          </div>
        </section>
      ) : null}

      {resources.length ? <Resources resources={resources} /> : null}
    </div>
  );
}
