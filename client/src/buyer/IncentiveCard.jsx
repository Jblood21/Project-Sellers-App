import { useState } from 'react';

import { DEFAULT_SETTINGS, complianceOf, fillTokens, telHref } from '@shared/domain.js';
import { useBuyer } from './BuyerContext.jsx';
import ContactSheet from './ContactSheet.jsx';

/**
 * The builder's incentive, above Explore Homes when Setup has it switched on.
 *
 * The words are the builder's own (Setup → Builder incentive) and no amount or
 * terms are ever assumed, so the card says only what they wrote. "Find out if you
 * qualify" opens a sheet with Call, Text and Email buttons on a phone and an Email
 * button on a computer, and the message each one starts is already written:
 * "Contact me about the preferred lender incentive for <development>."
 *
 * Renders nothing when the switch is off or there is no headline and no body: a
 * card with nothing to say is worse than none.
 */
export default function IncentiveCard({ className = '' }) {
  const { community, features, track } = useBuyer();
  const [open, setOpen] = useState(false);
  if (!features.incentive) return null;

  const settings = community?.settings ?? {};
  const { lender } = complianceOf(settings, { community });
  const tokens = { community: community?.name ?? '', builder: community?.builder ?? '', lender: lender.name || 'the lender' };
  const fill = (value) => fillTokens(value, tokens).trim();
  const title = fill(settings.incentiveTitle);
  const body = fill(settings.incentiveBody);
  const fine = fill(settings.incentiveFinePrint);
  if (!title && !body) return null;

  const button = fill(settings.incentiveButton) || DEFAULT_SETTINGS.incentiveButton;
  const message = fill(settings.incentiveMessage || DEFAULT_SETTINGS.incentiveMessage);
  // The team's own number if Setup has one, otherwise the lender's: the
  // incentive is the lender's to qualify a buyer for.
  const own = String(settings.incentivePhone ?? '').trim();
  const phone = telHref(own) ? own : lender.phone;
  // Likewise the email: the card's own address if it has one, else the lender's loan team.
  const email = String(settings.incentiveEmail ?? '').trim() || lender.email;

  return (
    <section
      className={`b-incentive ${className}`.trim()}
      aria-labelledby={title ? 'home-incentive' : undefined}
      aria-label={title ? undefined : 'Builder incentive'}
    >
      <span className="b-incentive__kicker">Builder incentive</span>
      {title ? <h2 id="home-incentive" className="b-incentive__title b-head">{title}</h2> : null}
      {body ? <p className="b-incentive__body">{body}</p> : null}
      {fine ? <p className="b-incentive__fine">{fine}</p> : null}
      <button
        type="button"
        className="b-btn"
        onClick={() => {
          track('Opened the builder incentive');
          setOpen(true);
        }}
      >
        {button}
      </button>
      <ContactSheet
        open={open}
        onClose={() => setOpen(false)}
        title={button}
        intro="Send the team a message, already written for you."
        phone={phone}
        email={email}
        subject={`Preferred lender incentive — ${community?.name ?? ''}`.trim()}
        message={message}
        onAct={(how) => track(`Asked about the builder incentive (${how})`)}
      />
    </section>
  );
}
