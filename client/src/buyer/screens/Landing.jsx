import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { homeMeta, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { nextOpenHouseLine, useOpenHouses } from '../openHouse.js';
import GuidesTeaser from '../GuidesTeaser.jsx';
import ListingAgentTop from '../ListingAgentTop.jsx';
import useFitHeading from '../useFitHeading.js';
import GateForm from './GateForm.jsx';

/**
 * What a buyer sees straight off the QR code on the development sign: the community's picture,
 * "Welcome to <name>", and the way in. No other headings and no explanation. Someone already signed
 * in on this device gets the same page with a single button in place of the form.
 *
 * This is the only way in: the sign-in is on the page itself, and every other "sign in" link and the old
 * /start address come back here. The name is typed by the builder and can be one word or a mouthful, so
 * the headline is sized to it (useFitHeading) rather than set at one size for all of them.
 */
export default function Landing({ onEntered }) {
  const { community, homes, signedIn, isListing } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  // A listing leads with the home's own first photo; an agent who has not added one yet still has the site's picture.
  const home = isListing ? homes[0] : null;
  const hero = (home?.photos?.[0]) ?? (community?.heroPhoto ? { url: community.heroPhoto } : null);
  const { today, sessions } = useOpenHouses(community?.settings);
  const status = community?.status;
  const facts = home ? homeMeta(home) : '';
  const nextOpen = status === 'Sold' ? null : sessions[0];
  const headingRef = useRef(null);
  useFitHeading(headingRef, community?.name);

  return (
    // `b-gate` as well: the layouts style a page that holds the sign-in form under that name.
    <div className="b-shell b-landing b-gate" style={{ minHeight: '100vh', paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      {/* A listing: the agent before the picture. */}
      <ListingAgentTop />
      <div className={`b-landing__hero${hero ? '' : ' b-landing__hero--none'}`}>
        {hero ? <Photo eager quiet photo={hero} alt={isListing ? `${community?.name} photo` : `${community?.name} community photo`} sizes="(min-width: 600px) 760px, 125vw" /> : null}
      </div>
      <h1
        ref={headingRef}
        className="b-head b-landing__welcome"
        data-punct={/[.?!]$/.test(community?.name ?? '') || undefined}
      >
        {/* One element holding the words, so the hook can count the lines they take. */}
        {/* "Welcome to" has its own element so a layout can set it apart from the name; the words and the span the hook measures are unchanged. */}
        {isListing ? (
          <span>{community?.name}</span>
        ) : (
          <span><span className="b-landing__hello">Welcome to </span>{community?.name}</span>
        )}
      </h1>
      {isListing ? (
        // A listing: the city, the price and facts, where it stands, and the next open house, then the way in.
        <div className="b-ls-lead">
          {community?.location ? <p className="b-ls-lead__city">{community.location}</p> : null}
          {status && status !== 'Active' ? <span className="b-ls-chip" data-status={status}>{status}</span> : null}
          {Number(home?.price) > 0 || facts ? (
            <p className="b-ls-lead__facts">
              {Number(home?.price) > 0 ? <strong>{money(home.price)}</strong> : null}
              {Number(home?.price) > 0 && facts ? <span aria-hidden="true"> · </span> : null}
              {facts}
            </p>
          ) : null}
          {nextOpen ? <p className="b-ls-lead__open">{nextOpenHouseLine(nextOpen, today)}</p> : null}
        </div>
      ) : (
        // Hidden here: a layout that sets the place under the name turns it on (Foyer does).
        community?.location ? <p className="b-landing__place" hidden>{community.location}</p> : null
      )}
      {signedIn ? (
        <button
          type="button" className="b-btn" style={{ minHeight: 52, fontSize: 16 }}
          onClick={() => navigate(`/c/${communityId}/${isListing ? 'home' : 'tools'}`)}
        >
          Continue
        </button>
      ) : (
        <GateForm onEntered={onEntered} />
      )}
      {/* A listing shows a few guides right here, readable before signing in. */}
      <GuidesTeaser />
    </div>
  );
}
