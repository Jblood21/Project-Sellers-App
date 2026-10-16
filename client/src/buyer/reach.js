import { complianceOf, telHref } from '@shared/compliance.js';
import { canMessage } from '../lib/contact.js';

/**
 * Whether "Talk about financing" has anything to do: a lender is set up, and there are times to pick from
 * (booking on and some posted) or a phone or email to reach them on. A button into a sheet with nothing on
 * it is worse than no button, the rule the Explore screen already follows.
 */
export function canTalkFinancing(community, features) {
  const { lender } = complianceOf(community?.settings, { community });
  const hasTimes = features?.booking !== false && (community?.slots?.length ?? 0) > 0;
  return lender.ready && (hasTimes || Boolean(telHref(lender.phone) || lender.email));
}

/**
 * Whether "Book a tour" has anyone to send a buyer to: an agent they can reach, or else the sales team's
 * phone or email. Without either, the button would open a sheet that only says there is no one to ask, so it
 * is left out, the rule "Talk about financing" and the Explore screen already follow.
 */
export function canBookTour(features, agents, settings) {
  const team = Boolean(String(settings?.teamPhone ?? '').trim() || String(settings?.teamEmail ?? '').trim());
  return canReachAgents(features, agents) || team;
}

/**
 * Whether there is an agent a buyer can call, text or email: the realtors are switched on and at least one
 * has a number or an address. "Book a tour" goes to the Meet the agents page then; without one it opens the
 * sheet that lists the sales team to reach instead.
 */
export function canReachAgents(features, agents) {
  return Boolean(features?.agents) && (agents ?? []).some((agent) => canMessage(agent) || telHref(agent.phone));
}
