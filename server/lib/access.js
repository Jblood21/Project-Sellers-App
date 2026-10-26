import { forgetAdminAccess, forgetAllAdminAccess, loadAdminFacts, roleOf } from './auth.js';

/**
 * Who may see what in the admin.
 *
 * There are two roles. The owner (the ADMIN_EMAIL account; ensureAdmin in server/index.js keeps it so) sees
 * every community and everything about the team, and alone shapes the branches. A member sees the communities
 * the owner has given them, two ways at once: every community in each branch they are in (a branch is a company
 * or a group of communities, see branches in server/db/schema.sql), now and whenever one is added to it, and the
 * communities ticked for them on their own (admin_communities). The two are one set here, and either way is
 * enough. Inside those they can do everything: homes, photos, setup, guides, realtors, leads and reports. What a
 * member cannot do is make or delete a community, move one between branches, open the Team or Branches pages or
 * read the activity log; those answer OWNER_ONLY. A community that is not theirs, or anything inside one, answers
 * NO_ACCESS, whether or not it exists: a member is told the same thing for a community they were never given
 * and for one that was just taken away, and learns nothing about the rest of the list from either.
 *
 * An `access` is { role, communityIds: Set }, the set being that union. requireAdmin (server/lib/auth.js)
 * attaches one to every admin request as req.access, from the same 30-second cache that holds the password
 * check, so the routes decide without another store read. loadAccess is for a caller outside a request. A change
 * to one person's access clears their entry (forgetAdminAccess); a change to a branch, which reaches whoever is
 * in it, clears everyone's (forgetAllAdminAccess).
 */
export const ROLES = Object.freeze(['owner', 'member']);
export const NO_ACCESS = "You don't have access to that community.";
export const OWNER_ONLY = 'Only the owner can do that.';

export { forgetAdminAccess, forgetAllAdminAccess, roleOf };

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
