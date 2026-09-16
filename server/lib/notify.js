import { contactMethodLabel, describeTour, money } from '../../shared/domain.js';
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
    `${lead.name} booked ${describeTour(lead.tour)}.`,
    '',
    // The contact they chose leads, because it decides what the builder does next.
    `Reach them by: ${contactMethodLabel(lead.tour?.contact)}`,
    prefersEmail ? `Email:     ${lead.email}` : `Phone:     ${lead.phone || 'not given'}`,
    prefersEmail ? `Phone:     ${lead.phone || 'not given'}` : `Email:     ${lead.email}`,
    `Community: ${community.name}`,
    `Booked at: ${when(lead.tour?.requestedAt)}`,
    '',
    saved.length ? `Homes they saved: ${saved.join(', ')}` : 'They have not saved a home yet.',
    '',
    planLines.length ? 'What they have worked out so far:' : 'They have not run any tools yet.',
    ...planLines,
    '',
    baseUrl ? `Open the lead: ${baseUrl}/admin/leads/${lead.id}` : '',
    '',
    `Mark it handled in the dashboard once you have ${prefersEmail ? 'emailed' : 'called'} them, so it leaves the queue.`,
  ].filter((line) => line !== undefined).join('\n');

  return sendEmail({
    to,
    subject: lead.tour?.date
      ? `${lead.name} booked ${describeTour(lead.tour)} — ${community.name}`
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
 */
export async function sendPlanToBuyer({ community, lead, baseUrl }) {
  const entries = Object.entries(lead.plan ?? {});
  const savedNames = (lead.savedHomeIds ?? [])
    .map((id) => community.homes?.find((h) => h.id === id))
    .filter(Boolean)
    .map((home) => `  · ${home.name} — ${money(home.price)}`);

  const text = [
    `Hi ${lead.name.split(' ')[0]},`,
    '',
    `Here is the home plan you put together for ${community.name}.`,
    '',
    ...(entries.length ? ['What you worked out:', ...entries.map(([, s]) => `  · ${s}`), ''] : []),
    ...(savedNames.length ? ['Homes you liked:', ...savedNames, ''] : []),
    baseUrl ? `Pick up where you left off: ${baseUrl}/c/${community.id}` : '',
    '',
    'These are estimates to help you plan — not a loan offer or a pre-approval.',
  ].join('\n');

  return sendEmail({
    to: lead.email,
    subject: `Your home plan — ${community.name}`,
    text,
  });
}
