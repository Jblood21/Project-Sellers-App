import { useState } from 'react';

/**
 * Renders a photo, or a labelled placeholder when the community/home has none.
 * The buyer app is photo-led, so an empty slot still has to look deliberate.
 *
 * Alt text: an explicit `alt` wins, including '' when a picture is purely
 * decoration. With none given, the label stands in, so an image is never left
 * without the attribute and a screen reader never reads a file name.
 *
 * `eager` is for the one picture a page exists to show (a hero): it loads at once, ahead of the rest,
 * instead of waiting to be scrolled near. A picture that fails to load falls back to the placeholder.
 */
export default function Photo({ photo, alt, label, radius, style, fit, className = '', eager = false }) {
  const [failed, setFailed] = useState(null);
  const wrapperStyle = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius,
    ...style,
  };
  const showImage = photo?.url && failed !== photo.url;
  return (
    <div className={className} style={wrapperStyle}>
      {showImage ? (
        <img
          className="photo-img"
          src={photo.url}
          alt={alt ?? (label || '')}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          onError={() => setFailed(photo.url)}
          // Drawings (floor plans, the site map) must not be cropped the way a
          // photograph can be, so they ask for `contain`.
          style={fit ? { objectFit: fit } : undefined}
        />
      ) : (
        <div className="photo-empty">{label || 'Photo coming soon'}</div>
      )}
    </div>
  );
}
