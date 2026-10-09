import { useEffect } from 'react';

/**
 * A home's video tour, played inside the app: either the file the builder uploaded or a YouTube or
 * Vimeo link. Opened by a button rather than sitting on the page, so a buyer on mobile data is never
 * charged for a clip they scrolled past. Same exits as the photo viewer (the button, the backdrop,
 * Escape), none of which leaves the app; closing it unmounts the player, which stops the video.
 */
export default function VideoViewer({ open, onClose, label = 'Video tour', src = '', embed = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || (!src && !embed)) return null;
  // The embed addresses come from videoEmbed (YouTube and Vimeo only). No related videos at the end,
  // and it starts at once: the buyer just pressed play on the button that opened this.
  const player = embed ? `${embed}${embed.includes('?') ? '&' : '?'}rel=0&modestbranding=1&autoplay=1` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#0b0d10', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 12px', paddingTop: 'calc(10px + env(safe-area-inset-top))',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: 'var(--t-font)' }}>{label}</span>
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{
            flex: 'none', minWidth: 44, minHeight: 44, borderRadius: 999, border: 'none',
            background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}
      >
        {embed ? (
          <iframe
            title={label}
            src={player}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ width: '100%', maxWidth: 960, aspectRatio: '16 / 9', border: 0, borderRadius: 8, background: '#000' }}
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={src} controls playsInline autoPlay preload="auto"
            style={{ width: '100%', maxWidth: 960, maxHeight: '100%', background: '#000', borderRadius: 8 }}
          />
        )}
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', justifyContent: 'center', padding: '12px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button" onClick={onClose}
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
