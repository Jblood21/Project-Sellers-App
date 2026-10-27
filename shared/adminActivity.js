/**
 * What the admin activity log can say: one key per kind of change an admin makes, and the plain-English
 * line the owner reads for it. `{subject}` is the thing changed, named the way the admin saw it (a home's
 * name, a guide's title, a person's email), and the row carries the community beside the line, so a label
 * does not repeat it.
 *
 * Shared between the server, which writes the keys, and the admin app, which turns them back into words:
 * the key is what is stored, so a label can be reworded later without touching a single row, and the
 * client never has to know which route produced an entry.
 */
export const ACTIONS = Object.freeze({
  'community.created': 'Created community {subject}',
  'community.updated': 'Changed setup for {subject}',
  'community.deleted': 'Deleted community {subject}',
  'listing.created': 'Created listing {subject}',
  'listing.deleted': 'Deleted listing {subject}',
  'home.added': 'Added home {subject}',
  'home.updated': 'Changed home {subject}',
  'home.deleted': 'Removed home {subject}',
  'home.photos': 'Changed photos of {subject}',
  'home.video': 'Changed the video of {subject}',
  'highlight.added': 'Added {subject} to the area guide',
  'highlight.updated': 'Changed {subject} in the area guide',
  'highlight.deleted': 'Removed {subject} from the area guide',
  'resource.added': 'Added {subject} to Learn',
  'resource.updated': 'Changed {subject} in Learn',
  'resource.deleted': 'Removed {subject} from Learn',
  'agent.added': 'Added realtor {subject}',
  'agent.updated': 'Changed realtor {subject}',
  'agent.deleted': 'Removed realtor {subject}',
  'guide.added': 'Added guide {subject}',
  'guide.updated': 'Changed guide {subject}',
  'guide.deleted': 'Removed guide {subject}',
  'guide.restored': 'Restored the default guides in {subject}',
  'slot.added': 'Added {subject}',
  'slot.deleted': 'Removed the time slot {subject}',
  'lead.updated': 'Updated lead {subject}',
  'report.sent': 'Sent the lead report',
  'team.invited': 'Invited {subject}',
  'team.removed': 'Removed {subject}',
  'team.assigned': 'Changed access for {subject}',
  'branch.created': 'Created branch {subject}',
  'branch.updated': 'Changed branch {subject}',
  'branch.deleted': 'Deleted branch {subject}',
});

/** Whether `action` is a key the log knows. */
export const isAction = (action) => Object.hasOwn(ACTIONS, action);

/**
 * The line for an entry: the label with the subject written in. An unknown key (a row written by a newer
 * server than this client) still reads, as the key itself, rather than as a blank.
 */
export function describeAction(action, subject = '') {
  const label = ACTIONS[action] ?? action;
  return label.includes('{subject}') ? label.replace('{subject}', subject || '…') : label;
}
