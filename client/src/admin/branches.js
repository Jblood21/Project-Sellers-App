/**
 * Communities sorted into their branches, for every page that lists them under headings: Today's cards, the side
 * menu, the Community filter on Activity and the boxes in the Edit access pop-up all group the same way, so a
 * community is under the same name everywhere.
 *
 * A row names its branch by `branchId`; the name comes from the `branches` list when there is one (Today sends
 * the owner [{ id, name }]) and otherwise from the row's own `branchName` (what GET /communities gives a member,
 * who cannot read the branches). A row with no branch, and every row when the server knows no branches at all,
 * goes under "No branch", which is always last; the branches before it are in name order. Only branches with a
 * community in the list appear, so an empty branch never makes an empty heading.
 */
export const NO_BRANCH = 'No branch';

export function groupByBranch(rows, branches = []) {
  const names = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));
  const groups = new Map();
  for (const row of rows ?? []) {
    const id = row.branchId ?? null;
    if (!groups.has(id)) {
      groups.set(id, { id, name: id ? (names.get(id) ?? row.branchName ?? 'A branch') : NO_BRANCH, communities: [] });
    }
    groups.get(id).communities.push(row);
  }
  return [...groups.values()].sort((a, b) => (a.id === null) - (b.id === null) || a.name.localeCompare(b.name));
}

/**
 * Whether the groups get their branch names as headings. The owner's pages show them as soon as there are two
 * groups to tell apart, "No branch" included, since the owner sorts the communities and sees the whole picture. A
 * member cannot see or change branches, so for them a heading is only worth its space when they are in two or
 * more branches; one branch plus a community of their own reads as one plain list, the way it did before branches.
 */
export const headedGroups = (groups, isOwner) => (isOwner
  ? groups.length > 1
  : groups.filter((group) => group.id !== null).length > 1);

/** The branches by name, the way every list of them is shown. */
export const sortBranches = (branches) => [...(branches ?? [])].sort((a, b) => a.name.localeCompare(b.name));

/** "3 communities", "1 person": the counts on a branch's card and in its Delete question. */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The one line under a person on the Team page that says what they can open: the branches they are in, then the
 * communities given to them on their own ("Branches: Summit Homes, Ivory · Also: Willow Creek"). The owner has
 * everything by role; a member with neither has nothing yet, and the line says so rather than showing nothing.
 */
export function accessSummary(member, branches, communities) {
  if (member.role === 'owner') return 'All communities';
  const branchNames = sortBranches((branches ?? []).filter((branch) => (member.branchIds ?? []).includes(branch.id))).map((b) => b.name);
  const own = new Set(member.communityIds ?? []);
  const communityNames = (communities ?? []).filter((community) => own.has(community.id)).map((c) => c.name);
  if (!branchNames.length && !communityNames.length) return 'No access yet';
  const parts = [];
  if (branchNames.length) parts.push(`Branches: ${branchNames.join(', ')}`);
  if (communityNames.length) parts.push(`${branchNames.length ? 'Also' : 'Communities'}: ${communityNames.join(', ')}`);
  return parts.join(' · ');
}
