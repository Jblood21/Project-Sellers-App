import { isOwnPhoto } from '@shared/photoSizes.js';

/** The pixel size of the picture at `src`, or null when it does not load. */
export function naturalSize(src) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => resolve(null);
    probe.src = src;
  });
}

/**
 * How big the stored picture behind a loaded <img> is, or null when it cannot be told.
 *
 * The element's own naturalWidth will not do. With a srcset it is scaled by the density
 * the browser picked, and even unscaled it is the size of the copy the slot asked for (a
 * 480 px copy for a 170 px thumbnail), which says nothing about the original. A photo
 * stored here is therefore asked about with a HEAD request for the same address: the
 * server answers with the original's size in X-Photo-Width and X-Photo-Height, from what
 * it already knows, and sends no picture. Anything else (a picture still waiting to
 * upload, a pasted link, the plain address) is the picture itself, measured as it is.
 */
export async function storedSize(img) {
  const src = img?.currentSrc || img?.src;
  if (!src) return null;
  const url = new URL(src, window.location.href);
  if (url.origin === window.location.origin && isOwnPhoto(url.pathname) && url.searchParams.has('w')) {
    try {
      // The Accept the <img> sent, so the answer is about the copy it already has.
      const res = await fetch(url, { method: 'HEAD', headers: { Accept: 'image/webp,image/*,*/*;q=0.8' } });
      const width = Number(res.headers.get('X-Photo-Width'));
      const height = Number(res.headers.get('X-Photo-Height'));
      if (res.ok && width > 0 && height > 0) return { width, height };
    } catch {
      /* measured from the picture below instead */
    }
  }
  return naturalSize(src);
}
