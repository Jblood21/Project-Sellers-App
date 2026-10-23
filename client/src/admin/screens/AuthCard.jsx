import { useEffect, useId, useRef } from 'react';

import Wordmark from '../Wordmark.jsx';

/**
 * The one card the signed-out pages share (sign in, forgot your password, choose a new one): the
 * wordmark, a heading, a line of context and whatever the page puts under them. A form passes `onSubmit`
 * and the card is the form, so Enter in any field submits it; a page with nothing to submit leaves it out.
 *
 * `focusTitle` is for a card that reports what just happened (the email is on its way, the link is dead,
 * the session ended). It replaces the form that had the keyboard, which would otherwise be left on
 * nothing, so the heading takes it, described by the line under it: the outcome is read out, and Tab
 * moves on to the next step.
 */
export default function AuthCard({ title, blurb, onSubmit, focusTitle = false, children }) {
  const Tag = onSubmit ? 'form' : 'div';
  const heading = useRef(null);
  const blurbId = useId();
  useEffect(() => {
    if (focusTitle) heading.current?.focus();
  }, [focusTitle, title]);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Tag className="card elev-sm" onSubmit={onSubmit} style={{ width: '100%', maxWidth: 380, gap: 14, padding: 24 }}>
        <span style={{ color: 'var(--color-accent)' }}>
          <Wordmark size={22} />
        </span>
        <h2
          ref={heading}
          tabIndex={focusTitle ? -1 : undefined}
          aria-describedby={focusTitle && blurb ? blurbId : undefined}
          style={{ margin: '6px 0 4px', fontSize: 24 }}
        >
          {title}
        </h2>
        {blurb ? <p id={blurbId} className="text-muted" style={{ fontSize: 13, margin: '0 0 6px' }}>{blurb}</p> : null}
        {children}
      </Tag>
    </div>
  );
}
