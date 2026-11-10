import { loadAccess } from './access.js';
import { emailConfigured, sendEmail } from './email.js';
import { pushToAdmin } from './push.js';
import { dm, slackConfigured } from './slack.js';

/**
 * Tells chosen team members, outside the app, when a new person signs in to a community or listing: by email, on their phone and/or in
 * Slack, whichever the owner switched on for them on the Team page. It is every new person, whether or not they have
 * booked a time. Only people who can open that community or listing hear about it (the owner always can).
 *
 * Never awaited by the visitor's request and never throws: a slow or broken mail provider or Slack must not hold up
 * or fail a sign-in, so every failure is caught and logged in one line.
 */
const when = () => new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** The team members with `flag` switched on (a column of admin_users) who can open `community`. */
async function recipients(store, community, flag) {
  const people = [];
  for (const admin of (await store.listAdmins()).filter((a) => a[flag])) {
    const access = await loadAccess(admin.id);
    if (access && (access.role === 'owner' || access.communityIds.has(community.id))) people.push(admin);
  }
  return people;
}

/** The email a team member gets: who signed in and how to reach them, then a link to open them. */
export function visitorEmail({ community, lead, baseUrl }) {
  const kind = community?.settings?.siteKind === 'listing' ? 'listing' : 'community';
  const link = baseUrl ? `${baseUrl}/admin/communities/${community.id}/leads/${lead.id}` : '';
  const text = [
    `${lead.name} just signed in to the ${kind} ${community.name}.`,
    '',
    `Name:      ${lead.name}`,
    `Email:     ${lead.email}`,
    `Phone:     ${lead.phone || 'not given'}`,
    `${kind === 'listing' ? 'Listing' : 'Community'}: ${community.name}`,
    `Signed in: ${when()}`,
    '',
    link ? `Open them in the dashboard: ${link}` : '',
    '',
    'You get this because the owner switched on new-visitor alerts for you on the Team page.',
  ].filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n');
  return { subject: `New visitor: ${lead.name} — ${community.name}`, text };
}

export async function alertNewVisitor({ store, community, lead, baseUrl }) {
  const out = { email: 0, slack: 0, push: 0 };
  try {
    if (emailConfigured()) {
      const { subject, text } = visitorEmail({ community, lead, baseUrl });
      for (const admin of await recipients(store, community, 'email_alerts')) {
        // Reply goes to the visitor, so a team member can answer them straight from the alert.
        const r = await sendEmail({ to: admin.email, subject, text, replyTo: lead.email });
        if (r.sent) out.email += 1;
        else console.warn(`Visitor email to ${admin.email} not sent: ${r.error || r.skipped}`);
      }
    }
    // Phones: a notification a tap away from that person's page.
    const phones = await recipients(store, community, 'push_alerts');
    if (phones.length) {
      const payload = {
        title: 'New visitor',
        body: `${lead.name} just signed in to ${community.name}.`,
        url: `/admin/communities/${community.id}/leads/${lead.id}`,
        tag: `lead-${lead.id}`,
      };
      for (const admin of phones) out.push += (await pushToAdmin(store, admin.id, payload)).sent;
    }
    if (slackConfigured()) {
      const kind = community?.settings?.siteKind === 'listing' ? 'listing' : 'community';
      const link = baseUrl ? `\n<${baseUrl}/admin/communities/${community.id}/leads/${lead.id}|Open ${lead.name}>` : '';
      const text = `*${lead.name}* just signed in to the ${kind} *${community.name}*.${link}`;
      for (const admin of await recipients(store, community, 'slack_alerts')) {
        const r = await dm(admin.email, text);
        if (r.ok) out.slack += 1;
        else console.warn(`Slack alert to ${admin.email} failed: ${r.error}`);
      }
    }
  } catch (err) {
    console.warn(`New-visitor alert failed: ${err.message}`);
  }
  return out;
}

/**
 * Tells the same chosen people when somebody asks to see a listing: by email and on their phone, with the day they asked
 * for and what they wrote. Never throws and is never awaited by the buyer's request, like alertNewVisitor.
 */
export async function alertShowingRequest({ store, community, lead, showing, baseUrl }) {
  const out = { email: 0, push: 0 };
  try {
    const asked = [showing.date, showing.part].filter(Boolean).join(', ') || 'no day given';
    const link = baseUrl ? `${baseUrl}/admin/communities/${community.id}/leads/${lead.id}` : '';
    if (emailConfigured()) {
      const text = [
        `${lead.name} asked to see ${community.name}.`, '',
        `When:    ${asked}`,
        `Name:    ${lead.name}`,
        `Phone:   ${lead.phone || 'not given'}`,
        `Email:   ${lead.email}`,
        showing.message ? `Message: ${showing.message}` : '', '',
        link ? `Confirm, decline or suggest another time: ${link}` : '', '',
        'You get this because the owner switched on new-visitor alerts for you on the Team page.',
      ].filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n');
      for (const admin of await recipients(store, community, 'email_alerts')) {
        const r = await sendEmail({ to: admin.email, subject: `Showing request: ${lead.name} — ${community.name}`, text, replyTo: lead.email });
        if (r.sent) out.email += 1;
      }
    }
    const payload = {
      title: 'Showing request', body: `${lead.name} wants to see ${community.name} (${asked}).`,
      url: `/admin/communities/${community.id}/leads/${lead.id}`, tag: `showing-${lead.id}`,
    };
    for (const admin of await recipients(store, community, 'push_alerts')) out.push += (await pushToAdmin(store, admin.id, payload)).sent;
  } catch (err) {
    console.warn(`Showing-request alert failed: ${err.message}`);
  }
  return out;
}
