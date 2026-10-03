import { fileToDataUrl } from '../../lib/photos.js';

const KEEP_AS_IS = new Set(['image/png', 'image/webp', 'image/jpeg', 'image/gif']);
// The server refuses anything over 3 MB once decoded, so a file at or under this
// can be sent exactly as it was picked.
const MAX_RAW_BYTES = 3 * 1024 * 1024;

/**
 * Reads a logo for upload.
 *
 * Photos are downscaled and re-encoded by `fileToDataUrl`, which is right for a
 * picture and wrong for a logo: re-encoding costs the crisp edges, and on
 * browsers that cannot write WebP it falls back to JPEG, which has no
 * transparency, so a transparent PNG would arrive on a black rectangle. A logo
 * that is already small enough therefore goes up byte for byte. Only an
 * oversized file is downscaled, and that is the rare case.
 */
export async function logoToDataUrl(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    // SVG can carry script and the server serves uploads from our own origin,
    // so it is refused outright rather than sanitised.
    throw new Error('SVG logos are not accepted. Export the logo as a PNG instead.');
  }
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');
  if (KEEP_AS_IS.has(file.type) && file.size <= MAX_RAW_BYTES) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file could not be read. Try picking it again.'));
      reader.readAsDataURL(file);
    });
    // The type came from the file's name, and the server only looks at the header
    // of the data URL, so a renamed text file would be saved as the logo and
    // replace the good one. Decoding it first costs nothing and keeps the bytes.
    await assertDecodes(dataUrl);
    return dataUrl;
  }
  return fileToDataUrl(file);
}

function assertDecodes(dataUrl) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => (probe.naturalWidth > 0 ? resolve() : reject(new Error(UNREADABLE)));
    probe.onerror = () => reject(new Error(UNREADABLE));
    probe.src = dataUrl;
  });
}

const UNREADABLE = 'That file is not a picture this browser can open. Pick a PNG, WebP, JPEG or GIF.';
