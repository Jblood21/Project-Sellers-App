import { loadAccess } from './access.js';

/**
 * Tells chosen team members in Slack when a new visitor signs in to a community or listing. The app has its own Slack
 * connection: a Slack app's bot token in SLACK_BOT_TOKEN (Render), with the scopes chat:write, im:write and
 * users:read.email. Each person is found by the email they sign in to the admin with and gets a direct message.
 *
 * Nothing here can break a visitor's sign-in: every failure is caught, logged in a line and returned, never thrown.
 * `SLACK_API_URL` is for tests (a stub server); in real use it is Slack's own address.
 */
const api = () => process.env.SLACK_API_URL || 'https://slack.com/api';
const token = () => String(process.env.SLACK_BOT_TOKEN ?? '').trim();
export const slackConfigured = () => Boolean(token());

/** Slack's words for what went wrong, turned into what the owner can do about it. */
const WHY = {
  invalid_auth: 'The Slack token is not valid. Check SLACK_BOT_TOKEN in Render.',
  not_authed: 'The Slack token is missing. Add SLACK_BOT_TOKEN in Render.',
  token_revoked: 'The Slack token was revoked. Make a new one and update SLACK_BOT_TOKEN in Render.',
  users_not_found: 'No one in your Slack workspace has this email address.',
  missing_scope: 'The Slack app is missing a permission (chat:write, im:write and users:read.email). Add it and reinstall the app.',
  channel_not_found: 'Slack could not open a message to this person.',
};

async function call(method, params) {
  const res = await fetch(`${api()}/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(5000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw Object.assign(new Error(WHY[body.error] ?? `Slack said: ${body.error ?? res.status}.`), { slack: body.error });
  return body;
}

// An email's Slack id does not change, so it is asked for once per start of the server.
const ids = new Map();
async function userIdFor(email) {
  const key = String(email).trim().toLowerCase();
  if (ids.has(key)) return ids.get(key);
  // users.lookupByEmail takes a form field, not JSON.
  const res = await fetch(`${api()}/users.lookupByEmail?email=${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(5000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw Object.assign(new Error(WHY[body.error] ?? `Slack said: ${body.error ?? res.status}.`), { slack: body.error });
  ids.set(key, body.user.id);
  return body.user.id;
}

/** One direct message to the person with this email. { ok: true } or { ok: false, error } in words. */
export async function dm(email, text) {
  if (!slackConfigured()) return { ok: false, error: 'Slack is not connected yet. Add SLACK_BOT_TOKEN in Render.' };
  try {
    // Posting to a user's id opens the direct message with the app.
    await call('chat.postMessage', { channel: await userIdFor(email), text, unfurl_links: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Slack could not be reached.' };
  }
}

/**
 * A new visitor signed in. Goes to every team member the owner has switched Slack alerts on for and who can see this
 * community or listing (the owner always can). Not awaited by the caller.
 */
export async function notifyNewVisitor({ store, community, lead, baseUrl }) {
  if (!slackConfigured()) return { sent: 0 };
  try {
    const admins = (await store.listAdmins()).filter((admin) => admin.slack_alerts);
    const people = [];
    for (const admin of admins) {
      const access = await loadAccess(admin.id);
      if (access && (access.role === 'owner' || access.communityIds.has(community.id))) people.push(admin);
    }
    if (!people.length) return { sent: 0 };
    const kind = community?.settings?.siteKind === 'listing' ? 'listing' : 'community';
    const link = baseUrl ? `\n<${baseUrl}/admin/communities/${community.id}/leads/${lead.id}|Open ${lead.name}>` : '';
    const text = `*${lead.name}* just signed in to the ${kind} *${community.name}*.${link}`;
    const results = await Promise.all(people.map((admin) => dm(admin.email, text)));
    for (const [i, r] of results.entries()) if (!r.ok) console.warn(`Slack alert to ${people[i].email} failed: ${r.error}`);
    return { sent: results.filter((r) => r.ok).length };
  } catch (err) {
    console.warn(`Slack alert failed: ${err.message}`);
    return { sent: 0 };
  }
}
