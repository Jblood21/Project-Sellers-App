import { videoTypeOf } from '@shared/domain.js';
import { LARGEST_PHOTO_WIDTH } from '@shared/photoSizes.js';

/**
 * How large an upload is kept, by what it is for. The server makes every smaller copy a
 * screen asks for (GET /api/photos/:id?w=…), so what is kept here only sets the most
 * detail a picture can ever show. A full-width hero or a photo in the full-screen viewer
 * on a 1440 to 1600 px laptop at 2x needs about 3000 px, and a Showcase slide wider still
 * (3840 on a 1920 px retina screen), so a photo keeps all of a phone camera's 4032 px.
 * Buyers pinch site maps and floor plans to read lot numbers and room sizes, which 3200 px
 * of a drawing is plenty for. A realtor's portrait (110 px on screen) and the app icon
 * (512 px) need far less, and a place on the area page is never shown wider than its card.
 */
const MAX_EDGE = {
  photo: LARGEST_PHOTO_WIDTH,
  drawing: 3200,
  highlight: 2400,
  icon: 1024,
  portrait: 800,
};

// The quality a picture is first tried at. This is the one lossy encode a photo goes
// through on its way in (the server's copies are made from it), so it is set where a
// careful look cannot tell it from the original, not where the file is smallest.
const WEBP_QUALITY = 0.85;
const JPEG_QUALITY = 0.9;
// One notch down, for the rare picture so full of fine detail that it is over the limit
// at full size. Still well above what most sites publish.
const WEBP_QUALITY_SMALLER = 0.8;
const JPEG_QUALITY_SMALLER = 0.85;
// For a drawing that will not fit losslessly: a high quality keeps thin lines and small
// type clean where a photo's setting would leave a haze around them.
const DRAWING_QUALITY = 0.92;

// The server refuses a picture over 3 MB once decoded (server/routes/admin.js), and
// counts it exactly the way a Blob's size does. A little room is left under it.
const UPLOAD_LIMIT = 3 * 1024 * 1024;
const BUDGET = Math.floor(UPLOAD_LIMIT * 0.95);
// When a picture is still over the limit after the lower quality, its long edge is cut
// in proportion to how far over it is, at most twice, and never below this: a hero this
// wide is still sharp on most screens, and anything that does not fit by then is refused
// with a plain message rather than kept shrinking into something soft.
const SMALLEST_EDGE = 1920;
const SHRINK_TRIES = 2;

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
 *  multi-megabyte base64 copy of the original in memory. A phone photo stored on
 *  its side with an EXIF turn comes out upright either way. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the FileReader path below */
    }
  }
  const dataUrl = await readAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = dataUrl;
  });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

const sizeOf = (source) => ({
  width: source.naturalWidth || source.width,
  height: source.naturalHeight || source.height,
});

/**
 * Draws `source` at `width` x `height` on a new canvas. A big reduction is made in halves
 * first: one large step leaves it to the browser how many source pixels each new pixel
 * looks at, and Firefox and older Safari look at only a few, which turns fine lines and
 * brickwork into jagged, shimmering patterns. Halving each time, every pixel is the
 * average of the four under it, which is the same in every browser.
 *
 * `opaque` paints white under the picture first, for JPEG, which has no transparency
 * and would otherwise turn every transparent pixel black.
 */
function render(source, width, height, { opaque }) {
  let current = source;
  let { width: w, height: h } = sizeOf(source);
  const steps = [];
  while (w / 2 >= width && h / 2 >= height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const half = document.createElement('canvas');
    half.width = w;
    half.height = h;
    const ctx = half.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, w, h);
    steps.push(half);
    current = half;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (opaque) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, width, height);
  // A 4096 px canvas holds up to 64 MB; let the steps go now rather than whenever the
  // collector gets round to them, which on a phone can be after the next one is made.
  for (const step of steps) step.width = step.height = 0;
  return canvas;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob(resolve, type, quality);
    else resolve(null);
  });
}

/**
 * The encodes to try, best first, for a picture of this kind on this browser. Each is
 * `{ type, quality, lossless }`. The smallest lossless one under the limit is the one
 * uploaded, and when none is, the first lossy one under it.
 *
 * A drawing (floor plan, site map) is lines and small type on a flat ground, which a
 * photo's lossy encode blurs and fringes, and which buyers zoom into. It is kept
 * lossless when it fits, and at a high quality when it does not. A browser that writes
 * WebP makes a lossless one at quality 1, but with libwebp's fastest setting, which for a
 * plat full of lot lines came out five times the size of the same drawing as a PNG (and
 * for a floor plan, half the size of the PNG). So both are made and the smaller is kept.
 */
function encodings(kind) {
  const webp = canEncodeWebp();
  if (kind === 'drawing') {
    return webp
      ? [
        { type: 'image/webp', quality: 1, lossless: true },
        { type: 'image/png', lossless: true },
        { type: 'image/webp', quality: DRAWING_QUALITY },
        { type: 'image/webp', quality: WEBP_QUALITY },
      ]
      : [
        { type: 'image/png', lossless: true },
        { type: 'image/jpeg', quality: DRAWING_QUALITY },
        { type: 'image/jpeg', quality: JPEG_QUALITY_SMALLER },
      ];
  }
  return webp
    ? [{ type: 'image/webp', quality: WEBP_QUALITY }, { type: 'image/webp', quality: WEBP_QUALITY_SMALLER }]
    : [{ type: 'image/jpeg', quality: JPEG_QUALITY }, { type: 'image/jpeg', quality: JPEG_QUALITY_SMALLER }];
}

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Reads a picked picture and returns what to upload, with its size:
 *   { dataUrl, width, height, sourceWidth, sourceHeight }
 * `width` and `height` are what was kept, `sourceWidth` and `sourceHeight` the picture
 * as it was picked (turned upright), so a caller can say when a picture is too small
 * for where it is going.
 *
 * `kind` is 'photo' (the default), 'drawing' for floor plans and site maps, or one of
 * the smaller uses in MAX_EDGE.
 *
 * It keeps as much of the picture as the upload limit allows: at most MAX_EDGE on the
 * long edge, never enlarged, at a quality where the encode cannot be seen. A picture
 * that would still be over the limit is tried one notch lower, then a little smaller,
 * so a builder never meets "that image is over 3 MB" for a photo straight off a camera.
 */
export async function preparePhoto(file, { kind = 'photo' } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');

  const source = await decode(file);
  try {
    const { width: sourceWidth, height: sourceHeight } = sizeOf(source);
    let edge = Math.min(MAX_EDGE[kind] ?? MAX_EDGE.photo, Math.max(sourceWidth, sourceHeight));
    // The smallest lossy try so far, which is what decides how much smaller to go.
    let smallest = Infinity;
    for (let shrink = 0; shrink <= SHRINK_TRIES; shrink += 1) {
      const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      // Every encode is tried on the same drawing, except that a JPEG needs white under it.
      let canvas = null;
      let opaqueCanvas = null;
      const encode = async ({ type, quality }) => {
        const opaque = type === 'image/jpeg';
        if (opaque) opaqueCanvas ??= render(source, width, height, { opaque: true });
        else canvas ??= render(source, width, height, { opaque: false });
        const blob = await toBlob(opaque ? opaqueCanvas : canvas, type, quality);
        // A browser that cannot write the type hands back a PNG instead; only
        // what actually came back counts, both for its type and its size.
        return blob && blob.type === type ? blob : null;
      };
      const kept = async (blob) => ({ dataUrl: await readAsDataUrl(blob), width, height, sourceWidth, sourceHeight });
      try {
        // A lossless encode that did not fit at full size will not fit a little smaller
        // either (it is several times the size of a lossy one), so a smaller try skips it.
        const tries = encodings(kind).filter((encoding) => !shrink || !encoding.lossless);
        // Every lossless encode is made, and the smallest that fits is kept.
        let lossless = null;
        for (const encoding of tries.filter((e) => e.lossless)) {
          const blob = await encode(encoding);
          if (blob && blob.size <= BUDGET && (!lossless || blob.size < lossless.size)) lossless = blob;
        }
        if (lossless) return await kept(lossless);
        // Then the lossy ones, best first, and the first that fits is kept.
        for (const encoding of tries.filter((e) => !e.lossless)) {
          const blob = await encode(encoding);
          if (!blob) continue;
          if (blob.size <= BUDGET) return await kept(blob);
          smallest = Math.min(smallest, blob.size);
        }
      } finally {
        if (canvas) canvas.width = canvas.height = 0;
        if (opaqueCanvas) opaqueCanvas.width = opaqueCanvas.height = 0;
      }
      if (edge <= SMALLEST_EDGE || !Number.isFinite(smallest)) break;
      // Bytes grow with the area, so the edge is cut by the square root of how far over
      // the limit the smallest try was, with a little to spare so one cut is usually enough.
      edge = Math.max(SMALLEST_EDGE, Math.floor(edge * Math.sqrt(BUDGET / smallest) * 0.95));
    }
    if (!Number.isFinite(smallest)) throw new Error('This browser could not save that picture. Try a JPEG or PNG.');
    throw new Error(
      `That picture has too much fine detail to fit in an upload (${mb(smallest)} at its smallest; the limit is `
      + `${mb(UPLOAD_LIMIT)}). Try a smaller copy of it.`,
    );
  } finally {
    source.close?.();
  }
}

/** Reads a picked picture and returns just the data URL to upload. See preparePhoto. */
export async function fileToDataUrl(file, options) {
  return (await preparePhoto(file, options)).dataUrl;
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
export async function videoToDataUrl(file, maxBytes, longerHint = 'for a longer one, paste a YouTube or Vimeo link instead.') {
  // The browser's own File.type is empty for some perfectly good files (a .mov
  // on a machine with no handler for it) and a non-standard name for others
  // (video/x-m4v), so judge by type-or-extension and say which type to store.
  const type = videoTypeOf(file.name, file.type);
  if (!type) throw new Error('That is not a video we can use. MP4 works everywhere; WebM and MOV also play.');
  if (file.size > maxBytes) {
    // The hint depends on where the video is going: a home walkthrough has no
    // link field to fall back to, so pointing at one would be a dead end.
    throw new Error(`That video is ${mb(file.size)}. Uploads stop at ${mb(maxBytes)} — ${longerHint}`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // FileReader labels the data URL with File.type, which is the very thing
    // that was empty or odd; relabel it with the type decided above.
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, `data:${type};base64,`));
    reader.onerror = () => reject(new Error('That file could not be read. Try picking it again.'));
    reader.readAsDataURL(file);
  });
}
