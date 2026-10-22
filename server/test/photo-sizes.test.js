import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import sharp from 'sharp';

import { acceptsWebp, askedWidth, clearPhotoCaches, servedWidth } from '../lib/photoSizes.js';
import { PHOTO_WIDTHS, isOwnPhoto, photoAtWidth, photoSrcSet } from '../../shared/photoSizes.js';
import { backends, startBackend } from './fixtures/harness.js';

// What a current browser sends for an <img>, and what an old Safari, curl or a link-preview crawler sends.
const CHROME = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const PLAIN = '*/*';

const dataUrl = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;

/**
 * A picture with something in it (stripes and a block of colour), so a resize has real
 * work to do and a JPEG of it is small enough to upload. `exif` sets an orientation tag.
 */
async function picture(width, height, { format = 'jpeg', alpha = false, orientation } = {}) {
  const stripes = Array.from({ length: Math.ceil(width / 40) }, (_, i) => `<rect x="${i * 40}" y="0" width="20" height="${height}" fill="#24527a"/>`).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${stripes}<rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="#d9822b"/></svg>`);
  const ground = alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 240, g: 236, b: 228 };
  let image = sharp({ create: { width, height, channels: 4, background: ground } }).composite([{ input: svg }]);
  if (orientation) image = image.withMetadata({ orientation });
  if (format === 'png') return image.png().toBuffer();
  if (format === 'webp') return image.webp({ quality: 80 }).toBuffer();
  return image.flatten({ background: '#fff' }).jpeg({ quality: 80 }).toBuffer();
}

/** A two-frame animated GIF. */
async function animatedGif() {
  const frame = (colour) => sharp({ create: { width: 400, height: 300, channels: 3, background: colour } }).raw().toBuffer();
  const frames = Buffer.concat([await frame('#c00'), await frame('#0c0')]);
  return sharp(frames, { raw: { width: 400, height: 600, channels: 3, pageHeight: 300 } }).gif({ loop: 0 }).toBuffer();
}

test('the width ladder and the addresses that ask for it', () => {
  assert.deepEqual([...PHOTO_WIDTHS], [320, 480, 640, 960, 1280, 1600, 1920, 2560, 3200, 4096]);
  assert.ok(isOwnPhoto('/api/photos/p_abc123'));
  assert.ok(!isOwnPhoto('https://images.example.com/a.jpg'), 'a pasted link has no copies');
  assert.ok(!isOwnPhoto('data:image/webp;base64,AAAA'), 'a picture still waiting to upload has none either');
  assert.ok(!isOwnPhoto('/api/photos/p_abc123?w=640'), 'an address already asking for a width is not asked again');
  assert.equal(photoAtWidth('/api/photos/p_1', 500), '/api/photos/p_1?w=640', 'rounded up to the next step');
  assert.equal(photoAtWidth('/api/photos/p_1', 9000), '/api/photos/p_1?w=4096', 'and never past the top');
  assert.equal(photoAtWidth('/guides/hero.webp', 500), '/guides/hero.webp');
  assert.equal(photoSrcSet('/api/photos/p_1').split(', ').length, PHOTO_WIDTHS.length);
  assert.match(photoSrcSet('/api/photos/p_1'), /^\/api\/photos\/p_1\?w=320 320w, .* \/api\/photos\/p_1\?w=4096 4096w$/);
  assert.equal(photoSrcSet('https://x.example/a.jpg'), undefined);
});

test('which widths are made, and which requests count as asking for one', () => {
  assert.equal(askedWidth('640'), 640);
  for (const junk of [undefined, '', '0', 'abc', '12.5', '-5', '999999', ['1', '2'], { a: '1' }, ' 640']) {
    assert.equal(askedWidth(junk), null, JSON.stringify(junk));
  }
  assert.equal(servedWidth(500, 2400), 640, 'rounded up to the ladder');
  assert.equal(servedWidth(2000, 2400), null, 'a copy nearly as wide as the original is not worth making');
  assert.equal(servedWidth(3200, 2400), null, 'and one wider is never made');
  assert.equal(servedWidth(99999, 5000), 4096, 'the top of the ladder is the most a copy is');
  assert.equal(servedWidth(640, undefined), null, 'a picture of unknown size goes as it is');
});

test('WebP only for a browser that names it', () => {
  assert.ok(acceptsWebp(CHROME));
  assert.ok(acceptsWebp('image/webp'));
  assert.ok(!acceptsWebp(PLAIN), 'a catch-all is what browsers from before WebP send');
  assert.ok(!acceptsWebp('image/*'));
  assert.ok(!acceptsWebp(undefined));
  assert.ok(!acceptsWebp('image/webp;q=0, */*'), 'q=0 means no');
});

for (const kind of backends()) {
  describe(`right-sized copies of a stored photo (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let hero;
    let reads = 0;
    // Set by a test that needs requests to overlap a read of the stored bytes.
    let readDelay = 0;

    const upload = async (slot, body) => {
      const res = await api(`/api/admin/communities/${cid}/photos/${slot}`, { method: 'POST', token, body });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    };
    const fetchPhoto = async (path, accept = CHROME) => {
      const res = await api(path, { raw: true, headers: { Accept: accept } });
      const bytes = Buffer.from(await res.arrayBuffer());
      const meta = res.status === 200 && res.headers.get('content-type')?.startsWith('image/') ? await sharp(bytes, { animated: true }).metadata() : null;
      return { res, bytes, meta, header: (name) => res.headers.get(name) };
    };

    before(async () => {
      clearPhotoCaches();
      app = await startBackend(kind, 'photo_sizes');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Sizes Test' } })).body.id;
      hero = await upload('hero', { dataUrl: dataUrl('image/jpeg', await picture(2400, 1600)) });
      // Counts reads of the stored bytes, to show a copy already made is not made again.
      const real = app.store.getPhotoData.bind(app.store);
      app.store.getPhotoData = async (id) => {
        reads += 1;
        if (readDelay) await new Promise((resolve) => { setTimeout(resolve, readDelay); });
        return real(id);
      };
    });
    after(() => app.stop());

    test('a width is served as a copy that wide, in the type the browser can show, with the same guards', async () => {
      const webp = await fetchPhoto(`${hero.url}?w=640`);
      assert.equal(webp.res.status, 200);
      assert.equal(webp.header('content-type'), 'image/webp');
      assert.equal(webp.meta.format, 'webp');
      assert.equal(webp.meta.width, 640);
      assert.equal(webp.meta.height, 427, 'the shape is kept');
      assert.equal(webp.header('vary'), 'Accept', 'the bytes depend on Accept, so a cache must too');
      assert.equal(webp.header('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(webp.header('x-content-type-options'), 'nosniff');
      assert.equal(webp.header('content-security-policy'), "default-src 'none'; sandbox");

      const jpeg = await fetchPhoto(`${hero.url}?w=640`, PLAIN);
      assert.equal(jpeg.header('content-type'), 'image/jpeg', 'a browser that did not name WebP gets a JPEG');
      assert.equal(jpeg.meta.format, 'jpeg');
      assert.equal(jpeg.meta.width, 640);
      assert.equal(jpeg.header('vary'), 'Accept');
      assert.equal(jpeg.meta.exif, undefined, 'a copy carries no camera data');
    });

    test('every sized answer says how big the original is, and a HEAD says so without making a copy', async () => {
      const copy = await fetchPhoto(`${hero.url}?w=480`);
      assert.equal(copy.meta.width, 480);
      assert.equal(copy.header('x-photo-width'), '2400', 'the original, not the copy');
      assert.equal(copy.header('x-photo-height'), '1600');
      const before = reads;
      const head = await api(`${hero.url}?w=320`, { raw: true, method: 'HEAD', headers: { Accept: CHROME } });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('x-photo-width'), '2400');
      assert.equal(head.headers.get('content-type'), 'image/webp');
      assert.equal(head.headers.get('vary'), 'Accept');
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      assert.equal(reads, before, 'nothing read or made for a HEAD once the original is known');
      assert.equal((await fetchPhoto(hero.url)).header('x-photo-width'), null, 'the plain address is unchanged');
    });

    test('an odd width is rounded up to the ladder, and a copy is made once', async () => {
      const first = await fetchPhoto(`${hero.url}?w=1000`);
      assert.equal(first.meta.width, 1280);
      const before = reads;
      const again = await fetchPhoto(`${hero.url}?w=1100`);
      assert.equal(again.meta.width, 1280, 'the same step');
      assert.deepEqual(again.bytes, first.bytes);
      assert.equal(reads, before, 'served from memory without reading the stored bytes again');
    });

    test('a picture is never enlarged: past its own width the stored bytes are sent as they are', async () => {
      const stored = await fetchPhoto(hero.url);
      for (const w of ['2200', '2560', '3200', '99999']) {
        const big = await fetchPhoto(`${hero.url}?w=${w}`);
        assert.equal(big.res.status, 200);
        assert.equal(big.meta.width, 2400, `w=${w}`);
        assert.equal(big.header('content-type'), 'image/jpeg', 'a JPEG every browser can show stays a JPEG');
        assert.deepEqual(big.bytes, stored.bytes, 'no second encode of the original');
        assert.equal(big.header('vary'), 'Accept');
        assert.equal(big.header('cache-control'), 'public, max-age=31536000, immutable');
      }
    });

    test('with no width, or one that is not a plain number, the stored photo is served exactly as before', async () => {
      const stored = await fetchPhoto(hero.url);
      assert.equal(stored.res.status, 200);
      assert.equal(stored.header('content-type'), 'image/jpeg');
      assert.equal(stored.header('vary'), null, 'nothing about it depends on Accept');
      assert.equal(stored.header('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(stored.header('x-content-type-options'), 'nosniff');
      assert.equal(stored.header('content-security-policy'), "default-src 'none'; sandbox");
      assert.equal(stored.meta.width, 2400);
      for (const query of ['w=abc', 'w=0', 'w=12.5', 'w=-1', 'w=999999', 'w=1&w=2', 'w=', 'width=640']) {
        const junk = await fetchPhoto(`${hero.url}?${query}`);
        assert.equal(junk.res.status, 200, query);
        assert.deepEqual(junk.bytes, stored.bytes, query);
        assert.equal(junk.header('vary'), null, query);
      }
    });

    test('a stored WebP is sent as it is to a browser that shows WebP, and as a JPEG to one that does not', async () => {
      const map = await upload('sitemap', { dataUrl: dataUrl('image/webp', await picture(1280, 720, { format: 'webp' })) });
      const stored = await fetchPhoto(map.url);
      const webp = await fetchPhoto(`${map.url}?w=1600`);
      assert.equal(webp.header('content-type'), 'image/webp');
      assert.deepEqual(webp.bytes, stored.bytes);
      const jpeg = await fetchPhoto(`${map.url}?w=1600`, PLAIN);
      assert.equal(jpeg.header('content-type'), 'image/jpeg');
      assert.equal(jpeg.meta.format, 'jpeg');
      assert.equal(jpeg.meta.width, 1280, 'at its own width, not enlarged to the step asked for');
      const small = await fetchPhoto(`${map.url}?w=320`, PLAIN);
      assert.equal(small.meta.width, 320);
      assert.equal(small.header('content-type'), 'image/jpeg');
    });

    test('a transparent picture keeps its transparency: lossless WebP, or PNG, never JPEG', async () => {
      const logo = await upload('logo', { dataUrl: dataUrl('image/png', await picture(1600, 600, { format: 'png', alpha: true })) });
      const webp = await fetchPhoto(`${logo.url}?w=320`);
      assert.equal(webp.header('content-type'), 'image/webp');
      assert.equal(webp.meta.hasAlpha, true);
      assert.equal(webp.meta.width, 320);
      const png = await fetchPhoto(`${logo.url}?w=320`, PLAIN);
      assert.equal(png.header('content-type'), 'image/png');
      assert.equal(png.meta.hasAlpha, true);
    });

    test('a drawing stored without loss gets copies without loss, and a WebP copy drops an unused transparency channel', async () => {
      // What a browser canvas writes for a floor plan: every pixel opaque, the channel there anyway.
      const plan = await sharp(await picture(1600, 900)).ensureAlpha().png().toBuffer();
      const png = await upload('sitemap', { dataUrl: dataUrl('image/png', plan) });
      const plain = await fetchPhoto(`${png.url}?w=640`, PLAIN);
      assert.equal(plain.header('content-type'), 'image/png', 'not a JPEG, which would blur its lines');
      assert.equal(plain.meta.width, 640);
      const webp = await fetchPhoto(`${png.url}?w=640`);
      assert.equal(webp.header('content-type'), 'image/webp');
      assert.equal(webp.bytes.toString('latin1', 12, 16), 'VP8L', 'a lossless WebP');
      assert.equal(webp.meta.hasAlpha, false, 'the WebP encoder leaves out a channel no pixel uses');

      // The admin's own encode of a drawing: a lossless WebP.
      const lossless = await upload('sitemap', { dataUrl: dataUrl('image/webp', await sharp(plan).webp({ lossless: true }).toBuffer()) });
      const copy = await fetchPhoto(`${lossless.url}?w=480`);
      assert.equal(copy.bytes.toString('latin1', 12, 16), 'VP8L');
      assert.equal(copy.meta.width, 480);
      assert.equal((await fetchPhoto(`${lossless.url}?w=480`, PLAIN)).header('content-type'), 'image/png');

      // A lossy WebP (a photo, or a drawing too detailed to fit losslessly) gets lossy copies.
      const lossy = await upload('sitemap', { dataUrl: dataUrl('image/webp', await sharp(plan).webp({ quality: 80 }).toBuffer()) });
      const small = await fetchPhoto(`${lossy.url}?w=480`);
      assert.notEqual(small.bytes.toString('latin1', 12, 16), 'VP8L');
      assert.equal((await fetchPhoto(`${lossy.url}?w=480`, PLAIN)).header('content-type'), 'image/jpeg');
    });

    test('a phone photo stored on its side comes out upright', async () => {
      // 1600 x 1200 as stored, with the tag that says "turn me a quarter": 1200 x 1600 as shown.
      const sideways = await upload('icon', { dataUrl: dataUrl('image/jpeg', await picture(1600, 1200, { orientation: 6 })) });
      const copy = await fetchPhoto(`${sideways.url}?w=640`);
      assert.equal(copy.meta.width, 640);
      assert.equal(copy.meta.height, 853);
      assert.equal(copy.meta.orientation, undefined, 'turned for real, not by a tag');
      // As wide as it is shown (1200), so a 1280 request is the original, tag and all.
      const whole = await fetchPhoto(`${sideways.url}?w=1280`);
      assert.equal(whole.meta.width, 1600);
      assert.equal(whole.meta.orientation, 6);
    });

    test('an animated GIF is sent as it was stored, every frame', async () => {
      const gif = await upload('lenderlogo', { dataUrl: dataUrl('image/gif', await animatedGif()) });
      const res = await fetchPhoto(`${gif.url}?w=320`);
      assert.equal(res.header('content-type'), 'image/gif');
      assert.equal(res.meta.pages, 2);
      assert.equal(res.meta.width, 400);
    });

    test('a drawing stored without loss is sent at its full size as the smaller of it and a lossless copy', async () => {
      // A browser's canvas writes a lossless WebP with libwebp's fastest setting, which can be
      // many times the size the same pixels need, and the viewer asks for a drawing at full size.
      const plan = await sharp(await picture(1600, 900)).ensureAlpha().png().toBuffer();
      const fast = await sharp(plan).webp({ lossless: true, effort: 0 }).toBuffer();
      const map = await upload('sitemap', { dataUrl: dataUrl('image/webp', fast) });
      const full = await fetchPhoto(`${map.url}?w=4096`);
      assert.equal(full.res.status, 200);
      assert.equal(full.header('content-type'), 'image/webp');
      assert.equal(full.bytes.toString('latin1', 12, 16), 'VP8L', 'still without loss');
      assert.equal(full.meta.width, 1600, 'at its own width, not enlarged');
      assert.ok(full.bytes.length < fast.length / 2, `${full.bytes.length} bytes against ${fast.length} stored`);
      const pixels = (bytes) => sharp(bytes).removeAlpha().raw().toBuffer();
      assert.deepEqual(await pixels(full.bytes), await pixels(fast), 'the same pixels');
      assert.equal(full.header('x-photo-width'), '1600');
      const plain = await fetchPhoto(`${map.url}?w=1600`, PLAIN);
      assert.equal(plain.header('content-type'), 'image/png', 'a browser without WebP gets a PNG of it');
      assert.equal(plain.meta.width, 1600);

      // A drawing already as small as the server would make it is sent exactly as stored.
      const tight = await sharp(fast).webp({ lossless: true }).toBuffer();
      const lean = await upload('sitemap', { dataUrl: dataUrl('image/webp', tight) });
      assert.deepEqual((await fetchPhoto(`${lean.url}?w=4096`)).bytes, tight);
    });

    test('a big copy is made with encoders that do not hold the whole picture: a PNG, or a JPEG in one pass', async () => {
      const drawing = await sharp(await picture(3200, 3200, { format: 'png' })).webp({ lossless: true }).toBuffer();
      const map = await upload('sitemap', { dataUrl: dataUrl('image/webp', drawing) });
      const big = await fetchPhoto(`${map.url}?w=2560`);
      assert.equal(big.header('content-type'), 'image/png', '2560 x 2560 is past what a lossless WebP may take');
      assert.equal(big.meta.width, 2560);
      assert.equal(big.header('vary'), 'Accept');
      const small = await fetchPhoto(`${map.url}?w=1920`);
      assert.equal(small.header('content-type'), 'image/webp');
      assert.equal(small.bytes.toString('latin1', 12, 16), 'VP8L');
      const head = await api(`${map.url}?w=2560`, { raw: true, method: 'HEAD', headers: { Accept: CHROME } });
      assert.equal(head.headers.get('content-type'), 'image/png', 'a HEAD names the same type');
      assert.deepEqual((await fetchPhoto(`${map.url}?w=4096`)).bytes, drawing, 'at full size, the stored drawing itself');

      const photo = await upload('icon', { dataUrl: dataUrl('image/jpeg', await picture(3200, 3200)) });
      const heavy = await fetchPhoto(`${photo.url}?w=2560`, PLAIN);
      assert.equal(heavy.header('content-type'), 'image/jpeg');
      assert.equal(heavy.meta.width, 2560);
      assert.equal(heavy.meta.isProgressive, false, 'one plain pass');
      const light = await fetchPhoto(`${photo.url}?w=1920`, PLAIN);
      assert.equal(light.meta.isProgressive, true, 'mozjpeg, for the copies small enough for it');
    });

    test('a picture with more pixels than any upload is sent as stored, never decoded, with its size still told', async () => {
      // A flat 5000 x 4000 PNG is a few kilobytes as a file and 80 MB once decoded.
      const huge = await sharp({ create: { width: 5000, height: 4000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png().toBuffer();
      const logo = await upload('logo', { dataUrl: dataUrl('image/png', huge) });
      for (const accept of [CHROME, PLAIN]) {
        const res = await fetchPhoto(`${logo.url}?w=320`, accept);
        assert.equal(res.res.status, 200);
        assert.equal(res.header('content-type'), 'image/png');
        assert.deepEqual(res.bytes, huge, 'not resized, so not decoded');
        assert.equal(res.header('x-photo-width'), '5000');
        assert.equal(res.header('x-photo-height'), '4000');
      }
    });

    test('a HEAD reads only the header: a picture whose pixels cannot be decoded still reports its size', async () => {
      const whole = await picture(1600, 1200, { format: 'png', alpha: true });
      const cut = whole.subarray(0, Math.floor(whole.length / 2));
      const broken = await upload('logo', { dataUrl: dataUrl('image/png', cut) });
      const head = await api(`${broken.url}?w=320`, { raw: true, method: 'HEAD', headers: { Accept: CHROME } });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('x-photo-width'), '1600', 'from the header, with no pixel decoded');
      assert.equal(head.headers.get('content-type'), 'image/webp');
      // A GET has to decode it, cannot, and sends the stored bytes, as the plain address always has.
      const warn = console.warn;
      console.warn = () => {};
      try {
        const res = await api(`${broken.url}?w=320`, { raw: true, headers: { Accept: CHROME } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), cut);
      } finally {
        console.warn = warn;
      }
    });

    test('requests that arrive together for a photo not read yet share one read of it', async () => {
      const fresh = await upload('icon', { dataUrl: dataUrl('image/jpeg', await picture(1200, 800)) });
      const before = reads;
      readDelay = 150;
      try {
        const heads = await Promise.all(Array.from({ length: 6 }, () => (
          api(`${fresh.url}?w=320`, { raw: true, method: 'HEAD', headers: { Accept: CHROME } })
        )));
        for (const head of heads) assert.equal(head.headers.get('x-photo-width'), '1200');
      } finally {
        readDelay = 0;
      }
      assert.equal(reads - before, 1, 'one read of the stored bytes for all six');
    });

    test('a photo that is gone is 404 with or without a width, even after its copies were made', async () => {
      const first = await upload('hero', { dataUrl: dataUrl('image/jpeg', await picture(2000, 1200)) });
      assert.equal((await fetchPhoto(`${first.url}?w=480`)).meta.width, 480);
      const second = await upload('hero', { dataUrl: dataUrl('image/jpeg', await picture(2000, 1200)) });
      assert.notEqual(second.id, first.id, 'a new upload is a new address, which is what lets a copy be kept a year');
      assert.equal((await fetchPhoto(`${first.url}?w=480`)).res.status, 404);
      assert.equal((await fetchPhoto(first.url)).res.status, 404);
      assert.equal((await fetchPhoto(`${second.url}?w=480`)).meta.width, 480);
      assert.equal((await fetchPhoto('/api/photos/p_nosuchphoto?w=640')).res.status, 404);
      assert.equal((await fetchPhoto('/api/photos/p_nosuchphoto')).res.status, 404);
      assert.equal((await fetchPhoto('/api/photos/p_bad%00id?w=640')).res.status, 404, 'a NUL is no photo, not an error');
    });

    test('a pasted link is still a redirect, with or without a width', async () => {
      const link = await upload('icon', { url: 'https://images.example.com/icon.png' });
      assert.equal(link.url, 'https://images.example.com/icon.png', 'the buyer app is handed the link itself');
      const own = `/api/photos/${link.id}`;
      for (const path of [own, `${own}?w=640`]) {
        const res = await api(path, { raw: true, redirect: 'manual', headers: { Accept: CHROME } });
        assert.equal(res.status, 302, path);
        assert.equal(res.headers.get('location'), 'https://images.example.com/icon.png', path);
      }
    });
  });
}
