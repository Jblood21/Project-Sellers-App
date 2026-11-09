import webpush from 'web-push';

/**
 * Phone notifications (web push). A team member who turned notifications on in the installed app has a subscription: an
 * address at their phone maker's push service (Apple, Google, Mozilla or Microsoft) and two keys. This site signs what it
 * sends with one VAPID key pair, made on first use and kept in the database (or taken from VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY when those are set), so a phone's subscription keeps working across deploys.
 *
 * Nothing here throws: a phone that has gone, a push service that is down or an expired subscription is logged in a
 * line and, where the push service says the phone is gone for good, its subscription is removed.
 */

// A subscription's address is where this server will send a request, so it is only taken when it is one of the push
// services' own hosts. Anything else (an internal address, someone's server) is refused.
const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/i,
  /^fcm\.googleapis\.com$/i,
  /(^|\.)push\.services\.mozilla\.com$/i,
  /(^|\.)notify\.windows\.com$/i,
];
export function allowedEndpoint(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname)) && String(value).length <= 2048;
  } catch {
    return false;
  }
}

const KEY_RE = /^[A-Za-z0-9_-]{16,200}$/;
/** A subscription from a browser ({ endpoint, keys: { p256dh, auth } }), checked: { value } or { error } in words. */
export function cleanSubscription(body) {
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!allowedEndpoint(endpoint)) return { error: 'That phone sent a notification address this site does not accept.' };
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY_RE.test(p256dh) || !KEY_RE.test(auth)) {
    return { error: 'That phone sent notification keys this site cannot read. Try turning notifications on again.' };
  }
  return { value: { endpoint, p256dh, auth } };
}

/** Swappable so tests can see what would be sent without a push service. */
let sender = (subscription, payload, options) => webpush.sendNotification(subscription, payload, options);
export function setPushSenderForTests(fn) {
  const previous = sender;
  sender = fn;
  return () => { previous && (sender = previous); };
}

let cachedKeys = null;
/** The key pair: from the environment, else the database, made and saved the first time it is needed. */
export async function pushKeys(store) {
  const fromEnv = { publicKey: String(process.env.VAPID_PUBLIC_KEY ?? '').trim(), privateKey: String(process.env.VAPID_PRIVATE_KEY ?? '').trim() };
  if (fromEnv.publicKey && fromEnv.privateKey) return fromEnv;
  if (cachedKeys?.store === store) return cachedKeys.keys;
  let keys = await store.getPushKeys();
  if (!keys) keys = await store.savePushKeys(webpush.generateVAPIDKeys());
  cachedKeys = { store, keys };
  return keys;
}

/** For tests, so a fresh store makes its own keys. */
export const forgetPushKeysForTests = () => { cachedKeys = null; };

function subject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const mail = /<([^>]+@[^>]+)>|^([^\s<>]+@[^\s<>]+)$/.exec(String(process.env.EMAIL_FROM ?? '').trim());
  const address = mail?.[1] ?? mail?.[2];
  return address ? `mailto:${address}` : 'https://www.touradoor.com';
}

/**
 * Sends `payload` ({ title, body, url, tag }) to every phone of `adminId`. Returns { sent, failed, devices }.
 */
export async function pushToAdmin(store, adminId, payload) {
  const out = { sent: 0, failed: 0, devices: 0 };
  try {
    const subs = await store.listPushSubscriptions(adminId);
    out.devices = subs.length;
    if (!subs.length) return out;
    const keys = await pushKeys(store);
    const options = { vapidDetails: { subject: subject(), ...keys }, TTL: 3600, urgency: 'high' };
    const body = JSON.stringify(payload);
    for (const sub of subs) {
      try {
        await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, options);
        out.sent += 1;
      } catch (err) {
        out.failed += 1;
        // 404 and 410 are the push service saying this phone will not be reached again.
        if (err?.statusCode === 404 || err?.statusCode === 410) await store.removePushSubscription(sub.endpoint);
        else console.warn(`Push to a phone of ${adminId} failed: ${err?.statusCode ?? ''} ${err?.message ?? err}`);
      }
    }
  } catch (err) {
    console.warn(`Push failed: ${err.message}`);
  }
  return out;
}

export async function pushPublicKey(store) {
  return (await pushKeys(store)).publicKey;
}
