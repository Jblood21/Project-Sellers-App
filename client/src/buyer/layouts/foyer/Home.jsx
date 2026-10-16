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

/** A hairline arrow, drawn so it does not depend on the body face having one. */
function Arrow() {
  return (
    <svg
      className="fy-arrow" width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor"
      strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M1 6h19M15 1l5 5-5 5" />
    </svg>
  );
}

/**
 * A section opens with its name in small capitals between two hairlines. The
 * heading is the section's h2; the lines are decoration and say nothing the
 * words do not.
 */
function Eyebrow({ id, children }) {
  return (
    <h2 id={id} className="fy-eyebrow">
      <span>{children}</span>
    </h2>
  );
}

/** The mark a tool carries once its answer is in the plan. */
function Done() {
  return (
    <span className="fy-done">
      <span aria-hidden="true">✓ </span>In your plan
    </span>
  );
}

/** One of the two lead questions: a framed panel with a second rule inside it. */
function Feature({ tool, done, onOpen }) {
  return (
    <button type="button" className="fy-feature" onClick={() => onOpen(tool)}>
      <span className="fy-feature__in">
        {done ? <Done /> : null}
        <span className="fy-feature__title">{tool.name}</span>
        <span className="fy-feature__q">{tool.q}</span>
        <span className="fy-begin">
          Begin <Arrow />
        </span>
      </span>
    </button>
  );
}

/** A row of the index: a number, the tool, its question, and the way in. */
function IndexRow({ number, tool, done, onOpen }) {
  return (
    <li>
      <button type="button" className="fy-idx" onClick={() => onOpen(tool)}>
        <span className="fy-idx__n" aria-hidden="true">{String(number).padStart(2, '0')}</span>
        <span className="fy-idx__text">
          <span className="fy-idx__title">{tool.name}</span>
          <span className="fy-idx__q">{tool.q}</span>
          {done ? <Done /> : null}
        </span>
        <span className="fy-idx__end">
          <Arrow />
        </span>
      </button>
    </li>
  );
}

/** A plain row that leads somewhere else: Local Spots, Site Map. */
function ListRow({ title, sub, onOpen }) {
  return (
    <li>
      <button type="button" className="fy-idx fy-idx--plain" onClick={onOpen}>
        <span className="fy-idx__text">
          <span className="fy-idx__title">{title}</span>
          <span className="fy-idx__q">{sub}</span>
        </span>
        <span className="fy-idx__end"><Arrow /></span>
      </button>
    </li>
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
  // A title the builder never wrote a body under would be an empty frame, so the
  // title stands on its own instead.
  const boxed = Boolean(item.videoUrl || embed || body);

  return (
    <div className="fy-resource">
      <h3 className="fy-resource__title">{item.title}</h3>
      {boxed ? (
        <article className="fy-resource__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to
              // decide to watch, and a buyer on mobile data should not pay for a clip
              // they scroll past.
              preload="metadata"
              className="fy-resource__video"
            />
          ) : embed ? (
            <div className="fy-resource__embed">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="fy-resource__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * The lender at the foot of the page, built from the community's own compliance
 * settings so what Setup says is what the panel says.
 *
 * Renders nothing until the lender has a name and an NMLS ID: a half-filled block
 * is a non-compliant mortgage ad, and showing nothing is the safe way for this to
 * fail. The licence number and the Equal Housing mark stay inside the panel
 * because they are part of the advertisement, not decoration under it.
 */
function LenderPanel({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section aria-labelledby="home-financing" className="fy-section">
      <Eyebrow id="home-financing">Financing</Eyebrow>
      <div className="fy-lender">
        <LenderLogo tone="light" height={44} className="fy-lender__logo" />
        {lender.tagline ? <p className="fy-lender__line">{lender.tagline}</p> : null}
        <button type="button" className="b-btn" onClick={onOpen}>
          Talk about financing
        </button>
        <LoanProcessLink />
        <div className="fy-lender__legal">
          <EhlMark tone="light" height={40} />
          <span className="fy-lender__id b-lender-card__text">
            <span>
              {lender.name} · NMLS #{lender.nmls}
              {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
            </span>
            {lender.phone ? (
              phoneHref ? <a className="fy-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Foyer's tools home, from the shared model.
 *
 * Every datum and handler the other homes have is here and does what it does
 * there: this decides only where each goes. A greeting, then the two lead
 * questions as framed panels, then the homes, what is nearby, and the other tools
 * as a numbered index; after the tools come the agents to tour with, the guides
 * (as a journal), the financing, the FAQ and last the builder's own videos and
 * articles. A builder incentive, when there is one, sits above the homes.
 */
export default function Home({ model }) {
  const {
    community, paths, leadTools, otherTools, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;
  const faq = useFaq();
  const floorplans = model.homesCount === 1 ? 'available floorplan' : 'available floorplans';
  const nearby = model.hasSpots || model.hasMap;

  return (
    <div className="b-shell fy-home">
      <div className="fy-masthead">
        <h1 className="fy-hello">Hello{model.firstName ? `, ${model.firstName}` : ''}.</h1>
        <p className="fy-sub">
          Can you buy one of these? Find out what works for you, and build your own home plan.
        </p>
      </div>

      {leadTools.length ? (
        <div className={`fy-features${leadTools.length > 1 ? ' fy-features--two' : ''}`}>
          {leadTools.map((tool) => (
            <Feature key={tool.k} tool={tool} done={inPlan(tool.k)} onOpen={openTool} />
          ))}
        </div>
      ) : null}

      <IncentiveCard className="fy-incentive" />

      <section aria-labelledby="home-homes" className="fy-section">
        <Eyebrow id="home-homes">The homes</Eyebrow>
        {/* The picture is shown as it is: no fade, no tint. The words sit on the
            page beneath it, where they read on any photograph. */}
        <button type="button" className="fy-banner" onClick={openExplore}>
          {community?.heroPhoto ? (
            <span className="fy-banner__img">
              <Photo photo={{ url: community.heroPhoto }} label="" alt={`${community?.name} community photo`} />
            </span>
          ) : null}
          <span className="fy-banner__row">
            <span className="fy-banner__count" aria-hidden="true">{model.homesCount}</span>
            <span className="fy-banner__text">
              <span className="fy-banner__title">Explore Homes</span>
              <span className="fy-banner__sub">
                {model.homesCount} {floorplans} · save the ones you like
              </span>
            </span>
            <Arrow />
          </span>
        </button>
      </section>

      {nearby ? (
        <section aria-labelledby="home-nearby" className="fy-section">
          <Eyebrow id="home-nearby">The neighbourhood</Eyebrow>
          <ul className="fy-list" role="list">
            {model.hasSpots ? (
              <ListRow title="Local Spots" sub="Schools, parks and everyday places nearby" onOpen={openArea} />
            ) : null}
            {model.hasMap ? <ListRow title="Site Map" sub="View the community layout" onOpen={openMap} /> : null}
          </ul>
        </section>
      ) : null}

      {otherTools.length ? (
        <section aria-labelledby="home-tools" className="fy-section">
          <Eyebrow id="home-tools">Your tools</Eyebrow>
          <ol className="fy-list fy-list--index" role="list">
            {otherTools.map((tool, index) => (
              <IndexRow key={tool.k} number={index + 1} tool={tool} done={inPlan(tool.k)} onOpen={openTool} />
            ))}
          </ol>
        </section>
      ) : null}

      <div className="fy-pair">
        <Link to={paths.saved} className="b-btn b-btn-outline">★ Homes I Like · {savedCount}</Link>
        <Link to={paths.plan} className="b-btn">My Home Plan</Link>
      </div>

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who is
          ready to see a home should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section aria-labelledby="home-agents" className="fy-section">
          <Eyebrow id="home-agents">Schedule your tour</Eyebrow>
          <AgentsBlock />
        </section>
      ) : null}

      {/* The guides come after the tour: a buyer who has just seen what the tools ask
          for is the buyer who wants the plain-English version of why. Three, with the
          way to the rest, so the screen stays a home screen and not a reading list. */}
      {model.showGuides ? (
        <section aria-labelledby="home-guides" className="fy-section">
          <Eyebrow id="home-guides">From the journal</Eyebrow>
          <ul className="fy-list fy-journal" role="list">
            {model.featuredGuides.map((guide) => (
              <li key={guide.id}>
                <Link to={`${paths.guides}/${guide.slug}`} className="fy-jrow">
                  <span className="fy-jrow__img" aria-hidden="true">
                    {guide.image ? <img src={guide.image} alt="" loading="lazy" decoding="async" /> : null}
                  </span>
                  <span className="fy-jrow__text">
                    {guide.category ? <span className="fy-kicker">{guide.category}</span> : null}
                    <span className="fy-jrow__title">{guide.title}</span>
                    {guide.summary ? <span className="fy-jrow__sum">{guide.summary}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {model.guides.length > model.featuredGuides.length ? (
            <Link to={paths.guides} className="fy-more">
              All {model.guides.length} buyer guides <Arrow />
            </Link>
          ) : null}
        </section>
      ) : null}

      <LenderPanel onOpen={openLender} />

      {faq.length ? (
        <section aria-labelledby="home-faq" className="fy-section">
          <Eyebrow id="home-faq">FAQ</Eyebrow>
          <FaqList items={faq} />
        </section>
      ) : null}

      {resources.length ? (
        <section aria-labelledby="home-worth-knowing" className="fy-section">
          <Eyebrow id="home-worth-knowing">Worth knowing</Eyebrow>
          <div className="fy-resources">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
