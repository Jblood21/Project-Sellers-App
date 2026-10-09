import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import Markdown from '../../components/Markdown.jsx';
import { buyerApi } from '../../lib/api.js';
import { useBuyer } from '../BuyerContext.jsx';
import { GuideCard } from './Guides.jsx';

/**
 * One guide, readable without signing in.
 *
 * The community payload already holds the summary, so the title, topic and
 * picture are on screen at once and only the body waits for the network. The
 * picture comes from the guide record, never from the body, so a builder can
 * change it without editing the text.
 */
export default function GuideArticle() {
  const { community, guides, features, signedIn, track } = useBuyer();
  const { communityId, slug } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ slug: '', guide: null, status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ slug, guide: null, status: 'loading' });
    buyerApi
      .guide(communityId, slug)
      .then((guide) => live && setState({ slug, guide, status: 'ready' }))
      // A guide that was unpublished, deleted or never existed is one answer: gone.
      .catch(() => live && setState({ slug, guide: null, status: 'missing' }));
    return () => {
      live = false;
    };
  }, [communityId, slug]);

  const summary = guides.find((item) => item.slug === slug);
  // Until the fetch for THIS slug lands, the state may still hold the last guide.
  const full = state.slug === slug && state.status === 'ready' ? state.guide : null;
  const head = full ?? summary;
  const missing = state.slug === slug && state.status === 'missing';

  // The tab title is StructuredData's: it writes the same string the server puts
  // in the page head, so the two cannot disagree.
  useEffect(() => {
    if (full && signedIn) track(`Read the guide: ${full.title}`);
    // track changes identity with the token; reading a guide once is one event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full?.id]);

  // "other-guide.md" in a body is a link to that guide in this community. Anything
  // else with no scheme is dropped by the parser.
  const resolveLink = useCallback(
    (href) => (href.endsWith('.md') ? `/c/${communityId}/guides/${href.slice(0, -3)}` : null),
    [communityId],
  );
  const onInternalLink = useCallback((href) => navigate(href), [navigate]);

  if (!features.guides) {
    return <Navigate to={signedIn ? `/c/${communityId}/tools` : `/c/${communityId}`} replace />;
  }

  if (missing) {
    return (
      <div className="b-shell" style={{ paddingTop: 24 }}>
        <h1 className="b-head" style={{ margin: '0 0 8px', fontSize: 25 }}>We couldn’t find that guide</h1>
        <p style={{ margin: '0 0 18px', color: 'var(--t-mut)', fontSize: 14, lineHeight: 1.55 }}>
          It may have been taken down or moved. The rest of the guides are still here.
        </p>
        <Link
          to={`/c/${communityId}/guides`}
          className="b-btn"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
        >
          See all buyer guides
        </Link>
      </div>
    );
  }

  const others = guides.filter((item) => item.slug !== slug).slice(0, 3);

  return (
    <article className="b-shell b-article" style={{ paddingTop: 20 }} aria-busy={!full}>
      {head ? (
        <>
          {head.category ? <span className="b-lbl b-article__kicker">{head.category}</span> : null}
          <h1 className="b-head b-article__title">{head.title}</h1>
          {head.byline ? <p className="b-article__byline">{head.byline}</p> : null}
          {head.note ? <p className="b-article__note">{head.note}</p> : null}
        </>
      ) : (
        <h1 className="b-head b-article__title">Loading the guide</h1>
      )}

      {full ? (
        <Markdown source={full.body} resolveLink={resolveLink} onInternalLink={onInternalLink} />
      ) : (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }} role="status">Loading…</p>
      )}

      {/*
        Where a reader who has finished goes next. A guide answers one question;
        the tools answer it for this buyer's own numbers, and that is what the
        guide is there to lead to.
      */}
      {full ? (
        <section className="b-article__cta" aria-labelledby="guide-cta">
          <h2 id="guide-cta" className="b-head" style={{ fontSize: 19, lineHeight: 1.25 }}>
            Ready to run your own numbers?
          </h2>
          <p style={{ margin: '6px 0 14px', color: 'var(--t-ink)', fontSize: 13.5, lineHeight: 1.55 }}>
            The Homebuyer App shows what a home at {community?.name} would cost you each month, what you could
            afford and whether down payment help applies. It’s free.
          </p>
          <Link
            to={signedIn ? `/c/${communityId}/explore` : `/c/${communityId}`}
            className="b-btn"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
          >
            {signedIn ? 'Explore Homes' : 'Sign in to explore homes'}
          </Link>
        </section>
      ) : null}

      {full && others.length ? (
        <section className="b-article__more" aria-labelledby="guide-more">
          <h2 id="guide-more" className="b-lbl" style={{ margin: '0 0 12px', color: 'var(--t-accT)' }}>
            More buyer guides
          </h2>
          <div className="b-glist">
            {others.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
