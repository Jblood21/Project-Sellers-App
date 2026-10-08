import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';
import { createApp } from '../index.js';

let server;
let base;
let dir;
let token;

const api = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 8));
const dataUrl = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const ftyp = (brand) => [0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from(brand), 0, 0, 2, 0, ...Buffer.from('isomiso2'), 1, 2, 3, 4];

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'psa-video-rev-'));
  process.env.SESSION_SECRET = 'test-secret';
  const store = createFileStore(join(dir, 'db.json'));
  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('/api/admin/login', { method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' } })).body.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

test('a replaced walkthrough is a new address, so a year-long cache cannot keep the old one', async () => {
  const cid = (await api('/api/admin/communities', { method: 'POST', body: { name: 'Revision Test' } })).body.id;
  const home = (await api(`/api/admin/communities/${cid}/homes`, {
    method: 'POST', body: { name: 'The Elm', price: 400000, beds: 3, baths: 2, sqft: 1800 },
  })).body;
  const put = (bytes) => api(`/api/admin/homes/${home.id}/video`, { method: 'PUT', body: { dataUrl: dataUrl('video/mp4', bytes) } });

  const first = (await put(Buffer.alloc(100, 1))).body.videoUrl;
  await tick();
  const second = (await put(Buffer.alloc(300, 2))).body.videoUrl;

  assert.match(first, new RegExp(`^/api/homes/${home.id}/video\\?v=\\d+$`));
  assert.notEqual(first, second, 'same address would let an immutable cache serve the first file forever');

  // The route ignores the query, and the address a buyer holds serves the current bytes.
  const served = await fetch(`${base}${second}`);
  assert.equal(served.status, 200);
  assert.equal((await served.arrayBuffer()).byteLength, 300);
  assert.equal((await fetch(`${base}/api/homes/${home.id}/video`)).status, 200, 'the old bare address still resolves');

  // Reading the home back without touching the video keeps the address stable.
  const again = (await api(`/api/c/${cid}`)).body.homes.find((h) => h.id === home.id).videoUrl;
  assert.equal(again, second, 'an unchanged file keeps its address, so it stays cacheable');
});

test('a replaced resource video is a new address; a title edit is not', async () => {
  const cid = (await api('/api/admin/communities', { method: 'POST', body: { name: 'Revision Resource' } })).body.id;
  const made = await api(`/api/admin/communities/${cid}/resources`, {
    method: 'POST', body: { kind: 'video', title: 'Tour', dataUrl: dataUrl('video/mp4', Buffer.alloc(100, 1)) },
  });
  const first = made.body.videoUrl;
  assert.match(first, new RegExp(`^/api/resources/${made.body.id}/video\\?v=\\d+$`));

  await tick();
  const renamed = await api(`/api/admin/resources/${made.body.id}`, { method: 'PATCH', body: { title: 'Tour, renamed' } });
  assert.equal(renamed.body.videoUrl, first, 'renaming does not change the file, so it does not change the address');

  await tick();
  const replaced = await api(`/api/admin/resources/${made.body.id}`, {
    method: 'PATCH', body: { dataUrl: dataUrl('video/webm', Buffer.alloc(250, 3)) },
  });
  assert.notEqual(replaced.body.videoUrl, first, 'a new file is a new address');
  assert.equal((await (await fetch(`${base}${replaced.body.videoUrl}`)).arrayBuffer()).byteLength, 250);
});

test('the container signature decides the type when the label is missing or unhelpful', async () => {
  const cid = (await api('/api/admin/communities', { method: 'POST', body: { name: 'Sniff Test' } })).body.id;
  const post = (type, bytes, title = 'clip') => api(`/api/admin/communities/${cid}/resources`, {
    method: 'POST', body: { kind: 'video', title, dataUrl: dataUrl(type, bytes) },
  });
  const typeOf = async (res) => (await fetch(`${base}${res.body.videoUrl}`, { headers: { Range: 'bytes=0-1' } })).headers.get('content-type');

  const octet = await post('application/octet-stream', ftyp('isom'), 'octet-stream');
  assert.equal(octet.status, 201, 'a browser that reports no usable type does not make an MP4 unplayable');
  assert.equal(await typeOf(octet), 'video/mp4');

  const mov = await post('application/octet-stream', ftyp('qt  '), 'mov');
  assert.equal(await typeOf(mov), 'video/quicktime');

  const m4v = await post('video/x-m4v', ftyp('M4V '), 'm4v');
  assert.equal(m4v.status, 201, 'a video/* label the allowlist does not know is corrected by the bytes');
  assert.equal(await typeOf(m4v), 'video/mp4');

  // Never a way around the allowlist: an image labelled as an image is still refused,
  // and Matroska (same signature as WebM, different browser support) is not waved through.
  assert.equal((await post('image/heic', ftyp('heic'), 'heic')).status, 400);
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x88, ...Buffer.from('matroska')];
  assert.equal((await post('video/x-matroska', ebml, 'mkv')).status, 400);
  const webm = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84, ...Buffer.from('webm')];
  assert.equal((await post('application/octet-stream', webm, 'webm')).status, 201);
});

test('a huge body is refused before it is read, unless it is an admin uploading a video', async () => {
  const big = JSON.stringify({ junk: 'A'.repeat(8 * 1024 * 1024) });
  const anon = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
  assert.equal(anon.status, 413, 'the login form does not get a 36 MB parser');
  const gate = await fetch(`${base}/api/c/nope/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
  assert.equal(gate.status, 413, 'neither does the buyer contact gate');

  // A video upload without a token is turned away before its body is parsed.
  const noToken = await fetch(`${base}/api/admin/homes/h_x/video`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: `data:video/mp4;base64,${'A'.repeat(8 * 1024 * 1024)}` }),
  });
  assert.equal(noToken.status, 401);

  // And the real thing still goes through: a ~24 MB file, signed in.
  const cid = (await api('/api/admin/communities', { method: 'POST', body: { name: 'Big Upload' } })).body.id;
  const home = (await api(`/api/admin/communities/${cid}/homes`, { method: 'POST', body: { name: 'The Fir', price: 1, beds: 1, baths: 1, sqft: 1 } })).body;
  const file = Buffer.alloc(24 * 1024 * 1024, 7);
  const put = await api(`/api/admin/homes/${home.id}/video`, { method: 'PUT', body: { dataUrl: dataUrl('video/mp4', file) } });
  assert.equal(put.status, 200);
  assert.equal(put.body.videoSizeBytes, file.length);
});
