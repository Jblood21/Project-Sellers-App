import { agentLicenseLine } from '@shared/domain.js';
import { complianceOf, safeHref } from '@shared/compliance.js';
import { useBuyer } from './BuyerContext.jsx';
import { telHref } from '@shared/compliance.js';

// An address that is only an address. The server accepts anything with an @, and
// "a@b.co?bcc=somebody" in a mailto: link would add recipients to the buyer's
// draft, so a value with those characters is shown as text and never linked.
const MAILTO_SAFE = /^[^\s@?&#<>"'%,;]+@[^\s@?&#<>"'%,;]+\.[^\s@?&#<>"'%,;]+$/;

/** 'https://www.example.com/team/' becomes 'example.com/team', for the link text. */
function websiteLabel(href) {
  try {
    const url = new URL(href);
    return `${url.host.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;
  } catch {
    return href;
  }
}

/**
 * One realtor: portrait, name, brokerage and its logo, licence, and contact.
 *
 * Phone and email are real tel: and mailto: links so a buyer can act on them
 * from a phone; the website is linked only when it is an http(s) address. Each
 * link is a 44px target. A field the builder left blank prints nothing at all.
 * The licence line appears only with a number, because a licence a buyer cannot
 * look up says nothing.
 *
 * `headingLevel` is the level of the name, so the card sits under whichever
 * heading the page it is on already has.
 */
export default function AgentCard({ agent, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const brokerage = String(agent.brokerage ?? '').trim();
  const license = agentLicenseLine(agent);
  const phoneHref = telHref(agent.phone);
  const email = String(agent.email ?? '').trim();
  const website = safeHref(agent.website);

  return (
    <article className="b-agent">
      <div className="b-agent__photo">
        {agent.photo ? (
          <img src={agent.photo} alt={brokerage ? `${agent.name}, ${brokerage}` : agent.name} loading="lazy" decoding="async" width="76" height="76" />
        ) : (
          // No portrait uploaded: an initial keeps the card's shape. The name is
          // printed beside it, so the placeholder says nothing to a screen reader.
          <span className="b-agent__initial b-head" aria-hidden="true">{agent.name?.trim()?.[0] ?? ''}</span>
        )}
      </div>
      <div className="b-agent__body">
        <Heading className="b-agent__name b-head">{agent.name}</Heading>
        {brokerage ? <p className="b-agent__brokerage">{brokerage}</p> : null}
        {agent.logo ? (
          <img
            className="b-agent__logo"
            src={agent.logo}
            alt={`${brokerage || agent.name} logo`}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        {license ? <p className="b-agent__license">{license}</p> : null}
        <ul className="b-agent__contact">
          {agent.phone ? (
            <li>
              {phoneHref ? (
                <a className="b-agent__link" href={phoneHref}>{agent.phone}</a>
              ) : (
                <span className="b-agent__text">{agent.phone}</span>
              )}
            </li>
          ) : null}
          {email ? (
            <li>
              {MAILTO_SAFE.test(email) ? (
                <a className="b-agent__link" href={`mailto:${email}`}>{email}</a>
              ) : (
                <span className="b-agent__text">{email}</span>
              )}
            </li>
          ) : null}
          {website ? (
            <li>
              <a className="b-agent__link" href={website} target="_blank" rel="noopener noreferrer">
                {websiteLabel(website)}
              </a>
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

/**
 * What goes with a list of agents: who the lender says the agents are not, and
 * the fair housing line for real estate. The words of both come from settings, so
 * Setup can change or blank either. The second is text only; the Equal Housing
 * LENDER mark belongs to the lender and is not used for agents.
 */
export function AgentsNotice() {
  const { community } = useBuyer();
  const { agentsNote, agentsEhoLine } = complianceOf(community?.settings, { community });
  // With both blanked there is nothing to print, so no empty box is left behind.
  if (!agentsNote && !agentsEhoLine) return null;
  return (
    <div className="b-agents__notice">
      {agentsNote ? <p className="b-agents__note">{agentsNote}</p> : null}
      {agentsEhoLine ? <p className="b-agents__eho">{agentsEhoLine}</p> : null}
    </div>
  );
}
