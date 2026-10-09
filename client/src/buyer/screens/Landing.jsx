import { useNavigate, useParams } from 'react-router-dom';

import Photo from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';
import GateForm from './GateForm.jsx';

/**
 * What a buyer sees straight off the QR code on the development sign: the community's picture,
 * "Welcome to <name>", and the way in. No other headings and no explanation. Someone already signed
 * in on this device gets the same page with a single button in place of the form.
 */
export default function Landing({ onEntered }) {
  const { community, signedIn } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  const hero = community?.heroPhoto ? { url: community.heroPhoto } : null;

  return (
    // `b-gate` as well: the layouts style a page that holds the sign-in form under that name.
    <div className="b-shell b-landing b-gate" style={{ minHeight: '100vh', paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
      <div className={`b-landing__hero${hero ? '' : ' b-landing__hero--none'}`}>
        {hero ? <Photo eager quiet photo={hero} alt={`${community?.name} community photo`} /> : null}
      </div>
      <h1
        className="b-head b-landing__welcome"
        data-punct={/[.?!]$/.test(community?.name ?? '') || undefined}
      >
        Welcome to {community?.name}
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
