import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';
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
  const { community, signedIn } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  const hero = community?.heroPhoto ? { url: community.heroPhoto } : null;
  const headingRef = useRef(null);
  useFitHeading(headingRef, community?.name);

  return (
    // `b-gate` as well: the layouts style a page that holds the sign-in form under that name.
    <div className="b-shell b-landing b-gate" style={{ minHeight: '100vh', paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <div className={`b-landing__hero${hero ? '' : ' b-landing__hero--none'}`}>
        {hero ? <Photo eager quiet photo={hero} alt={`${community?.name} community photo`} /> : null}
      </div>
      <h1
        ref={headingRef}
        className="b-head b-landing__welcome"
        data-punct={/[.?!]$/.test(community?.name ?? '') || undefined}
      >
        {/* One element holding the words, so the hook can count the lines they take. */}
        <span>Welcome to {community?.name}</span>
      </h1>
      {signedIn ? (
        <button
          type="button" className="b-btn" style={{ minHeight: 52, fontSize: 16 }}
          onClick={() => navigate(`/c/${communityId}/tools`)}
        >
          Continue
        </button>
      ) : (
        <GateForm onEntered={onEntered} />
      )}
    </div>
  );
}
