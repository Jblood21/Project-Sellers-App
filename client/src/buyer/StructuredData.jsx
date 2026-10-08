import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { pageJsonLd, pageMeta, serializeJsonLd } from '@shared/schema.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * Keeps this page's schema.org JSON-LD and its description, canonical, robots,
 * Open Graph and Twitter tags in the document head, in step with the route.
 *
 * Mounted once in BuyerShell; it renders nothing. It computes the same answer the
 * server wrote into the HTML of the three public pages (both call
 * shared/schema.js), so a buyer who arrives on a server-rendered page sees no
 * change when the app boots, and one who navigates inside the app gets the tags
 * for the page they are on rather than for the page they landed on.
 *
 * Every tag it adds carries `data-cornerpost`, which is also how it recognises
 * the ones the server injected: those are removed and rewritten from the live
 * data, so there is one set at every moment and never two. The stock
 * description in index.html has no marker, so it is taken over and put back.
 */

const MARK = 'data-cornerpost';

// The pages server/lib/ssr.js writes a <title> for; the client keeps that title.
const TITLED_PAGES = new Set(['landing', 'guides', 'guide']);

// What the admin API stores for a community created with no location. It is a note
// to the builder, not a place, so it is not published as one (see server/lib/ssr.js).
const LOCATION_PLACEHOLDER = 'location tbd';

/**
 * What the route (the part of the path after /c/:communityId) is. `page` is one
 * of the names shared/schema.js knows, or '' for a path this app does not have.
 */
function routeOf(rest) {
  const [first, second] = String(rest ?? '').split('/').filter(Boolean);
  switch (first) {
    case undefined: return { page: 'landing' };
    case 'start': case 'tools': case 'explore': case 'area': case 'map':
    case 'saved': case 'realtors': return { page: first };
    // The printed plan is the plan, for search purposes: same page, other paper.
    case 'plan': return { page: 'plan' };
    case 'guides': return second ? { page: 'guide', slug: second } : { page: 'guides' };
    case 'homes': return second ? { page: 'home', homeId: second } : { page: '' };
    case 'tool': return second ? { page: 'tool', toolKey: second } : { page: '' };
    default: return { page: '' };
  }
}

/** The head tags a page needs, as [tag, attributes] pairs. */
function tagsFor(meta, siteName) {
  const image = meta.image ? [meta.image] : [];
  const tags = [
    ['meta', { name: 'robots', content: meta.robots }],
    ['link', { rel: 'canonical', href: meta.canonical }],
    ['meta', { property: 'og:type', content: meta.type }],
    ['meta', { property: 'og:site_name', content: siteName }],
    ['meta', { property: 'og:title', content: meta.title }],
    ['meta', { property: 'og:description', content: meta.description }],
    ['meta', { property: 'og:url', content: meta.canonical }],
    ['meta', { name: 'twitter:card', content: image.length ? 'summary_large_image' : 'summary' }],
    ['meta', { name: 'twitter:title', content: meta.title }],
    ['meta', { name: 'twitter:description', content: meta.description }],
  ];
  for (const src of image) {
    tags.push(['meta', { property: 'og:image', content: src }]);
    tags.push(['meta', { name: 'twitter:image', content: src }]);
  }
  return tags;
}

/**
 * Writes the page's head and returns the function that undoes it. Anything that
 * goes wrong is swallowed: structured data is a nicety, and a failure here must
 * never take the page the buyer is using down with it.
 */
function writeHead({ meta, nodes, siteName }) {
  const head = document.head;
  const added = [];
  let restoreDescription = null;

  try {
    head.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove());

    const make = (tag, attrs) => {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      el.setAttribute(MARK, '');
      head.appendChild(el);
      added.push(el);
      return el;
    };

    if (meta.description) {
      // The stock description (from index.html) is the one a page may already
      // have; a second would leave a crawler to choose between them.
      const stock = head.querySelector('meta[name="description"]');
      if (stock) {
        const original = stock.getAttribute('content');
        stock.setAttribute('content', meta.description);
        restoreDescription = () => stock.setAttribute('content', original ?? '');
      } else {
        make('meta', { name: 'description', content: meta.description });
      }
    }
    for (const [tag, attrs] of tagsFor(meta, siteName)) {
      if (Object.values(attrs).every(Boolean)) make(tag, attrs);
    }
    if (nodes.length) {
      // textContent, never innerHTML: the script's body is data, and the
      // serializer has already escaped everything that could end it early.
      make('script', { type: 'application/ld+json' }).textContent = serializeJsonLd(nodes);
    }
  } catch {
    /* leave whatever was written; the cleanup below removes it */
  }

  return () => {
    for (const el of added) el.remove();
    restoreDescription?.();
  };
}

export default function StructuredData() {
  const { community } = useBuyer();
  const params = useParams();
  const rest = params['*'];

  useEffect(() => {
    if (!community) return undefined;
    let undo = () => {};
    let restoreTitle = () => {};
    let cancelled = false;

    try {
      // The server pins the site's one public address (PUBLIC_ORIGIN) into the page it renders;
      // writing the browser's own host over it would put a second canonical on the same page.
      const origin = community.siteOrigin || window.location.origin;
      const route = routeOf(rest);
      const homes = Array.isArray(community.homes) ? community.homes : [];
      const guides = Array.isArray(community.guides) ? community.guides : [];
      const published = String(community.location ?? '').trim().toLowerCase() === LOCATION_PLACEHOLDER
        ? { ...community, location: '' }
        : community;
      const input = {
        page: route.page,
        community: published,
        origin,
        home: homes.find((h) => h.id === route.homeId),
        guide: guides.find((g) => g.slug === route.slug),
        tool: route.toolKey,
      };

      if (route.page) {
        undo = writeHead({
          meta: pageMeta(input),
          nodes: pageJsonLd(input),
          siteName: String(community.name ?? ''),
        });
      } else {
        // A path the app does not have is redirected away, but until it is, it
        // must not be indexed as whatever it happens to resemble.
        undo = writeHead({
          meta: { robots: 'noindex, nofollow', title: '', description: '', canonical: '', type: 'website', image: '' },
          nodes: [],
          siteName: '',
        });
      }

      // The pages the server renders a head for carry the same title in the tab,
      // in a bookmark and in og:title, because it is the one pageMeta computed.
      // Done in a microtask because BuyerShell sets the community name as the
      // title in an effect of its own, and a parent's effects run after its
      // children's: written straight away, this would be overwritten. The other
      // pages keep the title their own screen sets (the printed plan names the
      // file the browser offers to save).
      if (TITLED_PAGES.has(route.page)) {
        const title = pageMeta(input).title;
        if (title) {
          let previous = null;
          queueMicrotask(() => {
            if (cancelled) return;
            previous = document.title;
            document.title = title;
          });
          restoreTitle = () => {
            if (previous !== null) document.title = previous;
          };
        }
      }
    } catch {
      /* structured data is optional; the page works without it */
    }

    return () => {
      cancelled = true;
      try {
        undo();
        restoreTitle();
      } catch {
        /* nothing to restore */
      }
    };
  }, [community, rest]);

  return null;
}
