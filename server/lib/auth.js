import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { MIN_PASSWORD_LENGTH } from '../../shared/domain.js';
import { getStore } from '../db/index.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
export { MIN_PASSWORD_LENGTH };
// How long a reset link stays good. Long enough to find the email on a phone; short enough that a link
// in a mailbox somebody else later gets into is almost certainly dead.
export const RESET_TTL_MS = 1000 * 60 * 30;
// How long an invitation's set-password link stays good. An invite is read whenever the person gets round
// to it, days later as often as not, and the account it opens has no password yet to protect from the link.
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  // Dev fallback: stable for the lifetime of the process so restarts log admins out
  // rather than silently accepting tokens signed with an unknown key.
  if (!globalThis.__devSessionSecret) globalThis.__devSessionSecret = randomBytes(32).toString('hex');
  return globalThis.__devSessionSecret;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * The hash of a password nobody holds, for an account that was invited and has not chosen its own yet: 32
 * random bytes, hashed like any password and then forgotten, so the row can exist (and be listed, resent to,
 * removed) while nothing typed into the sign-in form can match it. Only a set-password link gets in.
 */
export function unusablePasswordHash() {
  return hashPassword(randomBytes(32).toString('hex'));
}

/** Why `password` cannot be an admin's new password, as a sentence for the person, or '' when it can. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return '';
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function sign(payloadB64) {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

/**
 * A session for `admin`. `issuedAt` is when it was issued (now, unless the caller has just changed the
 * password and wants this token to date from exactly that moment); requireAdmin refuses a token issued
 * before the admin's password last changed, which is how a reset ends every other session.
 */
export function issueToken(admin, { issuedAt = Date.now() } = {}) {
  const payload = { typ: 'admin', sub: admin.id, email: admin.email, iat: issuedAt, exp: issuedAt + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(body));
  // Compared as bytes, not characters: a signature of the same character count made of
  // multibyte characters is longer in bytes, and timingSafeEqual throws on unequal lengths.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Buyer and admin tokens are signed with one secret, so a valid signature says
 * nothing about WHO holds the token. The public contact gate hands a buyer token
 * to anyone who fills in a form, so it must never pass for an admin one. Tokens
 * now say what they are (`typ`); one issued before that was recorded is told
 * apart by its shape, since only an admin token has a `sub` and only a buyer
 * token has a `lead`.
 */
function isAdminToken(payload) {
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.lead) return false;
  return payload.typ === undefined || payload.typ === 'admin';
}

// ── sessions after a password change, and what the account may see ────────
// A session token is stateless: nothing on the server remembers it, so nothing on the server can
// revoke it. What the server does know is when the admin's password last changed, and a token issued
// before that moment belongs to whoever held the old password. So every admin request compares the
// token's issue time with password_changed_at.
//
// That comparison needs the admin row, and no admin request read the store before this. Reading it on
// every one would be one query more per request on a 512 MB instance that also resizes photos, so the
// answer is kept here for 30 seconds per admin instead. The trade: on the instance that changed the
// password the cache is cleared at once, so the old sessions end with the change (a row read that was
// already on its way is not trusted either; see adminFacts); a second instance (Render runs one,
// but a deploy briefly overlaps two) keeps accepting them for up to 30 seconds more, which is a short
// tail on a change that used to never end a session at all.
//
// The same row says what the account is allowed to do: its role, and for a member the communities they may
// see (every community in each branch they are in, and the ones shared with them on their own, as one set;
// see server/lib/access.js). Those ride on the same entry, read in the same breath, so a request learns who
// is asking and what they may touch for one store read every 30 seconds instead of two per request. An
// assignment change clears the entry the way a password change does (forgetAdminAccess), with the same
// answer to the same race, and is seen at once on this instance and within 30 seconds on an overlapping one.
// A change to a branch reaches whoever is in it, which is the very question the cache saves asking, so it
// clears every entry instead (forgetAllAdminAccess).
const SESSION_CHECK_TTL_MS = 30 * 1000;
const adminCache = new Map(); // admin id -> { changedAt: ms or null, role, communityIds: Set, until: ms }
// How many times this instance has changed each admin's row in a way the cache must hear about. A row read
// that was on its way while the count moved may have been answered from before the change.
const changeCounts = new Map(); // admin id -> count
// And how many times it has changed something that reaches everyone at once (a branch's communities or people,
// a community's branch): counted once for all rather than once per admin, and every admin's count moves with it,
// so a read on its way for anyone during such a change is read again like one that saw their own count move.
let everyoneChanges = 0;
const changeCount = (adminId) => (changeCounts.get(adminId) ?? 0) + everyoneChanges;

const timeOf = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** 'owner' or 'member', from an admin row of either store; anything else (a row from before roles) is a member. */
export const roleOf = (admin) => (admin?.role === 'owner' ? 'owner' : 'member');

/**
 * What a request needs to know about `adminId`: when the password last changed (ms, or null for never), the
 * role, and the communities a member may see, through their branches and on their own together (empty for the
 * owner, who has them all by role). Undefined for no such admin.
 */
async function adminFacts(adminId) {
  const known = adminCache.get(adminId);
  if (known && known.until > Date.now()) return known;
  const store = await getStore();
  // The row can be read while a reset on this instance is writing it: a read that started before the
  // write comes back with the old row after forgetAdminSessions has run, and kept as it came it would
  // hold the old sessions open for 30 seconds on the one instance that should refuse them first. So a
  // row whose read saw the count move is read again, and the answer is kept only when nothing moved.
  // The assignments are read under the same count, for the same reason.
  const read = async () => {
    const admin = await store.getAdminById(adminId);
    if (!admin) return undefined;
    const role = roleOf(admin);
    const communityIds = new Set(role === 'owner' ? [] : await store.listAccessibleCommunities(adminId));
    return { changedAt: timeOf(admin.password_changed_at), role, communityIds };
  };
  let seen = changeCount(adminId);
  let facts = await read();
  if (changeCount(adminId) !== seen) {
    seen = changeCount(adminId);
    facts = await read();
  }
  if (!facts) return undefined;
  if (changeCount(adminId) === seen) adminCache.set(adminId, { ...facts, until: Date.now() + SESSION_CHECK_TTL_MS });
  return facts;
}
// For server/lib/access.js, which answers about an account outside a request; routes read req.access instead.
export { adminFacts as loadAdminFacts };

/**
 * Forget what was cached for `adminId`, and count the change: called by whatever changes a password on
 * this instance (the reset and change routes, ADMIN_PASSWORD at boot) once the new row is written. The
 * entry also holds the role and the shared communities, so those are read afresh too.
 */
export function forgetAdminSessions(adminId) {
  adminCache.delete(adminId);
  changeCounts.set(adminId, changeCount(adminId) + 1);
}

/**
 * The same, called by whatever changes what one account may see (the Team page sharing or withdrawing a
 * community or a branch, a removal, the owner's role being set at boot), so the next request from that person
 * is answered from the new row rather than from a list up to 30 seconds old.
 */
export const forgetAdminAccess = forgetAdminSessions;

/**
 * Forget what was cached for everyone, and count the change for everyone: called by whatever changes who may
 * see what through a branch (its communities, a community moving between branches, a branch deleted), where
 * working out which admins are reached would be the same read the cache saves. Each admin's next request reads
 * their access afresh, and a read already on its way for anyone is read again, as above.
 */
export function forgetAllAdminAccess() {
  adminCache.clear();
  everyoneChanges += 1;
}

/**
 * Express middleware — requires a valid admin bearer token, issued since the admin's password last
 * changed, and attaches `req.admin` (the token) and `req.access` ({ role, communityIds }, see
 * server/lib/access.js). It reads the store (through the cache above), so it is async: a router wrapped by
 * catchAsyncErrors hands a store failure to the error handler, and index.js's parser gate passes one on
 * through `next(err)`.
 */
export async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && readToken(token);
  if (!isAdminToken(payload)) return res.status(401).json({ error: 'Not signed in' });
  let facts;
  try {
    facts = await adminFacts(payload.sub);
  } catch (err) {
    return next(err);
  }
  // A token from before issue times were recorded has no `iat`; it counts as issued at the beginning of
  // time, so it is still good for an admin whose password has never changed and dead after a change.
  if (!facts || (facts.changedAt !== null && (payload.iat ?? 0) < facts.changedAt)) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  req.admin = payload;
  req.access = { role: facts.role, communityIds: facts.communityIds };
  return next();
}

// ── password reset links ───────────────────────────────────────────────────
// The link carries a random token; the store keeps only its SHA-256, so a copy of the database (or a log
// line that printed a row) cannot be turned into a working link. 32 random bytes is far more than the
// 30-minute window could ever be guessed through.

/** A fresh reset token, and the hash the store keeps for it. The token itself goes only into the email. */
export function newResetToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashResetToken(token) };
}

export function hashResetToken(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex');
}

// ── buyer sessions ─────────────────────────────────────────────────────────
// Buyers have no password: the lead record IS the identity. The token below just
// stops one buyer from reading another's plan by guessing an email address.

const LEAD_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 6 months

export function issueLeadToken(lead) {
  const payload = { typ: 'lead', lead: lead.id, community: lead.communityId, exp: Date.now() + LEAD_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readLeadToken(token) {
  const payload = readToken(token);
  return payload && payload.lead && (payload.typ === undefined || payload.typ === 'lead') ? payload : null;
}

/** Express middleware — resolves req.lead from the buyer bearer token. */
export function requireLead(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && readLeadToken(token);
  if (!payload) return res.status(401).json({ error: 'Please sign in again to continue' });
  req.leadId = payload.lead;
  req.leadCommunityId = payload.community;
  next();
}
