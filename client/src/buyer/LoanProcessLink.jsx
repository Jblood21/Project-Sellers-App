import { complianceOf } from '@shared/compliance.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * "Start my loan process": the lender's online application, from Setup.
 *
 * It opens in a new tab so the buyer's plan is still here when they come back.
 * Renders nothing until a link has been set: a button that goes nowhere is worse
 * than none, and the address is the lender's to give, not ours to guess.
 */
export default function LoanProcessLink({ className = 'b-btn b-btn-outline', style }) {
  const { community, track } = useBuyer();
  const { lender } = complianceOf(community?.settings, { community });
  if (!lender.applyHref) return null;
  return (
    <a
      className={className}
      style={{ textDecoration: 'none', textAlign: 'center', ...style }}
      href={lender.applyHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('Started the loan process')}
    >
      Start my loan process
    </a>
  );
}
