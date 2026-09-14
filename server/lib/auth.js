import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

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

export function issueToken(admin) {
  const payload = { sub: admin.id, email: admin.email, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Express middleware — requires a valid admin bearer token. */
export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && readToken(token);
  if (!payload) return res.status(401).json({ error: 'Not signed in' });
  req.admin = payload;
  next();
}

// ── buyer sessions ─────────────────────────────────────────────────────────
// Buyers have no password: the lead record IS the identity. The token below just
// stops one buyer from reading another's plan by guessing an email address.

const LEAD_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 6 months

export function issueLeadToken(lead) {
  const payload = { lead: lead.id, community: lead.communityId, exp: Date.now() + LEAD_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readLeadToken(token) {
  const payload = readToken(token);
  return payload && payload.lead ? payload : null;
}

/** Express middleware — resolves req.lead from the buyer bearer token. */
export function requireLead(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && readLeadToken(token);
  if (!payload) return res.status(401).json({ error: 'Open the app from your community link to continue' });
  req.leadId = payload.lead;
  req.leadCommunityId = payload.community;
  next();
}
