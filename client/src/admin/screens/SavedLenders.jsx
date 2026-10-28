import { useEffect, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { LENDER_FIELDS } from '../lenderFields.js';
import ImageSlot from '../setup/ImageSlot.jsx';
import { logoToDataUrl } from '../setup/readImage.js';
import { ErrorNote, SaveNote, Spinner, TextField, useSaving } from '../ui.jsx';

const blank = () => ({ label: '', fields: Object.fromEntries(LENDER_FIELDS.map(({ key }) => [key, ''])) });

/** One lender's form: new (no `contact`) or an edit of a saved one. The logo is sent with the save. */
function LenderForm({ contact, onSaved, onCancel }) {
  const { token } = useAdmin();
  const saver = useSaving();
  const [form, setForm] = useState(() => (contact ? { label: contact.label, fields: { ...contact.fields } } : blank()));
  // undefined = leave the saved logo, null = remove it, a data URL = replace it
  const [logo, setLogo] = useState(undefined);
  const [isDefault, setIsDefault] = useState(Boolean(contact?.isDefault));
  const setField = (key) => (value) => setForm((f) => ({ ...f, fields: { ...f.fields, [key]: value } }));
  const showsLogo = logo === undefined ? Boolean(contact?.hasLogo) : Boolean(logo);

  const save = (event) => {
    event.preventDefault();
    return saver.run(async () => {
      const body = { ...form, isDefault };
      if (logo !== undefined) body.logo = logo;
      if (contact) onSaved(await adminApi.saveContact(token, contact.id, body));
      else onSaved((await adminApi.addContact(token, body)).contacts);
    });
  };

  return (
    <form onSubmit={save} className="card elev-sm" style={{ gap: 12 }}>
      <TextField label="Name in your list" value={form.label} maxLength={80} onChange={(v) => setForm((f) => ({ ...f, label: v }))} hint="Leave blank to use the loan officer and company." />
      <div className="ax-cols">
        {LENDER_FIELDS.map(({ key, label, ...rest }) => (
          <TextField key={key} label={label} value={form.fields[key]} maxLength={200} onChange={setField(key)} {...rest} />
        ))}
      </div>
      <ImageSlot
        label="Logo" image={logo || null} alt="Lender logo to save" read={logoToDataUrl} pending use="lenderlogo"
        onPick={async (dataUrl) => setLogo(dataUrl)} onRemove={showsLogo ? async () => setLogo(null) : undefined} removeWarning="Remove this logo?"
        hint={contact?.hasLogo && logo === undefined ? 'A logo is saved. Choose a new one to replace it.' : 'PNG, WebP, JPEG or GIF.'}
      />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Start every new listing with this lender
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" className="btn btn-primary" aria-disabled={saver.saving || undefined}>{saver.saving ? 'Saving…' : 'Save lender'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
      <SaveNote saver={saver} />
    </form>
  );
}

/** "Saved lenders" under Your details: add, edit, remove, and mark the one new listings start with. */
export default function SavedLenders() {
  const { token } = useAdmin();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | a contact id | null

  useEffect(() => {
    let live = true;
    adminApi.myContacts(token).then((l) => live && setList(l), (err) => live && setError(err.message));
    return () => { live = false; };
  }, [token]);

  const done = (next) => {
    setList(next);
    setEditing(null);
  };
  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.label}? Listings that already use it keep their details.`)) return;
    try {
      setList(await adminApi.removeContact(token, c.id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (list === null) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;
  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <span className="card-kicker">Saved lenders</span>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        Keep the lenders you work with here, then pick one on any listing instead of typing it again. Picking one copies its
        details onto that listing; changing it here does not change flyers you have already made.
      </p>
      {list.map((c) => (editing === c.id ? (
        <LenderForm key={c.id} contact={c} onSaved={done} onCancel={() => setEditing(null)} />
      ) : (
        <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <strong>{c.label}</strong>{c.isDefault ? <span className="tag tag-accent" style={{ marginLeft: 8 }}>Usual</span> : null}
            <div className="text-muted" style={{ fontSize: 14 }}>{[c.fields.lenderPhone, c.fields.lenderEmail].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(c.id)}>Edit</button>
            <button type="button" className="btn btn-secondary" onClick={() => remove(c)}>Remove</button>
          </div>
        </div>
      )))}
      {!list.length && editing !== 'new' ? <span className="text-muted" style={{ fontSize: 14 }}>No saved lenders yet.</span> : null}
      {editing === 'new' ? <LenderForm onSaved={done} onCancel={() => setEditing(null)} /> : (
        <div><button type="button" className="btn btn-secondary" onClick={() => setEditing('new')}>Add a lender</button></div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
