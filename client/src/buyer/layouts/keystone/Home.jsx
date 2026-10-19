import { Link } from 'react-router-dom';

import { videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import { Pin } from '../../../components/Icons.jsx';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { GuideCard } from '../../screens/Guides.jsx';

/** "01", "02" ...: the index numeral a tool carries. */
const pad = (n) => String(n).padStart(2, '0');

/** The arrow at the right of a row: 2px stroke, square caps, as the rest of the layout draws a line. */
function Arrow() {
  return (
    <svg
      className="ks-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The glyph in a row's tile when there is no photograph: a grid of homes, a map. */
function GridGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}
function MapGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />
    </svg>
  );
}

/**
 * A section: a micro-label heading with a hairline running out from it, then the body.
 * The label is the section's h2, so the page has a real outline.
 */
function Section({ id, title, children, className = '' }) {
  return (
    <section className={`ks-sec ${className}`.trim()} aria-labelledby={id}>
      <h2 id={id} className="ks-sec__title"><span>{title}</span></h2>
      {children}
    </section>
  );
}

/** One figure in the status strip: a micro-label over a big number. A link when it leads somewhere. */
function Cell({ label, value, suffix, to, meter }) {
  const body = (
    <>
      <span className="ks-cell__label">{label}</span>
      <span className="ks-cell__value">
        <b>{value}</b>
        {suffix ? <> <small>{suffix}</small></> : null}
      </span>
      {meter !== undefined ? (
        <span className="ks-cell__meter" aria-hidden="true"><i style={{ width: `${meter}%` }} /></span>
      ) : null}
    </>
  );
  return to ? <Link className="ks-cell" to={to}>{body}</Link> : <div className="ks-cell">{body}</div>;
}

/** The chip a finished tool wears. The word is there as well as the tick, so colour is not the only signal. */
function InPlan() {
  return <span className="ks-chip"><span aria-hidden="true">✓</span> In plan</span>;
}

/** A lead tool: an accent edge, a big index, the question, and the way in. */
function LeadTool({ tool, index, done, onOpen }) {
  return (
    <button type="button" className="ks-lead" onClick={() => onOpen(tool)}>
      <span className="ks-lead__idx" aria-hidden="true">{pad(index)}</span>
      <span className="ks-lead__body">
        <span className="ks-lead__name">{tool.name}</span>
        <span className="ks-lead__q">{tool.q}</span>
      </span>
      <span className="ks-lead__side">
        {done ? <InPlan /> : null}
        <Arrow />
      </span>
    </button>
  );
}

/** A compact tool card: index, a status dot or the In plan chip, the name and the question. */
function ToolCard({ tool, index, done, onOpen }) {
  return (
    <button type="button" className="ks-tool" onClick={() => onOpen(tool)}>
      <span className="ks-tool__top">
        <span className="ks-tool__idx" aria-hidden="true">{pad(index)}</span>
        {done ? <InPlan /> : <span className="ks-dot" aria-hidden="true" />}
      </span>
      <span className="ks-tool__name">{tool.name}</span>
      <span className="ks-tool__q">{tool.q}</span>
    </button>
  );
}

/** A row that leads somewhere: a tile, a micro-label, the title and a line under it. */
function Row({ tile, kicker, title, sub, onOpen }) {
  return (
    <button type="button" className="ks-item" onClick={onOpen}>
      <span className="ks-item__tile">{tile}</span>
      <span className="ks-item__text">
        <span className="ks-micro">{kicker}</span>
        <span className="ks-item__title">{title}</span>
        {sub ? <span className="ks-item__sub">{sub}</span> : null}
      </span>
      <Arrow />
    </button>
  );
}

/** The "Worth knowing" items: a video or an article, each under its own title. Videos are lazy. */
function Resource({ item }) {
  // An uploaded file plays in the page; a link plays in its frame. A video row with neither is a
  // builder's half-finished edit, and an empty black box is worse than nothing.
  const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
  if (item.kind === 'video' && !embed && !item.videoUrl) return null;
  const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
  // A title the builder never wrote a body under would be an empty box, so the title stands alone.
  const boxed = Boolean(item.videoUrl || embed || body);

  return (
    <div className="ks-res__item">
      <h3 className="ks-res__title">{item.title}</h3>
      {boxed ? (
        <article className="ks-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch,
              // and a buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="ks-res__video"
            />
          ) : embed ? (
            <div className="ks-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="ks-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * The lender as a dark panel, built from the community's own compliance settings so what
 * Setup says is what the panel says.
 *
 * It renders nothing until the lender has a name and an NMLS ID: a half-filled block is a
 * non-compliant mortgage ad, and showing nothing is the safe way for this to fail. The licence
 * line and the Equal Housing mark stay inside the panel because they are part of the
 * advertisement, not decoration under it.
 */
function LenderPanel({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <Section id="home-financing" title="Financing">
      <div className="ks-lender">
        <LenderLogo tone="dark" height={48} className="ks-lender__logo" />
        {lender.tagline ? <p className="ks-lender__line">{lender.tagline}</p> : null}
        <div className="ks-lender__actions">
          <button type="button" className="ks-btn ks-btn--white" onClick={onOpen}>
            Talk about financing
          </button>
          <LoanProcessLink className="ks-btn ks-btn--ghost" />
        </div>
        <div className="ks-lender__legal">
          <EhlMark tone="dark" height={40} />
          <span className="ks-lender__id b-lender-card__text">
            <span>
              {lender.name} · NMLS #{lender.nmls}
              {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
            </span>
            {lender.phone ? (
              phoneHref ? <a className="ks-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
            ) : null}
          </span>
        </div>
      </div>
    </Section>
  );
}

/**
 * Keystone's tools home, from the shared model.
 *
 * Every datum and handler the other homes have is here and does what it does there; this
 * decides only where each goes. Figures lead: a status strip (saved homes, tools in the plan,
 * homes available, progress), then the two questions a buyer asks first, the other tools as a
 * dense grid, and the places to go (Explore, Local Spots, Site Map). After the tools come the
 * sections that follow them in the other layouts: the agent to tour with, the guides, the
 * financing, the FAQ, and last the builder's own videos and articles. A builder incentive,
 * when there is one, sits above Explore Homes.
 */
export default function Home({ model }) {
  const {
    community, paths, leadTools, otherTools, resources, inPlan, savedCount,
    openTool, openExplore, openArea, openMap, openLender,
  } = model;
  const faq = useFaq();
  const tools = leadTools.length + otherTools.length;
  const inPlanCount = [...leadTools, ...otherTools].filter((tool) => inPlan(tool.k)).length;
  const progress = tools ? Math.round((inPlanCount / tools) * 100) : 0;
  const homes = model.homesCount;
  const hero = community?.heroPhoto ? { url: community.heroPhoto } : null;

  const cells = [
    { key: 'saved', label: 'Saved homes', value: savedCount, to: paths.saved },
    tools ? { key: 'plan', label: 'Tools in your plan', value: inPlanCount, suffix: `of ${tools}`, to: paths.plan } : null,
    { key: 'homes', label: 'Homes available', value: homes, to: paths.explore },
    tools ? { key: 'progress', label: 'Plan progress', value: `${progress}%`, meter: progress, to: paths.plan } : null,
  ].filter(Boolean);

  return (
    <div className="b-shell ks-home">
      <div className="ks-greet">
        <h1 className="ks-greet__h1">{model.greeting.headline || `Hi ${model.firstName} — can you buy one of these?`}</h1>
        <p className="ks-greet__lede">
          {model.greeting.subhead || 'Take a few minutes to find out what works for you and build your own home plan.'}
        </p>
      </div>

      <section aria-label="Your status">
        <div className="ks-status" style={{ '--cells': cells.length }} data-cells={cells.length}>
          {cells.map(({ key, ...cell }) => <Cell key={key} {...cell} />)}
        </div>
      </section>

      {leadTools.length ? (
        <Section id="home-start" title="Start here">
          <div className="ks-leads">
            {leadTools.map((tool, i) => (
              <LeadTool key={tool.k} tool={tool} index={i + 1} done={inPlan(tool.k)} onOpen={openTool} />
            ))}
          </div>
        </Section>
      ) : null}

      <IncentiveCard className="ks-incentive" />

      <Section id="home-explore" title="Explore the community">
        <div className="ks-list">
          <Row
            tile={
              hero ? (
                <Photo photo={hero} label="" alt="" quiet />
              ) : (
                <GridGlyph />
              )
            }
            kicker="Explore Homes"
            title={homes ? `Browse ${homes} ${homes === 1 ? 'home' : 'homes'}` : 'Homes are on their way'}
            sub={homes ? 'Photos, prices and floor plans. Save the ones you like.' : 'Check back soon for photos, prices and floor plans.'}
            onOpen={openExplore}
          />
          {model.hasSpots ? (
            <Row
              tile={<Pin size={20} />}
              kicker="Nearby"
              title="Local Spots"
              sub="Schools, parks and everyday places nearby"
              onOpen={openArea}
            />
          ) : null}
          {model.hasMap ? (
            <Row tile={<MapGlyph />} kicker="Plat" title="Site Map" sub="View the community layout" onOpen={openMap} />
          ) : null}
        </div>
      </Section>

      {otherTools.length ? (
        <Section id="home-tools" title={leadTools.length ? 'More tools' : 'All tools'}>
          <div className="ks-tools">
            {otherTools.map((tool, i) => (
              <ToolCard
                key={tool.k}
                tool={tool}
                index={leadTools.length + i + 1}
                done={inPlan(tool.k)}
                onOpen={openTool}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <div className="ks-pair">
        <Link to={paths.saved} className="ks-btn ks-btn--line">★ Homes I Like · {savedCount}</Link>
        <Link to={paths.plan} className="ks-btn ks-btn--solid">My Home Plan</Link>
      </div>

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who is ready to see a
          home should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <Section id="home-agents" title="Schedule your tour">
          <AgentsBlock />
        </Section>
      ) : null}

      {/* Three, with the way to the rest, so the screen stays a home screen and not a reading list. */}
      {model.showGuides ? (
        <Section id="home-guides" title="Buyer guides" className="ks-guides">
          <div className="b-glist">
            {model.featuredGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
          {model.guides.length > model.featuredGuides.length ? (
            <Link to={paths.guides} className="ks-more">
              <span>All {model.guides.length} buyer guides</span>
              <Arrow />
            </Link>
          ) : null}
        </Section>
      ) : null}

      <LenderPanel onOpen={openLender} />

      {faq.length ? (
        <Section id="home-faq" title="FAQ">
          <FaqList items={faq} />
        </Section>
      ) : null}

      {resources.length ? (
        <Section id="home-worth-knowing" title="Worth knowing">
          <div className="ks-res">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
