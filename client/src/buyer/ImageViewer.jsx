import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { isOwnPhoto } from '@shared/photoSizes.js';

import { photoImgProps } from '../components/Photo.jsx';
import { naturalSize } from '../lib/pictureSize.js';
import useDialog from './useDialog.js';

// How wide a picture is drawn here when its shape is not known yet: the window less the
// 12 px either side, which is never less than it is drawn. A drawing is asked for at
// twice its drawn width, because buyers pinch a site map or a floor plan to read the lot
// numbers and room sizes, and a pinch enlarges the picture the browser already has.
const PHOTO_SIZES = 'calc(100vw - 24px)';
const DRAWING_SIZES = 'calc(200vw - 48px)';
const GUTTER = 12;

/**
 * Full-screen viewer for a drawing, kept inside the app.
 *
 * These used to open with target="_blank", which on a phone with the app added
 * to the home screen hands the buyer a chrome-less window: no back button, no
 * tab bar, nothing to close. They were stuck looking at an image. So there are
 * now three ways out — the button, the backdrop, and Escape — and none of them
 * leaves the app.
 */
export default function ImageViewer({ images = [], index = 0, onIndex, onClose, label = 'Image', photos = false }) {
  const open = index !== null && index >= 0 && index < images.length;
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  // The room the picture has, and the pixel size of the picture that arrived, so it can be
  // drawn as large as fits but never wider than it is (see the img below).
  const [room, setRoom] = useState(null);
  const [arrived, setArrived] = useState(null);
  const url = open ? images[index].url : null;
  // The copy of this picture the page behind already shows, looked for once per picture.
  const shown = useMemo(() => (url ? copyOnPage(url) : null), [url]);
  // Focus moves in, Tab stays inside, Escape closes, and focus goes back to what opened it.
  useDialog(open, onClose, dialogRef);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowRight' && index < images.length - 1) onIndex?.(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex?.(index - 1);
    };
    document.addEventListener('keydown', onKey);
    // Without this the page behind scrolls under the viewer on iOS.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, index, images.length, onIndex, onClose]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => setRoom({ width: Math.max(0, stage.clientWidth - 2 * GUTTER), height: stage.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    return () => {
      observer?.disconnect();
      // Measured afresh the next time it opens: the window may have changed in between, and
      // the picture's copy is chosen from this.
      setRoom(null);
    };
  }, [open]);

  if (!open) return null;
  const many = images.length > 1;
  const loaded = arrived?.url === url;
  // Once the picture is in, it is drawn at its measured size. Until then the copy the page
  // already has is drawn in its place, filling the room in the same shape, so the viewer
  // opens on the picture at once and sharpens as the larger copy comes in, rather than
  // showing a black screen while it downloads. With no copy on the page, a spinner shows.
  const size = loaded ? drawnSize(arrived, room) : drawnSize(shown && { width: shown.aspect, height: 1 }, room, Infinity);
  const waiting = !loaded && !shown;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      // "1 of 1" is noise read aloud; a position only means something among several.
      aria-label={many ? `${label} ${index + 1} of ${images.length}` : label}
      onClick={onClose}
      style={{
        // Solid, not translucent: a plan is there to be read, and the page bleeding
        // through behind it both competes with the drawing and muddies whether the
        // buyer has left the app.
        position: 'fixed', inset: 0, zIndex: 90, background: '#0b0d10',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 12px', paddingTop: 'calc(10px + env(safe-area-inset-top))',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: 'var(--t-font)' }}>
          {many ? `${label} ${index + 1} of ${images.length}` : label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            flex: 'none', minWidth: 44, minHeight: 44, borderRadius: 999, border: 'none',
            background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 22, lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      <div
        ref={stageRef}
        style={{
          position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: `0 ${GUTTER}px`,
        }}
      >
        {waiting ? <span className="b-viewer-wait" role="status" aria-label="Loading" /> : null}
        {/* The img waits for the room to be measured (before the first paint), so the copy
            it asks for is chosen with the real `sizes` rather than a guess. */}
        {room ? (
          <img
            key={url}
            onClick={(event) => event.stopPropagation()}
            {...photoImgProps(url, sizesFor(shown, room, photos))}
            alt={`${label} ${index + 1}`}
            decoding="async"
            // With a srcset the browser sizes a picture by the density it chose, not by its
            // pixels, so an older photo smaller than the copy asked for would come out small
            // (or, sized to the window, stretched). It is measured once it arrives and drawn
            // as large as the room allows, but never wider than its own pixels: the same as
            // before for an older picture, and filling the screen for one big enough.
            onLoad={(event) => {
              const src = event.currentTarget.currentSrc || event.currentTarget.src;
              naturalSize(src).then((pixels) => setArrived({ url, ...pixels }));
            }}
            // A picture that will not load is shown as the browser shows any broken picture.
            onError={() => setArrived({ url })}
            style={{
              position: 'relative', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8,
              // A drawing sits on white so its lines read; a photograph does not need a plate.
              backgroundColor: photos ? 'transparent' : '#fff',
              ...(size ? { width: size.width, height: size.height } : null),
              ...(!loaded && shown ? { backgroundImage: `url("${shown.src}")`, backgroundSize: '100% 100%' } : null),
            }}
          />
        ) : null}
      </div>

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '12px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        }}
      >
        {many ? (
          <>
            <button
              type="button"
              onClick={() => onIndex?.(index - 1)}
              disabled={index === 0}
              aria-label="Previous"
              style={navStyle(index === 0)}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onIndex?.(index + 1)}
              disabled={index === images.length - 1}
              aria-label="Next"
              style={navStyle(index === images.length - 1)}
            >
              ›
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          style={{
            minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: '#fff', color: '#14161a', fontFamily: 'var(--t-font)', fontSize: 14, fontWeight: 700,
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * The CSS size to draw a picture of `pixels` in `room`: as large as fits, keeping its
 * shape, and at most `most` CSS pixels per pixel of the picture (one, unless it is only
 * a shape). Null until both are known.
 */
function drawnSize(pixels, room, most = 1) {
  if (!pixels?.width || !pixels?.height || !room?.width || !room?.height) return null;
  const scale = Math.min(room.width / pixels.width, room.height / pixels.height, most);
  return { width: Math.floor(pixels.width * scale), height: Math.floor(pixels.height * scale) };
}

/**
 * The `sizes` for the viewer's picture. When the page shows a copy, its shape says how
 * wide the picture is drawn in this room: a landscape photo on a wide, short screen is
 * held to the room's height, and asking for the full window's width would fetch a copy a
 * step or two bigger than it can show. Without one, the window's width, which is never
 * too little.
 */
function sizesFor(shown, room, photos) {
  const drawn = drawnSize(shown && { width: shown.aspect, height: 1 }, room, Infinity);
  if (!drawn) return photos ? PHOTO_SIZES : DRAWING_SIZES;
  return `${Math.ceil(drawn.width * (photos ? 1 : 2))}px`;
}

/**
 * The best copy of `url` the page behind already has, as { src, aspect }, or null. That
 * is the picture the buyer tapped, or the one beside it, so it is in the browser's memory
 * and can be drawn at once while the viewer's own larger copy downloads. Of several, the
 * widest copy wins; for a photo stored here that is told by the width in its address,
 * since a srcset picture's naturalWidth is in CSS pixels, not the file's.
 */
function copyOnPage(url) {
  if (typeof document === 'undefined') return null;
  const own = isOwnPhoto(url);
  const target = new URL(url, window.location.href);
  let best = null;
  for (const img of document.images) {
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) continue;
    const src = img.currentSrc || img.src;
    let at;
    try {
      at = new URL(src, window.location.href);
    } catch {
      continue;
    }
    const same = own ? at.origin === target.origin && at.pathname === target.pathname : at.href === target.href;
    if (!same) continue;
    const width = Number(at.searchParams.get('w')) || img.naturalWidth;
    if (!best || width > best.width) best = { src, width, aspect: img.naturalWidth / img.naturalHeight };
  }
  return best && { src: best.src, aspect: best.aspect };
}

const navStyle = (disabled) => ({
  minWidth: 44, minHeight: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.28)',
  background: 'transparent', color: '#fff', fontSize: 20, lineHeight: 1,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
});
