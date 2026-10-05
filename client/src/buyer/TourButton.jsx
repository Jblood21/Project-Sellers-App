import { messageLink, tourMessage, useIsMobile } from '../lib/contact.js';
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
export default function TourButton({ agent, homeName, label = 'Tour the homes', className = 'b-btn b-tour__btn' }) {
  const { community, lead, track } = useBuyer();
  const mobile = useIsMobile();
  if (!agent) return null;

  const body = tourMessage({ agentName: agent.name, community: community?.name, buyerName: lead?.name, homeName });
  const subject = homeName ? `Tour the ${homeName} model` : `Tour the homes at ${community?.name ?? 'the community'}`;
  const link = messageLink({ phone: agent.phone, email: agent.email, subject, body, mobile });
  if (!link) return null;

  return (
    <a
      className={className}
      href={link.href}
      onClick={() => track(`Asked ${agent.name} to schedule a tour${homeName ? ` of ${homeName}` : ''}`)}
    >
      {label}
    </a>
  );
}
