import '../../../styles/layouts/marketplace.css';
import Header from './Header.jsx';
import Home from './Home.jsx';
import Listing from './Listing.jsx';

/**
 * Marketplace: laid out like a big home-search site, in the community's own colours. A white bar with
 * a text nav, then a home screen that leads with the homes themselves: a slim filter bar and a grid of
 * photo cards, each with its price, an estimated monthly payment and the facts a buyer scans for. The
 * tools follow as an affordability section ("Can you buy one of these?"). Public Sans throughout.
 *
 * Header and footer sit on light grounds, which is what the traits say: the shared footer reads them to
 * pick the colour logo and the ink Equal Housing mark. photoGrid asks a home's page for its first five
 * photos as a grid (one large, four small), which wide screens show the way a listing does; the shared
 * page has no such grid to restyle, so it draws one only for a layout that asks.
 */
export default {
  traits: {
    footerTone: 'light', headerTone: 'light', photoGrid: true,
    // How wide its home page's hero photo is drawn (see heroSizes in ../index.js).
    heroSizes: '(min-width: 1180px) 1144px, (min-width: 900px) 100vw, (min-width: 740px) 750px, 107vw',
  },
  Header,
  Home,
  Listing,
};
