import { agentLicenseLine } from '@shared/domain.js';
import { AGENT_TOP_STYLES, normalizeAgentTop } from '@shared/listing.js';
import { safeHref, telHref } from '@shared/compliance.js';
import { useLocation } from 'react-router-dom';

import { photoImgProps } from '../components/Photo.jsx';
import { safeEmail } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';
import TextAction from './TextAction.jsx';

/**
 * The listing agent, above the home's pictures: their face, name and brokerage, and a way to reach them in one tap.
 * A listing is one agent's (the person who made it), so a visitor sees who they are dealing with before the photos.
 *
 * Two styles, chosen by the agent in Setup (settings.agentTop) and tried side by side with ?agent=compact or
 * ?agent=featured on the buyer's address (nothing is saved by that):
 *  - compact: one slim row, a round face on the left, name and brokerage, Call and Text on the right;
 *  - featured: a card with a big portrait, "Your listing agent", the name, brokerage and licence, the phone and
 *    email as links, and Call, Text and Email under them.
 * With no portrait uploaded an initial keeps the shape. Nothing is drawn without an agent (or with agents off).
 */
export default function ListingAgentTop() {
  const { community, agents, features, lead, track, isListing } = useBuyer();
  const { search } = useLocation();
  if (!isListing || !features?.agents || !agents?.length) return null;
  const agent = agents[0];
  const asked = new URLSearchParams(search).get('agent');
  const variant = AGENT_TOP_STYLES.includes(asked) ? asked : normalizeAgentTop(community?.settings?.agentTop);

  const brokerage = String(agent.brokerage ?? '').trim();
  const license = agentLicenseLine(agent);
  const phoneHref = telHref(agent.phone);
  const email = safeEmail(agent.email);
  const website = safeHref(agent.website);
  const first = String(agent.name ?? '').trim().split(/\s+/)[0];
  const reached = (what) => track(`Reached out to schedule a showing (${what}): ${agent.name}`);
  const greeting = `Hi${first ? ` ${first}` : ''},${lead?.name ? ` this is ${lead.name}.` : ''} I have a question about ${community?.name ?? 'the home'}.`;
  const featured = variant === 'featured';
  const size = featured ? 112 : 60;

  const face = agent.photo ? (
    <img
      className="b-lat__face" {...photoImgProps(agent.photo, `${size}px`)}
      alt={brokerage ? `${agent.name}, ${brokerage}` : agent.name} width={size} height={size} decoding="async"
    />
  ) : (
    <span className="b-lat__face b-lat__face--initial b-head" aria-hidden="true">{agent.name?.trim()?.[0] ?? ''}</span>
  );

  const actions = (phoneHref || email) ? (
    <div className="b-lat__actions">
      {phoneHref ? <a className="b-lat__act" href={phoneHref} onClick={() => reached('call')}>Call</a> : null}
      <TextAction className="b-lat__act" phone={agent.phone} message={greeting} onAct={reached} />
      {featured && email ? <a className="b-lat__act" href={`mailto:${email}`} onClick={() => reached('email')}>Email</a> : null}
    </div>
  ) : null;

  return (
    <section className={`b-lat b-lat--${variant}`} aria-label={`Your listing agent, ${agent.name}`}>
      {face}
      <div className="b-lat__who">
        {featured ? <span className="b-lbl b-lat__eyebrow">Your listing agent</span> : null}
        <strong className="b-lat__name b-head">{agent.name}</strong>
        {brokerage ? <span className="b-lat__brokerage">{brokerage}</span> : null}
        {featured && agent.logo ? <img className="b-lat__logo" src={agent.logo} alt={`${brokerage || agent.name} logo`} decoding="async" /> : null}
        {license ? <span className="b-lat__license">{license}</span> : null}
        {featured ? (
          <ul className="b-lat__contact">
            {agent.phone ? <li>{phoneHref ? <a href={phoneHref}>{agent.phone}</a> : agent.phone}</li> : null}
            {email ? <li><a href={`mailto:${email}`}>{email}</a></li> : null}
            {website ? <li><a href={website}>{website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></li> : null}
          </ul>
        ) : null}
      </div>
      {actions}
    </section>
  );
}
