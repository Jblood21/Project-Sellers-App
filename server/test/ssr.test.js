import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { createFileStore } from '../db/file.js';
import { resetStoreForTests } from '../db/index.js';
import { createApp } from '../index.js';
import { hashPassword } from '../lib/auth.js';
import { injectHead, originOfRequest, renderHead } from '../lib/ssr.js';

// What Vite writes, trimmed to the parts the injector has to deal with.
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="Explore new homes, see what one would really cost you." />
    <title>Homebuyer App</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const HOSTILE_NAME = '</script><script>alert(1)</script>"><img src=x onerror=alert(2)> & \u2028 Oaks';
const HOSTILE_TITLE = '</title><script>alert(3)</script>" onload="alert(4) Guide';

const heads = (html) => html.slice(0, html.indexOf('</head>'));
const jsonLdOf = (html) => {
  const found = [...html.matchAll(/<script type="application\/ld\+json" data-cornerpost>([\s\S]*?)<\/script>/g)];
  assert.equal(found.length, 1, 'exactly one JSON-LD script');
  return JSON.parse(found[0][1]);
};
const typesOf = (ld) => ld['@graph'].flatMap((n) => [].concat(n['@type']));
const meta = (html, key) =>
  html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)" data-cornerpost>`))?.[1];

describe('server-rendered page heads', () => {
  let dir;
  let server;
  let base;
  let store;
  let token;
  let plain;
  let cid;
  let hostileId;
  let draftSlug;
  let liveSlug;

  const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token && path.startsWith('/api/admin') ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  const json = async (path, opts) => JSON.parse((await api(path, opts)).text);

  before(async () => {
    process.env.SESSION_SECRET = 'test-secret';
    dir = mkdtempSync(join(tmpdir(), 'psa-ssr-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'index.html'), INDEX_HTML);
    store = createFileStore(join(dir, 'db.json'));
    await resetStoreForTests(store);
    await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
    server = createApp({ clientDist: join(dir, 'dist') }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    token = JSON.parse((await api('/api/admin/login', {
      method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
    })).text).token;

    cid = (await json('/api/admin/communities', {
      method: 'POST',
      body: { name: 'Willow Creek', location: 'Lehi, UT 84043', builder: 'Summit Builders' },
    })).id;
    hostileId = (await json('/api/admin/communities', { method: 'POST', body: { name: HOSTILE_NAME } })).id;

    const guides = (await json(`/api/admin/communities/${cid}`)).guides;
    liveSlug = guides[0].slug;
    // A draft: the public API hides it, so the page must look like it does not exist.
    draftSlug = 'secret-draft';
    const draft = await json(`/api/admin/communities/${cid}/guides`, { method: 'POST', body: { title: 'Secret Draft' } });
    await api(`/api/admin/guides/${draft.id}`, { method: 'PATCH', body: { slug: draftSlug, published: false } });
    const hostile = await json(`/api/admin/communities/${hostileId}/guides`, { method: 'POST', body: { title: HOSTILE_TITLE } });
    await api(`/api/admin/guides/${hostile.id}`, { method: 'PATCH', body: { slug: 'hostile-guide', summary: HOSTILE_TITLE } });
    plain = INDEX_HTML;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await resetStoreForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('the landing page carries the community title, description, canonical and JSON-LD', async () => {
    const res = await api(`/c/${cid}`, { headers: { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'https' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('cache-control'), /no-cache/);
    const html = res.text;
    assert.match(html, /<title>Willow Creek \| New homes in Lehi, UT 84043<\/title>/);
    assert.equal((html.match(/<title>/g) ?? []).length, 1, 'the stock title is replaced, not joined');
    assert.equal((html.match(/name="description"/g) ?? []).length, 1, 'one description');
    assert.ok(!html.includes('Homebuyer App'));
    assert.match(html, /<link rel="canonical" href="https:\/\/homes\.example\.com\/c\/[^"]+" data-cornerpost>/);
    assert.equal(meta(html, 'robots'), 'index, follow');
    assert.equal(meta(html, 'og:type'), 'website');
    assert.equal(meta(html, 'og:site_name'), 'Willow Creek');
    assert.ok(meta(html, 'twitter:card'));
    assert.ok(html.indexOf('</head>') > html.indexOf('application/ld+json'), 'in the head');
    assert.ok(html.includes('<div id="root">'), 'the app shell is intact');

    const ld = jsonLdOf(html);
    assert.equal(ld['@context'], 'https://schema.org');
    const types = typesOf(ld);
    for (const type of ['WebSite', 'Organization', 'Place', 'FinancialService', 'WebPage']) {
      assert.ok(types.includes(type), `landing graph has a ${type}`);
    }
    assert.ok(!types.includes('BreadcrumbList'), 'the landing page is the root of the trail');
  });

  test('the guide list is indexable and lists the published guides', async () => {
    const html = (await api(`/c/${cid}/guides`)).text;
    assert.match(html, /<title>Buyer guides \| Willow Creek<\/title>/);
    assert.equal(meta(html, 'robots'), 'index, follow');
    const ld = jsonLdOf(html);
    const types = typesOf(ld);
    assert.ok(types.includes('CollectionPage') && types.includes('ItemList') && types.includes('BreadcrumbList'));
    const list = ld['@graph'].find((n) => n['@type'] === 'ItemList');
    assert.equal(list.numberOfItems, 13, 'the 13 supplied guides, and not the draft');
    assert.ok(!JSON.stringify(ld).includes('Secret Draft'));
  });

  test('a guide gets its own title, article markup and canonical', async () => {
    const html = (await api(`/c/${cid}/guides/${liveSlug}`, { headers: { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'https' } })).text;
    assert.equal(meta(html, 'robots'), 'index, follow');
    assert.equal(meta(html, 'og:type'), 'article');
    assert.match(html, new RegExp(`href="https://homes\\.example\\.com/c/[^"]+/guides/${liveSlug}"`));
    const ld = jsonLdOf(html);
    const article = ld['@graph'].find((n) => n['@type'] === 'Article');
    assert.ok(article.headline && article.image?.['@type'] === 'ImageObject', 'an Article with an ImageObject');
    assert.ok(article.datePublished && article.dateModified);
    assert.match(html, new RegExp(`<title>${article.headline.replace(/[$()*+.?[\]\\^{|}]/g, '\\$&').replace(/&/g, '&amp;')}`));
    assert.ok(typesOf(ld).includes('BreadcrumbList'));
  });

  test('an unknown community gets the plain shell, as it always did', async () => {
    for (const path of [
      '/c/no-such-community', '/c/no-such-community/guides', `/c/no-such-community/guides/${liveSlug}`, '/c/%00',
    ]) {
      const res = await api(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.text, plain, `${path} is exactly the SPA shell`);
    }
  });

  test('a guide that is a draft, deleted or switched off is a 404 and noindex, not an indexable soft 404', async () => {
    // The community is real, so a crawler that does not run the app must be told
    // the page is gone. The body is still the shell, so the app can say it in words.
    for (const path of [`/c/${cid}/guides/${draftSlug}`, `/c/${cid}/guides/does-not-exist`, `/c/${cid}/guides/%00`]) {
      const res = await api(path);
      assert.equal(res.status, 404, path);
      assert.equal(res.text, plain, `${path} still sends the SPA shell`);
      assert.match(res.headers.get('x-robots-tag'), /noindex/);
    }
    // ...and a page that does exist is untouched.
    assert.equal((await api(`/c/${cid}/guides/${liveSlug}`)).status, 200);
    assert.equal((await api(`/c/${cid}/guides`)).status, 200);

    await api(`/api/admin/communities/${cid}`, { method: 'PATCH', body: { features: { guides: false } } });
    try {
      for (const path of [`/c/${cid}/guides`, `/c/${cid}/guides/${liveSlug}`]) {
        const res = await api(path);
        assert.equal(res.status, 404, `${path} with guides switched off`);
        assert.match(res.headers.get('x-robots-tag'), /noindex/);
      }
      assert.equal((await api(`/c/${cid}`)).status, 200, 'the landing page is still there');
    } finally {
      await api(`/api/admin/communities/${cid}`, { method: 'PATCH', body: { features: { guides: true } } });
    }
  });

  test('pages that are not public heads are untouched', async () => {
    for (const path of [`/c/${cid}/tools`, `/c/${cid}/start`, '/admin', '/']) {
      assert.equal((await api(path)).text, plain, path);
    }
  });

  test('a hostile community name and guide title cannot break out of the script or an attribute', async () => {
    for (const path of [`/c/${hostileId}`, `/c/${hostileId}/guides`, `/c/${hostileId}/guides/hostile-guide`]) {
      const res = await api(path, { headers: { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'https' } });
      const html = res.text;
      assert.equal(res.status, 200, path);
      const head = heads(html);
      assert.ok(!/<script>alert/.test(html), `${path}: no injected script`);
      assert.ok(!/<img src=x/.test(html), `${path}: no injected element`);
      assert.ok(!/\u2028/.test(head), `${path}: no raw line separator`);
      assert.equal((head.match(/<script/g) ?? []).length, 1, `${path}: only our own script`);
      assert.equal((head.match(/<\/script>/g) ?? []).length, 1);
      // Every attribute value in the head is closed where we closed it.
      for (const tag of head.match(/<(?:meta|link)\b[^>]*>/g) ?? []) {
        const quotes = (tag.match(/"/g) ?? []).length;
        assert.equal(quotes % 2, 0, `balanced quotes in ${tag}`);
        assert.ok(!/ on\w+=/i.test(tag.replace(/content="[^"]*"/, '')), `no handler attribute in ${tag}`);
      }
      // The hostile text is in the data, escaped, not stripped: it parses back to the name.
      const ld = jsonLdOf(html);
      const place = ld['@graph'].find((n) => n['@type'] === 'Place' || n['@type']?.includes?.('Place'));
      assert.equal(place.name, HOSTILE_NAME.replace(/\s+/g, ' '), `${path}: the name round-trips through the JSON`);
    }
  });

  test('hostile Host, X-Forwarded-Host and X-Forwarded-Proto values never reach the markup', async () => {
    const hostile = [
      { 'X-Forwarded-Host': 'evil.com"><script>alert(1)</script>' },
      { 'X-Forwarded-Host': 'user:pw@evil.com' },
      { 'X-Forwarded-Host': 'a b.com' },
      { 'X-Forwarded-Host': 'evil.com:99999' },
      { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'javascript' },
      { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'javascript:alert(1)//' },
    ];
    for (const headers of hostile) {
      for (const path of [`/c/${cid}`, `/c/${cid}/guides`, `/c/${cid}/guides/${liveSlug}`]) {
        const res = await api(path, { headers });
        const label = `${JSON.stringify(headers)} ${path}`;
        assert.equal(res.status, 200, label);
        // Either the plain shell, or a head whose every origin is a clean one.
        if (res.text === plain) continue;
        assert.ok(!/<script>alert/.test(res.text), `${label}: no injected script`);
        assert.ok(!/evil\.com|javascript:/i.test(heads(res.text)), `${label}: nothing hostile in the head`);
        assert.equal((heads(res.text).match(/<script/g) ?? []).length, 1, `${label}: only our own script`);
      }
    }
  });

  test('a forwarding chain uses the first host and protocol, as the browser did', async () => {
    const res = await api(`/c/${cid}`, {
      headers: { 'X-Forwarded-Host': 'homes.example.com, proxy.internal', 'X-Forwarded-Proto': 'https, http' },
    });
    assert.notEqual(res.text, plain, 'the head is still written behind a proxy chain');
    assert.match(res.text, /<link rel="canonical" href="https:\/\/homes\.example\.com\/c\/[^"]+" data-cornerpost>/);
    assert.ok(!res.text.includes('proxy.internal'));
  });

  test('originOfRequest reads the first token of each forwarded header', () => {
    const req = (headers, protocol = 'http') => ({
      protocol,
      get: (name) => headers[name.toLowerCase()],
    });
    assert.equal(originOfRequest(req({ host: 'a.test' })), 'http://a.test');
    assert.equal(originOfRequest(req({ host: 'a.test', 'x-forwarded-host': ' h.test , p.test', 'x-forwarded-proto': 'HTTPS, http' })), 'https://h.test');
    assert.equal(originOfRequest(req({ host: 'a.test', 'x-forwarded-proto': 'gopher' })), 'http://a.test', 'an unknown protocol falls back to the socket\'s');
    assert.equal(originOfRequest(req({})), '');
  });

  test('the "Location TBD" placeholder is not published as a place', async () => {
    const id = (await json('/api/admin/communities', { method: 'POST', body: { name: 'No Address Yet', location: '' } })).id;
    for (const path of [`/c/${id}`, `/c/${id}/guides`]) {
      const html = (await api(path, { headers: { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'https' } })).text;
      assert.ok(!/Location TBD/i.test(html), `${path}: no placeholder in the head`);
    }
    const html = (await api(`/c/${id}`, { headers: { 'X-Forwarded-Host': 'homes.example.com', 'X-Forwarded-Proto': 'https' } })).text;
    assert.match(html, /<title>No Address Yet[^<]*<\/title>/);
    const place = jsonLdOf(html)['@graph'].find((n) => [].concat(n['@type']).includes('Place'));
    assert.equal(place.address, undefined, 'no address is better than a made-up one');
  });

  test('a document that already carries the injected head is never injected again', async () => {
    const head = renderHead({
      page: 'landing', origin: 'https://homes.example.com',
      community: { id: 'x', name: 'Once', settings: {}, features: {}, homes: [], guides: [], agents: [] },
    });
    assert.ok(head.includes('application/ld+json'));
    const once = injectHead(INDEX_HTML, head);
    assert.notEqual(once, INDEX_HTML);
    assert.equal(injectHead(once, head), once, 'second pass changes nothing');
    assert.equal((once.match(/application\/ld\+json/g) ?? []).length, 1);
    assert.equal((once.match(/<title>/g) ?? []).length, 1);
  });

  test('a built index.html with no <title> still gets its tags; one with no </head> is left alone', () => {
    const head = '<meta name="robots" content="index, follow" data-cornerpost>';
    const noTitle = injectHead('<html><head><meta charset="utf-8"></head><body></body></html>', head);
    assert.ok(noTitle.includes(head));
    assert.ok(noTitle.indexOf(head) < noTitle.indexOf('</head>'));
    const broken = '<html><body>no head</body></html>';
    assert.equal(injectHead(broken, head), broken);
  });

  test('robots follows pageMeta: only landing, guides and guide are indexable', () => {
    const community = { id: 'x', name: 'Robots Row', settings: {}, features: {}, homes: [], guides: [{ slug: 'a', title: 'A', summary: 's', published: true }], agents: [] };
    const robots = (page, extra = {}) =>
      renderHead({ page, community, origin: 'https://homes.example.com', ...extra }).match(/name="robots" content="([^"]+)"/)[1];
    assert.equal(robots('landing'), 'index, follow');
    assert.equal(robots('guides'), 'index, follow');
    assert.equal(robots('guide', { guide: community.guides[0] }), 'index, follow');
    for (const page of ['tools', 'start', 'plan', 'realtors', 'saved']) assert.equal(robots(page), 'noindex, nofollow', page);
    assert.equal(robots('guide', { guide: undefined }), 'noindex, nofollow', 'a guide that is not there is not indexed');
  });

  test('no usable origin means no head at all', () => {
    const community = { id: 'x', name: 'Nowhere', settings: {}, features: {}, homes: [], guides: [], agents: [] };
    assert.equal(renderHead({ page: 'landing', community, origin: '' }), '');
    assert.equal(renderHead({ page: 'landing', community, origin: 'javascript:alert(1)' }), '');
  });

  test('with no client build the answer is today\'s 503', async () => {
    const bare = createApp({ clientDist: join(dir, 'nothing-here') }).listen(0);
    await new Promise((resolve) => bare.once('listening', resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${bare.address().port}/c/${cid}`);
      assert.equal(res.status, 503);
      assert.match(await res.text(), /Client bundle not built/);
    } finally {
      await new Promise((resolve) => bare.close(resolve));
    }
  });
});
