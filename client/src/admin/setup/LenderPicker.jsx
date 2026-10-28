import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';

/**
 * Lenders kept on the agent's account: pick one to put it on this listing, or keep what is typed for the next listing.
 * Using one copies its details (and logo) onto the listing, so a later edit of the saved contact never changes a flyer
 * already printed. `fields` is what the lender form holds now; `onUsed(fields)` hands the picked lender's details back
 * so the form shows them; `reload` re-reads the listing.
 */
export default function LenderPicker({ community, fields, onUsed, reload }) {
  const { token } = useAdmin();
  const [contacts, setContacts] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    adminApi.myContacts(token).then((list) => live && setContacts(list), () => live && setContacts([]));
    return () => { live = false; };
  }, [token]);

  const run = async (task) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await task();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const use = () => run(async () => {
    const picked = contacts.find((c) => c.id === choice);
    if (!picked) return;
    await adminApi.useContact(token, community.id, picked.id);
    onUsed?.(picked.fields);
    await reload?.();
    setNote(`${picked.label} is on this listing.`);
  });
  const keep = () => run(async () => {
    const { contacts: next } = await adminApi.saveLenderAsContact(token, community.id, { fields });
    setContacts(next);
    setNote('Saved. You can pick it on any of your listings.');
  });
  const hasLender = Boolean((fields.lenderName ?? '').trim() || (fields.loName ?? '').trim());

  return (
    <div className="ax-callout" style={{ display: 'grid', gap: 10 }}>
      <strong style={{ fontSize: 14 }}>Your saved lenders</strong>
      {contacts === null ? <span className="text-muted" style={{ fontSize: 14 }}>Loading…</span> : contacts.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" aria-label="Saved lender" value={choice} onChange={(e) => setChoice(e.target.value)} style={{ flex: '1 1 220px', minWidth: 0 }}>
            <option value="">Choose a saved lender…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' (usual)' : ''}</option>)}
          </select>
          <button type="button" className="btn btn-primary" disabled={!choice || busy} onClick={use}>Use this lender</button>
        </div>
      ) : (
        <span className="text-muted" style={{ fontSize: 14 }}>Nothing saved yet. Fill in a lender below and keep it to use on every listing.</span>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" disabled={!hasLender || busy} onClick={keep}>
          Save this lender for my other listings
        </button>
        <Link to="/admin/profile" style={{ fontSize: 14 }}>Manage saved lenders</Link>
      </div>
      {note ? <span role="status" style={{ fontSize: 14 }}>{note}</span> : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
