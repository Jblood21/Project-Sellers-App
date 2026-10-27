/**
 * The few places the buyer app's wording and links differ for a listing (one home an agent is selling, see
 * shared/listing.js) from an ordinary community. Every function takes the `isListing` flag from useBuyer(), so a
 * community goes through the same code with the same results as before.
 */

/** The route a signed-in buyer's "home screen" is: the tools home for a community, the one home for a listing. */
export const rootSlug = (listing) => (listing ? 'home' : 'tools');

/** The address of that screen. */
export const rootPath = (base, listing) => `${base}/${rootSlug(listing)}`;

/** Whether this path is that screen (a trailing slash reaches the same page). */
export const atRoot = (pathname, listing) => (listing ? /\/home\/?$/ : /\/tools\/?$/).test(pathname);

/** What the back button on the pages under it calls it. */
export const rootLabel = (listing, community = 'All Tools') => (listing ? 'The home' : community);

/** "Book a tour" for a community, "Request a showing" for a listing. */
export const talkLabel = (listing) => (listing ? 'Request a showing' : 'Book a tour');
