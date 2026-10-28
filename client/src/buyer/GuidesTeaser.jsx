import { Link, useParams } from 'react-router-dom';

import { useBuyer } from './BuyerContext.jsx';
import { GuideCard } from './screens/Guides.jsx';

/**
 * A few of the buyer guides on the front of a listing, for someone who has not signed in yet as much as for someone
 * who has: guides are public, so a visitor at the open house can start reading before giving their details. The first
 * four in the agent's own order, then the way to the rest. Nothing is drawn when the guides are off or there are none,
 * and a community's front pages never use it.
 */
export default function GuidesTeaser({ count = 4, headingLevel = 2 }) {
  const { guides, features, isListing } = useBuyer();
  const { communityId } = useParams();
  if (!isListing || !features?.guides || !guides?.length) return null;
  const Heading = `h${headingLevel}`;
  const shown = guides.slice(0, count);
  return (
    <section className="b-ls-guides" aria-labelledby="listing-guides-title">
      <Heading id="listing-guides-title" className="b-head b-ls-guides__title">Buying a home? Start here</Heading>
      <p className="b-ls-guides__sub">Short, plain-English guides, free to read.</p>
      <div className="b-ls-guides__list">
        {shown.map((guide) => <GuideCard key={guide.slug} guide={guide} headingLevel={headingLevel + 1} />)}
      </div>
      <Link className="b-btn b-btn-outline b-ls-guides__all" to={`/c/${communityId}/guides`}>
        {guides.length > shown.length ? `See all ${guides.length} guides` : 'See the guides'}
      </Link>
    </section>
  );
}
