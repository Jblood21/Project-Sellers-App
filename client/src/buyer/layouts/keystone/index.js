import '../../../styles/layouts/keystone.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Keystone: a compact, precise, data-forward layout for communities that want to read like
 * a dashboard or a banking app. Space Grotesk throughout with tabular figures, sharp
 * corners, 1px rules, a tab strip under the header in place of a bottom bar, and figures
 * that lead: a row of them tops the home screen.
 *
 * Header and footer sit on the page's own light ground, which is what the traits say: the
 * shared footer reads them to pick the colour logo and the ink Equal Housing mark, and a
 * dark one here would put a dark mark on a dark ground. (The one dark surface is the
 * lender panel on the home screen, which is built with its own white marks.)
 */
export default {
  traits: { footerTone: 'light', headerTone: 'light' },
  Header,
  Home,
};
