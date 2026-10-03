import '../../../styles/layouts/cornerpost.css';
import Header from './Header.jsx';
import Home from './Home.jsx';

/**
 * Cornerpost Default: one phone-width column of soft, rounded, bordered tiles
 * that walk a buyer from "can I afford this?" to "talk to a lender".
 *
 * It is the default layout, so a community that never chose one gets it. The
 * footer and the header both sit on the page's own light ground, which is what
 * the traits say: the shared footer reads them to pick the colour logo and the
 * ink Equal Housing mark, and a dark one here would put a dark mark on a dark
 * ground.
 */
export default {
  traits: { footerTone: 'light', headerTone: 'light' },
  Header,
  Home,
};
