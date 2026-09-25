import { useRef, useState } from 'react';

import { AVAILABILITY, MAX_PHOTOS_PER_HOME, MAX_VIDEO_BYTES, megabytes, money } from '@shared/domain.js';
import { Trash } from '../../components/Icons.jsx';
import Photo from '../../components/Photo.jsx';
import { adminApi } from '../../lib/api.js';
import { homeMeta } from '../../lib/format.js';
import { fileToDataUrl, videoToDataUrl } from '../../lib/photos.js';
import { useAdmin } from '../AdminContext.jsx';
import { Dialog, ErrorNote, Field, TextField } from '../ui.jsx';

const BLANK = {
  name: '', price: '', beds: '', baths: '', sqft: '', description: '',
  availability: 'Planning', lotNumber: '', readyOn: '',
};

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
      lotNumber: home.lotNumber ?? '',
      readyOn: home.readyOn ?? '',
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
      <SiteMapCard community={community} reload={reload} />

      {community.homes.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          No homes yet. Add the plans buyers will see when they scan the sign.
        </p>
      ) : null}

      {community.homes.map((home) => (
        <div key={home.id} className="card elev-sm" style={{ gap: 8 }}>
          <PhotoStrip home={home} communityId={community.id} reload={reload} />
          <FloorPlanStrip home={home} reload={reload} />
          <WalkthroughRow home={home} reload={reload} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 18 }}>{home.name}</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{money(home.price)}</span>
          </div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {homeMeta(home)}{home.lotNumber ? ` · ${home.lotNumber}` : ''}
          </span>
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
          <TextField
            label="Lot number" value={form.lotNumber}
            onChange={(lotNumber) => setForm((f) => ({ ...f, lotNumber }))}
            placeholder="e.g. Lot 14"
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
          {form.availability === 'Move-in ready' ? null : (
            <Field
              label="Ready for keys"
              hint="Buyers plan their move — and their lease notice — around this. Left blank, their timeline says nobody has set a date rather than guessing one."
            >
              <input
                className="input" type="date" value={form.readyOn}
                onChange={(event) => setForm((f) => ({ ...f, readyOn: event.target.value }))}
              />
            </Field>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * Plans are kept apart from the photo carousel: a buyer swiping pictures of a
 * kitchen does not want a line drawing in the middle of them.
 */
function FloorPlanStrip({ home, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const plans = home.floorPlans ?? [];

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.addFloorPlan(token, home.id, { dataUrl: await fileToDataUrl(file) });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          Floor plans
        </span>
        {plans.map((plan, index) => (
          <div key={plan.id} style={{ position: 'relative', width: 54, height: 54, flex: 'none' }}>
            <Photo photo={plan} radius={8} alt={`${home.name} floor plan ${index + 1}`} fit="contain" />
            <button
              type="button"
              aria-label={`Delete floor plan ${index + 1}`}
              onClick={async () => { await adminApi.deletePhoto(token, plan.id); await reload(); }}
              style={{
                position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                border: 'none', background: 'rgba(20,22,19,.65)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <Trash size={10} />
            </button>
          </div>
        ))}
        {plans.length < 4 ? (
          <button
            type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            aria-label={`Add a floor plan to ${home.name}`}
            style={{
              width: 54, height: 54, flex: 'none', borderRadius: 8,
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 18, cursor: 'pointer',
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

/**
 * The home's walkthrough: one video, uploaded from the device.
 *
 * One per home rather than a gallery, because every upload is database that
 * never shrinks and this one is multiplied by the number of homes — a dozen
 * homes at the 25MB cap is already 300MB. A builder with more to show has the
 * Videos & articles tab, where a link costs nothing.
 *
 * There is no link field here on purpose. A walkthrough is the thing a buyer
 * taps while they are looking at this home, and a YouTube frame takes them out
 * of the app to somewhere with a sidebar full of other builders' homes.
 */
function WalkthroughRow({ home, reload }) {
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
      const dataUrl = await videoToDataUrl(file, MAX_VIDEO_BYTES, 'try a shorter clip.');
      await adminApi.setHomeVideo(token, home.id, { dataUrl });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the walkthrough for ${home.name}? This cannot be undone.`)) return;
    await adminApi.deleteHomeVideo(token, home.id);
    await reload();
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
          Walkthrough
        </span>
        {home.videoUrl ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={home.videoUrl}
              controls
              preload="metadata"
              style={{ width: 150, borderRadius: 8, background: '#000', flex: 'none' }}
            />
            <span className="text-muted" style={{ fontSize: 11.5 }}>
              {megabytes(home.videoSizeBytes)}
            </span>
            <button
              type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()}
              disabled={busy} style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
            >
              {busy ? 'Reading…' : 'Replace'}
            </button>
            <button
              type="button" className="btn btn-ghost" onClick={remove}
              style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            style={{
              minHeight: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: '1.5px dashed var(--color-neutral-400)', background: 'transparent',
              color: 'var(--color-neutral-700)', fontSize: 12,
            }}
          >
            {busy ? 'Reading…' : `＋ Add a video · up to ${megabytes(MAX_VIDEO_BYTES)}`}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="video/*" hidden onChange={upload} />
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}

/**
 * The community plat, and the lot numbers that place homes on it.
 *
 * It lives here rather than with the hero photo and app icon because it is not
 * branding — it is the drawing a buyer holds next to the home list, and the lot
 * number on each home below is what ties the two together. A builder setting up
 * lots and a builder uploading the plat are the same person doing one job.
 */
function SiteMapCard({ community, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const map = community.siteMap ?? null;
  const shown = Boolean(community.features?.siteMap);
  const placed = community.homes.filter((home) => home.lotNumber).length;

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.addCommunityPhoto(token, community.id, 'sitemap', {
        dataUrl: await fileToDataUrl(file),
      });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove the site map? Buyers will stop seeing it.')) return;
    setError('');
    try {
      await adminApi.deletePhoto(token, map.id);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const show = async () => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { siteMap: true } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <span className="card-kicker">Site map</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={map ? 'Replace the site map' : 'Upload the site map'}
        style={{
          position: 'relative', width: '100%', height: 150, borderRadius: 12, overflow: 'hidden',
          cursor: 'pointer', padding: 0,
          border: `1.5px dashed ${map ? 'transparent' : 'var(--color-neutral-400)'}`,
          background: map ? 'var(--color-neutral-200)' : 'transparent',
        }}
      >
        {map ? (
          <>
            <Photo photo={map} alt="The community site map" />
            <span
              style={{
                position: 'absolute', right: 8, bottom: 8, padding: '5px 12px', borderRadius: 999,
                background: 'rgba(20,22,19,.72)', color: '#fff', fontSize: 12, fontWeight: 600,
              }}
            >
              {busy ? 'Uploading…' : 'Replace'}
            </span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {busy ? 'Uploading…' : 'Tap to upload the plat buyers tap'}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />

      {/*
        A map with no lot numbers on the homes is a picture, not a map: the buyer
        can see the plat but cannot tell which shape is the home they are standing
        in front of. Say so with the count rather than leaving them to notice.
      */}
      <span className="text-muted" style={{ fontSize: 12 }}>
        {map
          ? placed === 0
            ? 'No home has a lot number yet, so buyers cannot tell which shape is which. Add one when you edit a home.'
            : `${placed} of ${community.homes.length} homes carry a lot number, so buyers can place them on it.`
          : 'The plat drawing. Buyers open it full screen and match it to the lot numbers on your homes.'}
      </span>

      {/*
        Uploading is not publishing: the buyer app hides the map unless the Site
        map feature is on, which is a switch on another tab. Silently doing
        nothing is the worst version of this, so offer the switch here.
      */}
      {map && !shown ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, background: 'var(--color-neutral-200)',
          }}
        >
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
            Buyers are not seeing this — <strong>Site map</strong> is switched off under Tools.
          </span>
          <button
            type="button" className="btn btn-secondary" onClick={show}
            style={{ flex: 'none', minHeight: 34, padding: '0 14px', fontSize: 12.5 }}
          >
            Show it
          </button>
        </div>
      ) : null}

      {map ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button" className="btn btn-ghost" onClick={remove}
            style={{ minHeight: 34, padding: '0 14px', fontSize: 12.5 }}
          >
            Remove
          </button>
        </div>
      ) : null}

      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

function PhotoStrip({ home, reload }) {
  const { token } = useAdmin();
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The downscaled photo, shown in place the moment it is ready, so the strip
  // fills in while the upload is still in flight rather than after it.
  const [pending, setPending] = useState(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      setPending(dataUrl);
      await adminApi.addHomePhoto(token, home.id, { dataUrl });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
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
        {pending ? (
          <div style={{ position: 'relative', width: 170, height: 120, flex: 'none' }}>
            <img
              src={pending}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, display: 'block', opacity: 0.55 }}
            />
            <span
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
              }}
            >
              Uploading…
            </span>
          </div>
        ) : null}
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
