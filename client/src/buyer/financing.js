import { complianceOf, telHref } from '@shared/compliance.js';

/**
 * Whether "Talk about financing" in the quick-action bar and header has anything to do: a lender is set up, and
 * there are times to pick from (booking on and some posted) or a phone or email to reach them on. A button into
 * a sheet with nothing on it is worse than no button, the rule the Explore screen already follows.
 */
export function canTalkFinancing(community, features) {
  const { lender } = complianceOf(community?.settings, { community });
  const hasTimes = features?.booking !== false && (community?.slots?.length ?? 0) > 0;
  return lender.ready && (hasTimes || Boolean(telHref(lender.phone) || lender.email));
}
