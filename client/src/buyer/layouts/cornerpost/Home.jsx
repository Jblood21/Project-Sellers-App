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

/** The row chevron: 2.4px stroke, round caps, in the accent, as the design draws it. */
function RowChevron() {
  return (
    <svg
      className="cp-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * A 3px gradient rule, then the eyebrow, then an optional title in the accent.
 * The eyebrow is the section's h2; the rule is decoration and says nothing the
 * heading does not.
 */
function SectionHeader({ id, eyebrow, title }) {
  return (
    <div className="cp-section">
      <div className="cp-rule" role="presentation" />
      <h2 id={id} className="cp-eyebrow">{eyebrow}</h2>
      {title ? <p className="cp-section-title">{title}</p> : null}
    </div>
  );
}

/** One tool as a tile. Featured tools sit on the tint, the rest on the card colour. */
function ActionTile({ tool, featured, inPlan, onOpen }) {
  return (
    <button
      type="button"
      className={`cp-tile${featured ? ' cp-tile--featured' : ''}`}
      onClick={() => onOpen(tool)}
    >
      {inPlan ? <span className="cp-tile__badge">✓ In your plan</span> : null}
      <span className="cp-tile__title">{tool.name}</span>
      <span className="cp-tile__sub">{tool.q}</span>
    </button>
  );
}

/** A tinted row that leads to another screen: a title, a line under it and a chevron. */
function RowButton({ title, sub, onClick }) {
  return (
    <button type="button" className="cp-row" onClick={onClick}>
      <span className="cp-row__text">
        <span className="cp-tile__title">{title}</span>
        <span className="cp-tile__sub">{sub}</span>
      </span>
      <RowChevron />
    </button>
  );
}

/**
 * The Worth Knowing items: a video or an article, each under its own title.
 * Videos are lazy so a section nobody scrolls to costs nobody anything.
 */
function Resource({ item }) {
  // An uploaded file plays in the page; a link plays in its frame. A video row
  // with neither is a builder's half-finished edit, and an empty black box is
  // worse than nothing.
  const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
  if (item.kind === 'video' && !embed && !item.videoUrl) return null;
  const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
  // A title the builder never wrote a body under would be an empty card, so the
  // title stands on its own instead.
  const boxed = Boolean(item.videoUrl || embed || body);

  return (
    <div className="cp-resource">
      <h3 className="cp-section-title cp-resource__title">{item.title}</h3>
      {boxed ? (
        <article className="cp-frame cp-resource__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are
              // enough to decide to watch, and a buyer on mobile data should
              // not pay for a clip they scroll past.
              preload="metadata"
              className="cp-resource__video"
            />
          ) : embed ? (
            <div className="cp-resource__embed">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="cp-resource__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * The lender at the foot of the screen, built from the community's own
 * compliance settings so what Setup says is what the card says.
 *
 * Renders nothing until the lender has a name and an NMLS ID: a half-filled
 * block is a non-compliant mortgage ad, and showing nothing is the safe way for
 * this to fail. The licence number and the Equal Housing mark stay inside the
 * card because they are part of the advertisement, not decoration under it.
 */
function LenderCard({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section aria-labelledby="home-financing">
      <SectionHeader id="home-financing" eyebrow="Financing" />
      <div className="cp-card cp-card--tint cp-lender">
        <LenderLogo tone="light" height={44} className="cp-lender__logo" />
        {lender.tagline ? <p className="cp-lender__line">{lender.tagline}</p> : null}
        <button type="button" className="cp-btn cp-btn--primary cp-btn--block" onClick={onOpen}>
          Set up a time to talk
        </button>
        <LoanProcessLink className="cp-btn cp-btn--outline cp-btn--block" />
        <div className="cp-lender__legal">
          <EhlMark tone="light" height={40} />
          <span className="cp-lender__id">
            <span>
              {lender.name} · NMLS #{lender.nmls}
              {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
            </span>
            {lender.phone ? (
              phoneHref ? <a className="cp-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Cornerpost's tools home, from the shared model.
 *
 * Every datum and handler the default home has is here and does what it does
 * there: this decides only where each goes. Order follows the design (greeting,
 * the two lead questions, the homes photo, the rows, the other tools) and then
 * the sections that come after the tools, each under a rule and an eyebrow:
 * the agent to tour with, the guides, the financing, the FAQ, and last the
 * builder's own videos and articles. A builder incentive, when there is one,
 * sits above the homes photo.
 */
export default function Home({ model }) {
  const {
    community, paths, leadTools, otherTools, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;
  const faq = useFaq();
  const floorplans = model.homesCount === 1 ? 'available floorplan' : 'available floorplans';

  return (
    <div className="b-shell cp-home">
      <div className="cp-header">
        <h1 className="cp-display">Hi {model.firstName} — can you buy one of these?</h1>
        <p className="cp-lede">
          Take a few minutes to find out what works for you and build your own home plan.
        </p>
      </div>

      <div className="cp-stack">
        {leadTools.length ? (
          <div className="cp-grid-2">
            {leadTools.map((tool) => (
              <ActionTile key={tool.k} tool={tool} featured inPlan={inPlan(tool.k)} onOpen={openTool} />
            ))}
          </div>
        ) : null}

        <IncentiveCard className="cp-card cp-card--tint cp-incentive" />

        {/* The picture is shown as it is: no fade, no tint. The words sit on a
            solid caption beneath it, where they read on any photograph. */}
        <button type="button" className="cp-photo" onClick={openExplore}>
          {community?.heroPhoto ? (
            <Photo
              className="cp-photo__img"
              photo={{ url: community.heroPhoto }}
              label=""
              alt={`${community?.name} community photo`}
            />
          ) : (
            <span className="cp-photo__img cp-photo__img--empty" aria-hidden="true" />
          )}
          <span className="cp-photo__text">
            <span className="cp-photo__title">Explore Homes</span>
            <span className="cp-photo__sub">{model.homesCount} {floorplans} · save the ones you like</span>
          </span>
        </button>

        {model.hasSpots ? (
          <RowButton title="Local Spots" sub="Schools, parks and everyday places nearby" onClick={openArea} />
        ) : null}
        {model.hasMap ? (
          <RowButton title="Site Map" sub="View the community layout" onClick={openMap} />
        ) : null}

        {otherTools.length ? (
          <div className="cp-grid-2">
            {otherTools.map((tool) => (
              <ActionTile key={tool.k} tool={tool} inPlan={inPlan(tool.k)} onOpen={openTool} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="cp-btn-pair cp-btn-pair--home">
        <Link to={paths.saved} className="cp-btn cp-btn--outline">★ Homes I Like · {savedCount}</Link>
        <Link to={paths.plan} className="cp-btn cp-btn--primary">My Home Plan</Link>
      </div>

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who
          is ready to see a home should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section aria-labelledby="home-agents">
          <SectionHeader id="home-agents" eyebrow="Schedule your tour." />
          <AgentsBlock />
        </section>
      ) : null}

      {/*
        The guides come after the tour: a buyer who has just seen what the tools
        ask for is the buyer who wants the plain-English version of why. Three,
        with the way to the rest, so the screen stays a home screen and not a
        reading list. No pictures: they are text, and read faster that way.
      */}
      {model.showGuides ? (
        <section aria-labelledby="home-guides">
          <SectionHeader id="home-guides" eyebrow="Buyer guides" />
          <div className="cp-stack">
            {model.featuredGuides.map((guide) => (
              <Link key={guide.id} to={`${paths.guides}/${guide.slug}`} className="cp-row cp-row--guide">
                <span className="cp-row__text">
                  {guide.category ? <span className="cp-row__kicker">{guide.category}</span> : null}
                  <span className="cp-tile__title">{guide.title}</span>
                  {guide.summary ? <span className="cp-tile__sub cp-row__sum">{guide.summary}</span> : null}
                </span>
                <RowChevron />
              </Link>
            ))}
          </div>
          {model.guides.length > model.featuredGuides.length ? (
            <Link to={paths.guides} className="cp-btn cp-btn--outline cp-btn--block cp-more">
              All {model.guides.length} buyer guides
            </Link>
          ) : null}
        </section>
      ) : null}

      <LenderCard onOpen={openLender} />

      {faq.length ? (
        <section aria-labelledby="home-faq">
          <SectionHeader id="home-faq" eyebrow="FAQ" />
          <FaqList items={faq} />
        </section>
      ) : null}

      {resources.length ? (
        <section aria-labelledby="home-worth-knowing">
          <SectionHeader id="home-worth-knowing" eyebrow="Worth knowing" />
          <div className="cp-resources">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
