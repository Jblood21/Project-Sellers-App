import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { previewPath } from '../../client/src/lib/themePreview.js';
import { createApp } from '../index.js';

/**
 * Setup's theme preview (/c/<id>/preview) is the buyer app's home screen drawn for the builder inside Setup.
 * It is the app's own page, so it must load like any other buyer page, but a search engine must never list it
 * and only Setup (the same origin) may frame it.
 */
describe('the theme preview page', () => {
  let dir;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'psa-preview-'));
    mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><title>app shell</title>');
    server = createApp({ clientDist: join(dir, 'dist') }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  test('is the app shell, marked noindex, and frameable only by the same origin', async () => {
    const res = await fetch(`${base}${previewPath('willow-creek', { theme: 'wine', layout: 'trailhead' })}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>app shell<\/title>/);
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  });

  test('a trailing slash or other letter case gets the same page from the server, with the same header', async () => {
    for (const path of ['/c/willow-creek/preview/', '/c/Willow-Creek/Preview']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/, path);
      await res.arrayBuffer();
    }
  });

  // The Render address sends page visits to the public domain. The preview is only ever framed by the admin on
  // the admin's own address, so it must stay there: sent to the domain it is another origin, which the frame
  // refuses (SAMEORIGIN) and the preview's messages ignore, and the studio would be blank.
  test('is not sent from the Render address to the public domain, unlike the buyer pages around it', async () => {
    const get = (path) => new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers: { Accept: 'text/html,application/xhtml+xml', Host: 'touradoor-abc1.onrender.com' },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
      });
      req.on('error', reject);
      req.end();
    });
    process.env.PUBLIC_ORIGIN = 'https://touradoor.example';
    try {
      for (const path of ['/c/willow-creek/preview?theme=wine&layout=trailhead', '/c/willow-creek/preview/', '/C/Willow-Creek/PREVIEW']) {
        const res = await get(path);
        assert.equal(res.status, 200, path);
        assert.equal(res.location, undefined, `${path}: not redirected`);
      }
      // Only the preview itself: a buyer's page, or an address that merely starts like it, is still sent on.
      for (const path of ['/c/willow-creek/tools', '/c/willow-creek/previews', '/c/willow-creek/preview/x']) {
        const res = await get(path);
        assert.equal(res.status, 302, path);
        assert.equal(res.location, `https://touradoor.example${path}`, path);
      }
    } finally {
      delete process.env.PUBLIC_ORIGIN;
    }
  });

  test("a buyer's own pages are not marked noindex by it", async () => {
    for (const path of ['/c/willow-creek/tools', '/c/willow-creek/plan', '/c/willow-creek/previews']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('x-robots-tag'), null, path);
      await res.arrayBuffer();
    }
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const client = (file) => readFileSync(join(here, '../../client/src', file), 'utf8');

describe('the preview page in the browser (its source, as JSX does not run in Node)', () => {
  const preview = client('buyer/screens/Preview.jsx');

  test('the buyer app sends /c/<id>/preview there in any letter case, and nothing longer', () => {
    const [, body, flags] = preview.match(/export const PREVIEW_PATH_RE = \/(.+)\/([a-z]*);/);
    const re = new RegExp(body, flags);
    for (const path of ['/c/willow-creek/preview', '/c/willow-creek/preview/', '/c/Willow-Creek/Preview', '/c/x/PREVIEW//']) {
      assert.ok(re.test(path), path);
    }
    for (const path of ['/c/willow-creek/previews', '/c/willow-creek/preview/x', '/c/willow-creek/tools', '/admin/preview']) {
      assert.ok(!re.test(path), path);
    }
    // And the home screen it draws is worked out from the same address, in any case.
    assert.match(preview, /replace\(\/\\\/preview\\\/\*\$\/i, '\/tools'\)/);
  });

  test('only a message from its own parent, at its own origin, of its own type, is listened to', () => {
    assert.match(preview, /event\.source !== window\.parent \|\| event\.origin !== window\.location\.origin\) return;/);
    assert.match(preview, /data\.type !== PREVIEW_MESSAGE/);
    // The one message it sends goes to the parent at this origin, never to any origin.
    assert.match(preview, /window\.parent\.postMessage\(\{ type: PREVIEW_MESSAGE, ready: true \}, window\.location\.origin\)/);
    assert.doesNotMatch(preview, /postMessage\([^)]*'\*'/);
    // Read-only, and not for search engines.
    assert.match(preview, /\.inert = true/);
    assert.match(preview, /noindex, nofollow/);
  });

  test("the provider's preview mode stands in for every call that would reach the server or the device", () => {
    const context = client('buyer/BuyerContext.jsx');
    const actions = context.match(/const PREVIEW_ACTIONS = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
    const replaced = new Set([...actions.matchAll(/^\s+(\w+):/gm)].map(([, name]) => name));
    // Every callback the provider hands the screens that calls the API or writes to the device.
    // Each callback runs from its `const name = useCallback(` to the next one (the last to the value below them).
    const starts = [...context.matchAll(/\n  const (\w+) = useCallback\(/g)];
    const reaching = starts.filter((start, i) => {
      const end = starts[i + 1]?.index ?? context.indexOf('const shown');
      return /buyerApi\.|writeJson|remove\(/.test(context.slice(start.index, end));
    }).map(([, name]) => name);
    for (const name of ['track', 'toolOpened', 'enter', 'toggleSave', 'savePlan', 'saveMoveIn', 'emailPlan', 'requestTour']) {
      assert.ok(reaching.includes(name), `${name} is found as one that reaches the server`);
    }
    for (const name of reaching) assert.ok(replaced.has(name), `${name} reaches the server or the device, and the preview replaces it`);
    // The ones written straight into the value, and the toast.
    for (const name of ['markTutorialSeen', 'tutorialSeen', 'showToast']) assert.ok(replaced.has(name), name);
    // Laid over the real ones last, so they win; and the sign-in lookup never runs in a preview.
    assert.match(context, /\.\.\.\(previewing \? \{ \.\.\.PREVIEW_ACTIONS, signedIn: true, lead: PREVIEW_LEAD \} : null\),\n    \}\),/);
    assert.ok(context.indexOf('if (previewing) {') < context.indexOf('buyerApi.me('), 'the preview returns before looking up a sign-in');
    assert.match(context, /PREVIEW_LEAD = Object\.freeze\(\{ name: 'Dana Example', plan: Object\.freeze\(\{\}\), savedHomeIds: Object\.freeze\(\[\]\) \}\)/);
  });
});
