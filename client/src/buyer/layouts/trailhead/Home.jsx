import { Link } from 'react-router-dom';

import { videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { canBookTour, canTalkFinancing } from '../../reach.js';
import { GuideCard } from '../../screens/Guides.jsx';
import { ArrowRight, Calendar, ChevronRight, Heart, HouseGlyph, MapGlyph, PinGlyph } from './icons.jsx';
import TrailMap, { HereCard } from './TrailMap.jsx';
import { TOUR_EVENT, WIDE, stopLink, trailOf, useMedia } from './trail.js';

/**
 * The slim line under the greeting: how much of the trail is walked. It is one progress bar with a name for a
 * screen reader, and the words beside it say the same thing whenever the line above does not already (the
 * builder's own subhead replaces "Stop 3 of 8 on your way home"), so the bar is never the only way to read it.
 */
function Progress({ done, total, words }) {
  const said = `${done} of ${total} ${total === 1 ? 'stop' : 'stops'} done`;
  return (
    <div
      className="th-progress"
      role="progressbar"
      aria-label="Your trail"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={said}
    >
      <span className="th-progress__bar" aria-hidden="true">
        <span className="th-progress__done" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      {words ? <span className="th-progress__words">{said}</span> : null}
    </div>
  );
}

/**
 * The end of the trail, once every stop is done: it says so, and points to the plan the buyer built and to a
 * tour, the step that comes before keys. Book a tour is the header's own (see TOUR_EVENT), so it records the
 * ask and goes where every other Book a tour goes; it is left out when there is nobody to send the buyer to.
 */
function DoneCard({ model, tour, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const askTour = (event) => event.currentTarget.dispatchEvent(new CustomEvent(TOUR_EVENT, { bubbles: true }));
  return (
    <div className="th-done">
      <p className="th-kicker">The end of the trail</p>
      <Heading className="th-done__title">Every stop is done</Heading>
      <p className="th-done__text">
        Everything you worked out is in My Home Plan.{tour ? ' Next comes a tour, then keys in hand.' : ''}
      </p>
      <div className="th-done__acts">
        <Link to={model.paths.plan} className="th-btn th-btn--go">
          My Home Plan
          <ArrowRight />
        </Link>
        {tour ? (
          <button type="button" className="th-btn th-btn--line" onClick={askTour}>
            <Calendar />
            Book a tour
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** On a wide screen, under the opened stop: the one after it, so the next step is always in sight. */
function UpNext({ stop, model }) {
  const { to, state, onClick } = stopLink(stop, model);
  return (
    <Link to={to} state={state} onClick={onClick} className="th-upnext">
      <span className="th-mark th-mark--later th-mark--sm" aria-hidden="true">{stop.n}</span>
      <span className="th-upnext__text">
        <span className="th-kicker">Up next · Stop {stop.n}</span>
        <span className="th-upnext__name">{stop.name}</span>
        <span className="th-upnext__q">{stop.q}</span>
      </span>
      <ArrowRight size={18} />
    </Link>
  );
}

/** A tile for a place near the community: an icon, a title and what is there. */
function PlaceTile({ icon, title, sub, onOpen }) {
  return (
    <li>
      <button type="button" className="th-place" onClick={onOpen}>
        <span className="th-place__icon">{icon}</span>
        <span className="th-place__text">
          <span className="th-place__title">{title}</span>
          <span className="th-place__sub">{sub}</span>
        </span>
        <span className="th-place__go"><ChevronRight /></span>
      </button>
    </li>
  );
}

/**
 * The lender, built from the community's own compliance settings so what Setup says is what the card says.
 *
 * Renders nothing until the lender has a name and an NMLS ID: a half-filled block is a non-compliant
 * mortgage ad, and showing nothing is the safe way for this to fail. The licence line and the Equal
 * Housing mark stay inside the card because they are part of the advertisement, not decoration under it.
 */
function LenderCard({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section className="th-sec th-lender" aria-labelledby="home-financing">
      <h2 id="home-financing" className="th-h2">Financing</h2>
      <LenderLogo tone="light" height={44} className="th-lender__logo" />
      {lender.tagline ? <p className="th-lender__line">{lender.tagline}</p> : null}
      <div className="th-lender__acts">
        <button type="button" className="th-btn th-btn--go" onClick={onOpen}>
          Talk about financing
        </button>
        <LoanProcessLink className="th-btn th-btn--line" />
      </div>
      <div className="th-lender__legal">
        <EhlMark tone="light" height={40} />
        <span className="th-lender__id b-lender-card__text">
          <span>
            {lender.name} · NMLS #{lender.nmls}
            {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
          </span>
          {lender.phone ? (
            phoneHref ? <a className="th-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
          ) : null}
        </span>
      </div>
    </section>
  );
}

/**
 * The Worth Knowing items: a video or an article, each under its own title.
 * Videos are lazy so a section nobody scrolls to costs nobody anything.
 */
function Resource({ item }) {
  // An uploaded file plays in the page; a link plays in its frame. A video row with neither is a builder's
  // half-finished edit, and an empty black box is worse than nothing.
  const embed = item.kind === 'video' && !item.videoUrl ? videoEmbed(item.url) : null;
  if (item.kind === 'video' && !embed && !item.videoUrl) return null;
  const body = item.kind === 'article' ? (item.body ?? '').trim() : '';
  // A title the builder never wrote a body under would be an empty box, so the title stands on its own.
  const boxed = Boolean(item.videoUrl || embed || body);

  return (
    <div className="th-res__item">
      <h3 className="th-res__title">{item.title}</h3>
      {boxed ? (
        <article className="th-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch, and a
              // buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="th-res__video"
            />
          ) : embed ? (
            <div className="th-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="th-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * Trailhead's home screen: the buyer's way home drawn as a trail. The greeting says which stop they are at
 * ("Stop 3 of 8 on your way home") over a slim progress line, then the builder incentive (above the homes,
 * where every layout puts it), then the trail itself: the community's tools as numbered stops on one winding
 * line, done ones ticked, the next one opened with a big Start, and "Pick your home" as the overlook where
 * the homes are, ending at Keys in hand. After it come the sections every home screen has, in Marketplace's
 * order and on its conditions: the lender, what is around the community, the agents to tour with, the
 * guides, the FAQ, and last the builder's own videos and articles.
 *
 * On a wide screen it is two panes, as the board's computer view: the greeting and the whole trail in a
 * narrow column that stays put, and beside it the incentive, the current stop opened large with the one
 * after it, then the sections.
 *
 * Every datum and handler is the model's and does what it does in every other layout; this decides only
 * where each goes and how it looks. The homes' monthly figures are shown only while the Payment tool is on.
 */
export default function Home({ model }) {
  const { community, paths, homes, leadTools, otherTools, resources, savedCount, openArea, openMap, openLender } = model;
  const { features, agents, settings } = useBuyer();
  const faq = useFaq();
  const wide = useMedia(WIDE);

  const trail = trailOf(model);
  const tools = leadTools.length + otherTools.length;
  // The stops about money offer the lender, but only when its sheet has something to do (the rule every
  // "Talk about financing" follows).
  const onFinance = canTalkFinancing(community, features) ? openLender : null;
  const tour = canBookTour(features, agents, settings);
  const nearby = model.hasSpots || model.hasMap;
  const allDone = trail.total > 0 && !trail.current;

  const first = model.firstName;
  const place = community?.name ?? 'your new community';
  const headline = model.greeting.headline || (first ? `Hi ${first}.` : `Welcome to ${place}${/[.?!]$/.test(place) ? '' : '.'}`);
  const stopLine = !trail.total
    ? 'Have a look around while we set things up.'
    : trail.current
      ? `Stop ${trail.current.n} of ${trail.total} on your way home`
      : 'Every stop is done. Keys in hand are next.';
  const subhead = model.greeting.subhead || stopLine;

  const intro = (
    <div className="th-intro">
      <p className="th-kicker">Your way home</p>
      <h1 className="th-h1">{headline}</h1>
      <p className="th-lede">{subhead}</p>
      {trail.total ? <Progress done={trail.done} total={trail.total} words={Boolean(model.greeting.subhead)} /> : null}
    </div>
  );

  const trailMap = trail.total ? (
    <section className="th-trailsec" aria-labelledby="home-trail">
      <h2 id="home-trail" className="th-vh">Your trail</h2>
      <TrailMap
        model={model}
        trail={trail}
        wide={wide}
        onFinance={onFinance}
        endCard={wide ? null : <DoneCard model={model} tour={tour} />}
      />
    </section>
  ) : null;

  const empties = (
    <>
      {!homes.length ? (
        <div className="th-empty">
          <HouseGlyph size={32} />
          <p className="th-empty__title">No homes listed yet</p>
          <p className="th-empty__text">We’re still adding homes to this community. Check back soon.</p>
        </div>
      ) : null}
      {!tools ? (
        <div className="th-empty th-empty--slim">
          <p className="th-empty__title">More is on the way</p>
          <p className="th-empty__text">
            {homes.length
              ? 'For now, save the homes you like and keep them in My Home Plan.'
              : 'The steps to your new home will be here soon.'}
          </p>
        </div>
      ) : null}
    </>
  );

  const pair = (
    <div className="th-pair">
      <Link to={paths.saved} className="th-btn th-btn--line">
        <Heart size={18} filled={savedCount > 0} /> Homes I Like · {savedCount}
      </Link>
      <Link to={paths.plan} className="th-btn th-btn--go">My Home Plan</Link>
    </div>
  );

  const sections = (
    <>
      <LenderCard onOpen={openLender} />

      {nearby ? (
        <section className="th-sec" aria-labelledby="home-nearby">
          <h2 id="home-nearby" className="th-h2">Around {community?.name ?? 'the community'}</h2>
          <ul className="th-places" role="list">
            {model.hasSpots ? (
              <PlaceTile
                icon={<PinGlyph />}
                title="Local Spots"
                sub="Schools, parks and everyday places nearby"
                onOpen={openArea}
              />
            ) : null}
            {model.hasMap ? (
              <PlaceTile icon={<MapGlyph />} title="Site Map" sub="View the community layout" onOpen={openMap} />
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who is ready to see a home
          should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section className="th-sec th-agents" aria-labelledby="home-agents">
          <h2 id="home-agents" className="th-h2">Schedule your tour</h2>
          <AgentsBlock />
        </section>
      ) : null}

      {/* Three, with the way to the rest, so the screen stays a home screen and not a reading list. */}
      {model.showGuides ? (
        <section className="th-sec" aria-labelledby="home-guides">
          <div className="th-sec__head">
            <h2 id="home-guides" className="th-h2">Learn</h2>
            {model.guides.length > model.featuredGuides.length ? (
              <Link to={paths.guides} className="th-more">
                All {model.guides.length} buyer guides
                <ChevronRight size={16} />
              </Link>
            ) : null}
          </div>
          <div className="b-glist th-guides">
            {model.featuredGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>
      ) : null}

      {faq.length ? (
        <section className="th-sec th-faq" aria-labelledby="home-faq">
          <h2 id="home-faq" className="th-h2">FAQ</h2>
          <FaqList items={faq} />
        </section>
      ) : null}

      {resources.length ? (
        <section className="th-sec" aria-labelledby="home-worth-knowing">
          <h2 id="home-worth-knowing" className="th-h2">Worth knowing</h2>
          <div className="th-res">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  // The current stop opened large, with the one after it: on a wide screen only. On a phone it is opened on
  // the trail itself, and the trail ends with the same "every stop is done" card.
  const next = trail.current ? trail.after(trail.current) : null;
  const opened = !wide ? null : trail.current ? (
    <section className="th-opened" aria-labelledby="home-here">
      <HereCard stop={trail.current} trail={trail} model={model} onFinance={onFinance} headingLevel={2} wide />
      {next ? <UpNext stop={next} model={model} /> : null}
    </section>
  ) : allDone ? (
    <section className="th-opened" aria-label="The end of the trail">
      <DoneCard model={model} tour={tour} headingLevel={2} />
    </section>
  ) : null;

  // One order at every width, the order it is read in: the greeting, the incentive, the trail, then the rest.
  // A wide screen only places them, the greeting and the trail in the narrow column and the rest beside it.
  return (
    <div className={`b-shell th-home${wide ? ' th-home--wide' : ''}`}>
      {intro}
      <IncentiveCard className="th-incentive" />
      {trailMap}
      <div className="th-pane">
        {opened}
        {empties}
        {pair}
        {sections}
      </div>
    </div>
  );
}
