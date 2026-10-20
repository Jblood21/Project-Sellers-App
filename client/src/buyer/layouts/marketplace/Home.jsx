import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  HOME_SORTS, PROGRAMS, TOOLS, calcPayment, isSold, listHomes, money, num, priceSteps, ratesOf, unitsLabel,
  videoEmbed,
} from '@shared/domain.js';
import { complianceOf, telHref } from '@shared/compliance.js';
import Photo from '../../../components/Photo.jsx';
import { useBuyer } from '../../BuyerContext.jsx';
import LenderLogo, { EhlMark } from '../../LenderLogo.jsx';
import AgentsBlock from '../../AgentsBlock.jsx';
import FaqList, { useFaq } from '../../FaqList.jsx';
import IncentiveCard from '../../IncentiveCard.jsx';
import LoanProcessLink from '../../LoanProcessLink.jsx';
import { ChevronRight, Heart, HouseGlyph, MapGlyph, PinGlyph } from './icons.jsx';

/** A price as a filter offers it: "$425K", "$1.25M". The cards print the full figure. */
function shortMoney(value) {
  const n = num(value);
  if (n >= 1000000) return `$${Number((n / 1000000).toFixed(2))}M`;
  return `$${Math.round(n / 1000)}K`;
}

/** What a filter starts at, and what "Reset" puts back. */
const NO_FILTERS = { minPrice: '', maxPrice: '', minBeds: '', sort: HOME_SORTS[0].k };

/** The words on a card's badge, and the colour family the stylesheet gives it. */
function statusOf(home) {
  if (isSold(home)) return { label: 'Sold', tone: 'sold' };
  const label = String(home.availability ?? '').trim();
  if (!label) return null;
  return { label, tone: /ready/i.test(label) ? 'ready' : /construction/i.test(label) ? 'building' : 'planned' };
}

/**
 * The filter bar: price from and to, the fewest bedrooms, and the order, with how many homes are showing.
 * Plain selects, so a phone opens its own picker and a keyboard and a screen reader get controls they know.
 * It narrows what is on the screen and nothing else: nothing here is saved or reported.
 */
function Filters({ homes, value, onChange, shown }) {
  const steps = priceSteps(homes);
  const maxBeds = Math.min(5, Math.max(0, ...homes.map((home) => Math.floor(num(home.beds)))));
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  const filtered = value.minPrice || value.maxPrice || value.minBeds;

  return (
    <div className="mk-filters" role="search" aria-label="Filter the homes">
      <div className="mk-filter mk-filter--price" role="group" aria-labelledby="mk-price">
        <span id="mk-price" className="mk-filter__lbl">Price</span>
        <span className="mk-filter__pair">
          <select className="mk-select" value={value.minPrice} onChange={set('minPrice')} aria-label="Lowest price">
            <option value="">No min</option>
            {steps.map((price) => (
              <option key={price} value={price} disabled={Boolean(value.maxPrice) && price > num(value.maxPrice)}>
                {shortMoney(price)}
              </option>
            ))}
          </select>
          <span className="mk-filter__to" aria-hidden="true">to</span>
          <select className="mk-select" value={value.maxPrice} onChange={set('maxPrice')} aria-label="Highest price">
            <option value="">No max</option>
            {steps.map((price) => (
              <option key={price} value={price} disabled={Boolean(value.minPrice) && price < num(value.minPrice)}>
                {shortMoney(price)}
              </option>
            ))}
          </select>
        </span>
      </div>
      <label className="mk-filter">
        <span className="mk-filter__lbl">Beds</span>
        <select className="mk-select" value={value.minBeds} onChange={set('minBeds')}>
          <option value="">Any</option>
          {Array.from({ length: maxBeds }, (_, i) => i + 1).map((beds) => (
            <option key={beds} value={beds}>{beds}+</option>
          ))}
        </select>
      </label>
      <label className="mk-filter mk-filter--sort">
        <span className="mk-filter__lbl">Sort</span>
        <select className="mk-select" value={value.sort} onChange={set('sort')}>
          {HOME_SORTS.map((sort) => (
            <option key={sort.k} value={sort.k}>{sort.name}</option>
          ))}
        </select>
      </label>
      <p className="mk-count" aria-live="polite">
        <b>{shown}</b> {shown === 1 ? 'home' : 'homes'}
        {filtered && shown !== homes.length ? <span className="mk-count__of"> of {homes.length}</span> : null}
      </p>
      {filtered ? (
        <button type="button" className="mk-link mk-reset" onClick={() => onChange({ ...NO_FILTERS, sort: value.sort })}>
          Reset filters
        </button>
      ) : null}
    </div>
  );
}

/**
 * One home as a listing: the photo with its status and the save heart over it, then the price, what it
 * could cost a month, the bedrooms, baths and floor area, and the plan's name and lot. The whole card opens
 * the home's page; the heart is its own button after it, so the two are never one control inside another.
 */
function ListingCard({ home, saved, monthly, showLot, onOpen, onSave }) {
  const status = statusOf(home);
  const price = num(home.price);
  const units = isSold(home) ? '' : unitsLabel(home);
  const sqft = num(home.sqft);

  return (
    <li className={`mk-card${isSold(home) ? ' mk-card--sold' : ''}`}>
      <button type="button" className="mk-card__open" onClick={() => onOpen(home)}>
        <span className="mk-card__photo">
          {home.photos.length ? (
            <Photo photo={home.photos[0]} alt="" label="" quiet />
          ) : (
            <span className="mk-card__nophoto">
              <HouseGlyph />
              <span>Photo coming soon</span>
            </span>
          )}
          {status ? <span className={`mk-badge mk-badge--${status.tone}`}>{status.label}</span> : null}
        </span>
        <span className="mk-card__body">
          <span className="mk-card__price">{price ? money(price) : 'Price coming soon'}</span>
          {monthly ? (
            <span className="mk-card__est">
              Est. <b>{money(monthly)}</b>/mo
            </span>
          ) : null}
          <span className="mk-card__facts">
            <span><b>{num(home.beds)}</b> {num(home.beds) === 1 ? 'bd' : 'bds'}</span>
            <span><b>{num(home.baths)}</b> ba</span>
            {sqft ? <span><b>{sqft.toLocaleString('en-US')}</b> sqft</span> : null}
          </span>
          <span className="mk-card__name">
            {home.name}
            {showLot && home.lotNumber ? <span className="mk-card__lot"> · {home.lotNumber}</span> : null}
          </span>
          {units ? <span className="mk-card__units">{units}</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="mk-card__save"
        aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
        aria-pressed={saved}
        onClick={() => onSave(home)}
      >
        <Heart size={22} filled={saved} />
      </button>
    </li>
  );
}

/** The mark a tool carries once its answer is in the plan. The word is there too, so colour is not the only sign. */
function InPlan() {
  return (
    <span className="mk-inplan">
      <span aria-hidden="true">✓ </span>In your plan
    </span>
  );
}

/** One of the two lead questions: a card with the question and the way in. */
function LeadTool({ tool, done, onOpen }) {
  return (
    <button type="button" className="mk-lead" onClick={() => onOpen(tool)}>
      {done ? <InPlan /> : null}
      <span className="mk-lead__name">{tool.name}</span>
      <span className="mk-lead__q">{tool.q}</span>
      <span className="mk-lead__go">
        Start <ChevronRight size={16} />
      </span>
    </button>
  );
}

/** A compact row for the rest of the tools, and for the places near the community. */
function Row({ title, sub, done, icon, onOpen }) {
  return (
    <li>
      <button type="button" className="mk-row" onClick={onOpen}>
        {icon ? <span className="mk-row__icon">{icon}</span> : null}
        <span className="mk-row__text">
          <span className="mk-row__title">{title}</span>
          <span className="mk-row__sub">{sub}</span>
          {done ? <InPlan /> : null}
        </span>
        <span className="mk-row__go"><ChevronRight /></span>
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
    <section className="mk-lender" aria-labelledby="home-financing">
      <h2 id="home-financing" className="mk-lender__kicker">Financing</h2>
      <LenderLogo tone="light" height={44} className="mk-lender__logo" />
      {lender.tagline ? <p className="mk-lender__line">{lender.tagline}</p> : null}
      <button type="button" className="mk-btn mk-btn--solid" onClick={onOpen}>
        Talk about financing
      </button>
      <LoanProcessLink className="mk-btn mk-btn--line" />
      <div className="mk-lender__legal">
        <EhlMark tone="light" height={40} />
        <span className="mk-lender__id b-lender-card__text">
          <span>
            {lender.name} · NMLS #{lender.nmls}
            {lo ? ` · ${lo.name}, NMLS #${lo.nmls}` : ''}
          </span>
          {lender.phone ? (
            phoneHref ? <a className="mk-lender__tel" href={phoneHref}>{lender.phone}</a> : <span>{lender.phone}</span>
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
    <div className="mk-res__item">
      <h3 className="mk-res__title">{item.title}</h3>
      {boxed ? (
        <article className="mk-res__box">
          {item.videoUrl ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video
              src={item.videoUrl}
              controls
              playsInline
              // metadata, not auto: the poster frame and the duration are enough to decide to watch, and a
              // buyer on mobile data should not pay for a clip they scroll past.
              preload="metadata"
              className="mk-res__video"
            />
          ) : embed ? (
            <div className="mk-res__frame">
              <iframe
                src={embed}
                title={item.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {body ? <p className="mk-res__body">{body}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

/**
 * Marketplace's home screen, from the shared model: the homes first, as a home-search site lists them.
 *
 * Every datum and handler the other homes have is here and does what it does there; this decides only
 * where each goes. The heading, the builder incentive (above the homes, where every layout puts it), a
 * filter bar and the homes as photo cards; then the tools as an affordability section beside the lender,
 * what is around the community, the agents to tour with, the guides as articles to read, the FAQ, and
 * last the builder's own videos and articles.
 *
 * Each card's monthly figure is the Payment tool's own sum (calcPayment) at the loan and down payment the
 * buyer last chose there, or its starting ones, with the community's rates, taxes, insurance and HOA. It
 * is shown only while that tool is switched on: a builder who turned it off chose not to show payments.
 */
export default function Home({ model }) {
  const {
    community, paths, homes, leadTools, otherTools, resources, inPlan, isSaved, savedCount,
    openTool, openArea, openMap, openLender, openHome, toggleSave,
  } = model;
  const { tools, settings, features } = useBuyer();
  const faq = useFaq();
  const [filters, setFilters] = useState(NO_FILTERS);

  const shown = listHomes(homes, {
    minPrice: filters.minPrice || null,
    maxPrice: filters.maxPrice || null,
    minBeds: filters.minBeds || 0,
    sort: filters.sort,
  });
  const paymentTool = community?.tools?.payment ? TOOLS.find((tool) => tool.k === 'payment') : null;
  const { program, downPct } = tools.pay;
  const monthlyOf = (home) => {
    if (!paymentTool || isSold(home) || !num(home.price)) return 0;
    return calcPayment({ price: home.price, program, downPct, settings }).total;
  };
  const rate = ratesOf(settings)[program] ?? 0;
  const estimates = Boolean(paymentTool) && shown.some((home) => monthlyOf(home) > 0);
  const nearby = model.hasSpots || model.hasMap;
  const allTools = leadTools.length + otherTools.length;

  return (
    <div className="b-shell mk-home">
      <div className="mk-intro">
        <h1 className="mk-h1">{model.greeting.headline || `Homes at ${community?.name ?? 'this community'}`}</h1>
        <p className="mk-lede">
          {model.greeting.subhead || 'Every home for sale here, with what it could cost you each month. Save the ones you like.'}
        </p>
      </div>

      <IncentiveCard className="mk-incentive" />

      <section className="mk-listings" aria-labelledby="home-homes">
        <h2 id="home-homes" className="mk-visually-hidden">Homes for sale</h2>
        {homes.length ? <Filters homes={homes} value={filters} onChange={setFilters} shown={shown.length} /> : null}

        {!homes.length ? (
          <div className="mk-empty">
            <HouseGlyph size={36} />
            <p className="mk-empty__title">No homes listed yet</p>
            <p className="mk-empty__text">We’re still adding homes to this community. Check back soon.</p>
          </div>
        ) : !shown.length ? (
          <div className="mk-empty">
            <HouseGlyph size={36} />
            <p className="mk-empty__title">No homes match these filters</p>
            <p className="mk-empty__text">Try a wider price range or fewer bedrooms.</p>
            <button type="button" className="mk-btn mk-btn--line mk-empty__btn" onClick={() => setFilters(NO_FILTERS)}>
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="mk-grid" role="list">
            {shown.map((home) => (
              <ListingCard
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
        )}

        {estimates ? (
          <p className="mk-note">
            Estimated monthly payments: {PROGRAMS[program] ?? program} loan, {downPct}% down, {rate.toFixed(2)}% fixed for
            30 years, with property taxes, insurance and HOA dues. An estimate, not a loan offer.{' '}
            <button type="button" className="mk-link" onClick={() => openTool(paymentTool)}>
              Change these in {paymentTool.name}
            </button>
          </p>
        ) : null}
      </section>

      <div className="mk-money">
        <section className="mk-afford" aria-labelledby="home-afford">
          <h2 id="home-afford" className="mk-h2">Can you buy one of these?</h2>
          <p className="mk-sub">
            {allTools
              ? 'Find out what fits your budget and what a home would cost you each month, then build your own home plan.'
              : 'Keep the homes you like together, and build your own home plan.'}
          </p>
          {leadTools.length ? (
            <div className={`mk-leads${leadTools.length > 1 ? ' mk-leads--two' : ''}`}>
              {leadTools.map((tool) => (
                <LeadTool key={tool.k} tool={tool} done={inPlan(tool.k)} onOpen={openTool} />
              ))}
            </div>
          ) : null}
          {otherTools.length ? (
            <ul className="mk-rows" role="list">
              {otherTools.map((tool) => (
                <Row key={tool.k} title={tool.name} sub={tool.q} done={inPlan(tool.k)} onOpen={() => openTool(tool)} />
              ))}
            </ul>
          ) : null}
          <div className="mk-pair">
            <Link to={paths.saved} className="mk-btn mk-btn--line">
              <Heart size={18} filled={savedCount > 0} /> Homes I Like · {savedCount}
            </Link>
            <Link to={paths.plan} className="mk-btn mk-btn--solid">My Home Plan</Link>
          </div>
        </section>

        <LenderCard onOpen={openLender} />
      </div>

      {nearby ? (
        <section className="mk-sec" aria-labelledby="home-nearby">
          <h2 id="home-nearby" className="mk-h2">Around {community?.name ?? 'the community'}</h2>
          <ul className="mk-rows mk-rows--tiles" role="list">
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

      {/* The agent, listed in full on the page, ahead of the guides: a buyer who is ready to see a home
          should not have to scroll past reading to do it. */}
      {model.showAgents ? (
        <section className="mk-sec mk-agents" aria-labelledby="home-agents">
          <h2 id="home-agents" className="mk-h2">Schedule your tour</h2>
          <AgentsBlock />
        </section>
      ) : null}

      {/* Three, with the way to the rest, so the screen stays a home screen and not a reading list. */}
      {model.showGuides ? (
        <section className="mk-sec" aria-labelledby="home-guides">
          <div className="mk-sec__head">
            <h2 id="home-guides" className="mk-h2">Learn</h2>
            {model.guides.length > model.featuredGuides.length ? (
              <Link to={paths.guides} className="mk-link mk-more">
                All {model.guides.length} buyer guides <ChevronRight size={16} />
              </Link>
            ) : null}
          </div>
          <ul className="mk-articles" role="list">
            {model.featuredGuides.map((guide) => (
              <li key={guide.id}>
                <Link to={`${paths.guides}/${guide.slug}`} className="mk-article">
                  <span className="mk-article__img" aria-hidden="true">
                    {guide.image ? <img src={guide.image} alt="" loading="lazy" decoding="async" /> : null}
                  </span>
                  <span className="mk-article__text">
                    {guide.category ? <span className="mk-article__kicker">{guide.category}</span> : null}
                    <span className="mk-article__title">{guide.title}</span>
                    {guide.summary ? <span className="mk-article__sum">{guide.summary}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {faq.length ? (
        <section className="mk-sec" aria-labelledby="home-faq">
          <h2 id="home-faq" className="mk-h2">FAQ</h2>
          <FaqList items={faq} />
        </section>
      ) : null}

      {resources.length ? (
        <section className="mk-sec" aria-labelledby="home-worth-knowing">
          <h2 id="home-worth-knowing" className="mk-h2">Worth knowing</h2>
          <div className="mk-res">
            {resources.map((item) => (
              <Resource key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
