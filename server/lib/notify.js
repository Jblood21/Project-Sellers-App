import {
  complianceOf, complianceText, contactMethodLabel, describeTour, fillTokens, isoDate, lenderNameOf, money, SAFE_EMAIL_RE,
} from '../../shared/domain.js';
import { moveInPlanLines, printableMoveIn } from '../../shared/moveInPrint.js';
import { sendEmail } from './email.js';

/** Where a community's call requests go: its own address, else the dashboard account. */
async function notifyAddress(store, community) {
  const configured = String(community?.settings?.notifyEmail ?? '').trim();
  return configured || (await store.firstAdminEmail());
}

const when = (iso) => {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

/**
 * Tells the builder a buyer wants to talk.
 *
 * The body leads with what they need to act: the name, the number, and when the
 * buyer said. Everything after that is the context that makes the call a good
 * one rather than a cold one.
 */
export async function notifyCallRequest({ store, community, lead, baseUrl }) {
  const to = await notifyAddress(store, community);
  if (!to) return { sent: false, skipped: 'no admin address' };

  const saved = (lead.savedHomeIds ?? [])
    .map((id) => community.homes?.find((h) => h.id === id)?.name)
    .filter(Boolean);
  const planLines = Object.entries(lead.plan ?? {}).map(([, summary]) => `  · ${summary}`);

  const prefersEmail = lead.tour?.contact === 'email';
  const text = [
    `${lead.name} booked ${describeTour(lead.tour, lenderNameOf(community))}.`,
    '',
    // The contact they chose leads, because it decides what the builder does next.
    `Reach them by: ${contactMethodLabel(lead.tour?.contact)}`,
    prefersEmail ? `Email:     ${lead.email}` : `Phone:     ${lead.phone || 'not given'}`,
    prefersEmail ? `Phone:     ${lead.phone || 'not given'}` : `Email:     ${lead.email}`,
    ...(lead.extraEmails?.length ? [`Also email: ${lead.extraEmails.join(', ')}`] : []),
    `Community: ${community.name}`,
    `Booked at: ${when(lead.tour?.requestedAt)}`,
    '',
    saved.length ? `Homes they saved: ${saved.join(', ')}` : 'They have not saved a home yet.',
    '',
    planLines.length ? 'What they have worked out so far:' : 'They have not run any tools yet.',
    ...planLines,
    '',
    baseUrl ? `Open the lead: ${baseUrl}/admin/communities/${community.id}/leads/${lead.id}` : '',
    '',
    `Mark it handled in the dashboard once you have ${prefersEmail ? 'emailed' : 'called'} them, so it leaves the queue.`,
  ].filter((line) => line !== undefined).join('\n');

  return sendEmail({
    to,
    subject: lead.tour?.date
      ? `${lead.name} booked ${describeTour(lead.tour, lenderNameOf(community))} — ${community.name}`
      : `${lead.name} wants a call — ${community.name}`,
    text,
    // So hitting reply in a mail client reaches the buyer, not the app.
    replyTo: lead.email,
  });
}

/**
 * Sends a buyer the plan they built. Explicit only — triggered by a button they
 * press, never automatically, because an unrequested email is spam and this app
 * already has their address.
 *
 * The move-in plan goes in whole, every step with its date and whose job it is,
 * as on the printed plan; the saved one-line summary stands in only for a buyer
 * who added it before choosing a date of their own. `today` is a parameter so the
 * dates a test sees do not depend on the day it runs.
 */
export async function sendPlanToBuyer({ community, lead, baseUrl, today = isoDate(new Date()), to = lead.email, sharedBy = '' }) {
  const moveIn = lead.plan?.movein
    ? printableMoveIn(lead.moveIn, {
      home: community.homes?.find((h) => h.id === lead.moveIn?.homeId) ?? null,
      today,
    })
    : null;
  // The full plan replaces its own summary line, so it is not said twice.
  const entries = Object.entries(lead.plan ?? {}).filter(([key]) => !(key === 'movein' && moveIn));
  const savedNames = (lead.savedHomeIds ?? [])
    .map((id) => community.homes?.find((h) => h.id === id))
    .filter(Boolean)
    .map((home) => `  · ${home.name} — ${money(home.price)}`);

  // Sent to a second address the buyer added: said plainly as theirs, not the recipient's. The sender is
  // named by a first name that looks like one and nothing else of what they typed: this goes to an
  // address nobody has confirmed is theirs, so a visitor's free text must not become the subject or
  // the opening of a mail that comes from the builder's own sending address.
  const sharer = sharedBy ? (/^[\p{L}'’.-]{1,30}$/u.test(String(lead.name ?? '').trim().split(/\s+/)[0]) ? String(lead.name).trim().split(/\s+/)[0] : 'Someone') : '';
  const link = baseUrl ? `${baseUrl}/c/${community.urlKey ?? community.id}` : '';
  const text = [
    sharedBy ? 'Hi,' : `Hi ${lead.name.split(' ')[0]},`,
    '',
    sharedBy
      ? `${sharer} shared the home plan they put together for ${community.name}.`
      : `Here’s the home plan you put together for ${community.name}.`,
    '',
    ...(entries.length ? ['What you worked out:', ...entries.map(([, s]) => `  · ${s}`), ''] : []),
    ...(moveIn ? ['Your move-in plan:', '', ...moveInPlanLines(moveIn), ''] : []),
    ...(savedNames.length ? ['Homes you liked:', ...savedNames, ''] : []),
    // A shared copy is read by someone who has not been using the app, so there is nothing to pick up.
    link ? `${sharedBy ? 'Look around the community' : 'Pick up where you left off'}: ${link}` : '',
    '',
    'These are estimates to help you plan — not a loan offer or a pre-approval.',
    '',
    // The email carries payment estimates, so it is an advertisement of credit
    // like the page it came from and gets the same lender identity and
    // disclosures, built from the same function so the two cannot differ.
    '——',
    complianceText(community.settings, { community }),
  ].join('\n');

  return sendEmail({
    to,
    subject: sharedBy ? `A home plan was shared with you — ${community.name}` : `Your home plan — ${community.name}`,
    text,
    // A reply to a shared plan goes to the person who shared it, when their address is a plain one: the
    // sign-up accepts anything with an @, and a reply-to like `Boss <x@y.com>` would show as a name.
    ...(sharedBy && SAFE_EMAIL_RE.test(String(lead.email ?? '')) ? { replyTo: lead.email } : {}),
  });
}

/**
 * A buyer's message from the "Find out if you qualify" form, sent to the person who answers it: the
 * incentive email set in Setup, else the loan team. The buyer's own address is the reply-to, so answering
 * reaches them, and everything the recipient needs is in the message (who, how to reach them, what the
 * incentive said). The subject is one line whatever the name contains. Text only; no admin link, because
 * the loan team has no admin login.
 */
export async function emailLoanTeam({ community, lead, to, name, email, message, baseUrl }) {
  const settings = community.settings ?? {};
  const tokens = {
    community: community.name ?? '',
    builder: community.builder ?? '',
    lender: complianceOf(settings, { community }).lender.name || 'the lender',
  };
  const fill = (value) => fillTokens(value, tokens).trim();
  // Text a visitor typed: one line, and without the characters that reorder what is shown around them.
  const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
  const clean = (value) => String(value ?? '').replace(BIDI, '').replace(/[\r\n]+/g, ' ').trim();
  const asked = fill(settings.incentiveTitle);
  // The details the app knows come first, and what the visitor wrote is quoted line by line after them,
  // so nothing in it can pass for a section of this email or a second set of contact details.
  const quoted = String(message ?? '').replace(BIDI, '').trim().split('\n').map((line) => `  > ${line}`);
  const text = [
    `${clean(name)} asked about the builder incentive at ${community.name}${community.builder ? ` (${community.builder})` : ''}.`,
    '',
    'Reach them (from the sign-up form):',
    `  Name:  ${clean(name)}`,
    `  Email: ${clean(email)}  (reply to this email to answer them)`,
    `  Phone: ${lead.phone || 'not given'}`,
    '',
    'What they wrote (typed in the app, not checked):',
    ...quoted,
    '',
    ...(asked || fill(settings.incentiveBody)
      ? ['The incentive they were looking at:', ...[asked, fill(settings.incentiveBody), fill(settings.incentiveFinePrint)].filter(Boolean).map((line) => `  ${line}`), '']
      : []),
    `Sent from the Touradoor app${baseUrl ? ` (${baseUrl}/c/${community.urlKey ?? community.id})` : ''} after they pressed Send. The app told them their name, email and phone would be shared so you can reply.`,
  ].join('\n');

  return sendEmail({
    to,
    subject: `Builder incentive question: ${clean(name).slice(0, 80)} — ${clean(community.name).slice(0, 60)}`.slice(0, 150),
    text,
    replyTo: clean(email),
  });
}
