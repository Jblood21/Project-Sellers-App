import '../../../styles/layouts/saltgrass.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Salt Grass: a loud, condensed, big-control look for the landing and the
 * tools, and a calm editorial one for the guides.
 *
 * Header and footer sit on a dark ground drawn from the theme's secondary
 * colour, which is what the traits say: the shared footer reads them to pick
 * the white logo and the white Equal Housing mark, and a light mark on the
 * dark ground is the only one that can be seen.
 */
export default {
  traits: { footerTone: 'dark', headerTone: 'dark' },
  Header,
  Home,
};
