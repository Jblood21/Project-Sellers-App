import { useState } from 'react';

import { HIGHLIGHT_CATEGORIES, highlightCategoryLabel } from '@shared/domain.js';
import { Pin, Trash } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import { Dialog, ErrorNote, Field, TextField } from '../ui.jsx';

const BLANK = { category: 'schools', name: '', description: '', detail: '', address: '' };

/**
 * "What's around here" — the answer buyers ask a sales agent on every visit.
 * Schools, parks, shops, clinics, commute times: written once, shown to
 * everyone who scans the sign.
 */
export default function AreaTab({ community, reload }) {
  const { token } = useAdmin();
  const [dialog, setDialog] = useState(null); // { mode: 'new' | 'edit', highlight }
  const [form, setForm] = useState(BLANK);
  const [photo, setPhoto] = useState(null); // downscaled data URL, uploaded on save
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const highlights = community.highlights ?? [];
  const grouped = HIGHLIGHT_CATEGORIES
    .map((c) => [c, highlights.filter((h) => h.category === c.k)])
    .filter(([, items]) => items.length);

  const openNew = () => {
    setForm(BLANK);
    setPhoto(null);
    setError('');
    setDialog({ mode: 'new' });
  };

  const openEdit = (highlight) => {
    setForm({
      category: highlight.category,
      name: highlight.name,
      description: highlight.description,
      detail: highlight.detail,
      address: highlight.address ?? '',
    });
    setPhoto(null);
    setError('');
    setDialog({ mode: 'edit', highlight });
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Give this place a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = dialog.mode === 'new'
        ? await adminApi.createHighlight(token, community.id, form)
        : await adminApi.updateHighlight(token, dialog.highlight.id, form);
      if (photo) await adminApi.addHighlightPhoto(token, saved.id, { dataUrl: photo });
      setDialog(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (highlight) => {
    if (!window.confirm(`Remove ${highlight.name}? This cannot be undone.`)) return;
    await adminApi.deleteHighlight(token, highlight.id);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {highlights.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          Nothing here yet. Add the schools, parks, shops and drive times buyers ask about —
          they show up in the buyer app under <strong>Local Spots</strong>.
        </p>
      ) : null}

      {grouped.map(([category, items]) => (
        <div key={category.k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {category.label}
          </span>
          {items.map((highlight) => (
            <div key={highlight.id} className="card elev-sm" style={{ gap: 8 }}>
              {highlight.photo ? (
                <div style={{ height: 130 }}>
                  <Photo photo={highlight.photo} radius={12} alt={highlight.name} />
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="card-title" style={{ fontSize: 17 }}>{highlight.name}</span>
                {highlight.detail ? (
                  <span className="text-muted" style={{ flex: 'none', fontSize: 12 }}>{highlight.detail}</span>
                ) : null}
              </div>
              {highlight.description ? (
                <p className="card-body" style={{ margin: 0 }}>{highlight.description}</p>
              ) : null}
              {highlight.address ? (
                <span
                  className="text-muted"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  <Pin />
                  {highlight.address}
                </span>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button
                  type="button" className="btn btn-ghost" onClick={() => openEdit(highlight)}
                  style={{ minHeight: 34, padding: '0 14px', fontSize: 12.5 }}
                >
                  Edit
                </button>
                <button
                  type="button" className="btn btn-danger" aria-label={`Delete ${highlight.name}`}
                  onClick={() => remove(highlight)} style={{ minHeight: 34, padding: '0 12px' }}
                >
                  <Trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <button type="button" className="btn btn-primary btn-block" onClick={openNew} style={{ minHeight: 46 }}>
        ＋ Add a place
      </button>

      {dialog ? (
        <Dialog
          title={dialog.mode === 'new' ? 'Add a place' : 'Edit place'}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : dialog.mode === 'new' ? 'Add' : 'Save'}
              </button>
            </>
          }
        >
          <Field label="Category">
            <select
              className="input" value={form.category}
              onChange={(event) => setForm((f) => ({ ...f, category: event.target.value }))}
            >
              {HIGHLIGHT_CATEGORIES.map((category) => (
                <option key={category.k} value={category.k}>{category.label}</option>
              ))}
            </select>
          </Field>
          <TextField
            label="Name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))}
            placeholder="e.g. Oakridge Elementary"
          />
          <TextField
            label="Distance or hours" value={form.detail} onChange={(detail) => setForm((f) => ({ ...f, detail }))}
            placeholder="e.g. 4 min drive"
          />
          <TextField
            label="Address (optional)" value={form.address}
            onChange={(address) => setForm((f) => ({ ...f, address }))}
            placeholder="e.g. 1234 N Center St, Lehi, UT 84043"
            hint="Buyers tap this to open directions in Google Maps. A place name works too."
          />
          <Field label="What buyers should know">
            <textarea
              className="input" rows={3} value={form.description}
              placeholder="A sentence or two. Ratings, what's nearby, why it matters."
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </Field>
          <PhotoPicker
            label="Photo (optional)"
            hint="Tap to add a photo"
            currentUrl={dialog.highlight?.photo?.url ?? null}
            pendingDataUrl={photo}
            onPick={setPhoto}
            height={130}
          />
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}
