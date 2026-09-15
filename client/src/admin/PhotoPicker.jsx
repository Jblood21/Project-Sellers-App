import { useRef, useState } from 'react';

import { fileToDataUrl } from '../lib/photos.js';
import { ErrorNote, Field } from './ui.jsx';

/**
 * Picks and previews one photo inside a dialog.
 *
 * Deliberately does NOT upload on pick: it hands the downscaled data URL up to
 * the parent, which sends it when the dialog is saved. That keeps Cancel honest
 * — back out and the community's existing photo is untouched.
 */
export default function PhotoPicker({
  label,
  hint,
  currentUrl,
  pendingDataUrl,
  onPick,
  height = 150,
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = pendingDataUrl || currentUrl || null;

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onPick(await fileToDataUrl(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={preview ? `Replace ${label}` : `Upload ${label}`}
        style={{
          position: 'relative',
          width: '100%',
          height,
          borderRadius: 12,
          overflow: 'hidden',
          cursor: 'pointer',
          padding: 0,
          border: `1.5px dashed ${preview ? 'transparent' : 'var(--color-neutral-400)'}`,
          background: preview ? 'var(--color-neutral-200)' : 'transparent',
        }}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <span
              style={{
                position: 'absolute', right: 8, bottom: 8, padding: '5px 12px', borderRadius: 999,
                background: 'rgba(20,22,19,.72)', color: '#fff', fontSize: 12, fontWeight: 600,
              }}
            >
              {busy ? 'Reading…' : 'Replace'}
            </span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {busy ? 'Reading…' : hint}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      {pendingDataUrl ? (
        <span className="text-muted" style={{ fontSize: 11.5 }}>
          Uploads when you save.
        </span>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </Field>
  );
}
