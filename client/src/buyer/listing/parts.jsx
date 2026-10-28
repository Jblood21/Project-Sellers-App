import Photo from '../../components/Photo.jsx';
import { agentLicenseLine } from '@shared/domain.js';
import { safeHref, telHref } from '@shared/compliance.js';
import { money } from '../../lib/format.js';
import { safeEmail } from '../../lib/contact.js';
import { photoImgProps } from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';
import GuidesTeaser from '../GuidesTeaser.jsx';
import OpenHouseCard from '../OpenHouseCard.jsx';
import TextAction from '../TextAction.jsx';

/*
 * Building blocks every layout's listing page draws from. They carry the behaviour (what a button does, what is
 * tracked, what is hidden when there is nothing to show) and as little look as possible: classes are `ls-*` so each
 * layout's stylesheet styles them its own way.
 */

/** The agent's face, or their initial when there is no portrait. `size` is the drawn width in px. */
export function Face({ agent, size = 64, className = '' }) {
  const brokerage = String(agent?.brokerage ?? '').trim();
  if (agent?.photo) {
    return (
      <img
        className={`ls-face ${className}`} {...photoImgProps(agent.photo, `${size}px`)}
        alt={brokerage ? `${agent.name}, ${brokerage}` : agent.name} width={size} height={size} decoding="async"
      />
    );
  }
  return <span className={`ls-face ls-face--initial b-head ${className}`} style={{ width: size, height: size }} aria-hidden="true">{agent?.name?.trim()?.[0] ?? ''}</span>;
}

/** What to show and do for the agent: the lines under their name and Call, Text and Email, each tracked. */
export function useAgent(model) {
  const { track, lead } = useBuyer();
  const agent = model.agent;
  if (!agent) return null;
  const email = safeEmail(agent.email);
  const phoneHref = telHref(agent.phone);
  const first = String(agent.name ?? '').trim().split(/\s+/)[0];
  const reached = (what) => track(`Reached out to schedule a showing (${what}): ${agent.name}`);
  const greeting = `Hi${first ? ` ${first}` : ''},${lead?.name ? ` this is ${lead.name}.` : ''} I have a question about ${model.community?.name ?? 'the home'}.`;
  return {
    agent, first, email, phoneHref, reached, greeting,
    name: agent.name, brokerage: String(agent.brokerage ?? '').trim(), license: agentLicenseLine(agent), phone: agent.phone,
  };
}

/** Call, Text (or Email when there is no number) as buttons or links, in the order a phone user expects. */
export function AgentActions({ model, className = 'ls-act', emailToo = false }) {
  const a = useAgent(model);
  if (!a) return null;
  if (!a.phoneHref && !a.email) return null;
  return (
    <>
      {a.phoneHref ? <a className={className} href={a.phoneHref} onClick={() => a.reached('call')}>Call</a> : null}
      <TextAction className={className} phone={a.phone} message={a.greeting} onAct={a.reached} />
      {a.email && (emailToo || !a.phoneHref) ? <a className={className} href={`mailto:${a.email}`} onClick={() => a.reached('email')}>Email</a> : null}
    </>
  );
}

/** The agent's name, brokerage and licence as stacked lines. */
export function AgentLines({ model, nameTag: Name = 'strong' }) {
  const a = useAgent(model);
  if (!a) return null;
  return (
    <>
      <Name className="ls-agent__name b-head">{a.name}</Name>
      {a.brokerage ? <span className="ls-agent__brokerage">{a.brokerage}</span> : null}
      {a.license ? <span className="ls-agent__license">{a.license}</span> : null}
    </>
  );
}

/** A photo that opens in the viewer. `index` is its place in all the home's photos. */
export function PhotoButton({ model, photo, index, sizes, className = 'ls-photo', eager = false }) {
  if (!photo) return <div className={`${className} ls-photo--none`} aria-hidden="true" />;
  return (
    <button
      type="button" className={className} onClick={() => model.openPhoto(index)}
      aria-label={`Open ${model.name} photo ${index + 1} of ${model.photos.length}`}
    >
      <Photo eager={eager} photo={photo} alt={`${model.name} photo ${index + 1} of ${model.photos.length}`} sizes={sizes} />
    </button>
  );
}

/** Where the home stands, in words, for anything but an active listing. Nothing for Active. */
export function StatusNote({ model, className = 'b-ls-banner' }) {
  const { status } = model;
  if (!status || status === 'Active') return null;
  return (
    <p className={className} data-status={status} role="status">
      {status === 'Coming soon' ? 'Coming soon. This home is not on the market yet.' : null}
      {status === 'Under contract' ? 'Under contract. This home has an accepted offer.' : null}
      {status === 'Sold' ? 'Sold. This home is no longer available.' : null}
    </p>
  );
}

/** Beds, baths, sq ft as separate items (for tiles or a stat bar). Any that is not given is left out. */
export function statList(model) {
  return [
    model.beds ? { key: 'beds', value: String(model.beds), label: model.beds === 1 ? 'bed' : 'beds' } : null,
    model.baths ? { key: 'baths', value: String(model.baths), label: model.baths === 1 ? 'bath' : 'baths' } : null,
    model.sqft ? { key: 'sqft', value: Number(model.sqft).toLocaleString('en-US'), label: 'sq ft' } : null,
  ].filter(Boolean);
}

/** The listing facts as short lines: size, MLS number, brokerage. */
export function factLines(model) {
  return [model.meta, model.mls ? `MLS #${model.mls}` : '', model.brokerage ? `Listed with ${model.brokerage}` : ''].filter(Boolean);
}

/** "$610,000" or nothing when the price is not given. */
export function Price({ model, className = 'ls-price' }) {
  return model.price ? <span className={className}>{money(model.price)}</span> : null;
}

/** "About $3,420/mo" with the terms underneath, only when the Payment tool is on. */
export function Estimate({ model, className = 'ls-est' }) {
  if (!model.estimate) return null;
  return (
    <span className={className}>
      <strong>{money(model.estimate.monthly)}</strong>/mo est.
      <small>{model.estimate.downPct}% down, {Number(model.estimate.rate).toFixed(2)}% fixed</small>
    </span>
  );
}

/** Request a showing, Talk about financing, See my payment and Save, as the layout's buttons. Each only when it can do something. */
export function Actions({ model, className = 'ls-actions', btn = 'b-btn', outline = 'b-btn b-btn-outline', only }) {
  const show = (key) => !only || only.includes(key);
  return (
    <div className={className}>
      {show('showing') && model.requestShowing ? <button type="button" className={btn} onClick={model.requestShowing}>Request a showing</button> : null}
      {show('finance') && model.talkFinancing ? (
        <button type="button" className={model.requestShowing ? outline : btn} onClick={model.talkFinancing}>Talk about financing</button>
      ) : null}
      {show('payment') && model.openPayment ? <button type="button" className={outline} onClick={model.openPayment}>See My Payment for This Home</button> : null}
      {show('save') ? (
        <button
          type="button" className={outline} onClick={model.toggleSave}
          style={model.saved ? { background: 'var(--t-acc)', color: 'var(--t-onacc)' } : undefined}
        >
          {model.saved ? '★ Saved' : '☆ Save this home'}
        </button>
      ) : null}
    </div>
  );
}

/** Video tour button, when there is one. */
export function VideoButton({ model, className = 'b-btn b-btn-outline' }) {
  return model.hasVideo ? <button type="button" className={className} onClick={model.openVideo}>▶ Watch the video tour</button> : null;
}

/** Floor plans as small buttons that open the viewer. */
export function FloorPlans({ model, className = 'ls-plans' }) {
  if (!model.floorPlans.length) return null;
  return (
    <div className={className}>
      {model.floorPlans.map((plan, index) => (
        <button
          key={plan.id} type="button" className="ls-plan" onClick={() => model.openPlan(index)}
          aria-label={`Open ${model.name} floor plan ${index + 1}`}
        >
          <Photo photo={plan} alt={`${model.name} floor plan ${index + 1} of ${model.floorPlans.length}`} fit="contain" sizes="160px" />
        </button>
      ))}
    </div>
  );
}

/** The existing open-house card (calendar and directions per session). */
export function OpenHouses({ model }) {
  return model.sessions.length ? <OpenHouseCard sessions={model.sessions} today={model.today} time={model.time} /> : null;
}

/** Buyer guides teaser, as on every listing. */
export function Guides(props) {
  return <GuidesTeaser {...props} />;
}

export { safeHref };
