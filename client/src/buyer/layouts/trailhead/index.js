import '../../../styles/layouts/trailhead.css';
import Header from './Header.jsx';
import Home from './Home.jsx';
import Listing from './Listing.jsx';

/**
 * Trailhead: the buyer's way home as a guided trail. The community's tools are numbered stops on one winding
 * line down the home screen, done ones ticked, the next one opened into a card with a big Start, and the
 * homes at an overlook ("Pick your home") along the way, ending at Keys in hand. On a stop's own page a strip
 * under the header says where it sits ("Stop 2 of 8") and the foot of the page offers the next stop. On a
 * wide screen the whole trail stays in a narrow column beside the page. Bricolage Grotesque 700 for headings,
 * stop names and figures; DM Sans for everything a buyer reads or taps. It follows its board, drawn in the
 * Forest Green & Cream theme, and takes its colours from whichever theme is chosen.
 *
 * Where it departs from the board, it does so on purpose. The stops run in the order every other layout lists
 * the tools, the two lead questions first. On a wide screen the opened stop leaves out the board's Today's
 * rates (rates on the home screen would need their APR wording), its lender line (the lender has a card of its
 * own further down, with its licence and the Equal Housing mark) and Guides for this stretch (nothing ties a
 * guide to a tool).
 *
 * The header sits on a dark ground drawn from the theme's secondary colour and the footer on the light page,
 * which is what the traits say: the shared footer reads them to pick the colour logo and the ink Equal
 * Housing mark. On a phone a bar at the foot of the screen carries "Continue:" and the next stop on the home
 * screen, and Book a tour, Talk about financing and My Home Plan elsewhere; from 900px the header carries them.
 */
export default {
  traits: {
    footerTone: 'light', headerTone: 'dark',
    // How wide its home page's hero photo is drawn (see heroSizes in ../index.js).
    heroSizes: '(min-width: 1180px) 1120px, (min-width: 930px) 100vw, (min-width: 900px) 930px, (min-width: 740px) 750px, 107vw',
  },
  Header,
  Home,
  Listing,
};
