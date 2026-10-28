import '../../../styles/layouts/foyer.css';
import Header from './Header.jsx';
import Home from './Home.jsx';
import Listing from './Listing.jsx';

/**
 * Foyer: a calm, magazine-like layout for established communities. Serif
 * headlines, hairline rules, a numbered index of tools, and a narrow centred
 * column on the page's own light ground.
 *
 * Header and footer both sit on that light ground, which is what the traits say:
 * the shared footer reads them to pick the colour logo and the ink Equal Housing
 * mark.
 */
export default {
  traits: {
    footerTone: 'light', headerTone: 'light',
    // How wide its home page's hero photo is drawn (see heroSizes in ../index.js).
    heroSizes: '(min-width: 640px) 700px, 110vw',
  },
  Header,
  Home,
  Listing,
};
