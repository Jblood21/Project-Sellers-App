/**
 * The way out of a listing, at the foot of its Setup, for anyone who has the listing. It only opens the question
 * (DeleteListingDialog), which says what goes with it.
 */
export default function DeleteListingCard({ listing, visitors = null, onDelete }) {
  return (
    <div className="card elev-sm ax-danger" style={{ gap: 10 }}>
      <span className="card-kicker">Delete listing</span>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        Remove {listing.name} for good, with its photos and open houses{visitors === 0 ? '' : ' and every visitor\u2019s record'}.
        If the home is sold, set its status to Sold instead and keep everything.
      </p>
      <div>
        <button type="button" className="btn btn-danger" onClick={onDelete} style={{ minHeight: 46 }}>Delete listing…</button>
      </div>
    </div>
  );
}
