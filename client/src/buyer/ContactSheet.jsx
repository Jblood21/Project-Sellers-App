import { useEffect, useRef, useState } from 'react';

import { SAFE_EMAIL_RE, telHref } from '@shared/compliance.js';
import { copyText, emailHref, useIsMobile } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';
import TextAction from './TextAction.jsx';
import useDialog from './useDialog.js';

// The same rule the server applies to the address a message is sent from.
const EMAIL_LOOKS_RIGHT = SAFE_EMAIL_RE;

/**
 * A small sheet that gets a buyer talking to someone, with the message already
 * written: Call, Text and Email buttons on a phone, an Email button on a computer.
 *
 * The same sheet serves any "contact the team about X" button; the caller says
 * who, and what the message says. When the person has no email, a computer is
 * shown the number to call instead of a button that would open an empty draft.
 *
 * With `compose` the Email button becomes a message form that the app sends for the buyer (so it works
 * without a mail program): name and email prefilled, the message editable, and "Sent" shown only when the
 * server says it went. When it cannot be sent the buyer is told, keeps what they wrote, and is offered
 * the address to copy, their own mail app, and the number to call.
 */
export default function ContactSheet({
  open, onClose, title, intro, phone, email, subject, message, onAct, compose,
}) {
  const dialogRef = useRef(null);
  const mobile = useIsMobile();
  const { lead, showToast } = useBuyer();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  useDialog(open, onClose, dialogRef);

  useEffect(() => {
    if (!open) return;
    setForm({ name: lead?.name ?? '', email: lead?.email ?? '', message: message ?? '' });
    setState('idle');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start fresh each time it opens
  }, [open]);

  if (!open) return null;

  const dial = telHref(phone);
  const mail = emailHref(email, subject, form.message || message);
  const act = (what) => () => onAct?.(what);
  const useForm = Boolean(compose?.ready && email);
  const actions = [];
  if (mobile) {
    if (dial) actions.push(['Call us', dial, 'call']);
    if (mail && !useForm) actions.push(['Email us', mail, 'email']);
  } else if (mail && !useForm) {
    actions.push(['Email us', mail, 'email']);
  } else if (dial && !useForm) {
    // A computer cannot text, and an email needs an address: with none, the number
    // to call is the one thing that works from here.
    actions.push([`Call ${phone}`, dial, 'call']);
  }

  const looksBad = form.email.trim() !== '' && !EMAIL_LOOKS_RIGHT.test(form.email.trim());
  const canSend = state !== 'sending' && form.name.trim() && EMAIL_LOOKS_RIGHT.test(form.email.trim()) && form.message.trim().length >= 3;

  const send = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    setState('sending');
    setError('');
    try {
      const result = await compose.send({ name: form.name.trim(), email: form.email.trim(), message: form.message.trim() });
      setState(result?.sent ? 'sent' : 'error');
      if (!result?.sent) setError('We couldn’t send that right now.');
    } catch (err) {
      setError(/failed to fetch|networkerror|load failed/i.test(err.message) ? 'You seem to be offline, so nothing was sent.' : err.message);
      setState('error');
    }
  };

  const copyAddress = async () => {
    const ok = await copyText(String(email).trim());
    showToast(ok ? 'Email address copied' : `Email ${String(email).trim()}`);
  };

  return (
    <div ref={dialogRef} className="b-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="b-sheet" style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <span className="b-head" style={{ fontSize: 20 }}>{title}</span>

        {state === 'sent' ? (
          <>
            <p role="status" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Message sent{compose?.recipientName ? ` to ${compose.recipientName}` : ''}. They’ll reply to {form.email.trim()}.
            </p>
          </>
        ) : (
          <>
            {intro ? <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>{intro}</span> : null}
            {useForm ? (
              <form className="b-contactform" onSubmit={send}>
                <label className="b-field">
                  <span className="b-lbl">Your name</span>
                  <input className="b-in" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoComplete="name" disabled={state === 'sending'} />
                </label>
                <label className="b-field">
                  <span className="b-lbl">Your email</span>
                  <input
                    className="b-in" type="email" value={form.email} inputMode="email" autoComplete="email" disabled={state === 'sending'}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} aria-invalid={looksBad || undefined}
                  />
                </label>
                <label className="b-field">
                  <span className="b-lbl">Your message</span>
                  <textarea
                    className="b-in b-contactform__msg" rows={4} maxLength={1000} value={form.message} disabled={state === 'sending'}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  />
                </label>
                <span style={{ fontSize: 11.5, color: 'var(--t-mut)', lineHeight: 1.45 }}>
                  Sending shares your {lead?.phone ? 'name, email and phone number' : 'name and email'} with {compose.recipientName || 'the team'} so they can reply.
                </span>
                {state === 'error' ? (
                  <div role="alert" className="b-contactform__err">
                    <p style={{ margin: '0 0 6px' }}>{error}</p>
                    <p style={{ margin: 0 }}>
                      You can{' '}
                      <a href={mail} onClick={act('email')} style={{ color: 'var(--t-accT)', fontWeight: 700 }}>open it in your email app</a>
                      {' '}or{' '}
                      <button type="button" onClick={copyAddress} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--t-accT)', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>
                        copy {String(email).trim()}
                      </button>
                      {dial ? <>, or call <a href={dial} onClick={act('call')} style={{ color: 'var(--t-accT)', fontWeight: 700 }}>{phone}</a></> : null}.
                    </p>
                  </div>
                ) : null}
                <button type="submit" className="b-btn" disabled={!canSend}>
                  {state === 'sending' ? 'Sending…' : 'Send message'}
                </button>
              </form>
            ) : message ? (
              <blockquote className="b-contact__msg">
                {message}
              </blockquote>
            ) : null}

            {actions.length || (useForm && (mobile && dial)) ? (
              <div className="b-stack" style={{ gap: 8 }}>
                {actions.map(([label, href, what], index) => (
                  <a
                    key={what}
                    className={`b-btn${index || useForm ? ' b-btn-outline' : ''}`}
                    style={{ textDecoration: 'none', textAlign: 'center' }}
                    href={href}
                    onClick={act(what)}
                  >
                    {label}
                  </a>
                ))}
                {mobile && phone ? (
                  <TextAction className="b-btn b-btn-outline" phone={phone} message={message} onAct={onAct} style={{ textDecoration: 'none', textAlign: 'center' }}>
                    Text us
                  </TextAction>
                ) : null}
              </div>
            ) : !useForm ? (
              <span style={{ fontSize: 13.5, color: 'var(--t-mut)', lineHeight: 1.5 }}>
                The team hasn’t added a phone number or email here yet. You can ask them in person.
              </span>
            ) : null}
            {!mobile && !useForm && dial && mail ? (
              <span style={{ fontSize: 13, color: 'var(--t-mut)' }}>
                Or call <a href={dial} style={{ color: 'var(--t-accT)', fontWeight: 700 }}>{phone}</a>.
              </span>
            ) : null}
          </>
        )}

        <button type="button" className="b-btn b-btn-outline" onClick={onClose}>{state === 'sent' ? 'Done' : 'Close'}</button>
      </div>
    </div>
  );
}
