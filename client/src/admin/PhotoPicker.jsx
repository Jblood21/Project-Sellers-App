import { useRef, useState } from 'react';

import { photoImgProps } from '../components/Photo.jsx';
import { preparePhoto } from '../lib/photos.js';
import { LowResNote, measureImg, useLowRes } from './lowRes.jsx';
import { ErrorNote, Field } from './ui.jsx';
import { fromInput, useFileDrop } from './useFileDrop.js';

/**
 * Picks and previews one photo inside a dialog.
 *
 * Deliberately does NOT upload on pick: it hands the downscaled data URL up to
 * the parent, which sends it when the dialog is saved. That keeps Cancel honest
 * — back out and the community's existing photo is untouched.
 *
 * `use` is what the photo is for ('hero' or 'highlight'): it sets how large a picture is
 * kept, and when the picture shown is too small for that, a short note says so.
 */
export default function PhotoPicker({
  label,
  hint,
  currentUrl,
  pendingDataUrl,
  onPick,
  height = 150,
  use = 'hero',
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = pendingDataUrl || currentUrl || null;
  const lowRes = useLowRes(use, preview);

  const pick = async (file) => {
    setBusy(true);
    setError('');
    try {
      onPick((await preparePhoto(file, { kind: use === 'highlight' ? 'highlight' : 'photo' })).dataUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const { dropProps } = useFileDrop(pick, { accept: 'image', disabled: busy, onReject: setError });

  return (
    <Field label={label}>
      <button
        type="button"
        {...dropProps}
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
              // The dialog's width: about 380 px from a small tablet up.
              {...photoImgProps(preview, '(min-width: 480px) 380px, 100vw')}
              alt=""
              onLoad={measureImg(lowRes.measured)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <span
              style={{
                position: 'absolute', right: 8, bottom: 8, padding: '5px 12px', borderRadius: 999,
                background: 'rgba(14,34,40,.72)', color: '#fff', fontSize: 14, fontWeight: 600,
              }}
            >
              {busy ? 'Reading…' : 'Replace'}
            </span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 14 }}>
            {busy ? 'Reading…' : hint}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={fromInput(pick)} />
      {pendingDataUrl ? (
        <span className="text-muted" style={{ fontSize: 14 }}>
          Uploads when you save.
        </span>
      ) : null}
      <LowResNote>{preview ? lowRes.note : ''}</LowResNote>
      <ErrorNote>{error}</ErrorNote>
    </Field>
  );
}
