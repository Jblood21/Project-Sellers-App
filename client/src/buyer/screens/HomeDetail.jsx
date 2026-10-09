import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { isSold, unitsLabel, videoEmbed } from '@shared/domain.js';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { ToolSheet } from '../tools/index.jsx';
import ImageViewer from '../ImageViewer.jsx';
import AgentCard from '../AgentCard.jsx';
import VideoViewer from '../VideoViewer.jsx';

export default function HomeDetail({ onOpenLender }) {
  // Which plan the viewer is showing; null means closed.
  const [planIndex, setPlanIndex] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // Which of the home's photos the viewer is showing; null means closed. And the video tour player.
  const [photoIndex, setPhotoIndex] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const { homes, lead, toggleSave, track, setTool, agents, features } = useBuyer();
  const { communityId, homeId } = useParams();
  const navigate = useNavigate();

  const home = homes.find((h) => h.id === homeId);
  if (!home) return <Navigate to={`/c/${communityId}/explore`} replace />;

  const saved = lead?.savedHomeIds?.includes(home.id);
  // The first photo is the hero; the rest are tiles under the floor plans. The builder chooses the order.
  const hero = home.photos[0] ?? null;
  const more = home.photos.slice(1);
  // The video tour is an uploaded file or a YouTube/Vimeo link, never both. Nothing is shown without one.
  const embed = home.videoUrl ? '' : videoEmbed(home.videoLink);
  const hasVideo = Boolean(home.videoUrl || embed);

  return (
    <div className="b-shell" style={{ paddingTop: 16 }}>
      {/* The hero: this home's first photo, big. Tap it to see all of them full size. */}
      <button
        type="button"
        className="b-homehero"
        disabled={!hero}
        onClick={() => setPhotoIndex(0)}
        aria-label={hero ? `Open ${home.name} photo 1 of ${home.photos.length}` : undefined}
      >
        <Photo eager photo={hero} label={`${home.name} — photo coming soon`} alt={`${home.name} photo 1 of ${home.photos.length || 1}`} />
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <h1 className="b-head" style={{ fontSize: 24 }} data-punct={/[.?!]$/.test(home.name ?? '') || undefined}>{home.name}</h1>
        <span style={{ fontWeight: 700, fontSize: 19 }}>{money(home.price)}</span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--t-mut)' }}>
        {homeMeta(home)} · {home.availability}
        {home.lotNumber ? ` · ${home.lotNumber}` : ''}
      </span>
      {/*
        Its own line rather than another item in the grey run above: how many
        are left is the one fact here that changes a buyer's mind about waiting,
        and sold is not something to find at the end of a list of measurements.
      */}
      {unitsLabel(home) ? (
        // A block wrapper, not alignSelf: .b-shell is not a flex container, so
        // the badge would otherwise run straight on from the line above and
        // read "Move-in ready4 available".
        <div style={{ marginTop: 8 }}>
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
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '12px 0 16px' }}>{home.description}</p>

      {/*
        Under the description: a buyer scanning photos is not yet deciding to stop and watch. A button, not an
        always-there player, so nobody on mobile data pays for a clip they scrolled past.
      */}
      {hasVideo ? (
        <button
          type="button"
          className="b-btn b-btn-outline"
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
        <div style={{ marginBottom: 16 }}>
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
                <Photo photo={plan} alt={`${home.name} floor plan ${index + 1} of ${home.floorPlans.length}`} fit="contain" />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--t-mut)' }}>Tap a plan to see it full size.</span>
        </div>
      ) : null}

      {more.length ? (
        <div style={{ marginBottom: 16 }}>
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
                <Photo photo={photo} alt={`${home.name} photo ${index + 2} of ${home.photos.length}`} />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--t-mut)' }}>Tap a photo to see it full size.</span>
        </div>
      ) : null}

      <div className="b-stack" style={{ gap: 10 }}>
        {/*
          First, because a buyer looking at a model is closest to wanting to know what it would
          take to own it. It opens the day-then-time picker for a conversation about financing
          with the lender; a tour is asked for below, through the agents.
        */}
        <button
          type="button"
          className="b-btn"
          style={{ minHeight: 50 }}
          onClick={() => {
            track(`Asked about financing for ${home.name}`);
            onOpenLender();
          }}
        >
          Talk about financing
        </button>
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
        <button
          type="button"
          className="b-btn b-btn-outline"
          onClick={() => toggleSave(home)}
          style={saved ? { background: 'var(--t-acc)', color: 'var(--t-onacc)' } : undefined}
        >
          {saved ? '★ Saved to My Home Plan' : '☆ Save to My Home Plan'}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--t-mut)', textAlign: 'center', margin: '10px 0 0' }}>
        Saving a home adds it to My Home Plan and tells the team you&apos;re interested.
      </p>

      {/*
        Under the actions rather than above them: a buyer here is deciding about
        the home first, and who to talk to about buying it comes second. The
        agents are the community's, not this home's, so every home shows the same.
      */}
      {features.agents && agents.length ? (
        <section style={{ marginTop: 26 }} aria-labelledby="home-agents">
          <hr className="b-rule" aria-hidden="true" style={{ margin: '0 0 12px' }} />
          <h2 id="home-agents" className="b-head" style={{ margin: '0 0 6px', fontSize: 24 }}>Want a Tour?</h2>
          <span className="b-lbl" style={{ display: 'block', margin: '0 0 12px', color: 'var(--t-accT)' }}>
            {agents.length > 1 ? 'Meet the agents.' : 'Meet the agent.'}
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
