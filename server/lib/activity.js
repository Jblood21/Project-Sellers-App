import { isAction } from '../../shared/adminActivity.js';

/**
 * One line in the owner's activity log: who (the signed-in admin, from the request), did what (`action`, a key
 * from shared/adminActivity.js), to what (`subject`, named as the admin saw it), where (`communityId`, or null
 * for the team) and anything more worth a few words (`detail`).
 *
 * It never throws. The change it describes has already been made when this is called, and a log that could
 * turn a saved home into a 500 would be worse than a missing line; a failure is written to the server log
 * instead, where it is a fault to fix rather than something for the admin to retry.
 */
export async function recordActivity(store, req, { communityId = null, action, subject = '', detail = '' }) {
  try {
    // A key the labels do not know still goes in (the row is the record), but somebody should hear about it.
    if (!isAction(action)) console.error(`The activity log has no label for '${action}'; add one to shared/adminActivity.js.`);
    await store.addAdminActivity({
      adminId: req.admin.sub, adminEmail: req.admin.email ?? '', communityId,
      action, subject: String(subject ?? '').slice(0, 300), detail: String(detail ?? '').slice(0, 1000),
    });
  } catch (err) {
    console.error(`The activity log could not record ${action} for ${req.admin?.email ?? 'an admin'}:`, err);
  }
}
