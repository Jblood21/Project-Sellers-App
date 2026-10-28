import { normalizeLayout } from '@shared/domain.js';
import cornerpost from './cornerpost/index.js';
import foyer from './foyer/index.js';
import ledger from './ledger/index.js';
import marketplace from './marketplace/index.js';
import redrock from './redrock/index.js';
import saltgrass from './saltgrass/index.js';
import showcase from './showcase/index.js';
import trailhead from './trailhead/index.js';

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
 *           (photoGrid: a home's page leads with its first five photos as a grid),
 *           or to ask for a picture at the size it is drawn (heroSizes: the `sizes`
 *           of a home page's hero photo, below)
 *   Header  replaces the sticky header; props { onOpenMenu, onTalk, onFinance }
 *   Home    replaces the tools home screen; props { model } (see useHomeModel)
 *   Listing the page of a listing (one home for sale); props { model } (see listing/useListingModel). A layout
 *           without one shows the shared home page.
 *
 * What a layout may not do is change what a tool does. It decides where the
 * buttons go and what they look like, and nothing else.
 */
const LAYOUTS = { cornerpost, saltgrass, foyer, marketplace, redrock, trailhead, showcase, ledger };

export function layoutFor(key) {
  return LAYOUTS[normalizeLayout(key)];
}

/**
 * The `sizes` of a home page's hero photo when a layout gives none: never less than any
 * layout draws it, so never soft, though it can fetch a step bigger than needed.
 *
 * Each layout gives its own (traits.heroSizes), because the hero's box differs more from
 * one layout to the next than anywhere else in the app: 520 px wide at most in Cornerpost
 * and 1144 in Marketplace, and on a tablet anything from half the window to all of it.
 * One value for all of them either asks a landscape iPad for a 3200 px photo it draws at
 * 520, or leaves the widest layouts short. Each value is the box's width from the layout's
 * stylesheet at every window width, and where the box is shorter than a wide photo's shape
 * (on a phone, or under a max-height), the width a 16:9 photo is drawn at to cover it,
 * which is wider than the box. They were checked against every window width from 300 to
 * 1310 px in 10 px steps, so a change to a layout's hero rules needs its value checked too.
 */
const HERO_SIZES = '(min-width: 1180px) 1144px, (min-width: 900px) 100vw, (min-width: 760px) 1016px, 134vw';

/** Defaults first, so a layout only has to say where it differs. */
export function layoutTraits(key) {
  return { footerTone: 'light', headerTone: 'light', photoGrid: false, heroSizes: HERO_SIZES, ...(layoutFor(key).traits ?? {}) };
}
