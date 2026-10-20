import '../../../styles/layouts/ledger.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Ledger: the buyer's own dashboard. A bento of tiles of different sizes with the figures first: buying power
 * on the one dark tile with a half-circle gauge against the homes, the monthly payment as a five-part bar, the
 * down payment saved as a ring, the plan as dots, today's rates, the homes in budget, the next step and the
 * community's down payment help. Every figure is the one its tool would give, from the buyer's own answers,
 * and a figure not given yet says so and offers the tool. IBM Plex Sans for words and headings, IBM Plex Mono
 * for every figure. It looks exactly like its board under Ice Blue & Dark Navy and takes its colours from
 * whichever theme is chosen.
 *
 * The header sits on a dark ground drawn from the theme's secondary colour; on a wide screen it becomes a dark
 * rail down the left with a light bar beside it. The footer is on the light ground, which is what the traits
 * say: the shared footer reads them to pick the colour logo and the ink Equal Housing mark. On a phone a bar at
 * the foot of the screen carries Book a tour, Talk about financing and My Home Plan, as Red Rock's does; from
 * 900px the header carries them.
 */
export default {
  traits: { footerTone: 'light', headerTone: 'dark' },
  Header,
  Home,
};
