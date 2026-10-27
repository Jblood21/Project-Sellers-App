import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, SaveNote, useSaving } from '../ui.jsx';

/**
 * The question before a listing is deleted. It says what goes with it, in particular the visitors' records (their
 * names, phone numbers, notes and the consent on file), which cannot be brought back. An agent may delete their own
 * listing; the server decides who may, so a refusal reads in its own words.
 */
export default function DeleteListingDialog({ listing, visitors = null, onClose, onDeleted }) {
  const { token } = useAdmin();
  const saver = useSaving();
  const records = 'names, phone numbers, emails, notes and the call consent on file';

  const remove = async () => {
    const done = await saver.run(async () => {
      await adminApi.deleteCommunity(token, listing.id);
    });
    if (done) onDeleted();
  };

  return (
    <Dialog
      title="Delete this listing?"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} data-autofocus="">Keep the listing</button>
          <button type="button" className="btn btn-danger" onClick={remove} aria-disabled={saver.saving || undefined}>
            {saver.saving ? 'Deleting…' : 'Delete listing'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
        <strong>{listing.name}</strong> will be removed, with its photos and open houses.{' '}
        {visitors === 0
          ? 'Nobody has signed in yet, so there are no visitor records to lose.'
          : `Every visitor\u2019s record goes too${visitors === null ? '' : ` (${visitors === 1 ? '1 visitor' : `${visitors} visitors`})`}: ${records}.`}{' '}
        The QR code on the sign stops working.
      </p>
      <p className="text-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        This cannot be undone. If the home is sold, you can set its status to Sold instead and keep everything.
      </p>
      <SaveNote saver={saver} />
    </Dialog>
  );
}
