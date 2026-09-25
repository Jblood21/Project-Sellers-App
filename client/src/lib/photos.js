// A hero photo renders at most ~1290 physical pixels (a 430px-wide phone at DPR 3),
// and home photos far less, so 1280 is the point past which extra pixels are paid
// for in upload time and never seen.
const MAX_EDGE = 1280;

// WebP at 0.72 is visually comparable to JPEG at 0.82 and roughly 30% smaller.
const WEBP_QUALITY = 0.72;
const JPEG_QUALITY = 0.82;

/**
 * Safari below 16.4 ignores an unsupported canvas type and silently hands back
 * PNG — which for a photo is far LARGER than the JPEG we were replacing. So we
 * never trust the request, only the bytes that come back.
 */
let webpEncodes = null;
function canEncodeWebp() {
  if (webpEncodes === null) {
    try {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      webpEncodes = probe.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpEncodes = false;
    }
  }
  return webpEncodes;
}

/** Decodes straight from the Blob where possible, which skips holding a
 *  multi-megabyte base64 copy of the original in memory. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the FileReader path below */
    }
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = dataUrl;
  });
}

/**
 * Reads a picked file and returns a downscaled data URL ready to upload.
 *
 * The upload is the slow part of this on a phone — measured at ~5s for the old
 * 465 KB payload on a weak signal — so the work here is about producing the
 * fewest bytes that still look right, not about raw encode speed.
 */
export async function fileToDataUrl(file) {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');

  const source = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();

  if (canEncodeWebp()) {
    const webp = canvas.toDataURL('image/webp', WEBP_QUALITY);
    if (webp.startsWith('data:image/webp')) return webp;
  }
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Reads a picked video without touching it.
 *
 * Unlike an image, there is no downscaling to do here — re-encoding video in a
 * browser is a different project, and a builder who exported a clip at the size
 * they wanted should get that clip. So this is a straight read, and the size
 * limit is enforced before the read rather than after: reading 200MB into a
 * string to then refuse it is how a phone runs out of memory.
 */
export async function videoToDataUrl(file, maxBytes) {
  if (!file.type.startsWith('video/')) throw new Error('Pick a video file.');
  if (file.size > maxBytes) {
    const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
    throw new Error(
      `That video is ${mb(file.size)}. Uploads stop at ${mb(maxBytes)} — `
      + 'for a longer one, paste a YouTube or Vimeo link instead.',
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read. Try picking it again.'));
    reader.readAsDataURL(file);
  });
}
