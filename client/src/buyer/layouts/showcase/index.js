import '../../../styles/layouts/showcase.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Showcase: photo first, like phone stories. Each home fills the screen with its first photo, its name very
 * large in Instrument Serif and its price and monthly estimate over the photo's foot; a swipe (or the
 * arrows, or the arrow keys) goes to the next. A tab bar floating at the foot of a phone carries Homes,
 * My numbers, My plan and Learn, and "My numbers" slides a sheet up over the page with the monthly payment
 * in its five parts and the tools as rows. Inter for everything a buyer reads or taps; pills and 24px sheet
 * corners. It looks like its board under Black, White & Orange and takes its colours from whichever theme is
 * chosen: the dark ground is the theme's secondary colour taken most of the way to black.
 *
 * Header and footer sit on a dark ground, which is what the traits say: the shared footer reads them to pick
 * the white logo and the white Equal Housing mark, the only ones that can be seen on it. photoGrid asks a
 * home's page for its first five photos as a grid (one large, four small), which wide screens show the way
 * a listing opens, so a home's own page is photo first as well.
 */
export default {
  traits: {
    footerTone: 'dark', headerTone: 'dark', photoGrid: true,
    // How wide its home page's hero photo is drawn (see heroSizes in ../index.js).
    heroSizes: '(min-width: 1180px) 1080px, (min-width: 900px) 100vw, (min-width: 760px) 1016px, 134vw',
  },
  Header,
  Home,
};
