import { useEffect } from 'react';

/**
 * Full-screen viewer for a drawing, kept inside the app.
 *
 * These used to open with target="_blank", which on a phone with the app added
 * to the home screen hands the buyer a chrome-less window: no back button, no
 * tab bar, nothing to close. They were stuck looking at an image. So there are
 * now three ways out — the button, the backdrop, and Escape — and none of them
 * leaves the app.
 */
export default function ImageViewer({ images = [], index = 0, onIndex, onClose, label = 'Image' }) {
  const open = index !== null && index >= 0 && index < images.length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
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

  if (!open) return null;
  const many = images.length > 1;

  return (
    <div
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
        onClick={(event) => event.stopPropagation()}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}
      >
        <img
          src={images[index].url}
          alt={`${label} ${index + 1}`}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff', borderRadius: 8 }}
        />
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

const navStyle = (disabled) => ({
  minWidth: 44, minHeight: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.28)',
  background: 'transparent', color: '#fff', fontSize: 20, lineHeight: 1,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
});
