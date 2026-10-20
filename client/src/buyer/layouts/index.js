import { normalizeLayout } from '@shared/domain.js';
import cornerpost from './cornerpost/index.js';
import foyer from './foyer/index.js';
import marketplace from './marketplace/index.js';
import redrock from './redrock/index.js';
import saltgrass from './saltgrass/index.js';

/**
 * The layouts a community can choose, by key.
 *
 * A layout is a bundle of what the shared screens cannot express with CSS
 * alone. Everything it leaves out falls back to the default screens, which is
 * what keeps a half-built layout from taking the buyer app down with it.
 *
 *   traits  facts the shared components need to pick the right artwork, such as
 *           whether the footer sits on a light or a dark ground, or to draw
 *           something the stylesheet cannot make from markup that is not there
 *           (photoGrid: a home's page leads with its first five photos as a grid)
 *   Header  replaces the sticky header; props { onOpenMenu, onTalk, onFinance }
 *   Home    replaces the tools home screen; props { model } (see useHomeModel)
 *
 * What a layout may not do is change what a tool does. It decides where the
 * buttons go and what they look like, and nothing else.
 */
const LAYOUTS = { cornerpost, saltgrass, foyer, marketplace, redrock };

export function layoutFor(key) {
  return LAYOUTS[normalizeLayout(key)];
}

/** Defaults first, so a layout only has to say where it differs. */
export function layoutTraits(key) {
  return { footerTone: 'light', headerTone: 'light', photoGrid: false, ...(layoutFor(key).traits ?? {}) };
}
