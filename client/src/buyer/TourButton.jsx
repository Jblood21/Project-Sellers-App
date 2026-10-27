import { messageLink, modelPhrase, tourMessage, useIsMobile } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * "Tour the homes": a button that opens a message to the agent, already written.
 * On a phone it is a text message and on a computer an email, so the buyer only
 * has to press send. It is a plain link, which is why it works without any
 * script and why a screen reader announces it as one.
 *
 * Renders nothing when the agent has no phone and no email: a button that opens
 * an empty message to nobody is worse than no button.
 */
export default function TourButton({ agent, homeName, label, className = 'b-btn b-tour__btn' }) {
  const { community, lead, track, isListing } = useBuyer();
  const mobile = useIsMobile();
  if (!agent) return null;

  const body = tourMessage({ agentName: agent.name, community: community?.name, buyerName: lead?.name, homeName, listing: isListing });
  const subject = isListing
    ? `Showing request — ${community?.name ?? 'the home'}`
    : homeName ? `Tour ${modelPhrase(homeName)}` : `Tour the homes at ${community?.name ?? 'the community'}`;
  const link = messageLink({ phone: agent.phone, email: agent.email, subject, body, mobile });
  if (!link) return null;

  return (
    <a
      className={className}
      href={link.href}
      onClick={() => track(isListing ? `Asked ${agent.name} to schedule a showing` : `Asked ${agent.name} to schedule a tour${homeName ? ` of ${homeName}` : ''}`)}
    >
      {label ?? (isListing ? 'Request a showing' : 'Tour the homes')}
    </a>
  );
}
