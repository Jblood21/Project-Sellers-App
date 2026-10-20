import { DEFAULT_SETTINGS } from '../../shared/domain.js';

/**
 * A one-time refresh of figures every community already holds.
 *
 * Each community keeps its own copy of the settings and of the supplied guides from the day it was created, so a
 * new default reaches no community that exists. When the defaults are brought up to date (rates, a down payment
 * program, the guides' wording), this carries the same figures into every existing community once: on the first
 * start of a server that has it, each community not yet at `version` is claimed (so two servers starting together
 * do it once), given the new figures, and stamped with the version. After that, anything the builder changes in
 * Setup or the Learn tab stays as they left it: the refresh does not run again until a new version is written here.
 * A community created after the refresh starts on the new defaults and is stamped at creation.
 *
 * What it changes, and nothing else:
 *   settings     these keys, in every community, overwriting what was there (the owner asked for that)
 *   byCommunity  local figures researched for one community by its id (tax, insurance, HOA dues)
 *   guides       the supplied guides' words (title, category, byline, note, summary, body, picture text), matched
 *                by their default key, so a guide the builder deleted is not brought back and one they hid stays
 *                hidden, in the same place on the list
 */

/** Keys copied from the current defaults into every community. */
const REFRESHED_KEYS = [
  'rateConv', 'rateFha', 'rateVa', 'ratesUpdatedAt',
  'dpaIncomeLimit', 'dpaAmount', 'dpaPct', 'dpaPriceCap', 'dpaMinCredit', 'dpaProgram', 'dpaAsOf',
];

export const FIGURES_REFRESH = {
  version: '2026-10-20',
  settings: Object.fromEntries(REFRESHED_KEYS.map((key) => [key, DEFAULT_SETTINGS[key]])),
  /*
   * Researched on Oct 19-20, 2026 for the communities live then. Property tax is the 2026 levy of the tax area the
   * community is in, times the 55% Utah taxes a primary residence on. Insurance is an HO-6 (walls-in) policy where
   * the HOA insures the buildings, which is the case for both townhome communities. HOA dues are from 2026 listings
   * in each community. Willow Creek is the demo community, of detached homes, and keeps its own insurance and dues.
   */
  byCommunity: {
    // Lehi, Utah County tax area 010: 0.008580 x 0.55.
    'willow-creek-bseh': { taxPctYr: '0.47' },
    // West Point, Davis County tax district 64: 0.010865 x 0.55. Dues include insurance, grounds, sewer and trash.
    'salt-grass-zoxa': { taxPctYr: '0.60', insuranceYr: '650', hoaMo: '172' },
    // Heber City, Wasatch County: about 0.0088 x 0.55. Dues from a July 2026 sale in the community.
    'old-mill-village-townhom-pd7g': { taxPctYr: '0.48', insuranceYr: '500', hoaMo: '291' },
  },
  guides: true,
};

/** A community's settings after the refresh: its own, then the refreshed keys, then its own local figures. */
export function refreshedSettings(community, refresh = FIGURES_REFRESH) {
  return {
    ...(community?.settings ?? {}),
    ...refresh.settings,
    ...(refresh.byCommunity?.[community?.id] ?? {}),
  };
}
