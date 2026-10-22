import { useState } from 'react';

import { photoAtWidth, photoSrcSet } from '@shared/photoSizes.js';

import { storedSize } from '../lib/pictureSize.js';

/**
 * The srcset, sizes and src for a plain <img> showing `url`, for the places that are not
 * a Photo (a logo-shaped slot, a guide's picture, the full-screen viewer). A picture that
 * is not stored here (a pasted link, a picture still waiting to upload, the app's own
 * artwork) gets its address as it is. srcSet comes first so it is set before src.
 */
export function photoImgProps(url, sizes) {
  const srcSet = photoSrcSet(url);
  if (!srcSet) return { src: url };
  return { srcSet, sizes, src: photoAtWidth(url, 1280) };
}

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
 * `quiet` is for a picture that is only a picture: when there is none (or it fails) the box is left
 * empty rather than saying "Photo coming soon", and whatever is behind it shows.
 *
 * `sizes` is how wide the picture is DRAWN, in CSS pixels, as an img `sizes` value. A
 * photo stored here is offered at every width on the ladder (shared/photoSizes.js) and
 * the browser takes the smallest that covers `sizes` at its screen density, so a phone
 * downloads a small copy and a big retina screen gets a big one. With object-fit: cover
 * the drawn width is not the box's: a landscape photo in a box taller than its shape is
 * drawn wider than the box and cropped, so a box like that gives the drawn width, which
 * is the box's height times the photo's shape. Without `sizes` the browser assumes the
 * whole width of the window, which is never blurry and often more than needed.
 *
 * `onMeasure(size)` is for the admin, which tells a builder when a picture is too small
 * for where it is used: it is called once the picture loads with the stored picture's
 * width and height (lib/pictureSize.js), whatever size of copy this slot shows.
 */
export default function Photo({
  photo, alt, label, radius, style, fit, className = '', eager = false, quiet = false,
  sizes = '100vw', onMeasure,
}) {
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
          // srcset and sizes come before src: React sets attributes in this order, and a
          // browser that started on src before it saw the srcset would download both. The
          // plain address is the one a browser with no srcset support uses; for a photo
          // stored here it is a middling copy rather than the full upload.
          {...photoImgProps(photo.url, sizes)}
          alt={alt ?? (label || '')}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : undefined}
          onError={() => setFailed(photo.url)}
          onLoad={onMeasure ? (event) => storedSize(event.currentTarget).then((size) => size && onMeasure(size)) : undefined}
          // Drawings (floor plans, the site map) must not be cropped the way a
          // photograph can be, so they ask for `contain`.
          style={fit ? { objectFit: fit } : undefined}
        />
      ) : quiet ? null : (
        <div className="photo-empty">{label || 'Photo coming soon'}</div>
      )}
    </div>
  );
}
