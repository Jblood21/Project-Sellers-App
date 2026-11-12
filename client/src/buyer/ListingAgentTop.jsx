import { agentLicenseLine } from '@shared/domain.js';
import { safeHref, telHref } from '@shared/compliance.js';

import { photoImgProps } from '../components/Photo.jsx';
import { safeEmail } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';
import { listingAgentsOf } from './listingAgents.js';
import TextAction from './TextAction.jsx';

/**
 * The listing agent, above the home's pictures: their face, name, brokerage and licence, and Call and Text in one tap.
 * A listing is one agent's (the person who made it), so a visitor sees who they are dealing with before the photos.
 * With no portrait uploaded an initial keeps the shape. Nothing is drawn without an agent (or with agents off).
 */
function AgentRow({ agent }) {
  const { community, lead, track } = useBuyer();
  const brokerage = String(agent.brokerage ?? '').trim();
  const license = agentLicenseLine(agent);
  const phoneHref = telHref(agent.phone);
  const email = safeEmail(agent.email);
  const first = String(agent.name ?? '').trim().split(/\s+/)[0];
  const reached = (what) => track(`Reached out to schedule a showing (${what}): ${agent.name}`);
  const greeting = `Hi${first ? ` ${first}` : ''},${lead?.name ? ` this is ${lead.name}.` : ''} I have a question about ${community?.name ?? 'the home'}.`;

  return (
    <section className="b-lat" aria-label={`Your listing agent, ${agent.name}`}>
      {agent.photo ? (
        <img
          className="b-lat__face" {...photoImgProps(agent.photo, '60px')}
          alt={brokerage ? `${agent.name}, ${brokerage}` : agent.name} width="60" height="60" decoding="async"
        />
      ) : (
        <span className="b-lat__face b-lat__face--initial b-head" aria-hidden="true">{agent.name?.trim()?.[0] ?? ''}</span>
      )}
      <div className="b-lat__who">
        <strong className="b-lat__name b-head">{agent.name}</strong>
        {brokerage ? <span className="b-lat__brokerage">{brokerage}</span> : null}
        {license ? <span className="b-lat__license">{license}</span> : null}
      </div>
      {phoneHref || email ? (
        <div className="b-lat__actions">
          {phoneHref ? <a className="b-lat__act" href={phoneHref} onClick={() => reached('call')}>Call</a> : null}
          <TextAction className="b-lat__act" phone={agent.phone} message={greeting} onAct={reached} />
          {!phoneHref && email ? <a className="b-lat__act" href={`mailto:${email}`} onClick={() => reached('email')}>Email</a> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The listing's agents, above the home's pictures: each with their face, name, brokerage and licence, and Call and Text
 * in one tap. One agent shows alone; several, or a team, show under a line ("Listed by The Whitcombe Group").
 * With no portrait an initial keeps the shape. Nothing is drawn without an agent (or with agents off).
 */
export default function ListingAgentTop() {
  const { agents, features, settings, isListing } = useBuyer();
  if (!isListing || !features?.agents || !agents?.length) return null;
  const { list, title } = listingAgentsOf({ agents, settings, isListing });
  if (!list.length) return null;
  if (list.length === 1 && !title) return <AgentRow agent={list[0]} />;
  return (
    <div className="b-lat-group">
      {title ? <p className="b-lat-group__title b-head">{title}</p> : null}
      {list.map((agent) => <AgentRow key={agent.id} agent={agent} />)}
    </div>
  );
}
