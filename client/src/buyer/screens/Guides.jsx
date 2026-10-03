import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { useBuyer } from '../BuyerContext.jsx';

/**
 * The alt text for a guide's thumbnail next to its title: the guide's own image
 * description (the supplied default picture carries one too), or the title when
 * there is none. It is the same text the structured data gives the picture, so
 * what a screen reader says and what a crawler reads cannot disagree.
 */
export function thumbAlt(guide) {
  return guide.imageAlt || guide.title;
}

/**
 * One guide in a list: picture, category, title and the summary.
 *
 * The title is the only link and it is stretched over the whole card, so a
 * screen reader hears one link named for the guide rather than a paragraph, and
 * a thumb can hit anywhere on the card.
 */
export function GuideCard({ guide, headingLevel = 3 }) {
  const { communityId } = useParams();
  const Heading = `h${headingLevel}`;
  return (
    <article className="b-gcard">
      <img
        className="b-gcard__img"
        src={guide.image}
        alt={thumbAlt(guide)}
        loading="lazy"
        decoding="async"
        width="1400"
        height="930"
      />
      <div className="b-gcard__body">
        {guide.category ? <span className="b-lbl b-gcard__kicker">{guide.category}</span> : null}
        <Heading className="b-gcard__title b-head">
          <Link className="b-gcard__link" to={`/c/${communityId}/guides/${guide.slug}`}>
            {guide.title}
          </Link>
        </Heading>
        {guide.summary ? <p className="b-gcard__sum">{guide.summary}</p> : null}
      </div>
    </article>
  );
}

/**
 * The buyer guides. Public: a buyer who has not given their details can read
 * them, which is the point of them being findable. Everything here comes from
 * the published summaries in the community payload; the article body is
 * fetched when one is opened.
 */
export default function Guides() {
  const { community, guides, features, signedIn } = useBuyer();
  const { communityId } = useParams();
  const [category, setCategory] = useState('');

  // A builder who turned guides off has no page here. Send a signed-in buyer to
  // the tools and everybody else to the front door, the same as an unknown address.
  if (!features.guides) {
    return <Navigate to={signedIn ? `/c/${communityId}/tools` : `/c/${communityId}`} replace />;
  }

  const categories = [...new Set(guides.map((guide) => guide.category).filter(Boolean))];
  const shown = category ? guides.filter((guide) => guide.category === category) : guides;

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h1 className="b-head b-guides__title" style={{ margin: '0 0 4px', fontSize: 25 }}>Buyer guides</h1>
      <p style={{ margin: '0 0 14px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        Plain-English answers to the questions people ask before buying a home at {community?.name}.
      </p>

      {guides.length === 0 ? (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>Guides are being added — check back soon.</p>
      ) : null}

      {categories.length > 1 ? (
        <div
          className="b-gfilter"
          role="group"
          aria-label="Filter guides by topic"
          // The topics wrap rather than scroll sideways: a scrolling row hides its scrollbar
          // here, so a mouse user on a desktop would never find the topics past the edge.
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 12px' }}
        >
          {[['', 'All'], ...categories.map((name) => [name, name])].map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              className="b-pill"
              data-on={category === value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              style={{ flex: 'none', padding: '0 14px' }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="b-glist">
        {shown.map((guide) => (
          <GuideCard key={guide.id} guide={guide} headingLevel={2} />
        ))}
      </div>
    </div>
  );
}
