import { useRef } from 'react';

import { telHref } from '@shared/compliance.js';
import { emailHref, textHref, useIsMobile } from '../lib/contact.js';
import useDialog from './useDialog.js';

/**
 * A small sheet that gets a buyer talking to someone, with the message already
 * written: Call, Text and Email buttons on a phone, an Email button on a computer.
 *
 * The same sheet serves any "contact the team about X" button; the caller says
 * who, and what the message says. When the person has no email, a computer is
 * shown the number to call instead of a button that would open an empty draft.
 */
export default function ContactSheet({ open, onClose, title, intro, phone, email, subject, message, onAct }) {
  const dialogRef = useRef(null);
  const mobile = useIsMobile();
  useDialog(open, onClose, dialogRef);
  if (!open) return null;

  const dial = telHref(phone);
  const text = textHref(phone, message);
  const mail = emailHref(email, subject, message);
  const act = (what) => () => onAct?.(what);
  const actions = [];
  if (mobile) {
    if (dial) actions.push(['Call', dial, 'call']);
    if (text) actions.push(['Text us', text, 'text']);
    if (mail) actions.push(['Email us', mail, 'email']);
  } else if (mail) {
    actions.push(['Email us', mail, 'email']);
  } else if (dial) {
    // A computer cannot text, and an email needs an address: with none, the number
    // to call is the one thing that works from here.
    actions.push([`Call ${phone}`, dial, 'call']);
  }

  return (
    <div ref={dialogRef} className="b-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="b-sheet">
        <span className="b-head" style={{ fontSize: 20 }}>{title}</span>
        {intro ? <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>{intro}</span> : null}
        {message ? (
          <blockquote className="b-contact__msg">
            {message}
          </blockquote>
        ) : null}

        {actions.length ? (
          <div className="b-stack" style={{ gap: 8 }}>
            {actions.map(([label, href, what], index) => (
              <a
                key={what}
                className={`b-btn${index ? ' b-btn-outline' : ''}`}
                style={{ textDecoration: 'none', textAlign: 'center' }}
                href={href}
                onClick={act(what)}
              >
                {label}
              </a>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
            The team has not listed a way to reach them here yet. Ask them in person or through the community website.
          </span>
        )}
        {!mobile && dial && mail ? (
          <span style={{ fontSize: 13, color: 'var(--t-mut)' }}>
            Or call <a href={dial} style={{ color: 'var(--t-accT)', fontWeight: 700 }}>{phone}</a>.
          </span>
        ) : null}

        <button type="button" className="b-btn b-btn-outline" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
