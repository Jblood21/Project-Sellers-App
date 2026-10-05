import { useBuyer } from './BuyerContext.jsx';

/**
 * The development's own logo, or its name when no logo has been uploaded.
 *
 *   tone      'light' | 'dark', the ground the mark sits on
 *   fallback  'name' prints the community name as text when there is no logo;
 *             'none' renders nothing, for a page that already prints the name
 *
 * Setup holds up to two files: the logo, and an optional version for dark
 * grounds. A dark ground uses the second when there is one. When only one file
 * exists and the ground is the wrong colour for it, the mark sits on a plate of
 * the right colour rather than disappearing, because a logo the builder
 * uploaded is never recoloured.
 */
export default function CommunityMark({ tone = 'light', height = 36, fallback = 'name', className = '' }) {
  const { community } = useBuyer();
  const dark = tone === 'dark';
  const name = community?.name ?? '';

  // logo is made for light grounds; logoLight for dark ones.
  const src = dark ? community?.logoLight || community?.logo : community?.logo || community?.logoLight;
  if (!src) {
    if (fallback === 'none') return null;
    return <span className={`b-mark b-mark--text b-head ${className}`.trim()}>{name}</span>;
  }

  const wrongGround = dark ? !community.logoLight : !community.logo;
  const plate = wrongGround ? (dark ? 'light' : 'dark') : '';

  return (
    <span className={`b-mark${plate ? ` b-mark--plate b-mark--${plate}` : ''} ${className}`.trim()}>
      <img className="b-mark__img" src={src} alt={`${name} logo`} style={{ height, width: 'auto', maxWidth: '100%' }} />
    </span>
  );
}
