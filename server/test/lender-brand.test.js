import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';

import { DEFAULT_SETTINGS } from '../../shared/domain.js';
import { lenderBrandOf } from '../lib/lenderBrand.js';
import { PdfDocument } from '../lib/pdf.js';
import { MAX_LOGO_SIDE, MAX_SOURCE_PIXELS, pdfImageFrom } from '../lib/pdfImage.js';
import { buildLeadsPdf, buildUserPdf } from '../lib/pdfReports.js';
import { buildReport, reportText } from '../lib/report.js';
import { GIF, PNG, backends, startBackend } from './fixtures/harness.js';
import { pdfText, readPdf } from './fixtures/pdfText.js';

// ── small picture files, made here so every case is exact ─────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, body = Buffer.alloc(0)) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};
/** A PNG from rows of raw bytes, each row given with its filter type: [[filter, ...bytes], ...]. */
const png = ({ width, height, depth = 8, colorType, rows, interlace = 0, extra = [] }) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), ...extra, chunk('IDAT', deflateSync(Buffer.from(rows.flat()))), chunk('IEND'),
  ]);
};
/** A JPEG with only the segments the reader looks at (enough for the PDF header, not a viewable picture). */
const jpeg = ({ width, height, components, adobe = false }) => {
  const segment = (marker, body) => {
    const head = Buffer.from([0xff, marker, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
  };
  const sof = Buffer.alloc(6 + components * 3);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = components;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    ...(adobe ? [segment(0xee, Buffer.from('Adobe\0\x64\0\0\0\0\x02', 'latin1'))] : []),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0xd9]),
  ]);
};
const pixels = (picture) => inflateSync(picture.data);
const alphaOf = (picture) => (picture.alpha ? inflateSync(picture.alpha) : null);

/** The pictures a PDF holds, as { width, height, colorSpace, smask } from their object headers. */
const imagesIn = (buffer) => [...buffer.toString('latin1').matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/BitsPerComponent 8 \/ColorSpace \/(\w+)([^>]*)>>/g)]
  .map((m) => ({ width: Number(m[1]), height: Number(m[2]), colorSpace: m[3], smask: /\/SMask \d+ 0 R/.test(m[4]) }))
  // A soft mask is itself a grey image; only the pictures the page draws are counted.
  .filter((image, i, all) => !(image.colorSpace === 'DeviceGray' && all.some((other) => other.smask && other.width === image.width && other.height === image.height)));

describe('reading a logo for the PDF', () => {
  test('an RGBA PNG keeps its colours, and its see-through pixels become a soft mask', () => {
    const picture = pdfImageFrom(png({
      width: 2, height: 2, colorType: 6,
      rows: [[0, 255, 0, 0, 255, 0, 0, 255, 0], [2, 0, 0, 255, 0, 0, 0, 0, 128]],
    }));
    assert.deepEqual([picture.width, picture.height, picture.colorSpace, picture.filter], [2, 2, 'DeviceRGB', 'FlateDecode']);
    // Row 2 used the Up filter: each byte is added to the one above it.
    assert.deepEqual([...pixels(picture)], [255, 0, 0, 0, 0, 255, 255, 0, 255, 0, 0, 255]);
    assert.deepEqual([...alphaOf(picture)], [255, 0, 255, 128]);
  });

  test('a solid PNG has no mask, and every row filter is undone', () => {
    const rows = [
      [1, 10, 20, 30, 5, 5, 5], // Sub
      [3, 10, 10, 10, 10, 10, 10], // Average
      [4, 1, 1, 1, 1, 1, 1], // Paeth
    ];
    const picture = pdfImageFrom(png({ width: 2, height: 3, colorType: 2, rows }));
    assert.equal(picture.alpha, null, 'nothing is see-through, so there is no mask');
    const out = [...pixels(picture)];
    assert.deepEqual(out.slice(0, 6), [10, 20, 30, 15, 25, 35], 'Sub adds the pixel to the left');
    assert.deepEqual(out.slice(6, 12), [15, 20, 25, 25, 32, 40], 'Average adds half of left plus up');
    assert.deepEqual(out.slice(12, 18), [16, 21, 26, 26, 33, 41], 'Paeth adds the nearest neighbour');
  });

  test('a palette PNG with transparency, a 1-bit grey one and a 16-bit one are all read', () => {
    const palette = pdfImageFrom(png({
      width: 2, height: 1, colorType: 3,
      rows: [[0, 0, 1]],
      extra: [chunk('PLTE', Buffer.from([255, 255, 255, 0, 64, 128])), chunk('tRNS', Buffer.from([0]))],
    }));
    assert.deepEqual([...pixels(palette)], [255, 255, 255, 0, 64, 128]);
    assert.deepEqual([...alphaOf(palette)], [0, 255], 'the first colour is fully see-through');

    const bits = pdfImageFrom(png({ width: 3, height: 1, depth: 1, colorType: 0, rows: [[0, 0b10100000]] }));
    assert.equal(bits.colorSpace, 'DeviceGray');
    assert.deepEqual([...pixels(bits)], [255, 0, 255]);

    const deep = pdfImageFrom(png({ width: 1, height: 1, depth: 16, colorType: 2, rows: [[0, 0x12, 0x34, 0xab, 0xcd, 0xff, 0x00]] }));
    assert.deepEqual([...pixels(deep)], [0x12, 0xab, 0xff], 'the high byte of each sample');
  });

  test('a JPEG goes in as it is, with its size and colour model; Adobe CMYK is marked inverted', () => {
    const rgb = jpeg({ width: 640, height: 200, components: 3 });
    const picture = pdfImageFrom(rgb);
    assert.deepEqual([picture.width, picture.height, picture.colorSpace, picture.filter, picture.decode], [640, 200, 'DeviceRGB', 'DCTDecode', null]);
    assert.equal(picture.data, rgb, 'the file itself, not a copy');
    assert.equal(pdfImageFrom(jpeg({ width: 10, height: 10, components: 1 })).colorSpace, 'DeviceGray');
    assert.deepEqual(pdfImageFrom(jpeg({ width: 10, height: 10, components: 4, adobe: true })).decode, [1, 0, 1, 0, 1, 0, 1, 0]);
  });

  test('an interlaced PNG reads exactly as the same picture saved plainly, at every bit depth', () => {
    const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
    /** Rows of whole-byte pixels, plain and interlaced, from a function giving each pixel's bytes. */
    const both = (width, height, pixel) => {
      const plain = Array.from({ length: height }, (_, y) => [0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()]);
      const passes = [];
      for (const [x0, y0, dx, dy] of ADAM7) {
        for (let y = y0; y < height; y += dy) {
          const row = [];
          for (let x = x0; x < width; x += dx) row.push(...pixel(x, y));
          if (row.length) passes.push([0, ...row]);
        }
      }
      return { plain, passes };
    };
    const rgba = both(9, 7, (x, y) => [x * 20, y * 30, (x * y) % 256, x === y ? 0 : 255]);
    const a = pdfImageFrom(png({ width: 9, height: 7, colorType: 6, rows: rgba.plain }));
    const b = pdfImageFrom(png({ width: 9, height: 7, colorType: 6, interlace: 1, rows: rgba.passes }));
    assert.deepEqual([b.width, b.height], [9, 7]);
    assert.deepEqual(pixels(b), pixels(a));
    assert.deepEqual(alphaOf(b), alphaOf(a));

    // 1-bit grey, 11 wide: pixels share bytes, so they are moved bit by bit.
    const bit = (x, y) => ((x * 7 + y * 3) % 5 < 2 ? 1 : 0);
    const pack = (values) => {
      const bytes = [];
      values.forEach((v, i) => { bytes[i >> 3] = (bytes[i >> 3] ?? 0) | (v << (7 - (i & 7))); });
      return bytes;
    };
    const plainRows = Array.from({ length: 5 }, (_, y) => [0, ...pack(Array.from({ length: 11 }, (_, x) => bit(x, y)))]);
    const passRows = [];
    for (const [x0, y0, dx, dy] of ADAM7) {
      for (let y = y0; y < 5; y += dy) {
        const values = [];
        for (let x = x0; x < 11; x += dx) values.push(bit(x, y));
        if (values.length) passRows.push([0, ...pack(values)]);
      }
    }
    const c = pdfImageFrom(png({ width: 11, height: 5, depth: 1, colorType: 0, rows: plainRows }));
    const d = pdfImageFrom(png({ width: 11, height: 5, depth: 1, colorType: 0, interlace: 1, rows: passRows }));
    assert.deepEqual(pixels(d), pixels(c));
  });

  test('a large PNG is sampled down to the size of a logo, and a large JPEG is kept as it is', () => {
    const width = MAX_LOGO_SIDE * 2 + 1;
    const row = [0, ...Array.from({ length: width }, (_, x) => [x % 256, 0, 0]).flat()];
    const big = pdfImageFrom(png({ width, height: 3, colorType: 2, rows: [row, row, row] }));
    assert.deepEqual([big.width, big.height], [Math.ceil(width / 3), 1], 'every third pixel of every third row');
    const out = pixels(big);
    assert.deepEqual([out[0], out[3], out[6]], [0, 3, 6]);
    assert.ok(big.width <= MAX_LOGO_SIDE);
    const photo = pdfImageFrom(jpeg({ width: 6000, height: 4000, components: 3 }));
    assert.deepEqual([photo.width, photo.height, photo.filter], [6000, 4000, 'DCTDecode'], 'a JPEG is never decoded, so its size costs nothing');
  });

  test('anything else is null, never an error: WebP, GIF, damaged, empty or far too large', () => {
    const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'), Buffer.alloc(20)]);
    const gif = Buffer.from(GIF.split(',')[1], 'base64');
    const unknownInterlace = png({ width: 1, height: 1, colorType: 2, interlace: 2, rows: [[0, 1, 2, 3]] });
    const short = png({ width: 4, height: 4, colorType: 2, rows: [[0, 1, 2, 3]] });
    const huge = png({ width: MAX_SOURCE_PIXELS, height: 2, colorType: 0, rows: [[0, 0]] });
    const cut = jpeg({ width: 10, height: 10, components: 3 }).subarray(0, 12);
    // A 2x2 picture whose data unpacks into 20 MB: nothing past the rows a 2x2 picture can have is inflated.
    const header = png({ width: 2, height: 2, colorType: 2, rows: [[0, 0, 0, 0, 0, 0, 0]] });
    const bomb = Buffer.concat([header.subarray(0, 33), chunk('IDAT', deflateSync(Buffer.alloc(20 * 1024 * 1024))), chunk('IEND')]);
    for (const [label, bytes] of [['bomb', bomb], ['webp', webp], ['gif', gif], ['unknown interlace', unknownInterlace], ['short rows', short], ['huge', huge], ['cut jpeg', cut], ['empty', Buffer.alloc(0)], ['null', null]]) {
      assert.equal(pdfImageFrom(bytes), null, label);
    }
  });

  test('the PDF writer puts a picture in the file once, however many pages draw it', () => {
    const picture = pdfImageFrom(png({ width: 1, height: 1, colorType: 6, rows: [[0, 1, 2, 3, 4]] }));
    const doc = new PdfDocument();
    doc.image(picture, { x: 10, y: 10, w: 40, h: 20 });
    doc.addPage();
    doc.image(picture, { x: 10, y: 10, w: 40, h: 20 });
    const file = doc.finish();
    const raw = file.toString('latin1');
    assert.equal(imagesIn(file).length, 1);
    assert.match(raw, /\/XObject << \/Im1 \d+ 0 R >>/);
    for (const page of readPdf(file)) assert.match(page.ops, /q 40 0 0 20 10 762 cm \/Im1 Do Q/, 'drawn at the asked size, top-left at (10, 10)');
    assert.equal((raw.match(/\/SMask/g) ?? []).length, 1);
  });
});

// ── the reports ──────────────────────────────────────────────────────────

const NOW = new Date('2026-10-16T18:00:00Z');
const base = { id: 'brand-test-abcd', name: 'Brand Estates', location: 'West Point, Utah', theme: 'navy', settings: { ...DEFAULT_SETTINGS } };
const withLender = (settings) => ({ ...base, settings: { ...base.settings, ...settings } });
const other = withLender({ lenderName: 'Canyon Federal Credit Union', lenderNmls: '402115', lenderPhone: '435-555-0199', lenderEmail: 'loans@canyon.test', lenderWebsite: 'canyon.test', loName: 'Dana Reyes', loNmls: '998877' });
const person = (i) => ({
  id: `l${i}`, communityId: base.id, name: `Buyer ${i}`, email: `b${i}@test.co`, phone: '', status: 'new', notes: '', tour: null, savedHomeIds: [],
  extraEmails: [], openedAt: null, archivedAt: null, plan: {}, activity: [], moveIn: null, consent: null, firstVisitAt: new Date(NOW - i * 3600e3).toISOString(),
});
const leadsPdf = (community, extra = {}) => buildLeadsPdf({ community, leads: Array.from({ length: 70 }, (_, i) => person(i)), homes: [], now: NOW, timeZone: 'America/Denver', ...extra });
const userPdf = (community, extra = {}) => buildUserPdf({ community, lead: person(1), homes: [], consents: [], now: NOW, timeZone: 'America/Denver', ...extra });

describe('the lead reports are prepared by the lender in Setup', () => {
  test('Summit Home Loans, the default: its supplied logo, name and NMLS ID under the band, on every page top and bottom', () => {
    for (const made of [leadsPdf(base), userPdf(base)]) {
      const pages = readPdf(made.buffer);
      const text = pdfText(made.buffer);
      assert.ok(text.includes('Prepared by ') && text.includes('Summit Home Loans · NMLS #1790749'));
      assert.ok(text.includes('801-855-8535 · myloanteam@summithomeloans.com'), 'how to reach them');
      const [logo] = imagesIn(made.buffer);
      assert.deepEqual([logo.width, logo.height, logo.colorSpace, logo.smask], [700, 355, 'DeviceRGB', true], 'the supplied logo, see-through background kept');
      assert.ok(pages[0].ops.includes('/Im1 Do'), 'drawn on the first page');
      assert.ok(pages.length >= 2);
      for (const [i, page] of pages.entries()) {
        assert.ok(page.lines.includes(`Page ${i + 1} of ${pages.length}`), `page ${i + 1} numbered`);
        assert.ok(page.lines.includes('Summit Home Loans · NMLS #1790749'), `page ${i + 1} footer names the lender`);
        if (i > 0) assert.ok(page.lines.includes('Prepared by Summit Home Loans'), `page ${i + 1} running header`);
      }
      assert.match(made.buffer.toString('latin1'), /\/Author <FEFF0053/, 'the file says who prepared it');
    }
  });

  test('another lender with no logo uploaded: their name, never the Summit logo; a named loan officer is shown with their NMLS ID', () => {
    for (const made of [leadsPdf(other), userPdf(other)]) {
      const text = pdfText(made.buffer);
      assert.ok(text.includes('Canyon Federal Credit Union · NMLS #402115'));
      assert.ok(text.includes('435-555-0199 · loans@canyon.test · canyon.test · Loan officer: Dana Reyes · NMLS #998877'));
      assert.ok(!/Summit/.test(text), 'nothing says Summit');
      assert.deepEqual(imagesIn(made.buffer), [], 'no picture at all');
    }
    assert.equal(lenderBrandOf(withLender({ lenderName: '  summit home loans ' })).logo?.width, 700, 'the name is compared without case or spaces');
  });

  test('an uploaded logo is used for any lender; no lender in Setup means nothing is said about one', () => {
    const logo = pdfImageFrom(png({ width: 3, height: 1, colorType: 2, rows: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]] }));
    const brand = lenderBrandOf(other, { logo });
    assert.deepEqual(imagesIn(leadsPdf(other, { brand }).buffer).map((i) => [i.width, i.height]), [[3, 1]]);

    const none = withLender({ lenderName: '' });
    for (const made of [leadsPdf(none), userPdf(none)]) {
      const text = pdfText(made.buffer);
      assert.ok(!text.includes('Prepared by'), 'no prepared-by line');
      assert.ok(!text.includes('NMLS'), 'no NMLS line');
      assert.deepEqual(imagesIn(made.buffer), []);
      assert.ok(text.includes('Page 1 of'), 'the page numbers are still there');
    }
  });

  test('a long name or contact is cut, never an NMLS ID: the lender ID stays in the strip and footer, the loan officer is whole or left out', () => {
    const busy = withLender({
      lenderName: 'Academy Mortgage Corporation doing business as Academy Home Loans of Northern Utah', lenderNmls: '3113',
      lenderPhone: '801-325-6228', lenderEmail: 'mortgageteam.northern.utah@academyhomeloans.example', lenderWebsite: 'https://www.academyhomeloans.example/utah/ogden/mortgage',
      loName: 'Jennifer Christensen-Whitaker', loNmls: '1234567',
    });
    const logo = pdfImageFrom(png({ width: 600, height: 200, colorType: 2, rows: Array.from({ length: 200 }, () => [0, ...Array(1800).fill(90)]) }));
    for (const made of [leadsPdf(busy, { brand: lenderBrandOf(busy, { logo }) }), userPdf(busy, { brand: lenderBrandOf(busy, { logo }) })]) {
      const pages = readPdf(made.buffer);
      const first = pages[0].lines;
      assert.ok(first.some((line) => line.endsWith('Loan officer: Jennifer Christensen-Whitaker · NMLS #1234567')), 'the loan officer, whole');
      assert.ok(first.some((line) => line.endsWith('... · NMLS #3113') || line.endsWith('Northern Utah · NMLS #3113')), 'the strip keeps the lender ID');
      for (const page of pages) assert.ok(page.lines.some((line) => /· NMLS #3113$/.test(line) && !line.startsWith('Prepared')), 'the footer keeps the lender ID');
    }
  });

  test('a lender name with characters PDF text cannot hold, or a very long one, is printed safely and cut to fit', () => {
    const odd = withLender({ lenderName: `Ł${'Very Long Lender Name '.repeat(12)}(x) Tj /Evil`, lenderNmls: '1' });
    const made = leadsPdf(odd);
    const text = pdfText(made.buffer);
    assert.ok(text.includes('Prepared by'));
    assert.ok(text.includes('...'), 'cut with an ellipsis');
    assert.ok(!made.buffer.toString('latin1').includes('(x) Tj /Evil'), 'never written as PDF syntax');
  });

  test('the emailed report says who prepared it and ends with how to reach them, or says nothing when there is no lender', () => {
    const report = (community) => reportText(buildReport({ community, leads: [], now: NOW }));
    const text = report(other);
    assert.match(text, /^Brand Estates — leads report for .+\nPrepared by Canyon Federal Credit Union · NMLS #402115\n/);
    assert.match(text, /\n—\nCanyon Federal Credit Union · NMLS #402115\n435-555-0199 · loans@canyon\.test · canyon\.test\nLoan officer: Dana Reyes · NMLS #998877$/);
    const bare = report(withLender({ lenderName: '' }));
    assert.ok(!bare.includes('Prepared by') && !bare.includes('NMLS'), bare);
  });
});

for (const kind of backends()) {
  describe(`the downloaded reports carry the lender logo from Setup (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let leadId;

    before(async () => {
      app = await startBackend(kind, 'lender_brand');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Logo Estates' } })).body.id;
      leadId = (await api(`/api/c/${cid}/leads`, { method: 'POST', body: { name: 'Pat Logo', email: 'pat@logo.test', phone: '' } })).body.lead.id;
    });
    after(async () => {
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const pdf = async (path) => Buffer.from(await (await api(`/api/admin${path}`, { token, raw: true })).arrayBuffer());
    const both = async () => [await pdf(`/communities/${cid}/reports/leads.pdf`), await pdf(`/leads/${leadId}/report.pdf`)];

    test('no upload: the supplied logo while the lender is Summit; the name alone once it is another lender', async () => {
      for (const file of await both()) assert.deepEqual(imagesIn(file).map((i) => i.width), [700]);
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { lenderName: 'Acme Lending', lenderNmls: '55555' } } });
      for (const file of await both()) {
        assert.deepEqual(imagesIn(file), []);
        assert.ok(pdfText(file).includes('Acme Lending · NMLS #55555'));
      }
    });

    test('an uploaded PNG is the logo on both reports; a GIF upload gives the name, never the supplied logo', async () => {
      assert.equal((await admin(`/communities/${cid}/photos/lenderlogo`, { method: 'POST', body: { dataUrl: PNG } })).status, 201);
      for (const file of await both()) assert.deepEqual(imagesIn(file).map((i) => [i.width, i.height]), [[1, 1]]);

      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { lenderName: 'Summit Home Loans', lenderNmls: '1790749' } } });
      assert.equal((await admin(`/communities/${cid}/photos/lenderlogo`, { method: 'POST', body: { dataUrl: GIF } })).status, 201);
      for (const file of await both()) {
        assert.deepEqual(imagesIn(file), [], 'their own logo cannot be drawn, and it is not swapped for the supplied one');
        assert.ok(pdfText(file).includes('Summit Home Loans · NMLS #1790749'));
      }
    });
  });
}
