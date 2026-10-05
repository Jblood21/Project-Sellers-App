import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'public', 'sw.js'), 'utf8',
);

/**
 * Runs the real service worker in a sandbox with just enough of the worker
 * globals to drive its fetch handler: a Cache Storage that records what is put
 * where, and a network the test controls.
 */
function boot() {
  const stores = new Map();
  const listeners = {};
  const net = { responses: new Map(), offline: false, calls: [] };
  const keyOf = (req) => (typeof req === 'string' ? req : new URL(req.url).pathname);
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      put: async (req, res) => { map.set(keyOf(req), res); },
      match: async (req) => map.get(keyOf(req)),
      addAll: async () => {},
    };
  };
  const caches = {
    open: async (name) => cacheOf(name),
    match: async (req) => {
      for (const map of stores.values()) if (map.has(keyOf(req))) return map.get(keyOf(req));
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const response = (body, { ok = true, type = 'basic', status = 200 } = {}) => ({
    ok, type, status, body, clone() { return this; },
  });
  const sandbox = {
    self: {
      location: { origin: 'https://app.test' },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches,
    URL,
    Response: { error: () => response('error', { ok: false, type: 'error', status: 0 }) },
    fetch: async (request) => {
      net.calls.push(keyOf(request));
      if (net.offline) throw new TypeError('offline');
      return net.responses.get(keyOf(request)) ?? response('missing', { ok: false, status: 404 });
    },
  };
  vm.runInNewContext(source, sandbox);

  const request = (path, mode = 'cors') => ({ url: `https://app.test${path}`, method: 'GET', mode });
  const run = async (path, mode) => {
    let answer;
    const waits = [];
    listeners.fetch({ request: request(path, mode), respondWith: (p) => { answer = p; }, waitUntil: (p) => waits.push(p) });
    const out = answer ? await answer : undefined;
    await Promise.all(waits);
    await new Promise((resolve) => setImmediate(resolve));
    return out;
  };
  return { stores, net, response, run, listeners };
}

test('the compliance artwork is fetched fresh, so a corrected logo reaches installed apps', async () => {
  const sw = boot();
  const path = '/brand/equal-housing-lender-ink.svg';
  sw.net.responses.set(path, sw.response('v1'));
  assert.equal((await sw.run(path)).body, 'v1');
  sw.net.responses.set(path, sw.response('v2'));
  assert.equal((await sw.run(path)).body, 'v2', 'the second load sees the new file, not the cached one');
  assert.equal((await sw.run('/guides/blog-hero-model-home.webp')).status, 404);
  // Offline it still shows the last copy rather than a broken image.
  sw.net.offline = true;
  assert.equal((await sw.run(path)).body, 'v2');
});

test('hashed build assets stay cache first', async () => {
  const sw = boot();
  sw.net.responses.set('/assets/app-abc123.js', sw.response('js'));
  await sw.run('/assets/app-abc123.js');
  const before = sw.net.calls.length;
  assert.equal((await sw.run('/assets/app-abc123.js')).body, 'js');
  assert.equal(sw.net.calls.length, before, 'the second load did not touch the network');
});

test('a community page or an error never becomes the offline shell for every address', async () => {
  const sw = boot();
  sw.net.responses.set('/admin', sw.response('SHELL'));
  await sw.run('/admin', 'navigate');
  assert.equal(sw.stores.get('psa-shell-v2').get('/').body, 'SHELL');

  for (const path of ['/c/willow', '/c/willow/guides', '/c/willow/guides/credit-score']) {
    sw.net.responses.set(path, sw.response(`<title>${path}</title>`));
    await sw.run(path, 'navigate');
    assert.equal(sw.stores.get('psa-shell-v2').get('/').body, 'SHELL', `${path} did not replace the shell`);
  }
  sw.net.responses.set('/c/broken/tools', sw.response('{"error":"boom"}', { ok: false, status: 500 }));
  await sw.run('/c/broken/tools', 'navigate');
  assert.equal(sw.stores.get('psa-shell-v2').get('/').body, 'SHELL', 'a 500 did not replace the shell');

  // A gated page is the plain shell, so it may refresh it.
  sw.net.responses.set('/c/willow/tools', sw.response('SHELL2'));
  await sw.run('/c/willow/tools', 'navigate');
  assert.equal(sw.stores.get('psa-shell-v2').get('/').body, 'SHELL2');

  sw.net.offline = true;
  assert.equal((await sw.run('/c/other/guides', 'navigate')).body, 'SHELL2');
});

test('an old cache, which holds frozen artwork, is dropped on activate', async () => {
  const sw = boot();
  sw.stores.set('psa-shell-v1', new Map([['/brand/summit-home-loans-color.png', sw.response('old')]]));
  sw.stores.set('psa-shell-v2', new Map());
  let done;
  sw.listeners.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual([...sw.stores.keys()], ['psa-shell-v2']);
});

test('the API is never intercepted', async () => {
  const sw = boot();
  assert.equal(await sw.run('/api/c/willow'), undefined);
});
