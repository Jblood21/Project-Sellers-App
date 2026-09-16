/**
 * Outbound email over Resend's HTTP API. Deliberately no SDK — one fetch call is
 * the whole integration, and it keeps the dependency list at express + pg.
 *
 * Two rules hold everywhere this is used:
 *
 *  1. Without RESEND_API_KEY it no-ops and says so. Local development, CI and
 *     anyone running this without an email account are unaffected.
 *  2. Sending never throws. A lead asking for a call must be recorded even if
 *     the mail provider is down; losing the lead to save the notification would
 *     be exactly backwards.
 */

const ENDPOINT = process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails';

/** Swappable so tests can assert what would be sent without touching the network. */
let transport = async (payload, apiKey) => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // The buyer's request waits on this, so it is bounded. A provider that hangs
    // costs five seconds and a logged error, never the tour request itself.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  return res.json();
};

export function setTransportForTests(fn) {
  const previous = transport;
  transport = fn;
  return () => { transport = previous; };
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Returns {sent, skipped?, error?} rather than throwing, so callers can log the
 * outcome without having to guard every call site.
 */
export async function sendEmail({ to, subject, text, replyTo }) {
  if (!emailConfigured()) return { sent: false, skipped: 'RESEND_API_KEY is not set' };
  if (!to) return { sent: false, skipped: 'no recipient' };

  const payload = {
    from: process.env.EMAIL_FROM || 'Cornerpost <onboarding@resend.dev>',
    to: [to],
    subject,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  try {
    await transport(payload, process.env.RESEND_API_KEY);
    return { sent: true };
  } catch (err) {
    // Logged, never rethrown — see rule 2 above.
    console.error(`Email to ${to} failed: ${err.message}`);
    return { sent: false, error: err.message };
  }
}
