import { agentLicenseLine } from '@shared/domain.js';
import { safeHref, telHref } from '@shared/compliance.js';
import { safeEmail } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';
import TextAction from './TextAction.jsx';
import TourButton from './TourButton.jsx';

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
 * One real estate agent: portrait, name, brokerage and its logo, licence, and
 * every way to reach them.
 *
 * The phone number and email are links, and under them sit Call, Text and Email
 * buttons, each a 44px target: a buyer can act on the card without copying
 * anything. Text is offered only on a device that can send one. "Tour the homes"
 * (unless `tour` is false) opens a message to the agent that is already written.
 * Nothing here opens a new tab; the listing is the page. A field the builder
 * left blank prints nothing, and the licence line appears only with a number,
 * because a licence a buyer cannot look up says nothing.
 *
 * `headingLevel` is the level of the name, so the card sits under whichever
 * heading the page it is on already has. `homeName` makes the tour message
 * about one model.
 */
export default function AgentCard({ agent, headingLevel = 3, tour = true, homeName }) {
  const Heading = `h${headingLevel}`;
  const { community, lead } = useBuyer();
  const brokerage = String(agent.brokerage ?? '').trim();
  const license = agentLicenseLine(agent);
  const phoneHref = telHref(agent.phone);
  const email = safeEmail(agent.email);
  const website = safeHref(agent.website);
  const first = String(agent.name ?? '').trim().split(/\s+/)[0];
  const greeting = `Hi${first ? ` ${first}` : ''},${lead?.name ? ` this is ${lead.name}.` : ''} I have a question about ${community?.name ?? 'the community'}.`;

  return (
    <article className="b-agent">
      <div className="b-agent__top">
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
            {agent.email ? (
              <li>
                {email ? (
                  <a className="b-agent__link" href={`mailto:${email}`}>{email}</a>
                ) : (
                  <span className="b-agent__text">{agent.email}</span>
                )}
              </li>
            ) : null}
            {website ? (
              <li>
                <a className="b-agent__link" href={website}>{websiteLabel(website)}</a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {phoneHref || email ? (
        <div className="b-agent__actions">
          {phoneHref ? <a className="b-agent__act" href={phoneHref}>Call</a> : null}
          <TextAction className="b-agent__act" phone={agent.phone} message={greeting} />
          {email ? <a className="b-agent__act" href={`mailto:${email}`}>Email</a> : null}
        </div>
      ) : null}

      {tour ? <TourButton agent={agent} homeName={homeName} /> : null}
    </article>
  );
}
