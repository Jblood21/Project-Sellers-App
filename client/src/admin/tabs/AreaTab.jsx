import { useState } from 'react';

import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import { UTAH_SCHOOL_REPORT_URL, driveLabel, pointOf } from '@shared/neighborhood.js';
import { Pin, Trash } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { LowResNote, useLowRes } from '../lowRes.jsx';
import PhotoPicker from '../PhotoPicker.jsx';
import { Dialog, ErrorNote, Field, TextField } from '../ui.jsx';

const BLANK = { category: 'schools', name: '', description: '', detail: '', address: '', miles: '', minutes: '', link: '' };

/** A place's photo on its card, with a note under it when it is too small for the buyer app. */
function HighlightPhoto({ highlight }) {
  const lowRes = useLowRes('highlight', highlight.photo.url);
  return (
    <>
      <div style={{ height: 130 }}>
        <Photo
          photo={highlight.photo} radius={12} alt={highlight.name} sizes="(min-width: 1000px) 880px, 100vw"
          onMeasure={lowRes.measured}
        />
      </div>
      <LowResNote>{lowRes.note}</LowResNote>
    </>
  );
}

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
  const [locating, setLocating] = useState(false);
  const [findAddress, setFindAddress] = useState(null); // what to look up; null until edited, then the saved name and location
  const [mapNote, setMapNote] = useState({ text: '', bad: false });
  const onMap = pointOf({ lat: community.settings?.mapLat, lng: community.settings?.mapLng });
  const isListing = community.settings?.siteKind === 'listing';

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
      miles: highlight.miles ?? '',
      minutes: highlight.minutes ?? '',
      link: highlight.link ?? '',
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

  const searchText = findAddress ?? [community.name, community.location].filter(Boolean).join(', ');
  const locate = async () => {
    setLocating(true);
    setMapNote({ text: '', bad: false });
    try {
      await adminApi.locateCommunity(token, community.id, searchText);
      setMapNote({ text: 'Found. The map on the Neighborhood screen now shows it.', bad: false });
      await reload();
    } catch (err) {
      setMapNote({ text: err.message, bad: true });
    } finally {
      setLocating(false);
    }
  };

  const remove = async (highlight) => {
    if (!window.confirm(`Remove ${highlight.name}? This cannot be undone.`)) return;
    await adminApi.deleteHighlight(token, highlight.id);
    await reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card elev-sm" style={{ gap: 8 }}>
        <span className="card-kicker">Map</span>
        <p className="card-body" style={{ margin: 0 }}>
          {onMap
            ? `${isListing ? 'The home' : community.name} is on the map. Buyers see it with the places below, and a Get directions button.`
            : `${isListing ? 'The home' : community.name} is not on the map yet, so buyers see no map.`}
        </p>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Address to find</span>
          <input
            className="input" value={searchText} onChange={(event) => setFindAddress(event.target.value)} autoComplete="off"
            placeholder="e.g. 1234 Maple St, Lehi, UT 84043"
          />
        </label>
        <div>
          <button type="button" className="btn btn-secondary" onClick={locate} aria-disabled={locating || undefined} style={{ minHeight: 44 }}>
            {locating ? 'Looking…' : onMap ? 'Find it again' : 'Find it on the map'}
          </button>
        </div>
        {mapNote.text ? <span role={mapNote.bad ? 'alert' : 'status'} style={{ fontSize: 14 }}>{mapNote.text}</span> : null}
      </div>

      {highlights.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
          Nothing here yet. Add the schools, parks, shops and drive times buyers ask about —
          they show up in the buyer app under <strong>Local Spots</strong>.
        </p>
      ) : null}

      {grouped.map(([category, items]) => (
        <div key={category.k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="text-muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {category.label}
          </span>
          {items.map((highlight) => (
            <div key={highlight.id} className="card elev-sm" style={{ gap: 8 }}>
              {highlight.photo ? <HighlightPhoto highlight={highlight} /> : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="card-title" style={{ fontSize: 17 }}>{highlight.name}</span>
                {driveLabel(highlight.miles, highlight.minutes) || highlight.detail ? (
                  <span className="text-muted" style={{ flex: 'none', fontSize: 14 }}>{driveLabel(highlight.miles, highlight.minutes) || highlight.detail}</span>
                ) : null}
              </div>
              {highlight.description ? (
                <p className="card-body" style={{ margin: 0 }}>{highlight.description}</p>
              ) : null}
              {highlight.address ? (
                <span
                  className="text-muted"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14 }}
                >
                  <Pin />
                  {highlight.address}
                </span>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button
                  type="button" className="btn btn-ghost" onClick={() => openEdit(highlight)}
                  style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}
                >
                  Edit
                </button>
                <button
                  type="button" className="btn btn-danger" aria-label={`Delete ${highlight.name}`}
                  onClick={() => remove(highlight)} style={{ minHeight: 44, minWidth: 44, padding: '0 12px' }}
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
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <TextField
              label="Miles away" value={form.miles} inputMode="decimal" onChange={(miles) => setForm((f) => ({ ...f, miles }))}
              placeholder="e.g. 1.2"
            />
            <TextField
              label="Minutes to drive" value={form.minutes} inputMode="numeric" onChange={(minutes) => setForm((f) => ({ ...f, minutes }))}
              placeholder="e.g. 4"
            />
          </div>
          <TextField
            label="Other note (hours, etc.)" value={form.detail} onChange={(detail) => setForm((f) => ({ ...f, detail }))}
            placeholder="e.g. Open 5am to 10pm"
          />
          <TextField
            label="Link for more info (optional)" value={form.link} inputMode="url" onChange={(link) => setForm((f) => ({ ...f, link }))}
            placeholder={form.category === 'schools' ? UTAH_SCHOOL_REPORT_URL : 'e.g. https://example.com'}
            hint={form.category === 'schools' ? 'Left blank, buyers get a link to the Utah school report card.' : undefined}
          />
          <TextField
            label="Address (optional)" value={form.address}
            onChange={(address) => setForm((f) => ({ ...f, address }))}
            placeholder="e.g. 1234 N Center St, Lehi, UT 84043"
            hint="Buyers tap this for directions, and the place is put on the map from it. A place name works too."
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
            use="highlight"
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
