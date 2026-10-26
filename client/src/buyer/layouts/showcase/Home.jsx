import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { isSold, money, num, unitsLabel, videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { canTalkFinancing } from '../../reach.js';
import { GuideCard } from '../../screens/Guides.jsx';
import { ChevronLeft, ChevronRight, Heart, MapGlyph, PinGlyph } from './icons.jsx';
import Placeholder from './Placeholder.jsx';
import Row from './Row.jsx';
import { lastHomeSeen, paymentFor, setHomeOnScreen, slideOrder, termsLine } from './numbers.js';

/**
 * How wide a slide's photo is drawn. The slide fills the window, and on any window
 * narrower than a 16:9 photo (every phone held upright, most laptops) the photo is
 * stretched to the window's height and cropped at the sides, so it is drawn far wider
 * than the window: about 1.7 times the window's height for the usual 3:2 to 16:9 shots.
 * Asking for less would hand a phone a picture a third as wide as the one it draws, and
 * that holds on a 3x phone too: its slide is cropped from a photo drawn some 3500 device
 * pixels wide, so it is given the largest copy, like every other picture in the app.
 */
const SLIDE_SIZES = '(max-aspect-ratio: 16/9) 170vh, 100vw';

/** True when the buyer has asked for less motion: the carousel then jumps rather than glides. */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Text a screen reader hears that the eye does not need, such as "a month" after "/mo". */
function Hidden({ children }) {
  return <span className="sc-vh">{children}</span>;
}

/** The words on a slide's chip, and whether it gets the tick (a home a buyer can move into now). */
function statusOf(home) {
  if (isSold(home)) return { label: 'Sold', ready: false };
  const label = String(home.availability ?? '').trim();
  return label ? { label, ready: /ready/i.test(label) } : null;
}

/**
 * One home, one screen: its first photo (or the drawn placeholder) filling the whole slide, as a story does,
 * and over the photo's foot, on a dark scrim, everything a buyer decides on. The chip says how far along it
 * is, the name is set very large in the serif, then the price, the monthly estimate with its terms in a line
 * and "An estimate, not a loan offer.", the facts, and the two things to do: save it (the heart, the one save
 * the whole app uses) and see inside.
 *
 * The slide is three layers: the photo behind everything, the clear stretch of it between the greeting and
 * the words (where Previous and Next sit over its edges, as on the board), and the words. Each slide carries
 * its own pair of buttons so they are always centred on the part of the picture that shows; only the slide on
 * screen can be reached with Tab, so the keyboard does not walk through every home on the way to the rest of
 * the page.
 */
function Slide({ home, index, count, current, saved, pay, showLot, eager, onOpen, onSave, onStep }) {
  const status = statusOf(home);
  const units = isSold(home) ? '' : unitsLabel(home);
  const price = num(home.price);
  const sqft = num(home.sqft);
  const facts = [
    num(home.beds) > 0 ? `${num(home.beds)} bd` : '',
    num(home.baths) > 0 ? `${num(home.baths)} ba` : '',
    sqft ? `${sqft.toLocaleString('en-US')} sq ft` : '',
    showLot && home.lotNumber ? home.lotNumber : '',
  ].filter(Boolean);
  const tab = current ? 0 : -1;

  return (
    <div
      className={`sc-slide${isSold(home) ? ' sc-slide--sold' : ''}`}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}`}
      data-index={index}
    >
      <div className="sc-slide__photo">
        <Placeholder />
        {home.photos.length ? <Photo photo={home.photos[0]} alt="" label="" quiet eager={eager} sizes={SLIDE_SIZES} /> : null}
      </div>
      <div className="sc-slide__view">
        {count > 1 ? (
          <>
            <button
              type="button"
              className="sc-step sc-step--prev"
              aria-label="Previous home"
              aria-controls="sc-track"
              aria-disabled={index === 0 || undefined}
              tabIndex={tab}
              onClick={() => onStep(index, -1)}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="sc-step sc-step--next"
              aria-label="Next home"
              aria-controls="sc-track"
              aria-disabled={index === count - 1 || undefined}
              tabIndex={tab}
              onClick={() => onStep(index, 1)}
            >
              <ChevronRight size={22} />
            </button>
          </>
        ) : null}
      </div>

      <div className="sc-slide__text">
        <div className="sc-slide__top">
          <span className="sc-chips">
            {status ? (
              <span className={`sc-chip${status.ready ? ' sc-chip--ready' : ''}`}>
                {status.ready ? <span className="sc-chip__tick" aria-hidden="true">✓</span> : null}
                {status.label}
              </span>
            ) : null}
            {units ? <span className="sc-chip">{units}</span> : null}
          </span>
          {/* The slide's own name already says where it is in the list; this is the same for the eye. */}
          {count > 1 ? <span className="sc-slide__count" aria-hidden="true">{index + 1} of {count} homes</span> : null}
        </div>
        <h2 className="sc-slide__name">{home.name}</h2>
        <p className="sc-slide__money">
          <span className="sc-slide__price">{price ? money(price) : 'Price coming soon'}</span>
          {pay ? (
            <span className="sc-slide__est">
              est. {money(pay.total)}
              <span aria-hidden="true">/mo</span>
              <Hidden> a month</Hidden>
            </span>
          ) : null}
        </p>
        {pay ? (
          <p className="sc-slide__terms">
            {termsLine(pay)} <span className="sc-slide__offer">An estimate, not a loan offer.</span>
          </p>
        ) : null}
        {facts.length ? <p className="sc-slide__facts">{facts.join(' · ')}</p> : null}
        <div className="sc-slide__row">
          <button
            type="button"
            className="sc-heart"
            aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
            aria-pressed={saved}
            tabIndex={tab}
            onClick={() => onSave(home)}
          >
            <Heart size={24} filled={saved} />
          </button>
          <button type="button" className="sc-btn sc-btn--fill sc-slide__open" tabIndex={tab} onClick={() => onOpen(home)}>
            See inside
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The lender, built from the community's own compliance settings so what Setup says is what the card says.
 *
 * Renders nothing until the lender has a name and an NMLS ID: a half-filled block is a non-compliant
 * mortgage ad, and showing nothing is the safe way for this to fail. The licence line and the Equal
 * Housing mark stay inside the card because they are part of the advertisement, not decoration under it.
 * The card sits on the dark ground, so it carries the white logo and the white mark.
 */
function LenderCard({ onOpen }) {
  const { community } = useBuyer();
  const { lender, lo } = complianceOf(community?.settings, { community });
  if (!lender.ready) return null;
  const phoneHref = telHref(lender.phone);

  return (
    <section className="sc-sec sc-lender" aria-labelledby="home-financing">
      <h2 id="home-financing" className="sc-h2">Financing</h2>
      <LenderLogo tone="dark" height={44} className="sc-lender__logo" />
      {lender.tagline ? <p className="sc-lender__line">{lender.tagline}</p> : null}
      <button type="button" className="sc-btn sc-btn--fill" onClick={onOpen}>
        Talk about financing
      </button>
      <LoanProcessLink className="sc-btn sc-btn--line" />
      <div className="sc-lender__legal">
        <EhlMark tone="dark" height={40} />
        <span className="sc-lender__id b-lender-card__text">
          <span>
            {lender.name} · NMLS #{lender.nmls}
            {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
          </span>
          {lender.phone ? (
            phoneHref ? <a className="sc-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
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
    <div className="sc-res__item">
      <h3 className="sc-res__title">{item.title}</h3>
      {boxed ? (
        <article className="sc-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch, and a
              // buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="sc-res__video"
            />
          ) : embed ? (
            <div className="sc-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="sc-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * Showcase's home screen, from the shared model: photo first, like phone stories.
 *
 * The homes come first, as a carousel one home wide that fills the screen under the header (see Slide):
 * swipe, the Previous and Next buttons over the photo, or the arrow keys once the carousel has the keyboard.
 * Over the top of the photos, on a scrim as a story's are, thin ticks say how many homes there are and which
 * one this is, with the heading and the line under it (the builder's own from Setup, or this layout's). On
 * a wide screen the photo takes the width with the home's words over its lower left, a small My Home Plan
 * panel sits over its lower right, and a film strip of every home under it jumps straight to one. With no
 * homes listed yet there is one welcome slide in their place, the community's picture behind its name and
 * "Homes are coming soon".
 *
 * Under the homes come the sections every home screen has, in Marketplace's order and on its conditions,
 * on the same dark ground: the builder incentive, the tools (the two lead questions first) with what is in
 * the plan, the lender, what is around the community, the agents to tour with, the guides, the FAQ, and
 * last the builder's own videos and articles.
 *
 * Every datum and handler is the model's and does what it does in every other layout; this decides only
 * where each goes and how it looks. A slide's monthly figure is the Payment tool's own (see paymentFor) and
 * is shown only while that tool is switched on: a builder who turned it off chose not to show payments.
 */
export default function Home({ model }) {
  const {
    community, paths, homes, leadTools, otherTools, resources, inPlan, isSaved, savedCount,
    openTool, openArea, openMap, openLender, openHome, toggleSave,
  } = model;
  const { tools, settings, features } = useBuyer();
  const faq = useFaq();

  const slides = useMemo(() => slideOrder(homes), [homes]);
  const count = slides.length;
  const frameRef = useRef(null);
  const greetRef = useRef(null);
  const trackRef = useRef(null);
  const frame = useRef(0);
  // Where a programmatic move is headed: scroll positions on the way there do not change the slide.
  const aim = useRef(null);
  const aimTimer = useRef(0);
  const [index, setIndex] = useState(() => Math.max(0, slides.findIndex((home) => home.id === lastHomeSeen())));
  const [announce, setAnnounce] = useState('');
  const current = Math.min(index, Math.max(0, count - 1));
  const onScreenId = slides[current]?.id ?? null;

  // The header's "My numbers" sheet is about the home on screen; this tells it which, and that there is
  // none once the home screen goes.
  useEffect(() => {
    setHomeOnScreen(onScreenId);
  }, [onScreenId]);
  useEffect(
    () => () => {
      setHomeOnScreen(null);
      cancelAnimationFrame(frame.current);
      clearTimeout(aimTimer.current);
    },
    [],
  );

  // A buyer coming back from a home finds the carousel on it, at once rather than gliding there.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el && index) el.scrollLeft = index * el.clientWidth;
    // Only on the first draw: after that the carousel is wherever the buyer moved it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The greeting floats over the top of the photos, and how tall it is depends on the builder's words and the
  // screen. The slides are told, so the words at their foot never ride up under it on a short screen and the
  // arrows sit in the middle of the part of the picture that shows.
  useLayoutEffect(() => {
    const greet = greetRef.current;
    const frame = frameRef.current;
    if (!greet || !frame) return undefined;
    const measure = () => frame.style.setProperty('--sc-greet-h', `${Math.ceil(greet.getBoundingClientRect().height)}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(greet);
    return () => watch.disconnect();
  }, [count]);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = trackRef.current;
      if (!el || !el.clientWidth) return;
      const at = el.scrollLeft / el.clientWidth;
      if (aim.current !== null) {
        if (Math.abs(at - aim.current) > 0.02) return;
        aim.current = null;
      }
      setIndex(Math.max(0, Math.min(count - 1, Math.round(at))));
    });
  };

  /** Moves the carousel to a home and says which, for a screen reader, since the move was asked for. */
  const go = (target) => {
    const el = trackRef.current;
    if (!el || !count) return current;
    const to = Math.max(0, Math.min(count - 1, target));
    aim.current = to;
    clearTimeout(aimTimer.current);
    // A swipe that interrupts the glide never arrives at the aim, so the aim is let go of after a moment.
    aimTimer.current = setTimeout(() => {
      aim.current = null;
    }, 900);
    el.scrollTo({ left: to * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setIndex(to);
    setAnnounce(`${slides[to].name}, ${to + 1} of ${count}`);
    return to;
  };

  // Previous or Next on a slide: the keyboard follows to the same button on the slide it moved to, so a
  // second press keeps going (the one it pressed is now off screen).
  const step = (from, by) => {
    const target = from + by;
    if (target < 0 || target >= count) return;
    const to = go(target);
    const which = by < 0 ? 'prev' : 'next';
    trackRef.current?.querySelector(`[data-index="${to}"] .sc-step--${which}`)?.focus({ preventScroll: true });
  };

  // The arrow keys, Home and End, while the carousel or anything in it has the keyboard. Nothing is listened
  // for on the page as a whole, so the keys keep their usual jobs everywhere else.
  const onKeyDown = (event) => {
    const keys = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: count - 1 };
    if (!(event.key in keys) || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    go(keys[event.key]);
    if (event.target !== trackRef.current) trackRef.current?.focus({ preventScroll: true });
  };

  const payOf = (home) => paymentFor(home, { community, tools, settings });

  const allTools = [...leadTools, ...otherTools];
  const done = allTools.filter((tool) => inPlan(tool.k)).length;
  const next = allTools.find((tool) => !inPlan(tool.k)) ?? null;
  const nearby = model.hasSpots || model.hasMap;
  const { lender } = complianceOf(community?.settings, { community });
  // The lender and the places share a row on a wide screen only when both are drawn. The lender card draws
  // nothing until the lender is set up, and a row with one of the two leaves half of it empty.
  const duo = nearby && lender.ready;

  // A name the builder typed with its own full stop ("Willow Creek Estates, Inc.") is not given a second.
  const first = model.firstName;
  const place = community?.name ?? 'your new community';
  const stop = /[.?!]$/.test(place) ? '' : '.';
  const headline = model.greeting.headline || `${first ? `Hi ${first}. ` : ''}Meet the homes at ${place}${stop}`;
  // The line promises a monthly cost only when a slide shows one: the Payment tool can be on while every home
  // is sold or none is priced yet, and then there is no figure to point at.
  const subhead =
    model.greeting.subhead ||
    (slides.some((home) => payOf(home))
      ? 'One home at a time, with what it could cost you each month.'
      : 'One home at a time. Tap See inside for the photos and floor plans.');

  /** The small My Home Plan panel over the photo's lower right on a wide screen. */
  const planCard = (
    <aside className="sc-card" aria-label="My Home Plan">
      <p className="sc-card__title">My Home Plan</p>
      {allTools.length ? (
        <>
          <p className="sc-card__done">
            {first ? `${first} · ` : ''}
            {done} of {allTools.length} tools done
          </p>
          <span className="sc-steps" aria-hidden="true">
            {allTools.map((tool) => (
              <span key={tool.k} className={inPlan(tool.k) ? 'sc-steps__on' : ''} />
            ))}
          </span>
        </>
      ) : (
        <p className="sc-card__done">Save the homes you like and keep them in your plan.</p>
      )}
      {next ? (
        <button type="button" className="sc-card__next" onClick={() => openTool(next)}>
          <span className="sc-card__text">
            <span className="sc-card__kick">Next tool</span>
            <span className="sc-card__name">{next.name}</span>
          </span>
          <ChevronRight />
        </button>
      ) : (
        <Link to={paths.plan} className="sc-card__next">
          <span className="sc-card__text">
            <span className="sc-card__kick">{allTools.length ? 'Every tool is done' : 'Your plan'}</span>
            <span className="sc-card__name">See My Home Plan</span>
          </span>
          <ChevronRight />
        </Link>
      )}
      {/* Only when the lender's sheet has something to do, the rule the header and the menu follow. */}
      {canTalkFinancing(community, features) ? (
        <button type="button" className="sc-card__fin" onClick={openLender}>
          <span className="sc-card__finword">Talk about financing</span>
          <span className="sc-card__with">with {lender.name}</span>
        </button>
      ) : null}
    </aside>
  );

  return (
    <div className="sc-home">
      {count ? (
        <div className="sc-stage">
          <div className="sc-frame" ref={frameRef}>
            {/* Over the top of the photos, as a story's ticks and name are: first in the page, so the heading
                comes before the homes' own, and never in the way of a swipe (it holds nothing to tap). */}
            <div className="sc-greet" ref={greetRef}>
              {count > 1 ? (
                <span className="sc-ticks" aria-hidden="true">
                  {slides.map((home, i) => (
                    <span key={home.id} className={i === current ? 'sc-ticks__on' : ''} />
                  ))}
                </span>
              ) : null}
              <h1 className="sc-greet__h1">{headline}</h1>
              <p className="sc-greet__sub">{subhead}</p>
            </div>
            <div
              id="sc-track"
              ref={trackRef}
              className="sc-track"
              role="region"
              aria-roledescription="carousel"
              aria-label="Homes"
              // The carousel scrolls sideways, so it takes the keyboard itself: the arrow keys move it.
              tabIndex={0}
              onScroll={onScroll}
              onKeyDown={onKeyDown}
            >
              {slides.map((home, i) => (
                <Slide
                  key={home.id}
                  home={home}
                  index={i}
                  count={count}
                  current={i === current}
                  saved={isSaved(home.id)}
                  pay={payOf(home)}
                  showLot={Boolean(features.lotNumbers)}
                  eager={i === current}
                  onOpen={openHome}
                  onSave={toggleSave}
                  onStep={step}
                />
              ))}
            </div>
            {planCard}
          </div>
          {/* Said once a move the buyer asked for has happened; a swipe is its own announcement. */}
          <p className="sc-vh" aria-live="polite">{announce}</p>

          {count > 1 ? (
            <div className="sc-strip">
              <ul className="sc-strip__list" role="list" aria-label="Every home">
                {slides.map((home, i) => (
                  <li key={home.id}>
                    <button
                      type="button"
                      className="sc-strip__btn"
                      aria-current={i === current ? 'true' : undefined}
                      aria-controls="sc-track"
                      onClick={() => go(i)}
                    >
                      <span className="sc-strip__thumb" aria-hidden="true">
                        <Placeholder />
                        {home.photos.length ? <Photo photo={home.photos[0]} alt="" label="" quiet sizes="100px" /> : null}
                      </span>
                      <span className="sc-strip__text">
                        <span className="sc-strip__name">{home.name}</span>
                        <span className="sc-strip__price">{num(home.price) ? money(home.price) : 'Price coming soon'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="sc-stage sc-stage--welcome">
          <div className="sc-frame">
            <div className="sc-slide sc-slide--welcome">
              <div className="sc-slide__photo">
                <Placeholder />
                {community?.heroPhoto ? <Photo photo={{ url: community.heroPhoto }} alt="" label="" quiet eager sizes={SLIDE_SIZES} /> : null}
              </div>
              <div className="sc-slide__view" />
              <div className="sc-slide__text">
                {model.greeting.headline ? (
                  <h1 className="sc-welcome__h1">{model.greeting.headline}</h1>
                ) : (
                  <h1 className="sc-welcome__h1">
                    <span className="sc-welcome__kicker">Welcome to</span> {place}
                  </h1>
                )}
                <p className="sc-welcome__soon">Homes are coming soon.</p>
                <p className="sc-slide__terms">{model.greeting.subhead || 'Have a look around while we add them.'}</p>
              </div>
            </div>
            {planCard}
          </div>
        </div>
      )}

      <div className="sc-below">
        <IncentiveCard className="sc-incentive" />

        <section className="sc-sec sc-plan" aria-labelledby="home-plan">
          <div className="sc-sec__head">
            <h2 id="home-plan" className="sc-h2">My Home Plan</h2>
            {allTools.length ? (
              <span className="sc-sec__aside">
                {first ? `${first} · ` : ''}
                {done} of {allTools.length} done
              </span>
            ) : null}
          </div>
          {allTools.length ? (
            <>
              <span className="sc-steps" aria-hidden="true">
                {allTools.map((tool) => (
                  <span key={tool.k} className={inPlan(tool.k) ? 'sc-steps__on' : ''} />
                ))}
              </span>
              <p className="sc-sub">Each one you finish goes into My Home Plan.</p>
              <ul className="sc-rows sc-rows--grid" role="list">
                {allTools.map((tool) => (
                  <Row key={tool.k} title={tool.name} sub={tool.q} done={inPlan(tool.k)} onOpen={() => openTool(tool)} />
                ))}
              </ul>
            </>
          ) : (
            <div className="sc-empty">
              <p className="sc-empty__title">More is on the way</p>
              <p className="sc-empty__text">For now, save the homes you like and keep them in My Home Plan.</p>
            </div>
          )}
          <div className="sc-pair">
            <Link to={paths.saved} className="sc-btn sc-btn--line">
              <Heart size={18} filled={savedCount > 0} /> Homes I Like · {savedCount}
            </Link>
            <Link to={paths.plan} className="sc-btn sc-btn--light">My Home Plan</Link>
          </div>
        </section>

        <div className={`sc-duo${duo ? ' sc-duo--two' : ''}`}>
          <LenderCard onOpen={openLender} />

          {nearby ? (
            <section className="sc-sec sc-near" aria-labelledby="home-nearby">
              <h2 id="home-nearby" className="sc-h2">Around {community?.name ?? 'the community'}</h2>
              <ul className="sc-rows" role="list">
                {model.hasSpots ? (
                  <Row
                    icon={<PinGlyph />}
                    title="Local Spots"
                    sub="Schools, parks and everyday places nearby"
                    onOpen={openArea}
                  />
                ) : null}
                {model.hasMap ? (
                  <Row icon={<MapGlyph />} title="Site Map" sub="View the community layout" onOpen={openMap} />
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>

        {/* The agent, listed in full on the page, ahead of the guides: a buyer who is ready to see a home
            should not have to scroll past reading to do it. */}
        {model.showAgents ? (
          <section className="sc-sec sc-agents" aria-labelledby="home-agents">
            <h2 id="home-agents" className="sc-h2">Schedule your tour</h2>
            <AgentsBlock />
          </section>
        ) : null}

        {/* Three, with the way to the rest, so the screen stays a home screen and not a reading list. */}
        {model.showGuides ? (
          <section className="sc-sec" aria-labelledby="home-guides">
            <div className="sc-sec__head">
              <h2 id="home-guides" className="sc-h2">Learn</h2>
              {model.guides.length > model.featuredGuides.length ? (
                <Link to={paths.guides} className="sc-more">
                  All {model.guides.length} buyer guides
                  <ChevronRight size={16} />
                </Link>
              ) : null}
            </div>
            <div className="b-glist sc-guides">
              {model.featuredGuides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} />
              ))}
            </div>
          </section>
        ) : null}

        {faq.length ? (
          <section className="sc-sec sc-faq" aria-labelledby="home-faq">
            <h2 id="home-faq" className="sc-h2">FAQ</h2>
            <FaqList items={faq} />
          </section>
        ) : null}

        {resources.length ? (
          <section className="sc-sec" aria-labelledby="home-worth-knowing">
            <h2 id="home-worth-knowing" className="sc-h2">Worth knowing</h2>
            <div className="sc-res">
              {resources.map((item) => (
                <Resource key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
