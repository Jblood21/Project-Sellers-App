import { forgetAdminAccess, loadAdminFacts, roleOf } from './auth.js';

/**
 * Who may see what in the admin.
 *
 * There are two roles. The owner (the ADMIN_EMAIL account; ensureAdmin in server/index.js keeps it so) sees
 * every community and everything about the team. A member sees the communities the owner has shared with
 * them (admin_communities) and can do everything inside those: homes, photos, setup, guides, realtors, leads
 * and reports. What a member cannot do is make or delete a community, open the Team page or read the
 * activity log; those answer OWNER_ONLY. A community that is not theirs, or anything inside one, answers
 * NO_ACCESS, whether or not it exists: a member is told the same thing for a community they were never given
 * and for one that was just taken away, and learns nothing about the rest of the list from either.
 *
 * An `access` is { role, communityIds: Set }. requireAdmin (server/lib/auth.js) attaches one to every admin
 * request as req.access, from the same 30-second cache that holds the password check, so the routes decide
 * without another store read. loadAccess is for a caller outside a request.
 */
export const ROLES = Object.freeze(['owner', 'member']);
export const NO_ACCESS = "You don't have access to that community.";
export const OWNER_ONLY = 'Only the owner can do that.';

export { forgetAdminAccess, roleOf };

/** The access of `adminId` as it stands now (through the cache), or null for no such admin. */
export async function loadAccess(adminId) {
  const facts = await loadAdminFacts(adminId);
  return facts ? { role: facts.role, communityIds: facts.communityIds } : null;
}

export const isOwner = (access) => access?.role === 'owner';

/** Whether `access` may see `communityId`: the owner may see any; a member, those shared with them. */
export function canAccess(access, communityId) {
  if (!access) return false;
  if (access.role === 'owner') return true;
  return typeof communityId === 'string' && access.communityIds.has(communityId);
}

/** Express middleware for the routes only the owner may use. Runs after requireAdmin, so req.access is set. */
export function requireOwner(req, res, next) {
  if (!isOwner(req.access)) return res.status(403).json({ error: OWNER_ONLY });
  return next();
}
