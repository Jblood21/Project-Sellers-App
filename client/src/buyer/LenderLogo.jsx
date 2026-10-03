import {
  EHL_MARK_MIN_HEIGHT, EHL_MARK_RATIO, EHL_MARKS, LENDER_LOGO_MIN_HEIGHT, LENDER_LOGO_RATIO, LENDER_LOGOS,
} from '@shared/domain.js';
import { complianceOf } from '@shared/compliance.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * The lender's logo, picked for the ground it sits on.
 *
 *   tone  'light'  the full-colour logo, for a light ground
 *         'dark'   the white logo, for a dark ground
 *         'print'  the one-colour black logo, for the printed plan
 *
 * The supplied artwork is never recoloured to the community's palette. A builder
 * who uploaded their own lender logo in Setup gets that file on every tone, and
 * because one file cannot be right on both grounds it sits on a light plate when
 * the ground is dark.
 *
 * The supplied guidance sets a 30px minimum height, so a smaller request is
 * raised to it rather than drawn too small to read.
 */
export default function LenderLogo({ tone = 'light', height = 44, className = '' }) {
  const { community } = useBuyer();
  const { lender } = complianceOf(community?.settings, { community });
  const custom = community?.lenderLogo || '';
  const h = Math.max(height, LENDER_LOGO_MIN_HEIGHT);
  const key = tone === 'dark' ? 'white' : tone === 'print' ? 'black' : 'color';
  const alt = `${lender.name || 'Lender'} logo`;

  if (custom) {
    const img = (
      <img
        className="b-lender-logo__img"
        src={custom}
        alt={alt}
        // Height fixed, width follows the file: an uploaded logo can be any shape.
        style={{ height: h, width: 'auto', maxWidth: '100%' }}
      />
    );
    return (
      <span className={`b-lender-logo${tone === 'dark' ? ' b-lender-logo--plate' : ''} ${className}`.trim()}>
        {img}
      </span>
    );
  }

  return (
    <span className={`b-lender-logo ${className}`.trim()}>
      <img
        className="b-lender-logo__img"
        src={LENDER_LOGOS[key]}
        alt={alt}
        width={Math.round(h * LENDER_LOGO_RATIO)}
        height={h}
        style={{ height: h, width: 'auto', maxWidth: '100%' }}
      />
    </span>
  );
}

/**
 * The Equal Housing Lender mark. It belongs wherever the lender is advertised,
 * and never at less than 40px tall, so a smaller request is raised to that. It
 * is the LENDER mark: the real estate agents' section carries a text line
 * instead and must not borrow this.
 */
export function EhlMark({ tone = 'light', height = 44, className = '' }) {
  const h = Math.max(height, EHL_MARK_MIN_HEIGHT);
  return (
    <img
      className={`b-ehl ${className}`.trim()}
      src={tone === 'dark' ? EHL_MARKS.white : EHL_MARKS.ink}
      alt="Equal Housing Lender"
      width={Math.round(h * EHL_MARK_RATIO)}
      height={h}
      style={{ height: h, width: 'auto' }}
    />
  );
}
