/**
 * What a home with no photo yet shows instead: a quiet drawing of a house at dusk, in the theme's own
 * colours, so the slide still looks like a slide and never like a broken picture. The shapes take their
 * colours from the stylesheet (sc-ph__*), which mixes them from the theme tokens; the drawing says
 * nothing to a screen reader, because the home's name and facts are printed under it.
 *
 * It is drawn behind every photo as well, so a picture that fails to load (the shared Photo leaves its box
 * empty when asked to be quiet) shows this rather than a hole.
 */
export default function Placeholder() {
  return (
    <svg className="sc-ph" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <rect className="sc-ph__sky" width="400" height="300" />
      <circle className="sc-ph__sun" cx="292" cy="118" r="46" />
      <path className="sc-ph__hill" d="M0 196 60 176 128 190 196 166 262 184 330 168 400 180V300H0Z" />
      <path className="sc-ph__ground" d="M0 236H400V300H0Z" />
      <path className="sc-ph__roof" d="M120 150 178 96 236 150Z" />
      <path className="sc-ph__wall" d="M132 148H224V236H132Z" />
      <path className="sc-ph__roof" d="M224 168 238 140H300L314 168Z" />
      <path className="sc-ph__wall" d="M230 166H308V236H230Z" />
      <path className="sc-ph__lit" d="M150 168H172V192H150ZM186 196H206V236H186ZM166 112H190V138H166Z" />
      <path className="sc-ph__door" d="M244 190H294V236H244Z" />
    </svg>
  );
}
