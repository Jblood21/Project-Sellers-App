import { Link } from 'react-router-dom';

import { PROGRAMS, TOOLS, calcPayment, isSold, listHomes, money, num, ratesOf, unitsLabel, videoEmbed } from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { GuideCard } from '../../screens/Guides.jsx';
import { ChevronRight, Heart, HouseGlyph, MapGlyph, PinGlyph } from './icons.jsx';

/** How many homes the home screen shows before "See all": the board's handful, not the whole list. */
const HOME_CARDS = 3;

/** The tool a layout reaches for by key, but only while the builder has it switched on. */
function toolOf(community, key) {
  return community?.tools?.[key] ? TOOLS.find((tool) => tool.k === key) ?? null : null;
}

/**
 * The homes the screen leads with: the order Explore Homes starts in, with the ones still for sale ahead
 * of the sold ones (the sort keeps each group's own order), so a buyer meets a home they can tour first.
 */
function homesToShow(homes) {
  const listed = listHomes(homes);
  return [...listed.filter((home) => !isSold(home)), ...listed.filter(isSold)].slice(0, HOME_CARDS);
}

/**
 * The home the payment panel is worked out for: the one the buyer last picked in the Payment tool, while
 * it is still for sale and priced, or else the lowest-priced home still for sale. None when no home is
 * both, which is when the panel is not drawn.
 */
function paymentHome(homes, pickedId) {
  const open = homes.filter((home) => !isSold(home) && num(home.price) > 0);
  const picked = open.find((home) => home.id === pickedId);
  if (picked) return picked;
  return open.reduce((low, home) => (!low || num(home.price) < num(low.price) ? home : low), null);
}

/**
 * What the sum holds besides the loan, read as words: ", with taxes, insurance and HOA". Each part is named only
 * when it is in the sum, so a community with no HOA, or no insurance figure set, is not told it pays one. With
 * nothing besides the loan it says so, rather than leaving the reader to guess.
 */
function inTheSum(result) {
  const parts = [];
  if (result.tax > 0) parts.push('taxes');
  if (result.insurance > 0) parts.push('insurance');
  if (result.mi > 0) parts.push('mortgage insurance');
  if (result.hoa > 0) parts.push('HOA');
  if (!parts.length) return ', with nothing added for taxes, insurance or HOA';
  if (parts.length === 1) return `, with ${parts[0]}`;
  return `, with ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The loan as it is said aloud: "an FHA loan", "a VA loan", "a Conventional loan". The article follows the
 * sound, not the letter, so FHA ("eff") takes "an" and VA ("vee") takes "a".
 */
function loanWords(program) {
  const name = PROGRAMS[program] ?? program;
  return `${/^(FHA|[AEIO])/i.test(name) ? 'an' : 'a'} ${name} loan`;
}

/** Text a screen reader hears that the eye does not need, such as "a month" after "/mo". */
function Hidden({ children }) {
  return <span className="rr-vh">{children}</span>;
}

/**
 * The board's slim three-part strip, made to mean something: the steps in the buyer's plan, the next one,
 * and the rest. The words beside it say the same thing, so the colours are never the only way to read it,
 * and the whole strip is one progress bar with a name for a screen reader.
 */
function Progress({ done, total }) {
  const next = done < total ? 1 : 0;
  const words = `${done} of ${total} ${total === 1 ? 'step' : 'steps'} in your plan`;
  return (
    <div
      className="rr-progress"
      role="progressbar"
      aria-label="Your home plan"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={words}
    >
      <span className="rr-progress__bar" aria-hidden="true">
        {done ? <span className="rr-progress__done" style={{ flexGrow: done }} /> : null}
        {next ? <span className="rr-progress__next" style={{ flexGrow: next }} /> : null}
        {total - done - next > 0 ? <span className="rr-progress__rest" style={{ flexGrow: total - done - next }} /> : null}
      </span>
      <span className="rr-progress__words">{words}</span>
    </div>
  );
}

/**
 * The dark panel the board puts first: what one of these homes could cost the buyer each month, set
 * large, and in words what that figure assumes. It is the Payment tool's own sum (calcPayment) at the loan
 * and down payment the buyer last chose there, or its starting ones, with the community's rates, taxes,
 * insurance and HOA, so it matches what the tool says for the same home.
 *
 * "Change my numbers" makes sure it IS the same home: the tool opens on the home the buyer last picked or,
 * before they pick one, on the first home listed, which need not be the one this panel chose. So the panel's
 * home is handed to the tool first, the way a home's own page does before it opens the payment, and the
 * buyer lands on the figure they just read.
 */
function PaymentPanel({ home, paymentTool, affordTool, onOpenTool }) {
  const { tools, settings, setTool } = useBuyer();
  const { program, downPct } = tools.pay;
  const result = calcPayment({ price: home.price, program, downPct, settings });
  const rate = ratesOf(settings)[program] ?? 0;

  const changeNumbers = () => {
    if (tools.pay.homeId !== home.id) setTool('pay', { homeId: home.id });
    onOpenTool(paymentTool);
  };

  return (
    <section className="rr-pay" aria-labelledby="home-payment">
      <h2 id="home-payment" className="rr-pay__label">Your est. payment</h2>
      <p className="rr-pay__fig">
        {money(result.total)}
        <span className="rr-pay__per" aria-hidden="true">/mo</span>
        <Hidden> a month</Hidden>
      </p>
      <p className="rr-pay__line">
        For a {money(home.price)} home, {downPct}% down on {loanWords(program)} at {rate.toFixed(2)}% fixed for 30
        years{inTheSum(result)}. An estimate, not a loan offer.
      </p>
      <div className="rr-pay__links">
        <button type="button" className="rr-pay__link" onClick={changeNumbers}>
          Change my numbers
        </button>
        {affordTool ? (
          <button type="button" className="rr-pay__link" onClick={() => onOpenTool(affordTool)}>
            What can I afford?
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One home as the board draws it: the photo with its top-left corner rounder than the rest and a save
 * heart over it, the price large in the serif with the monthly estimate beside it, a line of facts, and
 * small sand chips for the plan's name, its lot and how many are left. The card opens the home's page;
 * the heart is its own button after it, so the two are never one control inside another.
 */
function HomeCard({ home, saved, monthly, showLot, onOpen, onSave }) {
  const price = num(home.price);
  const sqft = num(home.sqft);
  const facts = [
    `${num(home.beds)} bd`,
    `${num(home.baths)} ba`,
    sqft ? `${sqft.toLocaleString('en-US')} sq ft` : '',
    String(home.availability ?? '').trim(),
  ].filter(Boolean);
  const units = unitsLabel(home);

  return (
    <li className={`rr-card${isSold(home) ? ' rr-card--sold' : ''}`}>
      <button type="button" className="rr-card__open" onClick={() => onOpen(home)}>
        <span className="rr-card__photo">
          {home.photos.length ? (
            <Photo photo={home.photos[0]} alt="" label="" quiet />
          ) : (
            <span className="rr-card__nophoto">
              <HouseGlyph />
              <span>Photo coming soon</span>
            </span>
          )}
        </span>
        <span className="rr-card__body">
          <span className="rr-card__money">
            <span className="rr-card__price">{price ? money(price) : 'Price coming soon'}</span>
            {monthly ? (
              <span className="rr-card__est">
                <span className="rr-card__estword">est. </span>
                {money(monthly)}
                <span aria-hidden="true">/mo</span>
                <Hidden> a month</Hidden>
              </span>
            ) : null}
          </span>
          <span className="rr-card__facts">{facts.join(' · ')}</span>
          <span className="rr-chips">
            <span className="rr-chip">{home.name}</span>
            {showLot && home.lotNumber ? <span className="rr-chip">{home.lotNumber}</span> : null}
            {units ? <span className="rr-chip rr-chip--units">{units}</span> : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="rr-card__save"
        aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
        aria-pressed={saved}
        onClick={() => onSave(home)}
      >
        <Heart size={20} filled={saved} />
      </button>
    </li>
  );
}

/** The mark a tool carries once its answer is in the plan. The words are there too, so colour is not the only sign. */
function InPlan() {
  return (
    <span className="rr-inplan">
      <span className="rr-inplan__tick" aria-hidden="true">✓ </span>In your plan
    </span>
  );
}

/** One tool as a tile: its name in the serif, the question it answers, and whether it is in the plan yet. */
function ToolTile({ tool, done, onOpen }) {
  return (
    <li>
      <button type="button" className="rr-tool" onClick={() => onOpen(tool)}>
        <span className="rr-tool__name">{tool.name}</span>
        <span className="rr-tool__q">{tool.q}</span>
        {done ? <InPlan /> : null}
      </button>
    </li>
  );
}

/** A tile for a place near the community: an icon, a title and what is there. */
function PlaceTile({ icon, title, sub, onOpen }) {
  return (
    <li>
      <button type="button" className="rr-place" onClick={onOpen}>
        <span className="rr-place__icon">{icon}</span>
        <span className="rr-place__text">
          <span className="rr-place__title">{title}</span>
          <span className="rr-place__sub">{sub}</span>
        </span>
        <span className="rr-place__go"><ChevronRight /></span>
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
    <section className="rr-lender" aria-labelledby="home-financing">
      <h2 id="home-financing" className="rr-h2">Financing</h2>
      <LenderLogo tone="light" height={44} className="rr-lender__logo" />
      {lender.tagline ? <p className="rr-lender__line">{lender.tagline}</p> : null}
      <button type="button" className="rr-btn rr-btn--plum" onClick={onOpen}>
        Talk about financing
      </button>
      <LoanProcessLink className="rr-btn rr-btn--line" />
      <div className="rr-lender__legal">
        <EhlMark tone="light" height={40} />
        <span className="rr-lender__id b-lender-card__text">
          <span>
            {lender.name} · NMLS #{lender.nmls}
            {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
          </span>
          {lender.phone ? (
            phoneHref ? <a className="rr-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
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
    <div className="rr-res__item">
      <h3 className="rr-res__title">{item.title}</h3>
      {boxed ? (
        <article className="rr-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch, and a
              // buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="rr-res__video"
            />
          ) : embed ? (
            <div className="rr-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="rr-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * Red Rock's home screen, from the shared model, in the order the board draws it: the greeting in the big
 * serif, how far the buyer's plan has come, the builder incentive (above the homes, where every layout puts
 * it), the dark payment panel, then "Homes you can tour" as cards and the tools as two-across tiles.
 * After those come the sections every home screen has, in Marketplace's order and on its conditions: the
 * lender, what is around the community, the agents to tour with, the guides, the FAQ, and last the
 * builder's own videos and articles.
 *
 * Every datum and handler is the model's and does what it does in every other layout; this decides only
 * where each goes and how it looks. The payment panel and each card's monthly figure are shown only while
 * the Payment tool is switched on: a builder who turned it off chose not to show payments.
 */
export default function Home({ model }) {
  const {
    community, paths, homes, leadTools, otherTools, resources, inPlan, isSaved, savedCount,
    openTool, openExplore, openArea, openMap, openLender, openHome, toggleSave,
  } = model;
  const { tools, settings, features } = useBuyer();
  const faq = useFaq();

  const paymentTool = toolOf(community, 'payment');
  const affordTool = toolOf(community, 'afford');
  const { program, downPct } = tools.pay;
  const monthlyOf = (home) => {
    if (!paymentTool || isSold(home) || !num(home.price)) return 0;
    return calcPayment({ price: home.price, program, downPct, settings }).total;
  };
  const panelHome = paymentTool ? paymentHome(homes, tools.pay.homeId) : null;
  const shown = homesToShow(homes);
  const estimates = shown.some((home) => monthlyOf(home) > 0);

  const allTools = [...leadTools, ...otherTools];
  const doneTools = allTools.filter((tool) => inPlan(tool.k)).length;
  const nearby = model.hasSpots || model.hasMap;
  // The lender and the places share a row on a wide screen only when both are drawn. The lender card draws
  // nothing until the lender is set up, and a row with one of the two leaves half of it empty.
  const lenderReady = complianceOf(community?.settings, { community }).lender.ready;
  const duo = nearby && lenderReady;

  // The board's question needs homes to point at; with none listed yet the greeting is a welcome instead.
  // A name the builder typed with its own full stop ("Willow Creek Estates, Inc.") is not given a second.
  const first = model.firstName;
  const place = community?.name ?? 'your new community';
  const question = homes.length ? 'Could one of these be yours?' : `Welcome to ${place}${/[.?!]$/.test(place) ? '' : '.'}`;
  const headline = model.greeting.headline || (first ? `Hi ${first}. ${question}` : question);
  const subhead =
    model.greeting.subhead ||
    (!homes.length
      ? 'Have a look around while we add the homes.'
      : paymentTool
        ? 'Tap any home to see your real monthly payment, with taxes, insurance and HOA in it.'
        : 'Tap any home to see its photos, floor plans and price.');

  // "See all" is a link, so it can be opened in a new tab; an ordinary click goes through the model, which
  // records the visit the way every other way into Explore Homes does.
  const seeAll = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openExplore();
  };

  return (
    <div className="b-shell rr-home">
      <div className={`rr-top${panelHome ? ' rr-top--pay' : ''}`}>
        <div className="rr-top__main">
          <div className="rr-intro">
            <h1 className="rr-h1">{headline}</h1>
            <p className="rr-lede">{subhead}</p>
          </div>
          {allTools.length ? <Progress done={doneTools} total={allTools.length} /> : null}
          <IncentiveCard className="rr-incentive" />
        </div>
        {panelHome ? (
          <PaymentPanel home={panelHome} paymentTool={paymentTool} affordTool={affordTool} onOpenTool={openTool} />
        ) : null}
      </div>

      <section className="rr-sec rr-homes" aria-labelledby="home-homes">
        <div className="rr-sec__head">
          <h2 id="home-homes" className="rr-h2">Homes you can tour</h2>
          {homes.length > shown.length ? (
            <Link to={paths.explore} className="rr-more" onClick={seeAll}>
              See all {homes.length}
              <ChevronRight size={16} />
            </Link>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="rr-grid" role="list">
            {shown.map((home) => (
              <HomeCard
                key={home.id}
                home={home}
                saved={isSaved(home.id)}
                monthly={monthlyOf(home)}
                showLot={Boolean(features.lotNumbers)}
                onOpen={openHome}
                onSave={toggleSave}
              />
            ))}
          </ul>
        ) : (
          <div className="rr-empty">
            <HouseGlyph size={34} />
            <p className="rr-empty__title">No homes listed yet</p>
            <p className="rr-empty__text">We’re still adding homes to this community. Check back soon.</p>
          </div>
        )}
        {estimates ? (
          <p className="rr-note">
            Each monthly figure is an estimate on the same loan and down payment as your payment above, not a loan offer.
          </p>
        ) : null}
      </section>

      <section className="rr-sec rr-steps" aria-labelledby="home-steps">
        <h2 id="home-steps" className="rr-h2">Your steps</h2>
        {allTools.length ? (
          <>
            <p className="rr-sub">Each one you finish goes into My Home Plan.</p>
            <ul className="rr-tools" role="list">
              {allTools.map((tool) => (
                <ToolTile key={tool.k} tool={tool} done={inPlan(tool.k)} onOpen={openTool} />
              ))}
            </ul>
          </>
        ) : (
          <div className="rr-empty rr-empty--slim">
            <p className="rr-empty__title">More is on the way</p>
            <p className="rr-empty__text">For now, save the homes you like and keep them in My Home Plan.</p>
          </div>
        )}
        <div className="rr-pair">
          <Link to={paths.saved} className="rr-btn rr-btn--line">
            <Heart size={18} filled={savedCount > 0} /> Homes I Like · {savedCount}
          </Link>
          <Link to={paths.plan} className="rr-btn rr-btn--plum">My Home Plan</Link>
        </div>
      </section>

      <div className={`rr-duo${duo ? ' rr-duo--two' : ''}`}>
        <LenderCard onOpen={openLender} />

        {nearby ? (
          <section className="rr-sec rr-near" aria-labelledby="home-nearby">
            <h2 id="home-nearby" className="rr-h2">Around {community?.name ?? 'the community'}</h2>
            <ul className="rr-places" role="list">
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
      </div>

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who is ready to see a home
          should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section className="rr-sec rr-agents" aria-labelledby="home-agents">
          <h2 id="home-agents" className="rr-h2">Schedule your tour</h2>
          <AgentsBlock />
        </section>
      ) : null}

      {/* Three, with the way to the rest, so the screen stays a home screen and not a reading list. */}
      {model.showGuides ? (
        <section className="rr-sec" aria-labelledby="home-guides">
          <div className="rr-sec__head">
            <h2 id="home-guides" className="rr-h2">Learn</h2>
            {model.guides.length > model.featuredGuides.length ? (
              <Link to={paths.guides} className="rr-more">
                All {model.guides.length} buyer guides
                <ChevronRight size={16} />
              </Link>
            ) : null}
          </div>
          <div className="b-glist rr-guides">
            {model.featuredGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>
      ) : null}

      {faq.length ? (
        <section className="rr-sec rr-faq" aria-labelledby="home-faq">
          <h2 id="home-faq" className="rr-h2">FAQ</h2>
          <FaqList items={faq} />
        </section>
      ) : null}

      {resources.length ? (
        <section className="rr-sec" aria-labelledby="home-worth-knowing">
          <h2 id="home-worth-knowing" className="rr-h2">Worth knowing</h2>
          <div className="rr-res">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
