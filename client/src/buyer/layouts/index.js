import { normalizeLayout } from '@shared/domain.js';
import cornerpost from './cornerpost/index.js';
import saltgrass from './saltgrass/index.js';

/**
 * The layouts a community can choose, by key.
 *
 * A layout is a bundle of what the shared screens cannot express with CSS
 * alone. Everything it leaves out falls back to the default screens, which is
 * what keeps a half-built layout from taking the buyer app down with it.
 *
 *   traits  facts the shared components need to pick the right artwork, such as
 *           whether the footer sits on a light or a dark ground
 *   Header  replaces the sticky header; props { onOpenMenu, onTalk }
 *   Home    replaces the tools home screen; props { model } (see useHomeModel)
 *
 * What a layout may not do is change what a tool does. It decides where the
 * buttons go and what they look like, and nothing else.
 */
const LAYOUTS = { cornerpost, saltgrass };

export function layoutFor(key) {
  return LAYOUTS[normalizeLayout(key)];
}

/** Defaults first, so a layout only has to say where it differs. */
export function layoutTraits(key) {
  return { footerTone: 'light', headerTone: 'light', ...(layoutFor(key).traits ?? {}) };
}
