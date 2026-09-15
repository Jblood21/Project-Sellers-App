import { useRef, useState } from 'react';

import { AVAILABILITY, MAX_PHOTOS_PER_HOME, money } from '@shared/domain.js';
import { Trash } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { homeMeta } from '../../lib/format.js';
import { fileToDataUrl } from '../../lib/photos.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote, Field, TextField } from '../ui.jsx';

const BLANK = { name: '', price: '', beds: '', baths: '', sqft: '', description: '', availability: 'Planning' };

export default function HomesTab({ community, reload }) {
  const { token } = useAdmin();
  const [dialog, setDialog] = useState(null); // { mode: 'new' | 'edit', home }
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setForm(BLANK);
    setDialog({ mode: 'new' });
  };

  const openEdit = (home) => {
    setForm({
      name: home.name,
      price: String(home.price),
      beds: String(home.beds),
      baths: String(home.baths),
      sqft: String(home.sqft),
      description: home.description,
      availability: AVAILABILITY.includes(home.availability) ? home.availability : 'Planning',
    });
    setDialog({ mode: 'edit', home });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (dialog.mode === 'new') await adminApi.createHome(token, community.id, form);
      else await adminApi.updateHome(token, dialog.home.id, form);
      setDialog(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeHome = async (home) => {
    if (!window.confirm(`Remove ${home.name} and its photos? This cannot be undone.`)) return;
    await adminApi.deleteHome(token, home.id);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {community.homes.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          No homes yet. Add the plans buyers will see when they scan the sign.
        </p>
      ) : null}

      {community.homes.map((home) => (
        <div key={home.id} className="card elev-sm" style={{ gap: 8 }}>
          <PhotoStrip home={home} communityId={community.id} reload={reload} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 18 }}>{home.name}</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{money(home.price)}</span>
          </div>
          <span className="text-muted" style={{ fontSize: 12 }}>{homeMeta(home)}</span>
          <p className="card-body" style={{ margin: 0 }}>{home.description}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="tag tag-accent-2">{home.availability}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(home)} style={{ minHeight: 34, padding: '0 14px', fontSize: 12.5 }}>
                Edit
              </button>
              <button
                type="button" className="btn btn-danger" aria-label={`Delete ${home.name}`}
                onClick={() => removeHome(home)} style={{ minHeight: 34, padding: '0 12px' }}
              >
                <Trash />
              </button>
            </span>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-primary btn-block" onClick={openNew} style={{ minHeight: 46 }}>
        ＋ Add home
      </button>

      {dialog ? (
        <Dialog
          title={dialog.mode === 'new' ? 'Add home' : 'Edit home'}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {dialog.mode === 'new' ? 'Add' : 'Save'}
              </button>
            </>
          }
        >
          <TextField label="Name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} placeholder="e.g. The Maple" />
          <TextField
            label="Base price" value={form.price} onChange={(price) => setForm((f) => ({ ...f, price }))}
            inputMode="numeric" placeholder="475000"
          />
          <div className="grid-3">
            <TextField label="Beds" value={form.beds} onChange={(beds) => setForm((f) => ({ ...f, beds }))} inputMode="numeric" />
            <TextField label="Baths" value={form.baths} onChange={(baths) => setForm((f) => ({ ...f, baths }))} inputMode="decimal" />
            <TextField label="Sq ft" value={form.sqft} onChange={(sqft) => setForm((f) => ({ ...f, sqft }))} inputMode="numeric" />
          </div>
          <Field label="Description">
            <textarea
              className="input" rows={3} value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </Field>
          <Field label="Availability">
            <select
              className="input" value={form.availability}
              onChange={(event) => setForm((f) => ({ ...f, availability: event.target.value }))}
            >
              {AVAILABILITY.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}

function PhotoStrip({ home, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      await adminApi.addHomePhoto(token, home.id, { dataUrl });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (photoId) => {
    await adminApi.deletePhoto(token, photoId);
    await reload();
  };

  return (
    <>
      <div className="scroll-x" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {home.photos.map((photo, index) => (
          <div key={photo.id} style={{ position: 'relative', width: 170, height: 120, flex: 'none' }}>
            <Photo photo={photo} radius={12} alt={`${home.name} photo ${index + 1}`} />
            <button
              type="button"
              aria-label={`Delete photo ${index + 1}`}
              onClick={() => removePhoto(photo.id)}
              style={{
                position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: '50%',
                border: 'none', background: 'rgba(20,22,19,.65)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash size={13} />
            </button>
          </div>
        ))}
        {home.photos.length < MAX_PHOTOS_PER_HOME ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Add photo"
            disabled={busy}
            style={{
              width: 64, height: 120, flex: 'none', borderRadius: 12,
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 24, cursor: 'pointer',
            }}
          >
            {busy ? '…' : '＋'}
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}
