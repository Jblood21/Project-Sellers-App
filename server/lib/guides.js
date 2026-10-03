import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGuideMarkdown } from '../../shared/markdown.js';

/**
 * The guides that ship with the product: the supplied buyer-education articles,
 * kept as Markdown files so the words can be reviewed (and replaced) as text.
 * The stores copy them into each community the first time it boots (see
 * `guides_seeded`); after that a community owns its copies and edits them in
 * the Learn tab. These files are never read at request time.
 */

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'guides');

/**
 * The order a first-time buyer would want to read them in: can I afford it,
 * what will they ask of my credit, what help exists, what it costs each month
 * and at closing, then the choices (buydown, rent, townhome vs house, HOA),
 * the special cases, and the checklist to take to the model.
 *
 * A file that is not listed here still loads, appended alphabetically after
 * these, so dropping a new article into the folder cannot make it vanish. The
 * test suite fails when that happens, on purpose: it forces a decision about
 * where the new article belongs in the journey.
 */
export const DEFAULT_GUIDE_ORDER = [
  'how-much-house-can-you-afford-northern-utah',
  'credit-score-buy-house-utah',
  'utah-first-time-buyer-new-construction-programs',
  'first-time-buyer-programs-weber-davis-county',
  'monthly-cost-new-townhome-northern-utah',
  'closing-costs-utah-homebuyer',
  'temporary-rate-buydown-utah',
  'rent-vs-buy-ogden-clearfield',
  'townhome-vs-house-utah',
  'townhome-hoa-fees-utah',
  'buying-house-with-student-loans-utah',
  'buying-near-hill-air-force-base-utah',
  '16-questions-to-ask-before-buying-a-new-construction-townhome-in-utah',
];

/** Listed slugs first, in the listed order; the rest alphabetically. Pure. */
export function orderGuideSlugs(slugs) {
  const present = new Set(slugs);
  const known = DEFAULT_GUIDE_ORDER.filter((slug) => present.has(slug));
  const listed = new Set(DEFAULT_GUIDE_ORDER);
  const unknown = slugs.filter((slug) => !listed.has(slug)).sort();
  return [...known, ...unknown];
}

/** Read and parse every guide in a folder, in the fixed order. Uncached. */
export function readGuidesFrom(dir) {
  const files = new Map();
  for (const name of readdirSync(dir)) {
    if (name.toLowerCase().endsWith('.md')) files.set(name.slice(0, -3), name);
  }
  return orderGuideSlugs([...files.keys()]).map((slug) => {
    const parsed = parseGuideMarkdown(readFileSync(join(dir, files.get(slug)), 'utf8'), files.get(slug));
    return {
      defaultKey: slug,
      slug,
      title: parsed.title,
      category: parsed.category,
      byline: parsed.byline,
      note: parsed.note,
      imageAlt: parsed.imageAlt,
      summary: parsed.summary,
      body: parsed.body,
    };
  });
}

let cache = null;

/**
 * The supplied guides, parsed once per process. Synchronous so the stores can
 * call it from `createCommunity` and `init()` without an await. Each call hands
 * back fresh objects, so a caller that edits one cannot change what the next
 * community is seeded with.
 */
export function loadDefaultGuides() {
  if (!cache) cache = readGuidesFrom(CONTENT_DIR);
  return cache.map((guide) => ({ ...guide }));
}
