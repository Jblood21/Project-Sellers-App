import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { createApp } from '../index.js';

describe('caching of the client build', () => {
  let dir;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'psa-static-'));
    for (const folder of ['assets', 'brand', 'guides']) mkdirSync(join(dir, 'dist', folder), { recursive: true });
    writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dir, 'dist', 'assets', 'index-AbC123.js'), 'export {}');
    writeFileSync(join(dir, 'dist', 'brand', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(join(dir, 'dist', 'guides', 'hero.webp'), 'not really an image');
    writeFileSync(join(dir, 'dist', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    server = createApp({ clientDist: join(dir, 'dist') }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  // Artwork that keeps its name when its content changes has to be checked with
  // the server each time, or a replaced logo stays stale for the cache lifetime.
  for (const path of ['/brand/logo.svg', '/guides/hero.webp']) {
    test(`${path} is revalidated on every use, and an unchanged file answers 304`, async () => {
      const first = await fetch(`${base}${path}`);
      assert.equal(first.status, 200);
      assert.equal(first.headers.get('cache-control'), 'no-cache');
      const etag = first.headers.get('etag');
      assert.ok(etag, 'an ETag is kept, so revalidation is cheap');
      assert.ok(first.headers.get('last-modified'), 'and so is Last-Modified');
      await first.arrayBuffer();

      // fetch() adds `Cache-Control: no-cache` to a conditional request unless told
      // otherwise, and a server must then answer in full. A browser revalidating a
      // stored copy sends no such header, so the test says so explicitly.
      const revalidating = { 'Cache-Control': 'max-age=0' };
      const byEtag = await fetch(`${base}${path}`, { headers: { ...revalidating, 'If-None-Match': etag } });
      assert.equal(byEtag.status, 304);
      assert.equal((await byEtag.arrayBuffer()).byteLength, 0, 'a 304 has no body');

      const bySince = await fetch(`${base}${path}`, { headers: { ...revalidating, 'If-Modified-Since': first.headers.get('last-modified') } });
      assert.equal(bySince.status, 304);
    });
  }

  test('hashed build files stay long-lived exactly as before', async () => {
    const res = await fetch(`${base}/assets/index-AbC123.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    await res.arrayBuffer();
  });

  test('other top-level files keep the one-hour default', async () => {
    const res = await fetch(`${base}/favicon.svg`);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    await res.arrayBuffer();
  });
});
