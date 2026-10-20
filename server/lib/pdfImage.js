import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Pictures for the PDF writer: a JPEG or PNG file read into what a PDF image needs, with no dependency.
 *
 * A JPEG goes into the file as it is (PDF reads JPEG itself); only its size and colour model are read from it. A PNG
 * is decoded to plain 8-bit samples, then compressed again, with any transparency moved into a separate soft mask,
 * so a logo with a transparent background sits on whatever is under it instead of on a black box.
 *
 * A large PNG is sampled down as it is read, to at most MAX_LOGO_SIDE pixels on its longer side: a report draws a
 * logo a couple of inches wide, so a 4,000-pixel brand-kit file would only make the PDF heavy. Interlaced PNGs are
 * put back together first.
 *
 * Anything else (WebP, GIF, a damaged PNG, one far too large to be a logo) gives null, and the caller draws something
 * else in its place. A report is never refused because of its logo.
 */

/** The longer side a PNG logo is kept at: sharp at the size a report prints it, even on paper. */
export const MAX_LOGO_SIDE = 1600;

/** More pixels than this (say 10,000 x 5,000) is not a logo, and is not worth the time to read. */
export const MAX_SOURCE_PIXELS = 50_000_000;

/**
 * The most a PNG's compressed data is ever inflated to. A small file that claims to unpack into gigabytes stops here
 * with an error (caught below) instead of filling the memory.
 */
const MAX_INFLATED_BYTES = 48 * 1024 * 1024;

/** Adam7, the order an interlaced PNG sends its pixels in: each pass's first column and row, and its step across and down. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads a JPEG's size and colour model from its frame header. */
function readJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let adobe = false;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // Padding, and the markers that stand alone with no length after them.
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) return null;
    // An Adobe segment: CMYK from Photoshop is stored inverted, and the PDF has to be told.
    if (marker === 0xee && buf.toString('latin1', i + 4, i + 9) === 'Adobe') adobe = true;
    // Start of frame (any kind but the three that are not frames: DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) return null;
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      const components = buf[i + 9];
      const colorSpace = { 1: 'DeviceGray', 3: 'DeviceRGB', 4: 'DeviceCMYK' }[components];
      // Never decoded (the PDF reader does that), so its size costs nothing here; the upload limit bounds the bytes.
      if (!width || !height || !colorSpace) return null;
      return {
        width, height, colorSpace, filter: 'DCTDecode', data: buf,
        decode: components === 4 && adobe ? [1, 0, 1, 0, 1, 0, 1, 0] : null,
      };
    }
    // The picture data follows start-of-scan; a file with no frame header before it is not one we can read.
    if (marker === 0xda) return null;
    i += 2 + length;
  }
  return null;
}

/** Undoes the PNG row filters in place, row by row, and returns the bare samples. */
function unfilter(raw, width, height, bitsPerPixel) {
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < (stride + 1) * height) return null;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let value = raw[src + x];
      if (type === 1) value += a;
      else if (type === 2) value += b;
      else if (type === 3) value += (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (type !== 0) return null;
      out[row + x] = value & 0xff;
    }
  }
  return { samples: out, stride };
}

/** The bytes one row of `width` pixels takes, not counting the filter byte in front of it. */
const rowBytes = (width, bitsPerPixel) => Math.ceil((width * bitsPerPixel) / 8);

/** Copies one pixel between two rows of samples, whole bytes or, below 8 bits a pixel, the bits themselves. */
function copyPixel(src, srcRow, from, dst, dstRow, to, bits) {
  if (bits >= 8) {
    const n = bits >> 3;
    src.copy(dst, dstRow + to * n, srcRow + from * n, srcRow + from * n + n);
    return;
  }
  const mask = (1 << bits) - 1;
  const fromBit = from * bits;
  const toBit = to * bits;
  const value = (src[srcRow + (fromBit >> 3)] >> (8 - bits - (fromBit & 7))) & mask;
  const shift = 8 - bits - (toBit & 7);
  dst[dstRow + (toBit >> 3)] = (dst[dstRow + (toBit >> 3)] & ~(mask << shift)) | (value << shift);
}

/** The seven passes of an interlaced PNG put back into one picture, laid out as a plain PNG's rows are. */
function deinterlace(raw, width, height, bitsPerPixel) {
  const stride = rowBytes(width, bitsPerPixel);
  const out = Buffer.alloc(stride * height);
  let offset = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    const w = Math.ceil((width - x0) / dx);
    const h = Math.ceil((height - y0) / dy);
    if (w <= 0 || h <= 0) continue;
    const size = (rowBytes(w, bitsPerPixel) + 1) * h;
    const pass = unfilter(raw.subarray(offset, offset + size), w, h, bitsPerPixel);
    if (!pass) return null;
    offset += size;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) copyPixel(pass.samples, y * pass.stride, x, out, (y0 + y * dy) * stride, x0 + x * dx, bitsPerPixel);
    }
  }
  return { samples: out, stride };
}

/** The bytes a PNG's image data inflates to: its rows, each with its filter byte, pass by pass when interlaced. */
function inflatedSize(width, height, bitsPerPixel, interlace) {
  if (!interlace) return (rowBytes(width, bitsPerPixel) + 1) * height;
  let total = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    const w = Math.ceil((width - x0) / dx);
    const h = Math.ceil((height - y0) / dy);
    if (w > 0 && h > 0) total += (rowBytes(w, bitsPerPixel) + 1) * h;
  }
  return total;
}

/** Decodes a PNG to 8-bit colour samples and, when any pixel is see-through, an 8-bit alpha channel. */
function readPng(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let i = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const data = [];
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + length);
    if (body.length !== length) return null;
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        depth: body[8], colorType: body[9], interlace: body[12],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    i += 12 + length;
  }
  if (!header || !data.length) return null;
  const { width, height, depth, colorType, interlace } = header;
  if (!width || !height || width * height > MAX_SOURCE_PIXELS || interlace > 1) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const depthOk = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[colorType];
  if (!channels || !depthOk?.includes(depth)) return null;
  if (colorType === 3 && !palette) return null;

  // The rows can be no longer than this, so nothing past it is inflated.
  const expected = inflatedSize(width, height, channels * depth, interlace);
  if (expected > MAX_INFLATED_BYTES) return null;
  const inflated = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  const decoded = interlace
    ? deinterlace(inflated, width, height, channels * depth)
    : unfilter(inflated, width, height, channels * depth);
  if (!decoded) return null;
  const { samples, stride } = decoded;

  /** The n-th sample of a row as 0..255 (or the raw index, for a palette). */
  const sample = (row, n) => {
    if (depth === 8) return samples[row * stride + n];
    if (depth === 16) return samples[row * stride + n * 2];
    const bit = n * depth;
    const byte = samples[row * stride + (bit >> 3)];
    const value = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return colorType === 3 ? value : Math.round((value * 255) / ((1 << depth) - 1));
  };
  /** A tRNS key colour, compared at the file's own depth. */
  const key = (n) => (transparency && transparency.length >= (n + 1) * 2 ? transparency.readUInt16BE(n * 2) : null);
  const raw = (row, n) => {
    if (depth === 16) return samples.readUInt16BE(row * stride + n * 2);
    if (depth === 8) return samples[row * stride + n];
    const bit = n * depth;
    return (samples[row * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };

  // Every step-th pixel of every step-th row: a large logo comes out at most MAX_LOGO_SIDE on its longer side.
  const step = Math.max(1, Math.ceil(Math.max(width, height) / MAX_LOGO_SIDE));
  const outWidth = Math.ceil(width / step);
  const outHeight = Math.ceil(height / step);
  const gray = colorType === 0 || colorType === 4;
  const color = Buffer.alloc(outWidth * outHeight * (gray ? 1 : 3));
  const alpha = Buffer.alloc(outWidth * outHeight, 255);
  let seeThrough = false;
  for (let oy = 0; oy < outHeight; oy += 1) {
    const y = oy * step;
    for (let ox = 0; ox < outWidth; ox += 1) {
      const x = ox * step;
      const p = oy * outWidth + ox;
      let a = 255;
      if (colorType === 0) {
        color[p] = sample(y, x);
        if (key(0) !== null && raw(y, x) === key(0)) a = 0;
      } else if (colorType === 2) {
        for (let c = 0; c < 3; c += 1) color[p * 3 + c] = sample(y, x * 3 + c);
        if (key(2) !== null && raw(y, x * 3) === key(0) && raw(y, x * 3 + 1) === key(1) && raw(y, x * 3 + 2) === key(2)) a = 0;
      } else if (colorType === 3) {
        const index = sample(y, x);
        if (index * 3 + 2 >= palette.length) return null;
        for (let c = 0; c < 3; c += 1) color[p * 3 + c] = palette[index * 3 + c];
        if (transparency && index < transparency.length) a = transparency[index];
      } else if (colorType === 4) {
        color[p] = sample(y, x * 2);
        a = sample(y, x * 2 + 1);
      } else {
        for (let c = 0; c < 3; c += 1) color[p * 3 + c] = sample(y, x * 4 + c);
        a = sample(y, x * 4 + 3);
      }
      alpha[p] = a;
      if (a !== 255) seeThrough = true;
    }
  }
  return {
    width: outWidth, height: outHeight, colorSpace: gray ? 'DeviceGray' : 'DeviceRGB', filter: 'FlateDecode',
    data: deflateSync(color), alpha: seeThrough ? deflateSync(alpha) : null, decode: null,
  };
}

/**
 * A picture file as a PDF image ({ width, height, colorSpace, filter, data, alpha, decode }), or null when it is not
 * a JPEG or PNG this can read. The bytes decide, not the type the upload claimed.
 */
export function pdfImageFrom(bytes) {
  try {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
    if (buf[0] === 0xff && buf[1] === 0xd8) return readJpeg(buf);
    if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return readPng(buf);
    return null;
  } catch {
    // A damaged file (a short IDAT, bad compressed data): no picture, never an error.
    return null;
  }
}
