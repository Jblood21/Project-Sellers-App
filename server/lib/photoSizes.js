import sharp from 'sharp';

import { LARGEST_PHOTO_WIDTH, PHOTO_WIDTHS } from '../../shared/photoSizes.js';

/**
 * Right-sized copies of the stored photos, for GET /api/photos/:id?w=<width>.
 *
 * An upload keeps up to 4096 px on its long edge (client/src/lib/photos.js), which a
 * full-width hero on a big retina screen needs and a 110 px realtor portrait on a phone
 * does not. The browser says how wide it wants the picture through its srcset, and this
 * makes that copy once, keeps it in memory and answers every later request from there.
 * A copy is never wider than the original: a small picture is sent as it was uploaded.
 *
 * Anyone can ask for any width of any photo, so the costly part (decoding the pixels)
 * only ever happens in the one-at-a-time line below, and only within each visitor's share.
 * Everything before it reads no more than the picture's header.
 */

// A copy within a tenth of the stored width is not worth an encode: it is barely smaller,
// and a second lossy pass costs more detail than the bytes it saves.
const NEAR_FULL_SIZE = 0.9;

// Copies kept in memory, by total bytes. The starter instance has 512 MB, and the work of
// one copy peaks at up to 155 MB over the server's own use (a 2560 px lossless copy of a
// site map, measured with the render.yaml memory settings; see HEAVY_PIXELS), so the cache
// is held well below what is left.
const CACHE_BYTES = (Number(process.env.PHOTO_CACHE_MB) || 48) * 1024 * 1024;
// No single copy may take more than an eighth of the cache, so one huge picture cannot
// push out a whole gallery of the small ones every page shows.
const LARGEST_ENTRY = CACHE_BYTES / 8;
// What is remembered about each original (its size, whether it has transparency or more
// than one frame) is a few dozen bytes, so a count is enough of a limit.
const MAX_FACTS = 5000;
// One resize at a time. On half a CPU a second one in parallel finishes no sooner, and it
// doubles the memory in use. A request that would wait longer than this, or join a line
// this long, is given the stored picture instead: bigger than it asked for, but at once.
const MAX_WAIT_MS = 8000;
const MAX_WAITING = 40;
// Reading what a picture is (its header) needs its bytes from the database, up to 3 MB of
// them, though the header itself is read in a millisecond and no pixel is decoded. A cold
// gallery takes those reads a few at a time, and two requests for one photo share one read.
const FACT_READS = 3;
// A stored picture is at most 3 MB, which a flat PNG or a lossless WebP can stretch to tens
// of megapixels, and decoding 49 of them takes 200 MB and more. Nothing the admin uploads
// is bigger than the largest upload (4096 x 4096), so a picture with more pixels than that
// is a logo kept as it was made, or one built to be expensive; either way it is sent as it
// is stored, which is what the app shows for a logo anyway, and is never decoded here.
const MAX_INPUT_PIXELS = LARGEST_PHOTO_WIDTH * LARGEST_PHOTO_WIDTH;
// Two encoders hold the whole picture several times over while they work: a lossless WebP
// takes about 32 bytes for every pixel of the copy (246 MB for a 3200 x 2400 site map), and
// mozjpeg's extra passes about 13. A copy with more pixels than this is made with ones that
// do not: a PNG instead of a lossless WebP (it streams, and is about twice the bytes), and a
// JPEG in one plain pass. With that, no copy of any picture the limits allow was measured
// above 155 MB over the server's own use, where a lossless 4096 px one took 530 MB.
const HEAVY_PIXELS = 5_000_000;

// Quality of the copies. These are the last encode a picture goes through before a buyer
// sees it, and the reason for all of this is pictures that look soft, so they are set
// where a careful eye cannot tell the copy from the upload rather than where bytes are
// smallest. JPEG goes through mozjpeg, which gets the same look into fewer bytes (all but
// a copy over HEAVY_PIXELS).
const WEBP_QUALITY = 82;
const JPEG_QUALITY = 84;

// libvips already uses one thread per image on glibc Linux; saying so keeps it true if a
// later sharp changes its default. Its own operation cache is off because the cache below
// holds exactly the results worth keeping, and nothing else should grow behind it.
sharp.concurrency(1);
sharp.cache(false);

/** The `w` a request asked for, or null when it asked for none (or for nonsense). */
export function askedWidth(value) {
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return null;
  const width = Number(value);
  return width > 0 ? width : null;
}

/**
 * The width to make for a request, or null when the stored picture should go as it is:
 * a copy is never wider than what was uploaded, and one nearly as wide is not made.
 */
export function servedWidth(asked, storedWidth) {
  const step = PHOTO_WIDTHS.find((w) => w >= asked) ?? LARGEST_PHOTO_WIDTH;
  if (!storedWidth || step >= storedWidth * NEAR_FULL_SIZE) return null;
  return step;
}

/**
 * Whether the browser said it can show WebP. Only an explicit `image/webp` counts: a
 * catch-all `*\/*` or `image/*` is also what browsers from before WebP send, and what
 * the link-preview crawlers send, and those get a JPEG or PNG they can open.
 */
export function acceptsWebp(accept) {
  return String(accept ?? '').split(',').some((part) => {
    const [type, ...params] = part.toLowerCase().split(';').map((s) => s.trim());
    if (type !== 'image/webp') return false;
    const q = params.find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
}

/**
 * The type to send. A picture with a transparency channel never becomes a JPEG, which has
 * none, and nor does one stored without loss (see `lossless` in readFacts). A lossy WebP
 * only carries the channel when some pixel uses it, because libwebp leaves an unused one
 * out, so the header is enough to tell a transparent logo from a photo. A lossless copy
 * of more than HEAVY_PIXELS is a PNG whatever the browser shows.
 */
function servedType(facts, webp, pixels) {
  if (facts.alpha || facts.lossless) return webp && pixels <= HEAVY_PIXELS ? 'image/webp' : 'image/png';
  return webp ? 'image/webp' : 'image/jpeg';
}

/** A least-recently-used map that evicts by total bytes rather than by count. */
class ByteCache {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  set(key, entry) {
    if (entry.body.length > LARGEST_ENTRY) return;
    this.delete(key);
    this.entries.set(key, entry);
    this.bytes += entry.body.length;
    for (const [oldest, old] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.bytes -= old.body.length;
    }
  }

  delete(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.body.length;
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

const copies = new ByteCache(CACHE_BYTES);
const facts = new Map();
const factsInFlight = new Map();
const inFlight = new Map();

/** The server is too busy to make this copy now (a long line, or a visitor over their share). */
class Busy extends Error {}

/**
 * A first-come line with a fixed number of places. `run` resolves with the job's result,
 * or rejects with Busy when the line is already `maxWaiting` long or the job has waited
 * `maxWaitMs` without its turn coming. A job that gave up is taken out of the line, so
 * the ones behind it move up and nothing runs for a request that has already been answered.
 */
class Line {
  constructor(places, { maxWaiting = Infinity, maxWaitMs = Infinity } = {}) {
    Object.assign(this, { places, maxWaiting, maxWaitMs, running: 0, waiting: [] });
  }

  run(job) {
    if (this.running < this.places) return this.#start(job);
    if (this.waiting.length >= this.maxWaiting) return Promise.reject(new Busy());
    return new Promise((resolve, reject) => {
      const turn = () => {
        clearTimeout(timer);
        this.#start(job).then(resolve, reject);
      };
      const timer = Number.isFinite(this.maxWaitMs) ? setTimeout(() => {
        const at = this.waiting.indexOf(turn);
        if (at >= 0) this.waiting.splice(at, 1);
        reject(new Busy());
      }, this.maxWaitMs) : null;
      this.waiting.push(turn);
    });
  }

  #start(job) {
    this.running += 1;
    return Promise.resolve().then(job).finally(() => {
      this.running -= 1;
      this.waiting.shift()?.();
    });
  }
}

const resizes = new Line(1, { maxWaiting: MAX_WAITING, maxWaitMs: MAX_WAIT_MS });
const factReads = new Line(FACT_READS);

/** For tests and the health of the cache: how much it holds and how busy it is. */
export function photoCacheStats() {
  return {
    bytes: copies.bytes, entries: copies.entries.size, facts: facts.size,
    running: resizes.running, waiting: resizes.waiting.length,
  };
}

/** Empties every cache. Tests use it between cases; nothing in the app needs to. */
export function clearPhotoCaches() {
  copies.clear();
  facts.clear();
}

/** The stored bytes of a photo, or null when the row has none (or is gone). */
async function storedBytes(store, id) {
  const stored = await store.getPhotoData(id);
  return stored?.data ? Buffer.from(stored.data, 'base64') : null;
}

/**
 * What matters about a stored picture for serving it: its width as it is shown (a phone
 * photo stored on its side with an EXIF turn is as wide as it is shown, not as stored),
 * whether it has a transparency channel, whether it was stored without loss, and frames.
 * All of it comes from the header, so it costs a millisecond or two and decodes nothing.
 *
 * `asStored` marks a picture that is only ever sent as it was stored: an animated one, one
 * with more pixels than MAX_INPUT_PIXELS (its size is still known and reported), and one
 * sharp cannot read at all, which is also `broken` and has no size.
 *
 * `lossless` is a PNG, a GIF or a lossless WebP. Uploads are lossy photos, except the
 * drawings (floor plans, site maps), which the admin keeps lossless whenever they fit
 * (client/src/lib/photos.js), and logos, which go up as they were made. Their copies are
 * lossless too: thin lines and small type stay clean, and for a drawing a lossless copy
 * is no bigger than a lossy one. A drawing too detailed to fit losslessly was stored
 * lossy, and is served like a photo.
 */
async function readFacts(bytes, type) {
  try {
    const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return { type, broken: true, asStored: true };
    const animated = (meta.pages ?? 1) > 1;
    const lossless = type === 'image/png' || type === 'image/gif' || (type === 'image/webp' && isLosslessWebp(bytes));
    return {
      type, width, height, alpha: Boolean(meta.hasAlpha), lossless, animated,
      asStored: animated || width * height > MAX_INPUT_PIXELS,
    };
  } catch {
    return { type, broken: true, asStored: true };
  }
}

/**
 * The facts about a stored photo, read once and remembered. Requests that arrive together
 * for a photo not read yet (a gallery's first visitor, or a script) share one read.
 */
function factsOf(store, id, type) {
  const known = facts.get(id);
  if (known) return known;
  let reading = factsInFlight.get(id);
  if (!reading) {
    reading = factReads.run(async () => {
      const bytes = await storedBytes(store, id);
      return bytes && readFacts(bytes, type);
    }).then((read) => {
      if (read) {
        if (facts.size >= MAX_FACTS) facts.delete(facts.keys().next().value);
        facts.set(id, read);
      }
      return read;
    }).finally(() => factsInFlight.delete(id));
    factsInFlight.set(id, reading);
  }
  return reading;
}

/**
 * Whether a WebP holds a lossless image: the first image chunk in the RIFF container is
 * VP8L rather than VP8. A file with no image chunk in its first few chunks is treated as
 * lossy, which only ever costs a little detail, never a picture.
 */
function isLosslessWebp(bytes) {
  let at = 12;
  for (let chunks = 0; chunks < 16 && at + 8 <= bytes.length; chunks += 1) {
    const fourcc = bytes.toString('latin1', at, at + 4);
    if (fourcc === 'VP8L') return true;
    if (fourcc === 'VP8 ') return false;
    const size = bytes.readUInt32LE(at + 4);
    at += 8 + size + (size % 2);
  }
  return false;
}

/**
 * A copy of `bytes`, `width` wide (or as wide as it is, for null), as `type`. The WebP
 * encoder leaves out a transparency channel no pixel uses, so the canvas PNG of a floor
 * plan, which always has one, gets a copy without it. A PNG copy, which only a browser
 * without WebP is sent, keeps the channel the original had.
 */
function encode(bytes, width, type, pixels, { alpha, lossless }) {
  // rotate() with no angle turns the picture upright from its EXIF orientation; the copy
  // carries no EXIF, so without it a sideways phone photo would stay sideways.
  let image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  // Lanczos, the default, is the sharpest of sharp's kernels for shrinking, and it is the
  // same however the picture was made, unlike the browser's own downscale on upload.
  if (width) image = image.resize({ width, withoutEnlargement: true });
  if (type === 'image/webp') {
    // A transparent picture is a logo or a drawing in practice: lossless keeps its hard
    // edges and, for flat colour, is no bigger than lossy.
    return (alpha || lossless ? image.webp({ lossless: true }) : image.webp({ quality: WEBP_QUALITY })).toBuffer();
  }
  if (type === 'image/png') return image.png().toBuffer();
  const heavy = pixels > HEAVY_PIXELS;
  return image.jpeg({ quality: JPEG_QUALITY, ...(heavy ? { optimiseCoding: false } : { mozjpeg: true }) }).toBuffer();
}

/**
 * The picture to send for GET /api/photos/:id?w=…, as one of
 *   null                                  no such photo
 *   { redirect }                          a link a builder pasted instead of a file
 *   { busy: true }                        nothing that browser can show is ready; try again
 *   { body, type, immutable, original }   bytes to send
 * `immutable` is false only when the server was too busy to resize and sent the original:
 * that answer is right for now but should not be what this browser keeps for a year.
 * `original` is the stored picture's { width, height } as it is shown, or null when it
 * could not be read; the admin uses it to say when a picture is too small for its place.
 *
 * `mayEncode()` is asked once before a copy that is not already made is made, and a false
 * answer is treated like a long line: the visitor gets the stored picture for now.
 * `headOnly` answers { type, immutable, original } for a HEAD request, which only wants
 * the headers, without decoding the picture or making a copy. (The first request of any
 * kind for a photo reads its header, which a HEAD needs for X-Photo-Width.)
 */
export async function sizedPhoto(store, id, asked, accept, { mayEncode = () => true, headOnly = false } = {}) {
  // The row without its bytes, every time: a cached copy of a photo that has since been
  // deleted (by the builder, or with its home or community) must not outlive it here.
  const row = await store.getPhotoInfo(id);
  if (!row) return null;
  if (row.url) return { redirect: row.url };

  const known = await factsOf(store, id, row.content_type || 'image/jpeg');
  if (!known) return null;

  const webp = acceptsWebp(accept);
  // Animated pictures, oversized ones and ones sharp cannot read go as they were stored:
  // resizing every frame of a GIF costs far more than the GIF does, and they are small
  // logos in practice.
  const width = known.asStored ? null : servedWidth(asked, known.width);
  // How many pixels the copy has, which decides the encoder (see HEAVY_PIXELS).
  let pixels = 0;
  if (!known.asStored) pixels = width ? width * Math.round((known.height * width) / known.width) : known.width * known.height;
  // A picture that needs no shrinking goes as stored whenever the browser can show its
  // type; re-encoding a lossy one would only lose detail. Two exceptions get a copy at
  // full size. A stored WebP for a browser that cannot show WebP gets a JPEG (or a PNG,
  // if it is transparent). And a picture stored without loss gets a lossless copy made
  // here, when that is smaller and light enough to make: a browser writes a lossless WebP
  // with libwebp's fastest setting, which for a site map can be twenty times the size of
  // the same pixels from sharp, and the full-screen viewer asks for a drawing at its full
  // size. (The admin also keeps the smaller of that WebP and a PNG, client/src/lib/photos.js,
  // so a drawing too big for a copy here is not stored at twenty times the size either.)
  const fullCopy = known.lossless && pixels <= HEAVY_PIXELS;
  const asStored = known.asStored || (width === null && !fullCopy && (known.type !== 'image/webp' || webp));
  const type = asStored ? known.type : servedType(known, webp, pixels);
  const key = asStored ? `${id}:stored` : `${id}:${width ?? 'full'}:${type}`;
  const original = known.broken ? null : { width: known.width, height: known.height };
  if (headOnly) return { type, immutable: true, original };
  const answer = (entry) => entry && (entry.body ? { ...entry, original } : entry);

  const hit = copies.get(key);
  if (hit) return answer(hit);
  if (inFlight.has(key)) return answer(await inFlight.get(key));

  const made = (async () => {
    if (asStored) {
      const body = await storedBytes(store, id);
      if (!body) return null;
      const entry = { body, type: known.type, immutable: true };
      copies.set(key, entry);
      return entry;
    }
    try {
      if (!mayEncode()) throw new Busy();
      // The bytes are read inside the turn, so a long line holds closures, not pictures.
      const body = await resizes.run(async () => {
        const bytes = await storedBytes(store, id);
        if (!bytes) return null;
        const copy = await encode(bytes, width, type, pixels, known);
        // A full-size lossless copy that came out no smaller than the stored picture of
        // the same type is not worth sending in its place.
        return width === null && type === known.type && bytes.length <= copy.length ? bytes : copy;
      });
      if (!body) return null;
      const entry = { body, type, immutable: true };
      copies.set(key, entry);
      return entry;
    } catch (err) {
      const busy = err instanceof Busy;
      // A WebP the browser cannot show is no answer at all; it is told to try again shortly.
      if (busy && known.type === 'image/webp' && !webp) return { busy: true };
      // Busy, or a picture that decodes as a header and fails as a whole: the stored
      // bytes are what this address served before sizes existed, so they are never wrong.
      if (!busy) console.warn(`Photo ${id} could not be resized (${err.message}); sent as stored.`);
      const body = await storedBytes(store, id);
      return body && { body, type: known.type, immutable: !busy };
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, made);
  return answer(await made);
}
