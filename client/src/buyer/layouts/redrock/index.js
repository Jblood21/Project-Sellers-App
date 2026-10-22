import '../../../styles/layouts/redrock.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Red Rock: warm and solid, like late sun on sandstone. A dark header bar with the community's name in a
 * serif, a big serif greeting, the buyer's own monthly payment first in a dark panel, then the homes as
 * warm cards with the price large and the tools as two-across tiles. Fraunces for every heading, price and
 * payment; Figtree for everything a buyer reads or taps. It looks exactly like its board under the Rust &
 * Desert Plum theme and takes its colours from whichever theme is chosen.
 *
 * Header and footer sit on a dark ground drawn from the theme's secondary colour, which is what the traits
 * say: the shared footer reads them to pick the white logo and the white Equal Housing mark, the only
 * ones that can be seen on it. On a phone a bar at the foot of the screen carries Book a tour, Talk about
 * financing and My Home Plan, as Ridgeline's does; from 900px the header carries them.
 */
export default {
  traits: {
    footerTone: 'dark', headerTone: 'dark',
    // How wide its home page's hero photo is drawn (see heroSizes in ../index.js).
    heroSizes: '(min-width: 1180px) 1080px, (min-width: 930px) 100vw, (min-width: 900px) 930px, (min-width: 740px) 750px, 107vw',
  },
  Header,
  Home,
};
