import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Star } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import ImageViewer from '../ImageViewer.jsx';
import { canMessage } from '../../lib/contact.js';
import TourButton from '../TourButton.jsx';

export default function Explore() {
  const { community, homes, lead, toggleSave, track, agents, features } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  // The server already withholds this when the builder has the site map
  // switched off, so its presence is the only condition worth checking.
  const map = community?.siteMap ? [{ id: 'map', url: community.siteMap }] : [];
  const [mapOpen, setMapOpen] = useState(false);
  const placed = homes.filter((home) => home.lotNumber).length;
  // Only the agents a message can reach: a heading with no button under it helps nobody.
  const reachable = agents.filter(canMessage);

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 12px', fontSize: 22 }}>Explore Homes</h1>

      {homes.length === 0 ? (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>
          We’re still adding homes to this community. Check back soon.
        </p>
      ) : null}
      <div className="b-stack" style={{ gap: 14 }}>
        {homes.map((home) => {
          const saved = lead?.savedHomeIds?.includes(home.id);
          return (
            <div
              key={home.id}
              onClick={() => {
                track(`Viewed ${home.name} (${home.photos.length} photos)`);
                navigate(`/c/${communityId}/homes/${home.id}`);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate(`/c/${communityId}/homes/${home.id}`);
              }}
              className="b-card"
              style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
            >
              <button
                type="button"
                aria-label={saved ? `Remove ${home.name} from Homes I Like` : `Save ${home.name}`}
                aria-pressed={saved}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSave(home);
                }}
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 2, width: 44, height: 44,
                  borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: saved ? 'var(--t-acc)' : 'var(--t-bg)',
                  color: saved ? 'var(--t-onacc)' : 'var(--t-acc)',
                  boxShadow: '0 2px 8px rgba(0,0,0,.18)',
                }}
              >
                <Star filled={saved} />
              </button>
              <div style={{ height: 130, margin: -1, marginBottom: 0 }}>
                <Photo
                  photo={home.photos[0]}
                  label={`${home.name} photo`}
                  alt={`${home.name} photo 1 of ${home.photos.length}`}
                />
              </div>
              <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="b-head" style={{ fontSize: 18 }}>{home.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{money(home.price)}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--t-mut)' }}>
                  {homeMeta(home)} · {home.availability}
                  {home.lotNumber ? ` · ${home.lotNumber}` : ''}
                </span>
                {home.photos.length > 1 ? (
                  <span style={{ fontSize: 11, color: 'var(--t-mut)' }}>{home.photos.length} photos</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Under the homes: a buyer who has found one they like is a buyer who wants
        to see it. The button opens a message to the agent, already written. With
        several agents each gets their own, so the buyer chooses who to ask.
      */}
      {features.agents && reachable.length ? (
        <section className="b-tour" style={{ marginTop: 22 }} aria-labelledby="explore-ready">
          <h2 id="explore-ready" className="b-tour__meet b-head">Ready to look at homes?</h2>
          {reachable.map((agent) => (
            <TourButton
              key={agent.id}
              agent={agent}
              label={reachable.length > 1 ? `Tour the homes with ${agent.name}` : 'Tour the homes'}
              className="b-btn"
            />
          ))}
        </section>
      ) : null}

      {/*
        The plat, under the list rather than on a screen of its own. A buyer
        scrolling for a home wants the homes first; the map is what they reach
        for once they have one in mind and want to know where it sits. The lot
        numbers on the cards above are the other half of that answer, so it
        still belongs on this screen — just after them, not before.
      */}
      {map.length ? (
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={() => {
              track('Opened the site map from Explore Homes');
              setMapOpen(true);
            }}
            aria-label={`Open the ${community?.name} site map full screen`}
            style={{
              width: '100%', padding: 0, cursor: 'zoom-in', background: 'var(--t-sur)',
              border: '1px solid var(--t-line)', borderRadius: 'var(--t-radlg)', overflow: 'hidden',
            }}
          >
            <div style={{ height: 170 }}>
              <Photo photo={map[0]} label="" alt={`${community?.name} site map`} />
            </div>
          </button>
          <span style={{ display: 'block', marginTop: 7, fontSize: 12, color: 'var(--t-mut)' }}>
            {placed
              ? 'Tap the site map to open it full screen, then match the lot numbers to the homes above.'
              : 'Tap the site map to open it full screen.'}
          </span>
        </div>
      ) : null}

      <ImageViewer
        images={map}
        index={mapOpen ? 0 : null}
        onClose={() => setMapOpen(false)}
        label={`${community?.name} site map`}
      />
    </div>
  );
}
