import { useRef, useState } from 'react';

import { fileToDataUrl } from '../../lib/photos.js';
import { ErrorNote } from '../ui.jsx';

/**
 * One uploadable picture: what is saved now, plus Replace and Remove.
 *
 * It does not know where the picture goes. The parent supplies `onPick(dataUrl)`
 * and `onRemove()`, which lets the same slot upload at once for something that
 * already exists (a saved realtor, the development logo) or hold the file for
 * later for something that does not exist yet (a realtor still being added).
 * Either way the slot shows an honest state while it waits and any failure
 * stays here, next to the picture it is about, instead of in a distant banner.
 *
 *   image      the url to show, or null
 *   fallback   { url, note } shown, without a Remove, while `image` is empty:
 *              the supplied Summit logo is what buyers see until one is uploaded
 *   plate      'light' or 'dark', the ground the picture is shown on
 *   shape      'wide' (logos, contained) or 'square' (portraits, cropped to fill)
 *   read       turns the picked File into a data URL; defaults to the photo downscale
 *   pending    true when the picture is held back until the parent saves
 */
export default function ImageSlot({
  label, hint, image, fallback = null, plate = 'light', shape = 'wide', alt,
  onPick, onRemove, read = fileToDataUrl, pending = false, disabled = false, removeWarning,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'upload' | 'remove' | null
  const [error, setError] = useState('');

  const shown = image || fallback?.url || null;
  const working = busy !== null;

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      await onPick(await read(file));
    } catch (err) {
      setError(err.message || 'That upload did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(removeWarning || `Remove the ${label.toLowerCase()}?`)) return;
    setBusy('remove');
    setError('');
    try {
      await onRemove();
    } catch (err) {
      setError(err.message || 'Could not remove that. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const plateClass = `ax-plate${plate === 'dark' ? ' ax-plate--dark' : ''}${shape === 'square' ? ' ax-plate--square ax-plate--cover' : ''}`;
  const status = busy === 'upload'
    ? 'Uploading…'
    : busy === 'remove'
      ? 'Removing…'
      : image
        ? pending ? 'Ready. Uploads when you add the realtor.' : 'Saved.'
        : fallback?.note || 'Nothing uploaded yet.';

  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="ax-slot">
        <div className={plateClass}>
          {shown ? (
            <img src={shown} alt={alt ?? (image ? `${label} as saved` : `${label} (default)`)} />
          ) : (
            <span className="ax-plate-empty">No image</span>
          )}
        </div>
        <div className="ax-slot-body">
          <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
          <span className="ax-status" role="status" aria-live="polite">{status}</span>
          <div className="ax-slot-actions">
            <button
              type="button" className="btn btn-secondary" disabled={working || disabled}
              onClick={() => inputRef.current?.click()}
              aria-label={`${image ? 'Replace' : 'Upload'} ${label}`}
            >
              {image ? 'Replace' : 'Upload'}
            </button>
            {image ? (
              <button
                type="button" className="btn btn-danger" disabled={working || disabled}
                onClick={remove} aria-label={`Remove ${label}`}
              >
                Remove
              </button>
            ) : null}
          </div>
          <input
            ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            aria-label={label} onChange={pick}
          />
        </div>
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
