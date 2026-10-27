import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { isSold, unitsLabel, videoEmbed } from '@shared/domain.js';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { layoutTraits } from '../layouts/index.js';
import { canTalkFinancing } from '../reach.js';
import { ToolSheet } from '../tools/index.jsx';
import ImageViewer from '../ImageViewer.jsx';
import OpenHouseCard from '../OpenHouseCard.jsx';
import { useOpenHouses } from '../openHouse.js';
import AgentCard from '../AgentCard.jsx';
import VideoViewer from '../VideoViewer.jsx';

/**
 * One home's page. For a community it is reached from Explore (`homes/:homeId`). A listing is one home, so its
 * `home` route passes no id and the page shows that home, with what a buyer of a single house wants first: where
 * it stands, its facts, the open houses and a way to ask for a showing (`onRequestShowing`, null when there is
 * nobody to send the buyer to).
 */
export default function HomeDetail({ onOpenLender, onRequestShowing = null }) {
  // Which plan the viewer is showing; null means closed.
  const [planIndex, setPlanIndex] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // Which of the home's photos the viewer is showing; null means closed. And the video tour player.
  const [photoIndex, setPhotoIndex] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const { community, homes, lead, toggleSave, track, setTool, agents, features, layout, isListing } = useBuyer();
  const { communityId, homeId } = useParams();
  const navigate = useNavigate();
  const { today, time, sessions } = useOpenHouses(community?.settings);

  // A listing's one home is the first (the only) one; a community's is the one the address names.
  const home = isListing ? homes[0] : homes.find((h) => h.id === homeId);

  // The agent sees that the buyer looked at the home, as Explore records it for a community.
  const viewed = useRef(null);
  useEffect(() => {
    if (!isListing || !home || viewed.current === home.id) return;
    viewed.current = home.id;
    track(`Viewed ${home.name} (${home.photos.length} photos)`);
  }, [isListing, home, track]);

  if (!home) {
    if (isListing) {
      return (
        <div className="b-shell" style={{ paddingTop: 24 }}>
          <p style={{ color: 'var(--t-mut)', fontSize: 14 }}>This home isn&apos;t ready to view yet. Check back soon.</p>
        </div>
      );
    }
    return <Navigate to={`/c/${communityId}/explore`} replace />;
  }
  const status = isListing ? community?.status : null;
  const sold = status === 'Sold';
  const settings = community?.settings ?? {};
  const mls = isListing ? String(settings.mlsNumber ?? '').trim() : '';
  const brokerage = isListing ? String(community?.builder ?? '').trim() : '';
  const listingFacts = isListing
    ? [homeMeta(home), mls ? `MLS #${mls}` : '', brokerage ? `Listed with ${brokerage}` : ''].filter(Boolean)
    : [];

  const saved = lead?.savedHomeIds?.includes(home.id);
  // The first photo is the hero; the rest are tiles under the floor plans. The builder chooses the order.
  const hero = home.photos[0] ?? null;
  const more = home.photos.slice(1);
  // The video tour is an uploaded file or a YouTube/Vimeo link, never both. Nothing is shown without one.
  const embed = home.videoUrl ? '' : videoEmbed(home.videoLink);
  const hasVideo = Boolean(home.videoUrl || embed);
  // A layout that asks for it gets photos 2 to 5 as a grid beside the hero, the way a listing opens; its
  // stylesheet shows the grid on a wide screen and hides those four from "More photos" while it does. Only
  // with all four, because a grid with holes in it looks broken. Every other layout's page is unchanged.
  const { photoGrid: gridLayout, heroSizes } = layoutTraits(layout);
  const photoGrid = gridLayout && more.length >= 4;

  return (
    // The b-hd names carry no style of their own; they are there so a layout can arrange the page (a
    // photo grid, the actions in a column beside the details) without matching the inline styles.
    <div className="b-shell b-hd" style={{ paddingTop: 16 }}>
      {/* The hero: this home's first photo, big. Tap it to see all of them full size. */}
      <button
        type="button"
        className="b-homehero"
        disabled={!hero}
        onClick={() => setPhotoIndex(0)}
        aria-label={hero ? `Open ${home.name} photo 1 of ${home.photos.length}` : undefined}
      >
        <Photo
          eager photo={hero} label={`${home.name} — photo coming soon`} alt={`${home.name} photo 1 of ${home.photos.length || 1}`}
          // From 520 to 1144 px wide on a wide screen, by layout, and on a phone wider than the box,
          // which is shorter than a wide photo's shape; each layout says (layouts/index.js).
          sizes={heroSizes}
        />
      </button>
      {photoGrid ? (
        <div className="b-hd__grid">
          {more.slice(0, 4).map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className="b-hd__thumb"
              onClick={() => setPhotoIndex(index + 1)}
              aria-label={`Open ${home.name} photo ${index + 2} of ${home.photos.length}`}
            >
              <Photo photo={photo} alt="" sizes="410px" />
              {/* On the last of the four, how many there are in all, since the viewer holds the rest. */}
              {index === 3 && home.photos.length > 5 ? (
                <span className="b-hd__count" aria-hidden="true">{home.photos.length} photos</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="b-hd__title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <h1 className="b-head" style={{ fontSize: 24 }} data-punct={/[.?!]$/.test(home.name ?? '') || undefined}>{home.name}</h1>
        {isListing && !(Number(home.price) > 0) ? null : <span style={{ fontWeight: 700, fontSize: 19 }}>{money(home.price)}</span>}
      </div>
      {isListing ? (
        <>
          {community?.location ? <span className="b-ls-city">{community.location}</span> : null}
          {status && status !== 'Active' ? (
            <p className="b-ls-banner" data-status={status} role="status">
              {status === 'Coming soon' ? 'Coming soon. This home is not on the market yet.' : null}
              {status === 'Under contract' ? 'Under contract. This home has an accepted offer.' : null}
              {status === 'Sold' ? 'Sold. This home is no longer available.' : null}
            </p>
          ) : null}
          {listingFacts.length ? (
            <ul className="b-ls-facts" aria-label="Facts about the home">
              {listingFacts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          ) : null}
          {sold ? null : <OpenHouseCard sessions={sessions} today={today} time={time} />}
        </>
      ) : (
        <span className="b-hd__meta" style={{ fontSize: 13, color: 'var(--t-mut)' }}>
          {[homeMeta(home), home.availability, home.lotNumber].filter(Boolean).join(' · ')}
        </span>
      )}
      {/*
        Its own line rather than another item in the grey run above: how many
        are left is the one fact here that changes a buyer's mind about waiting,
        and sold is not something to find at the end of a list of measurements.
      */}
      {!isListing && unitsLabel(home) ? (
        // A block wrapper, not alignSelf: .b-shell is not a flex container, so
        // the badge would otherwise run straight on from the line above and
        // read "Move-in ready4 available".
        <div className="b-hd__units" style={{ marginTop: 8 }}>
          <span
            style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 700, letterSpacing: '.02em',
              background: isSold(home) ? 'rgba(138,28,17,.10)' : 'var(--t-tint)',
              color: isSold(home) ? '#8a1c11' : 'var(--t-accT)',
              border: `1px solid ${isSold(home) ? 'rgba(138,28,17,.25)' : 'var(--t-line)'}`,
            }}
          >
            {unitsLabel(home)}
          </span>
        </div>
      ) : null}
      {/* A home added without a description has none to show: no stand-in line is written for it. */}
      {home.description ? (
        <p className="b-hd__desc" style={{ fontSize: 14, lineHeight: 1.55, margin: '12px 0 16px' }}>{home.description}</p>
      ) : null}

      {/*
        Under the description: a buyer scanning photos is not yet deciding to stop and watch. A button, not an
        always-there player, so nobody on mobile data pays for a clip they scrolled past.
      */}
      {hasVideo ? (
        <button
          type="button"
          className="b-btn b-btn-outline b-hd__video"
          style={{ marginBottom: 16 }}
          onClick={() => {
            track(`Watched the video tour of ${home.name}`);
            setVideoOpen(true);
          }}
        >
          ▶ Watch the video tour
        </button>
      ) : null}

      {home.floorPlans?.length ? (
        <div className="b-hd__plans" style={{ marginBottom: 16 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 8 }}>Floor plans</span>
          <div className="scroll-x" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {home.floorPlans.map((plan, index) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setPlanIndex(index)}
                aria-label={`Open ${home.name} floor plan ${index + 1}`}
                style={{
                  flex: 'none', width: 150, height: 150, borderRadius: 'var(--t-rad)',
                  overflow: 'hidden', border: '1px solid var(--t-line)', background: '#fff',
                  display: 'block', padding: 0, cursor: 'pointer',
                }}
              >
                <Photo photo={plan} alt={`${home.name} floor plan ${index + 1} of ${home.floorPlans.length}`} fit="contain" sizes="148px" />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--t-mut)' }}>Tap a plan to see it full size.</span>
        </div>
      ) : null}

      {more.length ? (
        <div className={`b-hd__more${photoGrid ? ' b-hd__more--after-grid' : ''}`} style={{ marginBottom: 16 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 8 }}>More photos</span>
          <div className="b-tiles">
            {more.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className="b-tile"
                onClick={() => setPhotoIndex(index + 1)}
                aria-label={`Open ${home.name} photo ${index + 2} of ${home.photos.length}`}
              >
                <Photo photo={photo} alt={`${home.name} photo ${index + 2} of ${home.photos.length}`} sizes="(min-width: 600px) 450px, 55vw" />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--t-mut)' }}>Tap a photo to see it full size.</span>
        </div>
      ) : null}

      <div className="b-hd__actions">
        <div className="b-stack" style={{ gap: 10 }}>
          {/*
            First, because a buyer looking at a model is closest to wanting to know what it would
            take to own it. It opens the day-then-time picker for a conversation about financing
            with the lender; a tour is asked for below, through the agents.
          */}
          {/* A listing's main ask: to see the home. It goes where "Book a tour" goes, and the agent is told. */}
          {isListing && !sold && onRequestShowing ? (
            <button type="button" className="b-btn" style={{ minHeight: 50 }} onClick={onRequestShowing}>
              Request a showing
            </button>
          ) : null}
          {canTalkFinancing(community, features) ? (
            <button
              type="button"
              className={isListing && !sold && onRequestShowing ? 'b-btn b-btn-outline' : 'b-btn'}
              style={{ minHeight: 50 }}
              onClick={() => {
                track(`Asked about financing for ${home.name}`);
                onOpenLender();
              }}
            >
              Talk about financing
            </button>
          ) : null}
          {/* Only when the payment tool is on: with it off the sheet cannot open, so the button would do nothing. */}
          {community?.tools?.payment ? (
            <button
              type="button"
              className="b-btn b-btn-outline"
              style={{ minHeight: 50 }}
              onClick={() => {
                setTool('pay', { homeId: home.id });
                track(`Opened payment for ${home.name}`);
                setPaymentOpen(true);
              }}
            >
              See My Payment for This Home
            </button>
          ) : null}
          <button
            type="button"
            className="b-btn b-btn-outline"
            onClick={() => toggleSave(home)}
            style={saved ? { background: 'var(--t-acc)', color: 'var(--t-onacc)' } : undefined}
          >
            {isListing ? (saved ? '★ Saved' : '☆ Save this home') : (saved ? '★ Saved to My Home Plan' : '☆ Save to My Home Plan')}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--t-mut)', textAlign: 'center', margin: '10px 0 0' }}>
          {isListing
            ? 'Saving the home lets your agent know you\u2019re interested.'
            : 'Saving a home adds it to My Home Plan and tells the team you\u2019re interested.'}
        </p>
      </div>

      {/*
        Under the actions rather than above them: a buyer here is deciding about
        the home first, and who to talk to about buying it comes second. The
        agents are the community's, not this home's, so every home shows the same.
      */}
      {features.agents && agents.length ? (
        <section className="b-hd__agents" style={{ marginTop: 26 }} aria-labelledby="home-agents">
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <h2 id="home-agents" className="b-head" style={{ margin: '0 0 6px', fontSize: 24 }}>{isListing ? 'Want a showing?' : 'Want a Tour?'}</h2>
          <span className="b-lbl" style={{ display: 'block', margin: '0 0 12px', color: 'var(--t-accT)' }}>
            {isListing
              ? (agents.length > 1 ? 'Meet your agents.' : 'Meet your agent.')
              : (agents.length > 1 ? 'Meet the agents.' : 'Meet the agent.')}
          </span>
          <div className="b-stack" style={{ gap: 12 }}>
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} headingLevel={3} tour={false} />
            ))}
          </div>
        </section>
      ) : null}
    <ToolSheet
      open={paymentOpen}
      toolKey="payment"
      label="See My Payment"
      onClose={() => setPaymentOpen(false)}
    />
    <ImageViewer
        photos
        images={home.photos}
        index={photoIndex}
        onIndex={setPhotoIndex}
        onClose={() => setPhotoIndex(null)}
        label={`${home.name} photo`}
      />
    <VideoViewer
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        label={`${home.name} video tour`}
        src={home.videoUrl}
        embed={embed ?? ''}
      />
    <ImageViewer
        images={home.floorPlans ?? []}
        index={planIndex}
        onIndex={setPlanIndex}
        onClose={() => setPlanIndex(null)}
        label={`${home.name} floor plan`}
      />
    </div>
  );
}
